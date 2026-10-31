"""
Generate expanded training data for the blasphemy context classifier.

Strategy:
  1. Start with 88 hand-curated examples (training_data.py)
  2. Generate systematic variations:
     - Same sacred term in different emotional contexts
     - Same sentence structure with different sacred terms
     - Movie/TV dialog patterns (interrogation, argument, surprise, grief)
     - Prayer/devotional patterns (rosary, litany, Mass responses)
  3. Add adversarial examples (hard cases near the decision boundary)

Target: 500+ examples with balanced labels.
"""

from __future__ import annotations

from .training_data import (
    TrainingExample,
    ALL_TRAINING_DATA,
    GOD_REVERENT,
    GOD_PROFANE,
    GOD_NEUTRAL,
    JESUS_REVERENT,
    JESUS_PROFANE,
    JESUS_NEUTRAL,
)


def generate_god_variations() -> list[TrainingExample]:
    """Generate systematic variations for God/Lord usage."""
    examples = []

    # === REVERENT: Prayer patterns ===
    prayer_templates = [
        ("God, grant me the serenity to accept the things I cannot change.", "reverent", "Serenity Prayer"),
        ("Lord God, King of Heaven, we praise Your holy name.", "reverent", "Liturgical"),
        ("O God, come to my assistance. O Lord, make haste to help me.", "reverent", "Liturgy of the Hours"),
        ("God, be merciful to me, a sinner.", "reverent", "Luke 18:13"),
        ("Almighty God, Father of our Lord Jesus Christ, have mercy on us.", "reverent", "Confiteor"),
        ("Lord, I am not worthy that you should enter under my roof.", "reverent", "Mass response"),
        ("God of mercy, God of grace, hear our prayer.", "reverent", "Hymn"),
        ("The Lord be with you. And with your spirit.", "reverent", "Mass dialog"),
        ("Lord, You know all things. You know that I love You.", "reverent", "John 21:17"),
        ("God, forgive me. I have sinned against You.", "reverent", "Personal prayer"),
        ("My Lord and my God!", "reverent", "Thomas, John 20:28"),
        ("Lord, save me!", "reverent", "Peter, Matthew 14:30"),
        ("Dear God, thank You for this food and the hands that prepared it.", "reverent", "Grace"),
        ("Lord, make me an instrument of Your peace.", "reverent", "St. Francis"),
        ("God, I place my trust in You.", "reverent", "Personal devotion"),
        ("Blessed be God forever.", "reverent", "Psalm response"),
        ("Lord, remember me when You come into Your kingdom.", "reverent", "Good thief, Luke 23:42"),
        ("O God, You are my God, earnestly I seek You.", "reverent", "Psalm 63"),
        ("Lord, teach us to pray.", "reverent", "Luke 11:1"),
        ("God, our Father, we thank You for Your abundant blessings.", "reverent", "Family prayer"),
    ]
    for text, label, note in prayer_templates:
        term = "Lord" if text.startswith("Lord") or "Lord" in text.split(",")[0] else "God"
        examples.append(TrainingExample(text, label, term, source="generated", notes_source=note))

    # === PROFANE: Movie dialog anger/frustration ===
    profane_anger = [
        ("God, you make me sick.", "profane", "God", "He threw the papers across the desk."),
        ("Oh my God, I can't do this anymore.", "profane", "God", "She collapsed on the couch."),
        ("God, why is this happening to me?", "profane", "God", "", "", "generated", "Self-pity, not genuine prayer"),
        ("Oh God, oh God, we're trapped.", "profane", "God", "The walls were closing in."),
        ("God, that is so gross.", "profane", "God", ""),
        ("Lord have mercy, this line is never going to move.", "profane", "Lord", "He checked his watch for the fifth time."),
        ("Oh my God, she did not just say that.", "profane", "God", ""),
        ("God, I'm starving. When do we eat?", "profane", "God", ""),
        ("Oh God, please, not the karaoke.", "profane", "God", ""),
        ("My God, look at the time.", "profane", "God", ""),
        ("God, that smells awful.", "profane", "God", "He opened the fridge."),
        ("Oh my God, I love this song!", "profane", "God", ""),
        ("God, can you believe this weather?", "profane", "God", ""),
        ("Oh God, he's coming this way.", "profane", "God", "She ducked behind the counter."),
        ("Dear God, what have I done?", "profane", "God", "He stared at the broken vase.", "", "generated", "Regret, not prayer"),
        ("Good God, woman, you scared me half to death.", "profane", "God", ""),
        ("God, just leave me alone.", "profane", "God", ""),
        ("Oh my God, is that a spider?", "profane", "God", ""),
        ("God, how many times do I have to tell you?", "profane", "God", ""),
        ("Oh God, the presentation is in five minutes.", "profane", "God", ""),
    ]
    for item in profane_anger:
        examples.append(TrainingExample(
            item[0], item[1], item[2],
            context_before=item[3] if len(item) > 3 else "",
            source="generated",
        ))

    # === NEUTRAL: Historical/cultural ===
    neutral_refs = [
        ("The word God appears in every inaugural address.", "neutral", "God"),
        ("Under God was added to the Pledge in 1954.", "neutral", "God"),
        ("Thank God it's Friday, as the saying goes.", "neutral", "God", "", "", "generated", "Idiom"),
        ("She played a god-like character in the film.", "neutral", "god"),
        ("Lord of the Rings is a classic trilogy.", "neutral", "Lord"),
        ("The Lord Mayor opened the ceremony.", "neutral", "Lord"),
        ("God particle was discovered at CERN.", "neutral", "God"),
        ("My God, it's full of stars, he said, quoting the film.", "neutral", "God", "", "", "generated", "Quotation"),
        ("Act of God is a legal term for natural disasters.", "neutral", "God"),
        ("God willing is a common expression in many cultures.", "neutral", "God"),
    ]
    for item in neutral_refs:
        examples.append(TrainingExample(
            item[0], item[1], item[2],
            source="generated",
            notes_source=item[5] if len(item) > 5 else "",
        ))

    return examples


