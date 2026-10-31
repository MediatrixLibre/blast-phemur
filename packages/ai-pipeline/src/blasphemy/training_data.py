"""
Training data for the blasphemy context classifier.

Hand-curated pairs of reverent vs. profane usage of sacred terms
in movie/TV dialog contexts. Each entry includes:
  - sentence: the line containing the sacred term
  - label: reverent / profane / neutral
  - term: the sacred term being classified
  - context: optional surrounding dialog

Target: 200+ curated examples as seed data.
These will be supplemented by LLM-generated pairs for fine-tuning.

Labels follow Catholic teaching per CCC 2142-2167:
  REVERENT = genuine prayer, worship, devotion, theological statement
  PROFANE  = expletive, exclamation, casual/flippant invocation
  NEUTRAL  = historical reference, title, quotation, genuinely ambiguous
"""

from dataclasses import dataclass


@dataclass
class TrainingExample:
    sentence: str
    label: str  # "reverent", "profane", "neutral"
    term: str   # the sacred term
    context_before: str = ""
    context_after: str = ""
    source: str = "curated"  # "curated", "llm_generated", "movie_transcript"
    notes_source: str = ""


# ============================================================
# GOD / LORD -- Reverent
# ============================================================

GOD_REVERENT = [
    TrainingExample("Oh my God, I am heartily sorry for having offended Thee.", "reverent", "God",
                    notes_source="Act of Contrition"),
    TrainingExample("God is good, all the time. And all the time, God is good.", "reverent", "God"),
    TrainingExample("Dear God, please watch over my family tonight.", "reverent", "God"),
    TrainingExample("I thank God every day for bringing you into my life.", "reverent", "God"),
    TrainingExample("Lord, have mercy on us.", "reverent", "Lord"),
    TrainingExample("The Lord is my shepherd, I shall not want.", "reverent", "Lord"),
    TrainingExample("Praise God from whom all blessings flow.", "reverent", "God"),
    TrainingExample("God, give me the strength to get through this.", "reverent", "God",
                    context_before="She knelt beside the hospital bed."),
    TrainingExample("Lord, hear our prayer.", "reverent", "Lord"),
    TrainingExample("May God bless you and keep you.", "reverent", "God"),
    TrainingExample("I know God has a plan, even when I can't see it.", "reverent", "God"),
    TrainingExample("Lord, I'm not worthy, but only say the word.", "reverent", "Lord"),
    TrainingExample("My God and my all.", "reverent", "God", notes_source="St. Francis of Assisi"),
    TrainingExample("God, I offer You my day.", "reverent", "God"),
    TrainingExample("In the name of God, the Father almighty.", "reverent", "God"),
    TrainingExample("God willing, we'll make it through this storm.", "reverent", "God"),
    TrainingExample("Dear Lord, grant us peace.", "reverent", "Lord"),
    TrainingExample("Our God is an awesome God.", "reverent", "God"),
    TrainingExample("Lord, to whom shall we go? You have the words of eternal life.", "reverent", "Lord"),
    TrainingExample("With God, all things are possible.", "reverent", "God"),
]

# ============================================================
# GOD / LORD -- Profane
# ============================================================

GOD_PROFANE = [
    TrainingExample("Oh my God, that dress is amazing!", "profane", "God",
                    context_before="She walked into the store."),
    TrainingExample("God, not another meeting.", "profane", "God",
                    context_before="The calendar notification popped up."),
    TrainingExample("Oh God, this is the worst day ever.", "profane", "God"),
    TrainingExample("My God, what happened to your face?", "profane", "God"),
    TrainingExample("Dear God, not you again.", "profane", "God"),
    TrainingExample("God, you're so annoying.", "profane", "God"),
    TrainingExample("Oh my God, did you see what she was wearing?", "profane", "God"),
    TrainingExample("God, I need a drink.", "profane", "God",
                    context_before="He slumped into the bar stool."),
    TrainingExample("Oh God, oh God, oh God, we're all going to die.", "profane", "God",
                    context_before="The plane shook violently."),
    TrainingExample("My God, that was the worst movie I've ever seen.", "profane", "God"),
    TrainingExample("God, will you shut up already?", "profane", "God"),
    TrainingExample("Oh my God, I totally forgot about the exam.", "profane", "God"),
    TrainingExample("God, I hate Mondays.", "profane", "God"),
    TrainingExample("Lord, what a mess.", "profane", "Lord",
                    context_before="He surveyed the flooded basement."),
    TrainingExample("God, this traffic is killing me.", "profane", "God"),
    TrainingExample("Oh my God, he actually said that to her face.", "profane", "God"),
    TrainingExample("God, why do these things always happen to me?", "profane", "God",
                    notes_source="Self-pity, not genuine prayer despite question form"),
    TrainingExample("Good God, man, get a grip.", "profane", "God"),
    TrainingExample("Oh my God, look at that car crash.", "profane", "God"),
    TrainingExample("God, this food is terrible.", "profane", "God"),
]

# ============================================================
# GOD / LORD -- Neutral
# ============================================================

GOD_NEUTRAL = [
    TrainingExample("God is referenced in the first line of the Constitution.", "neutral", "God"),
    TrainingExample("In God We Trust is printed on every dollar bill.", "neutral", "God"),
    TrainingExample("The ancient Greeks believed their gods lived on Mount Olympus.", "neutral", "gods"),
    TrainingExample("One nation under God, indivisible.", "neutral", "God"),
    TrainingExample("God Save the King is the British national anthem.", "neutral", "God"),
    TrainingExample("She played God in the school play.", "neutral", "God"),
    TrainingExample("The word 'Lord' comes from the Old English 'hlaford.'", "neutral", "Lord"),
    TrainingExample("He thinks he's God's gift to women.", "neutral", "God",
                    notes_source="Idiomatic expression, not directly invoking God"),
    TrainingExample("She had a God complex.", "neutral", "God"),
    TrainingExample("Lord Voldemort was the main villain.", "neutral", "Lord"),
]

