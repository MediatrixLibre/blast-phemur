"""
GuardianStream Plex Integration

Converts GSF filter sets to PlexAutoSkip-compatible JSON format.
PlexAutoSkip (219 stars) monitors Plex playback and triggers skip/mute
actions based on custom marker files.

Pipeline:
  1. Query GuardianStream API for filter data (by IMDB/TMDB ID)
  2. Convert GSF segments to PlexAutoSkip markers
  3. PlexAutoSkip handles the actual skip/mute during playback

Extends: mdhiggins/PlexAutoSkip
Also compatible with: cleanvid JSON output format

Usage:
    python plex_guardian.py --content-id "imdb:tt0111161" --output markers.json
    python plex_guardian.py --gsf-file filters.gsf.json --output markers.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


def gsf_to_plexautoskip(gsf: dict, plex_rating_key: str | None = None) -> dict:
    """
    Convert a GSF filter set to PlexAutoSkip JSON format.

    PlexAutoSkip expects:
    {
        "markers": {
            "<ratingKey>": [
                {"start": 125.0, "end": 128.5, "mode": "volume"},
                {"start": 567.0, "end": 572.0, "mode": "skip"}
            ]
        }
    }

    Args:
        gsf: GSF filter set dict
        plex_rating_key: Plex media rating key (if known)

    Returns:
        PlexAutoSkip-compatible JSON dict
    """
    key = plex_rating_key or gsf.get("providerContentId", gsf.get("contentId", "unknown"))

    markers: list[dict[str, Any]] = []
    for seg in gsf.get("segments", []):
        action = seg.get("action", "mute")

        if action in ("skip", "black"):
            mode = "skip"
        else:
            # mute, bleep, blur -> volume mode (PlexAutoSkip mutes audio)
            mode = "volume"

        markers.append({
            "start": seg["start"],
            "end": seg["end"],
            "mode": mode,
        })

    # Sort by start time and merge overlapping markers with same mode
    markers.sort(key=lambda m: m["start"])
    markers = _merge_markers(markers)

    return {
        "markers": {
            key: markers,
        }
    }


def gsf_to_edl(gsf: dict) -> str:
    """
    Convert a GSF filter set to EDL format for Kodi/MPlayer.

    EDL format: start_seconds\\tend_seconds\\taction
    Actions: 0=cut, 1=mute, 2=scene marker, 3=skip
    """
    lines: list[str] = []
    for seg in gsf.get("segments", []):
        action = seg.get("action", "mute")
        edl_action = 1  # default: mute
        if action in ("skip", "black"):
            edl_action = 0  # cut/skip

        lines.append(f"{seg['start']:.3f}\t{seg['end']:.3f}\t{edl_action}")

    return "\n".join(lines)


def fetch_gsf_from_api(
    provider: str,
    content_id: str,
    api_url: str = "http://localhost:3100",
) -> dict | None:
    """Fetch GSF filter set from GuardianStream API using hash-prefix privacy."""
    import urllib.request

    full_id = hashlib.sha256(f"{provider}:{content_id}".encode()).hexdigest()
    prefix = full_id[:4]

    try:
        url = f"{api_url}/api/v1/filters/{prefix}"
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read())

        # Client-side exact match
        for filter_set in data:
            if filter_set.get("contentId") == full_id:
                return filter_set
    except Exception as e:
        print(f"[Plex Guardian] API error: {e}", file=sys.stderr)

    return None


def _merge_markers(markers: list[dict]) -> list[dict]:
    """Merge overlapping markers with the same mode."""
    if not markers:
        return []

    merged = [markers[0]]
    for m in markers[1:]:
        prev = merged[-1]
        if m["mode"] == prev["mode"] and m["start"] <= prev["end"] + 1.0:
            prev["end"] = max(prev["end"], m["end"])
        else:
            merged.append(m)

    return merged


def main():
    parser = argparse.ArgumentParser(description="GuardianStream Plex Integration")
    parser.add_argument("--gsf-file", type=str, help="Path to GSF JSON file")
    parser.add_argument("--content-id", type=str, help="Content ID (e.g., 'imdb:tt0111161')")
    parser.add_argument("--provider", type=str, default="plex", help="Provider ID")
    parser.add_argument("--plex-key", type=str, help="Plex rating key")
    parser.add_argument("--api-url", type=str, default="http://localhost:3100")
    parser.add_argument("--output", "-o", type=str, help="Output file path")
    parser.add_argument("--format", choices=["plexautoskip", "edl"], default="plexautoskip")
    args = parser.parse_args()

    # Load GSF data
    gsf = None
    if args.gsf_file:
        with open(args.gsf_file) as f:
            gsf = json.load(f)
    elif args.content_id:
        gsf = fetch_gsf_from_api(args.provider, args.content_id, args.api_url)
    else:
        parser.error("Provide --gsf-file or --content-id")

    if not gsf:
        print("No filter data found.", file=sys.stderr)
        sys.exit(1)

    # Convert
    if args.format == "plexautoskip":
        output = gsf_to_plexautoskip(gsf, args.plex_key)
        output_str = json.dumps(output, indent=2)
    else:
        output_str = gsf_to_edl(gsf)

    # Output
    if args.output:
        with open(args.output, "w") as f:
            f.write(output_str)
        print(f"Saved to {args.output}")
    else:
        print(output_str)


if __name__ == "__main__":
    main()
