"""
Catholic Blasphemy Taxonomy

Grounded in the Catechism of the Catholic Church (CCC 2142-2167):
  - Second Commandment: "You shall not take the name of the Lord your God in vain."
  - CCC 2148: "Blasphemy is directly opposed to the second commandment. It consists
    in uttering against God -- inwardly or outwardly -- words of hatred, reproach,
    or defiance; in speaking ill of God; in failing in respect toward him in one's
    speech; in misusing God's name."

Four sub-categories, ordered by gravity:

1. GODS_NAME: Taking God's name in vain (most common in media)
   - Using "God," "Lord," "Almighty" as expletives
   - Casual/flippant invocations without reverence

2. JESUS_NAME: Profane use of the Holy Name of Jesus
   - "Jesus Christ" as an exclamation of frustration/anger
   - CCC 2146: "The second commandment forbids the abuse of God's name,
     i.e., every improper use of the names of God, Jesus Christ..."

3. SACRED_MOCKERY: Mocking the sacred
   - Ridiculing prayer, the Mass, sacraments, saints
   - Contemptuous treatment of sacred objects or rites
   - CCC 2148: "...in speaking ill of God; in failing in respect toward
     him in one's speech"

4. DEMONIC_GLORIFICATION: Positive portrayal of the demonic
   - Glorifying Satan, demons, hell as desirable
   - Treating occult practices as benign entertainment
   - CCC 2117: "All practices of magic or sorcery... are gravely contrary
     to the virtue of religion."
"""

from dataclasses import dataclass, field
from enum import Enum


class BlasphemyCategory(Enum):
    GODS_NAME = "blasphemy.gods_name"
    JESUS_NAME = "blasphemy.jesus_name"
    SACRED_MOCKERY = "blasphemy.sacred_mockery"
    DEMONIC = "blasphemy.demonic"


class Severity(Enum):
    MILD = 1       # Casual, likely accidental, common in everyday speech
    MODERATE = 2   # Deliberate, angry, or sustained
    GRAPHIC = 3    # Vicious, extended, or combined with hatred of God


class Ambiguity(Enum):
    UNAMBIGUOUS = "unambiguous"     # Always blasphemous regardless of context
    CONTEXT_DEPENDENT = "context"   # Needs ML classifier (prayer vs. expletive)
    SCENE_LEVEL = "scene"           # Requires visual/narrative context (LLM)


@dataclass
class BlasphemyEntry:
    """A single blasphemous phrase or pattern."""
    text: str
    category: BlasphemyCategory
    severity: Severity
    ambiguity: Ambiguity
    notes: str = ""
    regex_pattern: str | None = None  # Optional regex for fuzzy matching


# ============================================================
# CATEGORY 1: GOD'S NAME IN VAIN
# ============================================================