# ============================================================
# JESUS / CHRIST -- Reverent
# ============================================================

JESUS_REVERENT = [
    TrainingExample("Jesus Christ is risen from the dead.", "reverent", "Jesus Christ"),
    TrainingExample("Jesus, I trust in You.", "reverent", "Jesus"),
    TrainingExample("In the name of Jesus Christ, amen.", "reverent", "Jesus Christ"),
    TrainingExample("Jesus wept.", "reverent", "Jesus"),
    TrainingExample("Christ has died, Christ is risen, Christ will come again.", "reverent", "Christ"),
    TrainingExample("Jesus said, love your enemies and pray for those who persecute you.", "reverent", "Jesus"),
    TrainingExample("Lord Jesus Christ, Son of God, have mercy on me, a sinner.", "reverent", "Jesus Christ",
                    notes_source="Jesus Prayer"),
    TrainingExample("I gave my life to Christ when I was seventeen.", "reverent", "Christ"),
    TrainingExample("Jesus is the way, the truth, and the life.", "reverent", "Jesus"),
    TrainingExample("Come, Lord Jesus.", "reverent", "Jesus"),
    TrainingExample("Through Christ our Lord.", "reverent", "Christ"),
    TrainingExample("Jesus loves you, and so do I.", "reverent", "Jesus"),
    TrainingExample("Christ the King parish is hosting a fish fry.", "reverent", "Christ"),
    TrainingExample("Sacred Heart of Jesus, pray for us.", "reverent", "Jesus"),
    TrainingExample("Jesus, Mary, and Joseph, pray for us.", "reverent", "Jesus"),
]

# ============================================================
# JESUS / CHRIST -- Profane
# ============================================================

JESUS_PROFANE = [
    TrainingExample("Jesus Christ, what is wrong with you?", "profane", "Jesus Christ"),
    TrainingExample("Jesus Christ, that was close!", "profane", "Jesus Christ",
                    context_before="The bullet whizzed past his head."),
    TrainingExample("Jesus, are you serious right now?", "profane", "Jesus"),
    TrainingExample("Christ, not this again.", "profane", "Christ"),
    TrainingExample("Jesus Christ, how much did that cost?", "profane", "Jesus Christ"),
    TrainingExample("Jesus!", "profane", "Jesus",
                    context_before="The car almost hit him."),
    TrainingExample("Christ, will you give it a rest?", "profane", "Christ"),
    TrainingExample("Oh, Jesus Christ, the whole thing is on fire.", "profane", "Jesus Christ"),
    TrainingExample("Jesus, that scared the hell out of me.", "profane", "Jesus"),
    TrainingExample("Christ almighty, what a disaster.", "profane", "Christ"),
    TrainingExample("Jesus Christ, I can't believe they did that.", "profane", "Jesus Christ"),
    TrainingExample("Jesus, Mary, and Joseph!", "profane", "Jesus",
                    context_before="He dropped the heavy box on his foot.",
                    notes_source="Irish/Italian exclamation, not prayer despite saint names"),
    TrainingExample("Sweet Jesus, look at the size of that thing.", "profane", "Jesus"),
    TrainingExample("Christ on a bike, that's expensive.", "profane", "Christ"),
    TrainingExample("Jesus, take the wheel. No, literally, I can't drive.", "profane", "Jesus"),
]

# ============================================================
# JESUS / CHRIST -- Neutral
# ============================================================

JESUS_NEUTRAL = [
    TrainingExample("Jesus of Nazareth was born in Bethlehem.", "neutral", "Jesus"),
    TrainingExample("The historical Jesus is a subject of scholarly debate.", "neutral", "Jesus"),
    TrainingExample("Christ Church College is part of Oxford University.", "neutral", "Christ"),
    TrainingExample("The Jesus Lizard can run across water.", "neutral", "Jesus"),
    TrainingExample("Corpus Christi is a city in Texas.", "neutral", "Christi"),
    TrainingExample("The Christ the Redeemer statue overlooks Rio de Janeiro.", "neutral", "Christ"),
    TrainingExample("Christians believe Jesus is the Son of God.", "neutral", "Jesus"),
    TrainingExample("The film depicted Jesus as a carpenter.", "neutral", "Jesus"),
]

# ============================================================
# AGGREGATE
# ============================================================

ALL_TRAINING_DATA = (
    GOD_REVERENT + GOD_PROFANE + GOD_NEUTRAL
    + JESUS_REVERENT + JESUS_PROFANE + JESUS_NEUTRAL
)


def summary() -> str:
    """Print training data summary."""
    by_label = {}
    by_term = {}
    for ex in ALL_TRAINING_DATA:
        by_label.setdefault(ex.label, []).append(ex)
        by_term.setdefault(ex.term, []).append(ex)

    lines = [
        f"Total examples: {len(ALL_TRAINING_DATA)}",
        "",
        "By label:",
    ]
    for label in ["reverent", "profane", "neutral"]:
        lines.append(f"  {label}: {len(by_label.get(label, []))}")

    lines.append("")
    lines.append("By term:")
    for term, examples in sorted(by_term.items()):
        labels = {}
        for ex in examples:
            labels[ex.label] = labels.get(ex.label, 0) + 1
        label_str = ", ".join(f"{k}:{v}" for k, v in sorted(labels.items()))
        lines.append(f"  {term}: {len(examples)} ({label_str})")

    return "\n".join(lines)


if __name__ == "__main__":
    print(summary())