def generate_jesus_variations() -> list[TrainingExample]:
    """Generate systematic variations for Jesus/Christ usage."""
    examples = []

    # === REVERENT ===
    reverent = [
        ("Jesus, meek and humble of heart, make my heart like Yours.", "reverent", "Jesus"),
        ("Christ our light! Thanks be to God!", "reverent", "Christ", "", "", "Easter Vigil"),
        ("Jesus, remember me. Jesus, remember me.", "reverent", "Jesus", "", "", "Taize chant"),
        ("Lord Jesus, You are the bread of life.", "reverent", "Jesus"),
        ("Through Him, with Him, in Him, in the unity of the Holy Spirit.", "reverent", "Him"),
        ("Christ is born! Glorify Him!", "reverent", "Christ", "", "", "Nativity troparion"),
        ("The Sacred Heart of Jesus, have mercy on us.", "reverent", "Jesus"),
        ("Jesus, Son of the living God, have mercy on me.", "reverent", "Jesus"),
        ("In Christ alone my hope is found.", "reverent", "Christ", "", "", "Hymn"),
        ("Lord Jesus Christ, only Son of the Father.", "reverent", "Jesus Christ", "", "", "Gloria"),
        ("Jesus Christ, You are my everything.", "reverent", "Jesus Christ"),
        ("Come, Lord Jesus, come.", "reverent", "Jesus", "", "", "Maranatha"),
        ("Christ, hear us. Christ, graciously hear us.", "reverent", "Christ", "", "", "Litany"),
        ("Jesus walked on water to reach the disciples.", "reverent", "Jesus"),
        ("The risen Christ appeared to Mary Magdalene.", "reverent", "Christ"),
    ]
    for item in reverent:
        examples.append(TrainingExample(
            item[0], item[1], item[2],
            source="generated",
            notes_source=item[5] if len(item) > 5 else "",
        ))

    # === PROFANE ===
    profane = [
        ("Jesus Christ, the car won't start!", "profane", "Jesus Christ", "It was below freezing."),
        ("Jesus, that was loud.", "profane", "Jesus", "The fireworks went off nearby."),
        ("Christ, I forgot my wallet.", "profane", "Christ", ""),
        ("Oh Jesus, not the in-laws again.", "profane", "Jesus", ""),
        ("Jesus Christ, how did you pass the exam?", "profane", "Jesus Christ", ""),
        ("Christ alive, did you see that catch?", "profane", "Christ", ""),
        ("Jesus, slow down, you're going ninety.", "profane", "Jesus", ""),
        ("Christ, this coffee is horrible.", "profane", "Christ", ""),
        ("Jesus Christ, I just cleaned that!", "profane", "Jesus Christ", "The dog ran in with muddy paws."),
        ("Sweet Jesus, my back is killing me.", "profane", "Jesus", ""),
        ("Jesus, Mary, and Joseph, what a mess.", "profane", "Jesus", "He opened the garage door."),
        ("Christ on a cracker, that's expensive.", "profane", "Christ", ""),
        ("Jesus wept. I mean, what are we supposed to do now?", "profane", "Jesus", "", "", "generated",
         "Using 'Jesus wept' as exasperated expression, not scripture quotation"),
        ("Oh Christ, here we go again.", "profane", "Christ", ""),
        ("Jesus, could this day get any worse?", "profane", "Jesus", ""),
    ]
    for item in profane:
        examples.append(TrainingExample(
            item[0], item[1], item[2],
            context_before=item[3] if len(item) > 3 else "",
            source="generated",
        ))

    # === NEUTRAL ===
    neutral = [
        ("Christ Church Cathedral dates to the 12th century.", "neutral", "Christ"),
        ("The Jesus Film Project has been translated into 2,000 languages.", "neutral", "Jesus"),
        ("She played Jesus in the passion play.", "neutral", "Jesus"),
        ("The Christ figure is a common literary archetype.", "neutral", "Christ"),
        ("Jesus College, Cambridge was founded in 1496.", "neutral", "Jesus"),
    ]
    for item in neutral:
        examples.append(TrainingExample(item[0], item[1], item[2], source="generated"))

    return examples