GODS_NAME_ENTRIES: list[BlasphemyEntry] = [
    # --- UNAMBIGUOUS (always blasphemous) ---
    BlasphemyEntry(
        "goddamn", BlasphemyCategory.GODS_NAME, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
        regex_pattern=r"\bgod\s*damn\w*\b",
    ),
    BlasphemyEntry(
        "goddammit", BlasphemyCategory.GODS_NAME, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
        regex_pattern=r"\bgod\s*damm?it\b",
    ),
    BlasphemyEntry(
        "god dammit", BlasphemyCategory.GODS_NAME, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
    ),
    BlasphemyEntry(
        "god damn it", BlasphemyCategory.GODS_NAME, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
    ),
    BlasphemyEntry(
        "gd", BlasphemyCategory.GODS_NAME, Severity.MODERATE, Ambiguity.UNAMBIGUOUS,
        notes="Abbreviation used in subtitles",
        regex_pattern=r"\bg\.?d\.?\b",
    ),

    # --- CONTEXT-DEPENDENT (prayer vs. expletive) ---
    BlasphemyEntry(
        "oh my god", BlasphemyCategory.GODS_NAME, Severity.MODERATE, Ambiguity.CONTEXT_DEPENDENT,
        notes="Very common. Prayer: 'Oh my God, I am heartily sorry...' vs. expletive: 'Oh my God, that's disgusting'",
        regex_pattern=r"\boh\s+my\s+god\b",
    ),
    BlasphemyEntry(
        "omg", BlasphemyCategory.GODS_NAME, Severity.MILD, Ambiguity.CONTEXT_DEPENDENT,
        notes="Abbreviation. Almost always casual/expletive.",
        regex_pattern=r"\bo\.?m\.?g\.?\b",
    ),
    BlasphemyEntry(
        "oh god", BlasphemyCategory.GODS_NAME, Severity.MILD, Ambiguity.CONTEXT_DEPENDENT,
        notes="Could be prayer ('Oh God, help me') or expletive ('Oh God, not again')",
        regex_pattern=r"\boh\s+god\b",
    ),
    BlasphemyEntry(
        "my god", BlasphemyCategory.GODS_NAME, Severity.MODERATE, Ambiguity.CONTEXT_DEPENDENT,
        notes="Could be devotional ('My God and my all' - St. Francis) or expletive",
        regex_pattern=r"\bmy\s+god\b",
    ),
    BlasphemyEntry(
        "for god's sake", BlasphemyCategory.GODS_NAME, Severity.MODERATE, Ambiguity.UNAMBIGUOUS,
        notes="Nearly always an expletive in modern usage",
        regex_pattern=r"\bfor\s+god'?s?\s+sake\b",
    ),
    BlasphemyEntry(
        "god almighty", BlasphemyCategory.GODS_NAME, Severity.MODERATE, Ambiguity.CONTEXT_DEPENDENT,
        notes="Can be reverential or an exclamation of shock",
        regex_pattern=r"\bgod\s+almighty\b",
    ),
    BlasphemyEntry(
        "swear to god", BlasphemyCategory.GODS_NAME, Severity.MODERATE, Ambiguity.CONTEXT_DEPENDENT,
        notes="CCC 2150-2155: Oaths invoking God's name frivolously violate the second commandment",
        regex_pattern=r"\bswear\s+to\s+god\b",
    ),
    BlasphemyEntry(
        "dear god", BlasphemyCategory.GODS_NAME, Severity.MILD, Ambiguity.CONTEXT_DEPENDENT,
        notes="Could be beginning of prayer or expression of dismay",
        regex_pattern=r"\bdear\s+god\b",
    ),
    BlasphemyEntry(
        "good god", BlasphemyCategory.GODS_NAME, Severity.MILD, Ambiguity.CONTEXT_DEPENDENT,
        regex_pattern=r"\bgood\s+god\b",
    ),
    BlasphemyEntry(
        "god no", BlasphemyCategory.GODS_NAME, Severity.MILD, Ambiguity.CONTEXT_DEPENDENT,
        regex_pattern=r"\bgod,?\s+no\b",
    ),
]

# ============================================================
# CATEGORY 2: HOLY NAME OF JESUS
# ============================================================

