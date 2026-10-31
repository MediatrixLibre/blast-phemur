"""
Batch processing runner for pre-seeding the GuardianStream database.

Processes a queue of titles:
  1. Fetch SRT subtitle for each title
  2. Run audio analysis (blasphemy + profanity detection)
  3. Generate GSF filter set
  4. Save to local file + optionally upload to API

Usage:
    python -m src.batch.runner --output-dir ./seed-output
    python -m src.batch.runner --output-dir ./seed-output --upload --api-url http://localhost:3100
    python -m src.batch.runner --limit 10  # process first 10 only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

from .seed_titles import get_seed_titles, SeedTitle
from .subtitle_fetcher import fetch_subtitle_for_title
from ..audio.transcriber import SubtitleTranscriber
from ..audio.analyzer import AudioAnalyzer
from ..merge.merger import merge_to_gsf, save_gsf


def process_title(
    title: SeedTitle,
    subtitle_dir: Path,
    output_dir: Path,
    analyzer: AudioAnalyzer,
    transcriber: SubtitleTranscriber,
) -> dict | None:
    """Process a single title and return its GSF filter set."""
    print(f"\n[Batch] Processing: {title.title} ({title.year}) [{title.provider}]")

    # Step 1: Get subtitle
    srt_path = fetch_subtitle_for_title(title, subtitle_dir)
    if srt_path is None:
        print(f"[Batch] SKIP: No subtitle available for {title.title}")
        return None

    # Step 2: Parse SRT
    try:
        segments = transcriber.transcribe_srt(srt_path)
    except Exception as e:
        print(f"[Batch] SKIP: SRT parse error for {title.title}: {e}")
        return None

    if not segments:
        print(f"[Batch] SKIP: Empty subtitle for {title.title}")
        return None

    # Step 3: Analyze
    audio_results = analyzer.analyze(segments)

    # Step 4: Build GSF
    gsf = merge_to_gsf(
        audio_segments=audio_results,
        visual_segments=[],
        provider=title.provider,
        provider_content_id=title.content_id,
        title=f"{title.title} ({title.year})",
        duration=float(title.duration),
        visual_analyzed=False,
    )

    # Step 5: Save
    content_id = hashlib.sha256(
        f"{title.provider}:{title.content_id}".encode()
    ).hexdigest()
    output_path = output_dir / f"{content_id[:8]}_{title.imdb_id}.gsf.json"
    save_gsf(gsf, output_path)

    seg_count = len(gsf["segments"])
    blasphemy = sum(1 for s in gsf["segments"] if s["category"].startswith("blasphemy"))
    language = sum(1 for s in gsf["segments"] if s["category"].startswith("language"))

    print(f"[Batch] DONE: {seg_count} segments ({blasphemy} blasphemy, {language} language)")
    return gsf


def upload_to_api(gsf: dict, api_url: str) -> bool:
    """Upload a GSF filter set to the API server."""
    import urllib.request

    try:
        data = json.dumps(gsf).encode()
        req = urllib.request.Request(
            f"{api_url}/api/v1/filters/submit",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status == 201
    except Exception as e:
        print(f"[Batch] Upload error: {e}")
        return False


def run_batch(
    output_dir: str = "./seed-output",
    subtitle_dir: str = "./seed-subtitles",
    limit: int | None = None,
    upload: bool = False,
    api_url: str = "http://localhost:3100",
) -> dict:
    """
    Process all seed titles.

    Returns summary statistics.
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    subtitle_path = Path(subtitle_dir)
    subtitle_path.mkdir(parents=True, exist_ok=True)

    titles = get_seed_titles()
    if limit:
        titles = titles[:limit]

    analyzer = AudioAnalyzer()
    transcriber = SubtitleTranscriber()

    stats = {
        "total": len(titles),
        "processed": 0,
        "skipped": 0,
        "uploaded": 0,
        "total_segments": 0,
        "total_blasphemy": 0,
        "total_language": 0,
    }

    start_time = time.time()

    for i, title in enumerate(titles):
        print(f"\n{'='*60}")
        print(f"[Batch] [{i+1}/{len(titles)}] {title.title}")

        gsf = process_title(title, subtitle_path, output_path, analyzer, transcriber)

        if gsf is None:
            stats["skipped"] += 1
            continue

        stats["processed"] += 1
        stats["total_segments"] += len(gsf["segments"])
        stats["total_blasphemy"] += sum(
            1 for s in gsf["segments"] if s["category"].startswith("blasphemy")
        )
        stats["total_language"] += sum(
            1 for s in gsf["segments"] if s["category"].startswith("language")
        )

        if upload:
            if upload_to_api(gsf, api_url):
                stats["uploaded"] += 1
                print(f"[Batch] Uploaded to API")

    elapsed = time.time() - start_time
    stats["elapsed_seconds"] = round(elapsed, 1)

    print(f"\n{'='*60}")
    print(f"[Batch] COMPLETE")
    print(f"  Processed: {stats['processed']}/{stats['total']}")
    print(f"  Skipped: {stats['skipped']}")
    print(f"  Total segments: {stats['total_segments']}")
    print(f"  Blasphemy: {stats['total_blasphemy']}")
    print(f"  Language: {stats['total_language']}")
    print(f"  Time: {elapsed:.1f}s")
    if upload:
        print(f"  Uploaded: {stats['uploaded']}")

    return stats


def main():
    parser = argparse.ArgumentParser(description="GuardianStream Batch Processor")
    parser.add_argument("--output-dir", "-o", default="./seed-output")
    parser.add_argument("--subtitle-dir", "-s", default="./seed-subtitles")
    parser.add_argument("--limit", type=int, help="Process only first N titles")
    parser.add_argument("--upload", action="store_true", help="Upload to API server")
    parser.add_argument("--api-url", default="http://localhost:3100")
    args = parser.parse_args()

    run_batch(
        output_dir=args.output_dir,
        subtitle_dir=args.subtitle_dir,
        limit=args.limit,
        upload=args.upload,
        api_url=args.api_url,
    )


if __name__ == "__main__":
    main()
