"""
Filter merger.

Combines audio and visual analysis outputs into a single GSF filter set.
Deduplicates overlapping segments with the same category root.
Produces the final JSON output ready for the API or local file.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ..audio.analyzer import AudioFilterSegment
from ..visual.analyzer import VisualFilterSegment


def merge_to_gsf(
    audio_segments: list[AudioFilterSegment],
    visual_segments: list[VisualFilterSegment],
    provider: str,
    provider_content_id: str,
    title: str,
    duration: float,
    audio_analyzed: bool = True,
    visual_analyzed: bool = True,
    scene_analyzed: bool = False,
) -> dict:
    """
    Merge audio and visual analysis into a GSF v2 filter set.

    Returns a dict matching the GSFFilterSet TypeScript type,
    ready for JSON serialization.
    """
    content_id = hashlib.sha256(
        f"{provider}:{provider_content_id}".encode()
    ).hexdigest()

    segments: list[dict] = []

    # Convert audio segments
    for seg in audio_segments:
        segments.append({
            "id": str(uuid.uuid4()),
            "start": seg.start,
            "end": seg.end,
            "category": seg.category,
            "severity": seg.severity,
            "action": seg.action,
            "confidence": round(seg.confidence, 3),
            "source": seg.source,
            "votes": 0,
            "words": seg.words,
            "wordTimestamps": [list(ts) for ts in seg.word_timestamps],
            "description": seg.description,
        })

    # Convert visual segments
    for seg in visual_segments:
        segments.append({
            "id": str(uuid.uuid4()),
            "start": seg.start,
            "end": seg.end,
            "category": seg.category,
            "severity": seg.severity,
            "action": seg.action,
            "confidence": round(seg.confidence, 3),
            "source": seg.source,
            "votes": 0,
            "description": seg.description,
        })

    # Sort by start time
    segments.sort(key=lambda s: s["start"])

    # Deduplicate overlapping segments with same category root
    segments = _deduplicate(segments)

    now = datetime.now(timezone.utc).isoformat()

    return {
        "version": "2.0",
        "contentId": content_id,
        "title": title,
        "provider": provider,
        "providerContentId": provider_content_id,
        "duration": duration,
        "segments": segments,
        "coverage": {
            "audioAnalyzed": audio_analyzed,
            "visualAnalyzed": visual_analyzed,
            "sceneAnalyzed": scene_analyzed,
            "humanReviewed": False,
            "completenessEstimate": _estimate_completeness(
                audio_analyzed, visual_analyzed, scene_analyzed
            ),
            "lastUpdated": now,
        },
    }


def save_gsf(gsf: dict, output_path: str | Path) -> None:
    """Save a GSF filter set to a JSON file."""
    with open(output_path, 'w') as f:
        json.dump(gsf, f, indent=2)


def _deduplicate(segments: list[dict]) -> list[dict]:
    """Merge overlapping segments with the same category root."""
    if not segments:
        return []

    result: list[dict] = [segments[0]]

    for seg in segments[1:]:
        prev = result[-1]
        seg_root = seg["category"].split('.')[0]
        prev_root = prev["category"].split('.')[0]

        if seg_root == prev_root and seg["start"] <= prev["end"] + 1.0:
            # Merge
            prev["end"] = max(prev["end"], seg["end"])
            prev["start"] = min(prev["start"], seg["start"])
            prev["severity"] = max(prev["severity"], seg["severity"])
            prev["confidence"] = max(prev["confidence"], seg["confidence"])
            if seg.get("description"):
                prev["description"] = f"{prev.get('description', '')}; {seg['description']}"
            if seg["severity"] > prev["severity"]:
                prev["category"] = seg["category"]
        else:
            result.append(seg)

    return result


def _estimate_completeness(audio: bool, visual: bool, scene: bool) -> float:
    """Estimate how complete the analysis is (0-1)."""
    score = 0.0
    if audio:
        score += 0.5   # Audio catches ~50% of filterable content
    if visual:
        score += 0.35  # Visual catches ~35%
    if scene:
        score += 0.15  # Scene context catches remaining ~15%
    return round(score, 2)
