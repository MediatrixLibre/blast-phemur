"""
Blasphemy pattern matcher.

Two-pass detection:
  Pass 1: Regex matching for unambiguous phrases (always blasphemous)
  Pass 2: Keyword detection for context-dependent phrases (flagged for ML classification)

Operates on text (transcript output from Whisper). Returns match objects
with position, category, severity, and whether ML review is needed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .catholic_taxonomy import (
    ALL_ENTRIES,
    ALWAYS_FILTER,
    NEEDS_CLASSIFIER,
    Ambiguity,
    BlasphemyCategory,
    BlasphemyEntry,
    Severity,
)


@dataclass
class BlasphemyMatch:
    """A detected blasphemy instance in text."""

    text: str
    start: int              # character offset in source text
    end: int                # character offset in source text
    category: str           # e.g. "blasphemy.gods_name"
    severity: int           # 1-3
    needs_ml_review: bool   # True if context-dependent
    entry: BlasphemyEntry   # the taxonomy entry that matched


class BlasphemyPatternMatcher:
    """
    Detects blasphemous phrases in text.

    Usage:
        matcher = BlasphemyPatternMatcher()
        matches = matcher.find_all("Oh my God, that was goddamn awful")
        for m in matches:
            print(f"{m.text} -> {m.category} (ML review: {m.needs_ml_review})")
    """

    def __init__(self) -> None:
        # Build compiled regex patterns for each entry
        self._unambiguous_patterns: list[tuple[re.Pattern[str], BlasphemyEntry]] = []
        self._context_patterns: list[tuple[re.Pattern[str], BlasphemyEntry]] = []

        for entry in ALWAYS_FILTER:
            pattern = self._entry_to_regex(entry)
            if pattern:
                self._unambiguous_patterns.append((pattern, entry))

        for entry in NEEDS_CLASSIFIER:
            pattern = self._entry_to_regex(entry)
            if pattern:
                self._context_patterns.append((pattern, entry))

    def find_all(self, text: str) -> list[BlasphemyMatch]:
        """
        Find all blasphemy matches in text.

        Returns matches sorted by position. Unambiguous matches are
        definitive. Context-dependent matches have needs_ml_review=True.
        """
        matches: list[BlasphemyMatch] = []
        text_lower = text.lower()

        # Pass 1: Unambiguous patterns (always blasphemous)
        for pattern, entry in self._unambiguous_patterns:
            for m in pattern.finditer(text_lower):
                matches.append(BlasphemyMatch(
                    text=text[m.start():m.end()],  # preserve original case
                    start=m.start(),
                    end=m.end(),
                    category=entry.category.value,
                    severity=entry.severity.value,
                    needs_ml_review=False,
                    entry=entry,
                ))

        # Pass 2: Context-dependent patterns (need ML review)
        for pattern, entry in self._context_patterns:
            for m in pattern.finditer(text_lower):
                # Skip if already covered by an unambiguous match
                overlap = any(
                    existing.start <= m.start() < existing.end
                    or existing.start < m.end() <= existing.end
                    for existing in matches
                )
                if overlap:
                    continue

                matches.append(BlasphemyMatch(
                    text=text[m.start():m.end()],
                    start=m.start(),
                    end=m.end(),
                    category=entry.category.value,
                    severity=entry.severity.value,
                    needs_ml_review=True,
                    entry=entry,
                ))

        # Sort by position
        matches.sort(key=lambda m: m.start)
        return matches

    def find_unambiguous(self, text: str) -> list[BlasphemyMatch]:
        """Find only unambiguous matches (no ML needed)."""
        return [m for m in self.find_all(text) if not m.needs_ml_review]

    def find_needs_review(self, text: str) -> list[BlasphemyMatch]:
        """Find only context-dependent matches (need ML classifier)."""
        return [m for m in self.find_all(text) if m.needs_ml_review]

    @staticmethod
    def _entry_to_regex(entry: BlasphemyEntry) -> re.Pattern[str] | None:
        """Convert a taxonomy entry to a compiled regex."""
        if entry.regex_pattern:
            try:
                return re.compile(entry.regex_pattern, re.IGNORECASE)
            except re.error:
                pass

        # Fall back to escaped literal match
        if entry.text.startswith("["):
            # Scene-level entries like "[mocking prayer]" -- skip
            return None

        escaped = re.escape(entry.text)
        return re.compile(rf"\b{escaped}\b", re.IGNORECASE)


# === Quick test ===
if __name__ == "__main__":
    matcher = BlasphemyPatternMatcher()

    test_cases = [
        # Unambiguous
        "That goddamn car won't start.",
        "Oh for God's sake, just do it.",
        "Holy shit, did you see that?",
        "Hail Satan and all his works.",

        # Context-dependent
        "Oh my God, I am heartily sorry for having offended Thee.",
        "Oh my God, that dress is amazing!",
        "Jesus Christ is risen from the dead.",
        "Jesus Christ, what is wrong with you?",
        "Dear God, please watch over my family tonight.",
        "Dear God, not another meeting.",

        # Mixed
        "Goddamn it, Jesus Christ, what the holy hell is going on?",

        # Clean (should have no unambiguous matches)
        "God is good, all the time.",
        "The Lord is my shepherd.",
        "Thank God for this beautiful day.",
    ]

    for text in test_cases:
        matches = matcher.find_all(text)
        if matches:
            parts = []
            for m in matches:
                flag = " [ML?]" if m.needs_ml_review else ""
                parts.append(f'"{m.text}" -> {m.category} sev:{m.severity}{flag}')
            print(f'  "{text}"')
            for p in parts:
                print(f"    {p}")
        else:
            print(f'  "{text}" -> CLEAN')
        print()
