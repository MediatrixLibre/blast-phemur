"""
Visual content analyzer.

Detects nudity (via NudeNet) and violence (via pluggable model)
at frame level, then clusters detections into continuous segments.

Architecture:
  - Sample frames at configurable FPS (default 2fps)
  - Run NudeNet for nudity classification
  - Run violence model (placeholder, swappable)
  - Cluster adjacent positive frames into segments with padding
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class VisualFilterSegment:
    """A detected visual segment ready for the filter file."""
    start: float
    end: float
    category: str
    severity: int     # 1-3
    action: str       # "skip", "blur", "black"
    confidence: float
    labels: list[str] = field(default_factory=list)
    source: str = "ai"
    description: str = ""


# NudeNet label -> severity mapping
NUDITY_EXPLICIT = {
    "FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED",
    "FEMALE_BREAST_EXPOSED", "BUTTOCKS_EXPOSED", "ANUS_EXPOSED",
}
NUDITY_MODERATE = {
    "FEMALE_BREAST_COVERED", "BELLY_EXPOSED",
    "BUTTOCKS_COVERED", "ARMPITS_EXPOSED",
}


class VisualAnalyzer:
    """
    Analyze video frames for nudity and violence.

    Usage:
        analyzer = VisualAnalyzer()
        segments = analyzer.analyze("movie.mp4")
    """

    def __init__(self, sample_fps: float = 2.0) -> None:
        self.sample_fps = sample_fps
        self._nude_detector = None
        self._violence_model = None

    def _get_nude_detector(self):
        """Lazy-load NudeNet."""
        if self._nude_detector is None:
            try:
                from nudenet import NudeDetector
                self._nude_detector = NudeDetector()
            except ImportError:
                return None
        return self._nude_detector

    def analyze(
        self,
        video_path: str | Path,
        detect_nudity: bool = True,
        detect_violence: bool = True,
    ) -> list[VisualFilterSegment]:
        """
        Analyze video for visual content.

        Args:
            video_path: Path to video file
            detect_nudity: Run NudeNet nudity detection
            detect_violence: Run violence detection model

        Returns:
            List of VisualFilterSegment sorted by start time.
        """
        try:
            import cv2
        except ImportError:
            print("[VisualAnalyzer] OpenCV not available, skipping visual analysis")
            return []

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return []

        native_fps = cap.get(cv2.CAP_PROP_FPS)
        if native_fps <= 0:
            native_fps = 24.0
        frame_interval = max(1, int(native_fps / self.sample_fps))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        raw_detections: list[dict] = []
        frame_idx = 0

        while frame_idx < total_frames:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret:
                break

            timestamp = frame_idx / native_fps

            if detect_nudity:
                nudity = self._detect_nudity(frame)
                if nudity:
                    raw_detections.append({
                        "timestamp": timestamp,
                        "type": "nudity",
                        "labels": nudity["labels"],
                        "confidence": nudity["confidence"],
                        "severity": nudity["severity"],
                    })

            if detect_violence:
                violence = self._detect_violence(frame)
                if violence:
                    raw_detections.append({
                        "timestamp": timestamp,
                        "type": "violence",
                        "labels": ["violence"],
                        "confidence": violence["confidence"],
                        "severity": violence["severity"],
                    })

            frame_idx += frame_interval

        cap.release()
        return self._cluster_to_segments(raw_detections)

    def _detect_nudity(self, frame) -> dict | None:
        """Run NudeNet on a single frame."""
        detector = self._get_nude_detector()
        if detector is None:
            return None

        results = detector.detect(frame)
        positive = [r for r in results if r["score"] > 0.6]
        if not positive:
            return None

        labels = [r["class"] for r in positive]
        confidence = max(r["score"] for r in positive)
        severity = self._nudity_severity(labels)

        return {"labels": labels, "confidence": confidence, "severity": severity}

    def _detect_violence(self, frame) -> dict | None:
        """
        Violence detection placeholder.

        Replace with a real model (3D-CNN, ViViT, etc.) when available.
        Currently returns None (no detection).
        """
        # TODO: Integrate violence detection model
        # Options: 3D-CNN trained on Hockey Fight / Crowd Violence datasets
        # or ViViT (Video Vision Transformer)
        return None

    @staticmethod
    def _nudity_severity(labels: list[str]) -> int:
        """Map NudeNet labels to severity level."""
        if any(l in NUDITY_EXPLICIT for l in labels):
            return 3
        if any(l in NUDITY_MODERATE for l in labels):
            return 2
        return 1

    def _cluster_to_segments(
        self,
        detections: list[dict],
        padding: float = 0.5,
    ) -> list[VisualFilterSegment]:
        """Cluster per-frame detections into continuous segments."""
        if not detections:
            return []

        # Group by type
        by_type: dict[str, list[dict]] = {}
        for d in detections:
            by_type.setdefault(d["type"], []).append(d)

        segments: list[VisualFilterSegment] = []
        gap_threshold = 2.0 / self.sample_fps

        for det_type, dets in by_type.items():
            dets.sort(key=lambda d: d["timestamp"])

            current_start = dets[0]["timestamp"]
            current_end = dets[0]["timestamp"]
            current_labels: set[str] = set(dets[0]["labels"])
            current_max_conf = dets[0]["confidence"]
            current_max_sev = dets[0]["severity"]

            for det in dets[1:]:
                if det["timestamp"] - current_end <= gap_threshold:
                    current_end = det["timestamp"]
                    current_labels.update(det["labels"])
                    current_max_conf = max(current_max_conf, det["confidence"])
                    current_max_sev = max(current_max_sev, det["severity"])
                else:
                    segments.append(self._make_segment(
                        det_type, current_start, current_end,
                        list(current_labels), current_max_conf,
                        current_max_sev, padding,
                    ))
                    current_start = det["timestamp"]
                    current_end = det["timestamp"]
                    current_labels = set(det["labels"])
                    current_max_conf = det["confidence"]
                    current_max_sev = det["severity"]

            segments.append(self._make_segment(
                det_type, current_start, current_end,
                list(current_labels), current_max_conf,
                current_max_sev, padding,
            ))

        segments.sort(key=lambda s: s.start)
        return segments

    @staticmethod
    def _make_segment(
        det_type: str,
        start: float,
        end: float,
        labels: list[str],
        confidence: float,
        severity: int,
        padding: float,
    ) -> VisualFilterSegment:
        """Create a VisualFilterSegment from clustered detection data."""
        if det_type == "nudity":
            category = "nudity" if severity >= 3 else "sexual_content.implied"
            action = "blur"
        elif det_type == "violence":
            cat_map = {3: "violence.graphic", 2: "violence.moderate", 1: "violence.mild"}
            category = cat_map.get(severity, "violence.mild")
            action = "skip"
        else:
            category = f"disturbing.{det_type}"
            action = "skip"

        return VisualFilterSegment(
            start=round(max(0, start - padding), 3),
            end=round(end + padding, 3),
            category=category,
            severity=severity,
            action=action,
            confidence=round(confidence, 3),
            labels=labels,
            source="ai",
            description=f"Visual: {', '.join(labels)}",
        )