JESUS_NAME_ENTRIES: list[BlasphemyEntry] = [
    # --- UNAMBIGUOUS ---
    BlasphemyEntry(
        "jesus h christ", BlasphemyCategory.JESUS_NAME, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
        regex_pattern=r"\bjesus\s+h\.?\s+christ\b",
    ),
    BlasphemyEntry(
        "jesus f-ing christ", BlasphemyCategory.JESUS_NAME, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
        notes="And all variants with profanity inserted",
        regex_pattern=r"\bjesus\s+\w*(?:uck|kin)\w*\s+christ\b",
    ),

    # --- CONTEXT-DEPENDENT ---
    BlasphemyEntry(
        "jesus christ", BlasphemyCategory.JESUS_NAME, Severity.MODERATE, Ambiguity.CONTEXT_DEPENDENT,
        notes="Profession of faith: 'Jesus Christ is Lord.' Expletive: 'Jesus Christ, what happened?'",
        regex_pattern=r"\bjesus\s+christ\b",
    ),
    BlasphemyEntry(
        "jesus", BlasphemyCategory.JESUS_NAME, Severity.MILD, Ambiguity.CONTEXT_DEPENDENT,
        notes="Standalone. Prayer: 'Jesus, I trust in You.' Expletive: 'Jesus!' (shock)",
        regex_pattern=r"\bjesus\b(?!\s+(?:christ|said|taught|is|was|the|our|loves|wept|prayed|healed|told))",
    ),
    BlasphemyEntry(
        "sweet jesus", BlasphemyCategory.JESUS_NAME, Severity.MODERATE, Ambiguity.CONTEXT_DEPENDENT,
        notes="Usually an expletive but could be a devotional expression",
        regex_pattern=r"\bsweet\s+jesus\b",
    ),
    BlasphemyEntry(
        "christ", BlasphemyCategory.JESUS_NAME, Severity.MILD, Ambiguity.CONTEXT_DEPENDENT,
        notes="Title: 'Christ the King.' Expletive: 'Christ!' (anger). Very ambiguous standalone.",
        regex_pattern=r"\bchrist\b(?!\s+(?:the|is|was|our|said|child|mass|jesus|church))",
    ),
    BlasphemyEntry(
        "holy christ", BlasphemyCategory.JESUS_NAME, Severity.MODERATE, Ambiguity.CONTEXT_DEPENDENT,
        regex_pattern=r"\bholy\s+christ\b",
    ),
    BlasphemyEntry(
        "for christ's sake", BlasphemyCategory.JESUS_NAME, Severity.MODERATE, Ambiguity.UNAMBIGUOUS,
        notes="Nearly always an expletive in modern media",
        regex_pattern=r"\bfor\s+christ'?s?\s+sake\b",
    ),
]

# ============================================================
# CATEGORY 3: SACRED MOCKERY
# ============================================================

SACRED_MOCKERY_ENTRIES: list[BlasphemyEntry] = [
    # These are primarily scene-level (require visual/narrative context)
    # but some phrases are text-detectable
    BlasphemyEntry(
        "holy hell", BlasphemyCategory.SACRED_MOCKERY, Severity.MILD, Ambiguity.UNAMBIGUOUS,
        notes="Combines sacred ('holy') with profane. Common exclamation.",
        regex_pattern=r"\bholy\s+hell\b",
    ),
    BlasphemyEntry(
        "holy shit", BlasphemyCategory.SACRED_MOCKERY, Severity.MODERATE, Ambiguity.UNAMBIGUOUS,
        notes="Combines sacred with vulgar. Widespread but objectionable.",
        regex_pattern=r"\bholy\s+sh[i1][t7]\b",
    ),
    BlasphemyEntry(
        "holy crap", BlasphemyCategory.SACRED_MOCKERY, Severity.MILD, Ambiguity.UNAMBIGUOUS,
        regex_pattern=r"\bholy\s+crap\b",
    ),
    BlasphemyEntry(
        "holy f", BlasphemyCategory.SACRED_MOCKERY, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
        notes="holy + f-word variants",
        regex_pattern=r"\bholy\s+f\w*\b",
    ),
    # Scene-level entries (detected by multimodal LLM, not text matching)
    BlasphemyEntry(
        "[mocking prayer]", BlasphemyCategory.SACRED_MOCKERY, Severity.GRAPHIC, Ambiguity.SCENE_LEVEL,
        notes="Characters mockingly praying, genuflecting sarcastically, etc. Requires visual context.",
    ),
    BlasphemyEntry(
        "[desecrating sacrament]", BlasphemyCategory.SACRED_MOCKERY, Severity.GRAPHIC, Ambiguity.SCENE_LEVEL,
        notes="Desecration of the Eucharist, holy water used mockingly, crucifix abuse. Visual only.",
    ),
    BlasphemyEntry(
        "[mocking clergy/religious]", BlasphemyCategory.SACRED_MOCKERY, Severity.MODERATE, Ambiguity.SCENE_LEVEL,
        notes="Priests/nuns portrayed as universally corrupt/ridiculous. Narrative context needed.",
    ),
]

