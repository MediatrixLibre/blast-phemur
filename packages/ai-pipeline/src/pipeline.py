"""
GuardianStream AI Pipeline -- Full analysis entry point.

Orchestrates audio + visual analysis for a single title,
producing a complete GSF v2 filter set.

Usage:
    python -m src.pipeline --video movie.mp4 --provider netflix --id 81131850 --title "The Matrix"
    python -m src.pipeline --text "dialog transcript here" --provider test --id test1 --title "Test"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .audio.transcriber import AudioTranscriber, SubtitleTranscriber
from .audio.analyzer import AudioAnalyzer
from .visual.analyzer import VisualAnalyzer
from .merge.merger import merge_to_gsf, save_gsf


def analyze_video(
    video_path: str | Path,
    provider: str,
    provider_content_id: str,
    title: str,
    duration: float | None = None,
    whisper_model: str = "base",
    subtitle_path: str | Path | None = None,
    skip_visual: bool = False,
    output_path: str | Path | None = None,
) -> dict:
    """
    Full pipeline: analyze a video file and produce a GSF filter set.

    Args:
        video_path: Path to video file
        provider: Provider ID (e.g. "netflix")
        provider_content_id: Provider's content ID
        title: Human-readable title
        duration: Video duration in seconds (auto-detected if None)
        whisper_model: Whisper model size (tiny/base/small/medium/large-v3)
        subtitle_path: Optional SRT file (skips Whisper if provided)
        skip_visual: Skip visual analysis (faster, audio only)
        output_path: Optional path to save GSF JSON

    Returns:
        GSF filter set dict
    """
    video_path = Path(video_path)

    # Auto-detect duration
    if duration is None:
        duration = _get_duration(video_path)

    # Audio analysis
    print(f"[Pipeline] Analyzing audio for '{title}'...")
    if subtitle_path:
        print(f"[Pipeline] Using subtitle file: {subtitle_path}")
        transcriber = SubtitleTranscriber()
        segments = transcriber.transcribe_srt(subtitle_path)
    else:
        print(f"[Pipeline] Transcribing with Whisper ({whisper_model})...")
        transcriber = AudioTranscriber(model_size=whisper_model)
        segments = transcriber.transcribe(str(video_path))

    audio_analyzer = AudioAnalyzer()
    audio_segments = audio_analyzer.analyze(segments)
    print(f"[Pipeline] Found {len(audio_segments)} audio segments")

    # Visual analysis
    visual_segments = []
    if not skip_visual:
        print("[Pipeline] Analyzing video frames...")
        visual_analyzer = VisualAnalyzer()
        visual_segments = visual_analyzer.analyze(video_path)
        print(f"[Pipeline] Found {len(visual_segments)} visual segments")
    else:
        print("[Pipeline] Visual analysis skipped")

    # Merge
    gsf = merge_to_gsf(
        audio_segments=audio_segments,
        visual_segments=visual_segments,
        provider=provider,
        provider_content_id=provider_content_id,
        title=title,
        duration=duration,
        audio_analyzed=True,
        visual_analyzed=not skip_visual,
    )

    total = len(gsf["segments"])
    print(f"[Pipeline] Complete: {total} total segments for '{title}'")

    # Save
    if output_path:
        save_gsf(gsf, output_path)
        print(f"[Pipeline] Saved to {output_path}")

    return gsf


def analyze_text(
    text: str,
    provider: str = "test",
    provider_content_id: str = "test",
    title: str = "Test",
) -> dict:
    """Quick text-only analysis (no video, no Whisper). For testing."""
    audio_analyzer = AudioAnalyzer()
    audio_segments = audio_analyzer.analyze_text(text)

    return merge_to_gsf(
        audio_segments=audio_segments,
        visual_segments=[],
        provider=provider,
        provider_content_id=provider_content_id,
        title=title,
        duration=len(text) * 0.08,  # rough estimate
        visual_analyzed=False,
    )


def _get_duration(video_path: Path) -> float:
    """Get video duration using ffprobe or cv2."""
    try:
        import cv2
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        cap.release()
        if fps > 0:
            return frames / fps
    except ImportError:
        pass

    # Fallback: assume 2 hours
    return 7200.0


def main():
    parser = argparse.ArgumentParser(description="GuardianStream AI Pipeline")
    parser.add_argument("--video", type=str, help="Path to video file")
    parser.add_argument("--subtitle", type=str, help="Path to SRT subtitle file")
    parser.add_argument("--text", type=str, help="Raw text to analyze (testing)")
    parser.add_argument("--provider", type=str, default="test", help="Provider ID")
    parser.add_argument("--id", type=str, default="test", help="Content ID")
    parser.add_argument("--title", type=str, default="Test", help="Title")
    parser.add_argument("--duration", type=float, help="Duration in seconds")
    parser.add_argument("--model", type=str, default="base", help="Whisper model size")
    parser.add_argument("--skip-visual", action="store_true", help="Skip visual analysis")
    parser.add_argument("--output", "-o", type=str, help="Output GSF JSON path")
    args = parser.parse_args()

    if args.text:
        gsf = analyze_text(args.text, args.provider, args.id, args.title)
    elif args.video:
        gsf = analyze_video(
            args.video,
            provider=args.provider,
            provider_content_id=args.id,
            title=args.title,
            duration=args.duration,
            whisper_model=args.model,
            subtitle_path=args.subtitle,
            skip_visual=args.skip_visual,
            output_path=args.output,
        )
    else:
        parser.print_help()
        sys.exit(1)

    if not args.output:
        print(json.dumps(gsf, indent=2))


if __name__ == "__main__":
    main()
