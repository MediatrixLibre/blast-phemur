"""
Combined blasphemy detector.

Wires together:
  1. Pattern matcher (finds sacred terms + unambiguous blasphemy)
  2. Context classifier (distinguishes reverent from profane)

Input: text with word-level timestamps (from Whisper/WhisperX)
Output: list of filter segments ready for GSF format
"""

from __future__ import annotations

from dataclasses import dataclass

from .pattern_matcher import BlasphemyMatch, BlasphemyPatternMatcher
from .context_classifier import BlasphemyContextClassifier, SacredUsage


@dataclass
class BlasphemyDetection:
    """A confirmed blasphemy detection ready for the filter file."""

    text: str
    start_char: int
    end_char: int
    category: str           # "blasphemy.gods_name", etc.
    severity: int           # 1-3
    confidence: float       # 0.0-1.0
    action: str             # "mute"
    method: str             # "unambiguous", "rule_classified", "ml_classified"
    reasoning: str


class BlasphemyDetector:
    """
    Full blasphemy detection pipeline.

    Usage:
        detector = BlasphemyDetector()
        detections = detector.detect("Oh my God, that's disgusting. Goddamn car.")
        for d in detections:
            print(f"{d.text} -> {d.category} (confidence: {d.confidence})")
    """

    def __init__(self) -> None:
        self.matcher = BlasphemyPatternMatcher()
        self.classifier = BlasphemyContextClassifier()

    def detect(
        self,
        text: str,
        context_before: str = "",
        context_after: str = "",
    ) -> list[BlasphemyDetection]:
        """
        Detect blasphemy in text.

        Returns only confirmed profane usage. Reverent and neutral
        uses are filtered out.
        """
        matches = self.matcher.find_all(text)
        detections: list[BlasphemyDetection] = []

        for match in matches:
            if not match.needs_ml_review:
                # Unambiguous: always blasphemous
                detections.append(BlasphemyDetection(
                    text=match.text,
                    start_char=match.start,
                    end_char=match.end,
                    category=match.category,
                    severity=match.severity,
                    confidence=0.95,
                    action="mute",
                    method="unambiguous",
                    reasoning=f"Unambiguous blasphemous phrase: '{match.text}'",
                ))
            else:
                # Context-dependent: run classifier
                # Extract the sentence containing this match
                sentence = self._extract_sentence(text, match.start, match.end)
                sacred_term = match.text.strip()

                result = self.classifier.classify(
                    sentence=sentence,
                    sacred_term=sacred_term,
                    context_before=context_before,
                    context_after=context_after,
                )

                if result.label == SacredUsage.PROFANE:
                    detections.append(BlasphemyDetection(
                        text=match.text,
                        start_char=match.start,
                        end_char=match.end,
                        category=match.category,
                        severity=match.severity,
                        confidence=result.confidence,
                        action="mute",
                        method=f"{'rule' if result.method == 'rule' else 'ml'}_classified",
                        reasoning=result.reasoning,
                    ))
                # Reverent and neutral uses are silently dropped

        return detections

    def detect_all_with_labels(
        self,
        text: str,
        context_before: str = "",
        context_after: str = "",
    ) -> list[tuple[BlasphemyMatch, SacredUsage | None, float]]:
        """
        Like detect(), but returns ALL matches with their classification.
        Useful for debugging and training data review.

        Returns: list of (match, usage_label, confidence)
        """
        matches = self.matcher.find_all(text)
        results: list[tuple[BlasphemyMatch, SacredUsage | None, float]] = []

        for match in matches:
            if not match.needs_ml_review:
                results.append((match, SacredUsage.PROFANE, 0.95))
            else:
                sentence = self._extract_sentence(text, match.start, match.end)
                result = self.classifier.classify(
                    sentence=sentence,
                    sacred_term=match.text.strip(),
                    context_before=context_before,
                    context_after=context_after,
                )
                results.append((match, result.label, result.confidence))

        return results

    @staticmethod
    def _extract_sentence(text: str, start: int, end: int) -> str:
        """Extract the sentence containing the character range [start, end]."""
        # Walk backward to sentence boundary
        s = start
        while s > 0 and text[s - 1] not in '.!?\n':
            s -= 1

        # Walk forward to sentence boundary
        e = end
        while e < len(text) and text[e] not in '.!?\n':
            e += 1
        # Include the punctuation
        if e < len(text):
            e += 1

        return text[s:e].strip()


# === Test ===
if __name__ == "__main__":
    detector = BlasphemyDetector()

    test_texts = [
        # Mixed: should catch goddamn + classify "oh my god"
        "Oh my God, the goddamn car broke down again.",

        # Reverent: should produce NO detections
        "Oh my God, I am heartily sorry for having offended Thee. Jesus, I trust in You.",

        # Profane: should catch both
        "Jesus Christ, what happened? Oh God, this is terrible.",

        # Neutral: should produce NO detections
        "Jesus of Nazareth was a carpenter. Christ the King parish held Mass.",

        # Unambiguous only
        "Holy shit, that was close. For God's sake, be careful.",

        # Edge case: prayer in a movie scene
        "She knelt down and whispered, Dear God, please bring him home safely.",
    ]

    for text in test_texts:
        print(f'\n--- "{text}" ---')
        detections = detector.detect(text)
        if detections:
            for d in detections:
                print(f"  FILTER: \"{d.text}\" -> {d.category} "
                      f"(sev:{d.severity}, conf:{d.confidence:.0%}, {d.method})")
        else:
            print("  NO DETECTIONS (clean or reverent)")

        # Also show full labeling for debugging
        all_labels = detector.detect_all_with_labels(text)
        if all_labels:
            print("  (debug labels:)")
            for match, label, conf in all_labels:
                print(f"    \"{match.text}\" -> {label.value if label else '?'} ({conf:.0%})")