# ============================================================
# CATEGORY 4: DEMONIC GLORIFICATION
# ============================================================

DEMONIC_ENTRIES: list[BlasphemyEntry] = [
    # Almost entirely scene-level (requires visual/narrative context)
    BlasphemyEntry(
        "hail satan", BlasphemyCategory.DEMONIC, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
        notes="Unambiguously demonic invocation regardless of context",
        regex_pattern=r"\bhail\s+satan\b",
    ),
    BlasphemyEntry(
        "praise satan", BlasphemyCategory.DEMONIC, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
        regex_pattern=r"\bpraise\s+satan\b",
    ),
    BlasphemyEntry(
        "ave satanas", BlasphemyCategory.DEMONIC, Severity.GRAPHIC, Ambiguity.UNAMBIGUOUS,
        regex_pattern=r"\bave\s+satanas\b",
    ),
    # Scene-level
    BlasphemyEntry(
        "[demonic ritual portrayed positively]", BlasphemyCategory.DEMONIC, Severity.GRAPHIC, Ambiguity.SCENE_LEVEL,
        notes="Seances, pentagrams, summoning portrayed as effective/cool. Visual context only.",
    ),
    BlasphemyEntry(
        "[Satan portrayed sympathetically]", BlasphemyCategory.DEMONIC, Severity.MODERATE, Ambiguity.SCENE_LEVEL,
        notes="Devil as misunderstood hero. Narrative context needed.",
    ),
]

# ============================================================
# AGGREGATE
# ============================================================

ALL_ENTRIES = GODS_NAME_ENTRIES + JESUS_NAME_ENTRIES + SACRED_MOCKERY_ENTRIES + DEMONIC_ENTRIES

# Only entries detectable from text (not scene-level)
TEXT_DETECTABLE = [e for e in ALL_ENTRIES if e.ambiguity != Ambiguity.SCENE_LEVEL]

# Only entries that need ML classification
NEEDS_CLASSIFIER = [e for e in ALL_ENTRIES if e.ambiguity == Ambiguity.CONTEXT_DEPENDENT]

# Only entries safe to filter without ML (always blasphemous)
ALWAYS_FILTER = [e for e in ALL_ENTRIES if e.ambiguity == Ambiguity.UNAMBIGUOUS]


def summary() -> str:
    """Print taxonomy summary."""
    lines = [
        f"Total entries: {len(ALL_ENTRIES)}",
        f"  Text-detectable: {len(TEXT_DETECTABLE)}",
        f"  Always filter (unambiguous): {len(ALWAYS_FILTER)}",
        f"  Needs ML classifier: {len(NEEDS_CLASSIFIER)}",
        f"  Scene-level only: {len(ALL_ENTRIES) - len(TEXT_DETECTABLE)}",
        "",
        "By category:",
    ]
    for cat in BlasphemyCategory:
        count = sum(1 for e in ALL_ENTRIES if e.category == cat)
        lines.append(f"  {cat.value}: {count}")
    return "\n".join(lines)


if __name__ == "__main__":
    print(summary())
    print()
    print("=== UNAMBIGUOUS (always filter) ===")
    for e in ALWAYS_FILTER:
        print(f"  [{e.severity.name}] {e.text}")
    print()
    print("=== CONTEXT-DEPENDENT (needs classifier) ===")
    for e in NEEDS_CLASSIFIER:
        print(f"  [{e.severity.name}] {e.text} -- {e.notes}")
