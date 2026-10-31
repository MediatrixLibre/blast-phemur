"""
Combined audio analyzer.

Takes a transcript (from Whisper or SRT) and runs:
  1. Blasphemy detection (pattern matcher + context classifier)
  2. Profanity/slur/crude/sexual word matching
  3. Merges adjacent segments

Output: list of AudioFilterSegment objects ready for GSF format.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..blasphemy.detector import BlasphemyDetector
from .transcriber import TranscriptSegment, WordTimestamp


@dataclass
class AudioFilterSegment:
    """A detected audio segment ready for the GSF filter file."""
    start: float
    end: float
    category: str
    severity: int
    action: str
    confidence: float
    words: list[str]
    word_timestamps: list[tuple[float, float]]
    source: str  # "ai"
    description: str


# Severity mapping for profanity categories
CATEGORY_SEVERITY: dict[str, int] = {
    "language.profanity": 2,
    "language.slur": 3,
    "language.crude": 1,
    "language.sexual_reference": 2,
}


class AudioAnalyzer:
    """
    Analyze a transcript for blasphemy and profanity.

    Usage:
        analyzer = AudioAnalyzer()
        # From Whisper output:
        segments = analyzer.analyze(transcript_segments)
        # From raw text (for testing):
        segments = analyzer.analyze_text("That goddamn movie was shit.")
    """

    def __init__(self, wordlist_dir: str | Path | None = None) -> None:
        self.blasphemy_detector = BlasphemyDetector()

        # Load word lists
        if wordlist_dir is None:
            wordlist_dir = Path(__file__).parent.parent / "wordlists"
        else:
            wordlist_dir = Path(wordlist_dir)

        self.profanity = self._load_wordlist(wordlist_dir / "profanity.txt")
        self.slurs = self._load_wordlist(wordlist_dir / "slurs.txt")
        self.crude = self._load_wordlist(wordlist_dir / "crude.txt")
        self.sexual_ref = self._load_wordlist(wordlist_dir / "sexual_reference.txt")
        # Stems that make a profanity word severity 3 ("Severe" still filters it)
        self.strong_stems = self._load_wordlist(wordlist_dir / "profanity_strong.txt")

    def _severity(self, category: str, word: str) -> int:
        if category == "language.profanity" and any(stem in word for stem in self.strong_stems):
            return 3
        return CATEGORY_SEVERITY.get(category, 2)

    def analyze(
        self,
        segments: list[TranscriptSegment],
    ) -> list[AudioFilterSegment]:
        """
        Analyze transcript segments for all language content.

        Args:
            segments: Output from AudioTranscriber or SubtitleTranscriber

        Returns:
            Filter segments sorted by start time, merged where adjacent.
        """
        results: list[AudioFilterSegment] = []

        for seg in segments:
            # Get surrounding context for blasphemy classifier
            seg_idx = segments.index(seg)
            context_before = segments[seg_idx - 1].text if seg_idx > 0 else ""
            context_after = segments[seg_idx + 1].text if seg_idx < len(segments) - 1 else ""

            # 1. Blasphemy detection on the full segment text
            blasphemy_hits = self.blasphemy_detector.detect(
                seg.text, context_before, context_after
            )

            for hit in blasphemy_hits:
                # Map character positions back to word timestamps
                word_ts = self._char_to_word_timestamps(
                    seg.text, hit.start_char, hit.end_char, seg.words
                )
                if word_ts:
                    start = max(0, word_ts[0][0] - 0.05)
                    end = word_ts[-1][1] + 0.05
                else:
                    start = seg.start
                    end = seg.end

                results.append(AudioFilterSegment(
                    start=round(start, 3),
                    end=round(end, 3),
                    category=hit.category,
                    severity=hit.severity,
                    action="mute",
                    confidence=hit.confidence,
                    words=[hit.text],
                    word_timestamps=word_ts,
                    source="ai",
                    description=f"Blasphemy: {hit.text} ({hit.method})",
                ))

            # 2. Profanity/slur/crude/sexual word matching
            for word_info in seg.words:
                word_lower = word_info.text.lower().strip(".,!?;:'\"()-")
                if not word_lower:
                    continue

                # Skip if already caught by blasphemy detector
                already_caught = any(
                    r.start <= word_info.start <= r.end
                    for r in results
                )
                if already_caught:
                    continue

                category = self._classify_word(word_lower)
                if category:
                    results.append(AudioFilterSegment(
                        start=round(max(0, word_info.start - 0.05), 3),
                        end=round(word_info.end + 0.05, 3),
                        category=category,
                        severity=self._severity(category, word_lower),
                        action="mute",
                        confidence=word_info.confidence,
                        words=[word_lower],
                        word_timestamps=[(word_info.start, word_info.end)],
                        source="ai",
                        description=f"Language: {word_lower}",
                    ))

        # Sort and merge
        results.sort(key=lambda r: r.start)
        return self._merge_adjacent(results, gap_threshold=0.3)

    def analyze_text(self, text: str) -> list[AudioFilterSegment]:
        """
        Convenience: analyze raw text (no timestamps).
        Uses character positions as fake timestamps for testing.
        """
        words: list[WordTimestamp] = []
        pos = 0.0
        for w in text.split():
            duration = len(w) * 0.08  # ~80ms per character
            words.append(WordTimestamp(
                text=w,
                start=round(pos, 3),
                end=round(pos + duration, 3),
                confidence=0.9,
            ))
            pos += duration + 0.1

        segment = TranscriptSegment(
            text=text,
            start=0.0,
            end=pos,
            words=words,
        )
        return self.analyze([segment])

    def _classify_word(self, word: str) -> str | None:
        """Classify a word into a language category."""
        if word in self.profanity:
            return "language.profanity"
        if word in self.slurs:
            return "language.slur"
        if word in self.crude:
            return "language.crude"
        if word in self.sexual_ref:
            return "language.sexual_reference"
        return None

    @staticmethod
    def _char_to_word_timestamps(
        text: str,
        char_start: int,
        char_end: int,
        words: list[WordTimestamp],
    ) -> list[tuple[float, float]]:
        """Map character offsets in text back to word-level audio timestamps."""
        result: list[tuple[float, float]] = []
        char_pos = 0
        for word in words:
            word_start_char = text.lower().find(word.text.lower(), char_pos)
            if word_start_char == -1:
                char_pos += len(word.text) + 1
                continue
            word_end_char = word_start_char + len(word.text)

            # Check if this word overlaps with the target character range
            if word_end_char > char_start and word_start_char < char_end:
                result.append((word.start, word.end))

            char_pos = word_end_char + 1

        return result

    @staticmethod
    def _merge_adjacent(
        segments: list[AudioFilterSegment],
        gap_threshold: float,
    ) -> list[AudioFilterSegment]:
        """Merge segments that are very close together with the same category root."""
        if not segments:
            return []

        merged: list[AudioFilterSegment] = [segments[0]]
        for seg in segments[1:]:
            prev = merged[-1]
            same_root = seg.category.split('.')[0] == prev.category.split('.')[0]
            close = seg.start - prev.end < gap_threshold

            if same_root and close:
                # Merge into previous
                merged[-1] = AudioFilterSegment(
                    start=prev.start,
                    end=seg.end,
                    category=seg.category if seg.severity > prev.severity else prev.category,
                    severity=max(prev.severity, seg.severity),
                    action="mute",
                    confidence=min(prev.confidence, seg.confidence),
                    words=prev.words + seg.words,
                    word_timestamps=prev.word_timestamps + seg.word_timestamps,
                    source="ai",
                    description=f"{prev.description}; {seg.description}",
                )
            else:
                merged.append(seg)

        return merged

    @staticmethod
    def _load_wordlist(path: Path) -> set[str]:
        """Load a word list file (one word per line)."""
        try:
            with open(path) as f:
                return {line.strip().lower() for line in f
                        if line.strip() and not line.startswith("#")}
        except FileNotFoundError:
            return set()


# === Test ===
if __name__ == "__main__":
    analyzer = AudioAnalyzer()

    test_texts = [
        "That goddamn movie was total shit. Jesus Christ, what a disaster.",
        "Oh my God, I am heartily sorry for having offended Thee.",
        "The fucking idiot called her a bitch and a whore.",
        "She knelt and prayed. Lord, hear our prayer. Then she left.",
        "Holy shit, that asshole just cut me off. What a dick.",
    ]

    for text in test_texts:
        print(f'\n--- "{text}" ---')
        segs = analyzer.analyze_text(text)
        if segs:
            for s in segs:
                print(f"  [{s.category}] sev:{s.severity} conf:{s.confidence:.0%} "
                      f"({s.start:.2f}-{s.end:.2f}s) words:{s.words}")
        else:
            print("  CLEAN")