def generate_adversarial_examples() -> list[TrainingExample]:
    """
    Hard cases near the decision boundary.
    These test whether the classifier can handle ambiguity.
    """
    examples = []

    hard_cases = [
        # Grief that sounds like prayer but isn't
        ("Oh God, why did you take him from me?", "profane", "God",
         "She stood over the casket.", "",
         "Sounds like prayer but is an expression of grief/anger at God's decision. In Catholic theology this is borderline, but in movie context it's typically written as anguish, not petition."),

        # Sarcastic prayer
        ("Thank God for small mercies.", "profane", "God", "", "",
         "Sarcastic/ironic usage despite prayer-like structure"),

        # Genuine surprise that sounds profane
        ("Oh my God, it's a miracle!", "profane", "God", "The test results came back negative.", "",
         "Despite 'miracle' (reverent word), 'oh my God' here is an exclamation of surprise, not prayer"),

        # Movie character actually praying in a tense scene
        ("God, if you're listening, please get us out of here.", "reverent", "God",
         "The building was on fire.", "",
         "Genuine desperate prayer despite dramatic context"),

        # Character quoting scripture as a weapon
        ("The Lord giveth and the Lord taketh away, sweetheart.", "neutral", "Lord",
         "He slid the divorce papers across the table.", "",
         "Scripture used mockingly. Neutral because the words themselves are reverent; the mockery is tonal."),

        # Genuine whispered prayer in battle
        ("Jesus, protect me. Jesus, protect me.", "reverent", "Jesus",
         "Bullets flew overhead.", "",
         "Genuine prayer under fire"),

        # Medical drama exclamation
        ("Oh God, we're losing him!", "profane", "God",
         "The monitors started beeping.", "",
         "Medical urgency, not prayer"),

        # Sports exclamation
        ("Oh my God, he caught it!", "profane", "God",
         "Fourth quarter, ten seconds left.", "",
         "Sports excitement"),

        # Wedding vows
        ("Before God and these witnesses, I take you to be my wife.", "reverent", "God", "", "",
         "Formal religious ceremony"),

        # Courtroom oath
        ("So help me God.", "reverent", "God", "", "",
         "Formal oath invoking God as witness -- CCC 2150 permits oaths when truthful"),

        # Character questioning faith
        ("God, are You even there?", "reverent", "God",
         "She stared at the ceiling of her hospital room.", "",
         "Genuine theological questioning, not expletive"),

        # Drunk frustration
        ("God, I need another drink.", "profane", "God",
         "He waved at the bartender.", "",
         "Not prayer despite imperative form"),

        # Whispered in awe
        ("My God, it's beautiful.", "profane", "God",
         "They reached the top of the mountain.", "",
         "Awe, but using God's name as exclamation, not addressing God"),

        # Actually addressing God in awe (different context)
        ("My God, You made all of this.", "reverent", "God",
         "He stood on the mountaintop at sunrise.", "",
         "Same 'my God' + nature but now directly addressing God"),
    ]

    for text, label, term, before, after, note in hard_cases:
        examples.append(TrainingExample(
            text, label, term,
            context_before=before,
            context_after=after,
            source="generated",
            notes_source=note,
        ))

    return examples


def get_all_expanded_data() -> list[TrainingExample]:
    """Return all training data: curated + generated."""
    return (
        ALL_TRAINING_DATA
        + generate_god_variations()
        + generate_jesus_variations()
        + generate_adversarial_examples()
    )


def summary() -> str:
    data = get_all_expanded_data()
    by_label: dict[str, int] = {}
    by_source: dict[str, int] = {}
    for ex in data:
        by_label[ex.label] = by_label.get(ex.label, 0) + 1
        by_source[ex.source] = by_source.get(ex.source, 0) + 1

    lines = [
        f"Total expanded examples: {len(data)}",
        "",
        "By label:",
    ]
    for label in ["reverent", "profane", "neutral"]:
        lines.append(f"  {label}: {by_label.get(label, 0)}")
    lines.append("")
    lines.append("By source:")
    for source, count in sorted(by_source.items()):
        lines.append(f"  {source}: {count}")
    return "\n".join(lines)


if __name__ == "__main__":
    print(summary())
