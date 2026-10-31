"""
Tests for the Catholic blasphemy detection pipeline.

Verifies:
  1. Pattern matcher catches unambiguous blasphemy
  2. Pattern matcher flags context-dependent terms for ML review
  3. Context classifier distinguishes reverent from profane
  4. Combined detector produces correct filter/no-filter decisions
  5. Prayer and devotional language is never filtered
"""

import pytest
from src.blasphemy.pattern_matcher import BlasphemyPatternMatcher
from src.blasphemy.context_classifier import BlasphemyContextClassifier, SacredUsage
from src.blasphemy.detector import BlasphemyDetector
from src.blasphemy.catholic_taxonomy import ALWAYS_FILTER, NEEDS_CLASSIFIER, ALL_ENTRIES


# ============================================================
# Pattern Matcher
# ============================================================

class TestPatternMatcher:
    def setup_method(self):
        self.matcher = BlasphemyPatternMatcher()

    def test_catches_goddamn(self):
        matches = self.matcher.find_unambiguous("That goddamn car won't start.")
        assert len(matches) == 1
        assert matches[0].category == "blasphemy.gods_name"
        assert matches[0].severity == 3

    def test_catches_goddammit(self):
        matches = self.matcher.find_unambiguous("Goddammit, we're late.")
        assert len(matches) == 1

    def test_catches_holy_shit(self):
        matches = self.matcher.find_unambiguous("Holy shit!")
        assert len(matches) == 1
        assert matches[0].category == "blasphemy.sacred_mockery"

    def test_catches_for_gods_sake(self):
        matches = self.matcher.find_unambiguous("For God's sake, stop it.")
        assert len(matches) == 1

    def test_catches_hail_satan(self):
        matches = self.matcher.find_unambiguous("Hail Satan!")
        assert len(matches) == 1
        assert matches[0].category == "blasphemy.demonic"
        assert matches[0].severity == 3

    def test_flags_oh_my_god_for_review(self):
        matches = self.matcher.find_needs_review("Oh my God, really?")
        assert len(matches) == 1
        assert matches[0].needs_ml_review is True

    def test_flags_jesus_christ_for_review(self):
        matches = self.matcher.find_needs_review("Jesus Christ, what happened?")
        assert len(matches) == 1
        assert matches[0].needs_ml_review is True

    def test_clean_text_has_no_matches(self):
        matches = self.matcher.find_all("God is good, all the time.")
        assert len(matches) == 0

    def test_the_lord_is_my_shepherd_is_clean(self):
        matches = self.matcher.find_all("The Lord is my shepherd.")
        assert len(matches) == 0

    def test_mixed_text_catches_both(self):
        matches = self.matcher.find_all(
            "Goddamn it, Jesus Christ, what the holy hell is going on?"
        )
        unambiguous = [m for m in matches if not m.needs_ml_review]
        needs_review = [m for m in matches if m.needs_ml_review]
        assert len(unambiguous) >= 2  # goddamn + holy hell
        assert len(needs_review) >= 1  # Jesus Christ

    def test_no_overlap_between_unambiguous_and_context(self):
        """Unambiguous match should prevent the same region from being flagged as context-dependent."""
        # "goddamn" contains "god" -- should not produce a separate ML review for "god"
        matches = self.matcher.find_all("That goddamn fool.")
        assert len(matches) == 1
        assert matches[0].needs_ml_review is False


# ============================================================
# Context Classifier
# ============================================================

