"""
Audio transcription with word-level timestamps.

Supports three backends (auto-selected by priority):
  1. whisper.cpp -- fastest on Apple Silicon (Metal GPU), verbatim output
  2. faster-whisper -- CTranslate2 backend, CPU-only on Mac
  3. SRT subtitle files -- fallback, no ML needed

whisper.cpp is preferred because:
  - 5-6x faster than faster-whisper on Apple Silicon (Metal acceleration)
  - Verbatim output (no profanity censoring -- critical for our use case)
  - Quantized models fit in ~1.6GB RAM
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class WordTimestamp:
    """A single word with its audio timestamp."""
    text: str
    start: float   # seconds
    end: float      # seconds
    confidence: float  # 0.0-1.0


@dataclass
class TranscriptSegment:
    """A sentence/phrase with its words."""
    text: str
    start: float
    end: float
    words: list[WordTimestamp]


class WhisperCppTranscriber:
    """
    Transcribe using whisper.cpp (fastest on Apple Silicon).

    Requires whisper.cpp binary installed:
        brew install whisper-cpp
    or built from source:
        git clone https://github.com/ggml-org/whisper.cpp
        cd whisper.cpp && make

    Models downloaded from:
        https://huggingface.co/ggerganov/whisper.cpp/tree/main
    """

    def __init__(
        self,
        model_path: str | Path | None = None,
        binary_path: str = "whisper-cpp",
    ) -> None:
        self.model_path = model_path
        self.binary_path = binary_path

    def is_available(self) -> bool:
        """Check if whisper.cpp binary is installed."""
        # Check common names (homebrew installs as whisper-cli)
        for name in [self.binary_path, "whisper-cli", "whisper-cpp", "main"]:
            if shutil.which(name):
                self.binary_path = name
                return True
        # Check common build locations
        common_paths = [
            Path("/opt/homebrew/bin/whisper-cli"),
            Path("/usr/local/bin/whisper-cli"),
            Path.home() / "whisper.cpp" / "main",
            Path.home() / "whisper.cpp" / "build" / "bin" / "whisper-cli",
        ]
        for p in common_paths:
            if p.exists():
                self.binary_path = str(p)
                return True
        return False

    def transcribe(
        self,
        audio_path: str | Path,
        language: str = "en",
    ) -> list[TranscriptSegment]:
        """
        Transcribe audio file with word-level timestamps.

        Returns list of TranscriptSegment with word timestamps.
        Uses --output-json for structured output with word timings.
        """
        audio_path = Path(audio_path)

        # whisper.cpp needs WAV input; convert if needed
        wav_path = self._ensure_wav(audio_path)

        # Build command
        cmd = [
            self.binary_path,
            "-m", str(self.model_path),
            "-f", str(wav_path),
            "-l", language,
            "--output-json-full",
            "--word-thold", "0.01",  # include low-confidence words
            "--no-prints",
        ]

        # whisper-cli writes JSON to {input}.json, not stdout
        json_output_path = Path(str(wav_path) + ".json")

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=600,
            )
            if result.returncode != 0:
                print(f"[whisper.cpp] Error: {result.stderr[:200]}")
                return []

            # Read from the output file
            if json_output_path.exists():
                json_text = json_output_path.read_text()
                return self._parse_json_output(json_text)

            # Fallback: try stdout
            return self._parse_json_output(result.stdout)
        finally:
            # Clean up temp files
            if wav_path != audio_path and wav_path.exists():
                wav_path.unlink()
            if json_output_path.exists():
                json_output_path.unlink()

    def _parse_json_output(self, stdout: str) -> list[TranscriptSegment]:
        """Parse whisper.cpp JSON output into TranscriptSegments."""
        try:
            data = json.loads(stdout)
        except json.JSONDecodeError:
            # Try to find JSON in the output (whisper.cpp may print other stuff)
            for line in stdout.split('\n'):
                line = line.strip()
                if line.startswith('{'):
                    try:
                        data = json.loads(line)
                        break
                    except json.JSONDecodeError:
                        continue
            else:
                return []

        segments: list[TranscriptSegment] = []
        for seg in data.get("transcription", []):
            words: list[WordTimestamp] = []

            # Word-level timestamps from tokens
            for token in seg.get("tokens", []):
                text = token.get("text", "").strip()
                if not text or text.startswith("["):
                    continue  # skip special tokens
                words.append(WordTimestamp(
                    text=text,
                    start=token.get("offsets", {}).get("from", 0) / 1000.0,
                    end=token.get("offsets", {}).get("to", 0) / 1000.0,
                    confidence=token.get("p", 0.5),
                ))

            segments.append(TranscriptSegment(
                text=seg.get("text", "").strip(),
                start=seg.get("offsets", {}).get("from", 0) / 1000.0,
                end=seg.get("offsets", {}).get("to", 0) / 1000.0,
                words=words,
            ))

        return segments

    def _ensure_wav(self, path: Path) -> Path:
        """Convert to 16kHz mono WAV if not already WAV."""
        if path.suffix.lower() == '.wav':
            return path

        wav_path = path.with_suffix('.tmp.wav')
        if shutil.which("ffmpeg"):
            subprocess.run(
                ["ffmpeg", "-i", str(path), "-ar", "16000", "-ac", "1",
                 "-y", str(wav_path)],
                capture_output=True, timeout=120,
            )
            if wav_path.exists():
                return wav_path

        return path  # hope for the best


class FasterWhisperTranscriber:
    """
    Transcribe using faster-whisper (CTranslate2 backend).

    Fallback when whisper.cpp is not available.
    Note: CPU-only on Mac (CTranslate2 has no Metal support).
    Note: May censor profanity with asterisks by default.
    """

    def __init__(
        self,
        model_size: str = "base",
        device: str = "auto",
        compute_type: str = "auto",
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None

    def is_available(self) -> bool:
        try:
            import faster_whisper  # noqa: F401
            return True
        except ImportError:
            return False

    def _get_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel
            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )
        return self._model

    def transcribe(
        self,
        audio_path: str | Path,
        language: str = "en",
    ) -> list[TranscriptSegment]:
        model = self._get_model()

        segments_iter, _info = model.transcribe(
            str(audio_path),
            language=language,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )

        result: list[TranscriptSegment] = []
        for segment in segments_iter:
            words: list[WordTimestamp] = []
            if segment.words:
                for w in segment.words:
                    words.append(WordTimestamp(
                        text=w.word.strip(),
                        start=w.start,
                        end=w.end,
                        confidence=w.probability,
                    ))

            result.append(TranscriptSegment(
                text=segment.text.strip(),
                start=segment.start,
                end=segment.end,
                words=words,
            ))

        return result


class AudioTranscriber:
    """
    Auto-selecting transcriber. Tries backends in order:
      1. whisper.cpp (fastest, verbatim, Metal GPU)
      2. faster-whisper (CPU fallback)

    Usage:
        transcriber = AudioTranscriber()
        segments = transcriber.transcribe("movie.mp4")
    """

    def __init__(
        self,
        model_size: str = "base",
        model_path: str | Path | None = None,
        backend: str = "auto",
        device: str = "auto",
        compute_type: str = "auto",
    ) -> None:
        self.model_size = model_size
        self.backend = backend
        self._transcriber = None
        self._model_path = model_path
        self._device = device
        self._compute_type = compute_type

    def _find_default_model(self) -> Path | None:
        """Search standard locations for a whisper.cpp GGML model."""
        search_dirs = [
            Path.home() / ".guardianstream" / "models",
            Path.home() / ".cache" / "whisper",
            Path("/opt/homebrew/share/whisper-cpp/models"),
        ]
        # Prefer turbo quantized, then turbo, then large-v3, then base
        model_preferences = [
            "ggml-large-v3-turbo-q5_0.bin",
            "ggml-large-v3-turbo.bin",
            "ggml-large-v3-q5_0.bin",
            "ggml-large-v3.bin",
            "ggml-base.en.bin",
            "ggml-base.bin",
            "ggml-tiny.en.bin",
        ]
        for d in search_dirs:
            if d.exists():
                for name in model_preferences:
                    p = d / name
                    if p.exists():
                        print(f"[Transcriber] Found model: {p}")
                        return p
                # Also check for any .bin file
                bins = list(d.glob("ggml-*.bin"))
                if bins:
                    print(f"[Transcriber] Found model: {bins[0]}")
                    return bins[0]
        return None

    def _get_transcriber(self):
        if self._transcriber is not None:
            return self._transcriber

        if self.backend == "whisper.cpp" or self.backend == "auto":
            # Auto-find model if not specified
            model_path = self._model_path
            if not model_path:
                model_path = self._find_default_model()
            cpp = WhisperCppTranscriber(model_path=model_path)
            if cpp.is_available() and model_path:
                self._transcriber = cpp
                print("[Transcriber] Using whisper.cpp (Metal GPU)")
                return cpp

        if self.backend == "faster-whisper" or self.backend == "auto":
            fw = FasterWhisperTranscriber(
                model_size=self.model_size,
                device=self._device,
                compute_type=self._compute_type,
            )
            if fw.is_available():
                self._transcriber = fw
                print("[Transcriber] Using faster-whisper (CPU)")
                return fw

        raise RuntimeError(
            "No transcription backend available. "
            "Install whisper.cpp (brew install whisper-cpp) "
            "or faster-whisper (pip install faster-whisper)."
        )

    def transcribe(
        self,
        audio_path: str | Path,
        language: str = "en",
    ) -> list[TranscriptSegment]:
        return self._get_transcriber().transcribe(audio_path, language)

    def transcribe_to_flat_words(
        self,
        audio_path: str | Path,
        language: str = "en",
    ) -> list[WordTimestamp]:
        segments = self.transcribe(audio_path, language)
        words: list[WordTimestamp] = []
        for seg in segments:
            words.extend(seg.words)
        return words


class SubtitleTranscriber:
    """
    Extract word-approximate timestamps from SRT subtitle files.

    Fallback when Whisper is unavailable or for pre-seeding titles
    where SRT files are available from OpenSubtitles.
    """

    def transcribe_srt(self, srt_path: str | Path) -> list[TranscriptSegment]:
        import pysrt

        subs = pysrt.open(str(srt_path))
        result: list[TranscriptSegment] = []

        for sub in subs:
            start = self._srt_time_to_seconds(sub.start)
            end = self._srt_time_to_seconds(sub.end)
            text = sub.text.replace('\n', ' ').strip()

            if not text:
                continue

            raw_words = text.split()
            duration = end - start
            word_duration = duration / max(len(raw_words), 1)

            words: list[WordTimestamp] = []
            for i, w in enumerate(raw_words):
                w_start = start + i * word_duration
                w_end = w_start + word_duration
                words.append(WordTimestamp(
                    text=w,
                    start=round(w_start, 3),
                    end=round(w_end, 3),
                    confidence=0.8,
                ))

            result.append(TranscriptSegment(
                text=text,
                start=start,
                end=end,
                words=words,
            ))

        return result

    @staticmethod
    def _srt_time_to_seconds(t) -> float:
        return t.hours * 3600 + t.minutes * 60 + t.seconds + t.milliseconds / 1000
