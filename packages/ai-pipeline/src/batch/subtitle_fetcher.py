"""
Subtitle fetcher for pre-seeding.

Downloads SRT subtitle files for titles using:
  1. subliminal library (searches OpenSubtitles, Addic7ed, etc.)
  2. Direct OpenSubtitles API (if API key available)
  3. Manual SRT file lookup from local directory

For the pre-seeding pipeline, subtitles are the fastest way to
generate filter data -- no GPU needed, just text analysis.
"""

from __future__ import annotations

import os
from pathlib import Path

from .seed_titles import SeedTitle


def fetch_subtitle_for_title(
    title: SeedTitle,
    output_dir: str | Path,
) -> Path | None:
    """
    Attempt to download an English SRT subtitle for a title.

    Tries subliminal first, falls back to checking local directory.
    Returns path to the SRT file, or None if not found.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    srt_filename = f"{title.imdb_id}_{_safe_filename(title.title)}.srt"
    srt_path = output_dir / srt_filename

    # Already downloaded?
    if srt_path.exists() and srt_path.stat().st_size > 100:
        return srt_path

    # Try subliminal
    try:
        return _fetch_with_subliminal(title, srt_path)
    except Exception as e:
        print(f"[SubFetch] subliminal failed for {title.title}: {e}")

    # Try manual lookup
    manual = _check_manual_directory(title)
    if manual:
        return manual

    print(f"[SubFetch] No subtitle found for {title.title} ({title.imdb_id})")
    return None


def _fetch_with_subliminal(title: SeedTitle, output_path: Path) -> Path | None:
    """Use subliminal library to search multiple subtitle providers."""
    try:
        from babelfish import Language
        from subliminal import download_best_subtitles, save_subtitles, Video

        video = Video.fromname(f"{title.title} ({title.year}).mp4")
        # Override IMDB ID for better matching
        video.imdb_id = title.imdb_id

        subtitles = download_best_subtitles(
            {video},
            {Language('eng')},
            providers=['opensubtitlescom', 'addic7ed', 'podnapisi'],
        )

        if subtitles.get(video):
            best = subtitles[video][0]
            # Save as SRT
            with open(output_path, 'wb') as f:
                f.write(best.content)
            print(f"[SubFetch] Downloaded: {output_path.name}")
            return output_path

    except ImportError:
        print("[SubFetch] subliminal not installed (pip install subliminal)")

    return None


def _check_manual_directory(title: SeedTitle) -> Path | None:
    """Check for manually placed SRT files in common locations."""
    search_dirs = [
        Path("test-data/subtitles"),
        Path("subtitles"),
        Path.home() / "subtitles",
    ]
    patterns = [
        f"{title.imdb_id}*.srt",
        f"*{_safe_filename(title.title)}*.srt",
    ]
    for d in search_dirs:
        if d.exists():
            for pattern in patterns:
                matches = list(d.glob(pattern))
                if matches:
                    return matches[0]
    return None


def _safe_filename(s: str) -> str:
    """Convert a title to a safe filename."""
    return "".join(c if c.isalnum() or c in " -_" else "" for c in s).strip().replace(" ", "_")[:50]