class TestContextClassifier:
    def setup_method(self):
        self.classifier = BlasphemyContextClassifier()

    # --- Reverent ---

    def test_act_of_contrition(self):
        r = self.classifier.classify(
            "Oh my God, I am heartily sorry for having offended Thee.", "God"
        )
        assert r.label == SacredUsage.REVERENT
        assert r.confidence >= 0.7

    def test_lords_prayer(self):
        r = self.classifier.classify("Lord, hear our prayer.", "Lord")
        assert r.label == SacredUsage.REVERENT

    def test_in_the_name_of(self):
        r = self.classifier.classify("In the name of Jesus Christ, amen.", "Jesus Christ")
        assert r.label == SacredUsage.REVERENT

    def test_praise_god(self):
        r = self.classifier.classify("Praise God from whom all blessings flow.", "God")
        assert r.label == SacredUsage.REVERENT

    # --- Profane ---

    def test_exclamation_what(self):
        r = self.classifier.classify("Jesus Christ, what is wrong with you?", "Jesus Christ")
        assert r.label == SacredUsage.PROFANE
        assert r.confidence >= 0.7

    def test_exclamation_not(self):
        r = self.classifier.classify("God, not another meeting.", "God")
        assert r.label == SacredUsage.PROFANE

    def test_oh_god_worst_day(self):
        r = self.classifier.classify("Oh God, this is the worst day ever.", "God")
        assert r.label == SacredUsage.PROFANE

    def test_christ_stop(self):
        r = self.classifier.classify("Christ, stop doing that!", "Christ")
        assert r.label == SacredUsage.PROFANE

    # --- Neutral ---

    def test_jesus_said(self):
        r = self.classifier.classify("Jesus said to love your enemies.", "Jesus")
        # Scripture quotations are either neutral (historical reference) or reverent
        # (devotional). Both are acceptable -- the key is it must NOT be profane.
        assert r.label in (SacredUsage.NEUTRAL, SacredUsage.REVERENT)

    def test_christ_the_king_parish(self):
        r = self.classifier.classify("Christ the King parish is on Main Street.", "Christ")
        assert r.label == SacredUsage.NEUTRAL


# ============================================================
# Combined Detector
# ============================================================

class TestBlasphemyDetector:
    def setup_method(self):
        self.detector = BlasphemyDetector()

    def test_catches_unambiguous_blasphemy(self):
        detections = self.detector.detect("That goddamn car. Holy shit!")
        categories = [d.category for d in detections]
        assert "blasphemy.gods_name" in categories
        assert "blasphemy.sacred_mockery" in categories

    def test_catches_profane_sacred_term(self):
        detections = self.detector.detect("Jesus Christ, what happened?")
        assert len(detections) == 1
        assert detections[0].category == "blasphemy.jesus_name"

    def test_does_not_filter_prayer(self):
        """This is the critical test. Prayers must never be filtered."""
        detections = self.detector.detect(
            "Oh my God, I am heartily sorry for having offended Thee."
        )
        assert len(detections) == 0

    def test_does_not_filter_devotion(self):
        detections = self.detector.detect("Jesus, I trust in You.")
        assert len(detections) == 0

    def test_does_not_filter_scripture(self):
        detections = self.detector.detect(
            "Jesus said, love your enemies and pray for those who persecute you."
        )
        assert len(detections) == 0

    def test_does_not_filter_neutral_references(self):
        detections = self.detector.detect(
            "Jesus of Nazareth was a carpenter. Christ the King parish held Mass."
        )
        assert len(detections) == 0

    def test_mixed_reverent_and_profane(self):
        """In mixed text, only the profane usage should be detected."""
        detections = self.detector.detect(
            "Goddamn this weather. Lord, hear our prayer."
        )
        assert len(detections) == 1
        assert detections[0].text.lower() == "goddamn"

    def test_all_detections_have_required_fields(self):
        detections = self.detector.detect("Holy shit! Goddamn! Hail Satan!")
        for d in detections:
            assert d.category.startswith("blasphemy.")
            assert d.severity in (1, 2, 3)
            assert 0.0 <= d.confidence <= 1.0
            assert d.action == "mute"
            assert d.method in ("unambiguous", "rule_classified", "ml_classified")

    def test_taxonomy_completeness(self):
        """Verify all unambiguous entries have working regex patterns."""
        for entry in ALWAYS_FILTER:
            if entry.text.startswith("["):
                continue  # scene-level entries have no regex
            matches = self.detector.matcher.find_all(entry.text)
            assert len(matches) > 0, f"No match for unambiguous entry: {entry.text}"


# ============================================================
# Run with: python -m pytest tests/test_blasphemy.py -v
# ============================================================
