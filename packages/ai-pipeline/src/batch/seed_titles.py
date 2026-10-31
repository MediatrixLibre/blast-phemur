"""
Seed title list for pre-seeding the GuardianStream database.

These are popular titles across major streaming providers that
families commonly watch (and want filtered). Organized by provider.

Each entry includes:
  - provider + content_id (for content hashing)
  - IMDB ID (for subtitle lookups)
  - title + year (for display)
  - estimated duration in seconds

The batch runner processes these using SRT subtitles from OpenSubtitles.
"""

from dataclasses import dataclass


@dataclass
class SeedTitle:
    provider: str
    content_id: str
    imdb_id: str
    title: str
    year: int
    duration: int  # seconds


SEED_TITLES: list[SeedTitle] = [
    # === Netflix -- Popular movies ===
    SeedTitle("netflix", "81131850", "tt15398776", "Oppenheimer", 2023, 10800),
    SeedTitle("netflix", "70111470", "tt0111161", "The Shawshank Redemption", 1994, 8520),
    SeedTitle("netflix", "60011128", "tt0110912", "Pulp Fiction", 1994, 9240),
    SeedTitle("netflix", "70305883", "tt0816692", "Interstellar", 2014, 10140),
    SeedTitle("netflix", "60004480", "tt0137523", "Fight Club", 1999, 8280),
    SeedTitle("netflix", "60003581", "tt0109830", "Forrest Gump", 1994, 8520),
    SeedTitle("netflix", "70202589", "tt1375666", "Inception", 2010, 8880),
    SeedTitle("netflix", "60031236", "tt0133093", "The Matrix", 1999, 8160),
    SeedTitle("netflix", "70153404", "tt1345836", "The Dark Knight Rises", 2012, 9960),
    SeedTitle("netflix", "80100172", "tt4154796", "Avengers: Endgame", 2019, 10860),

    # === Netflix -- Popular TV ===
    SeedTitle("netflix", "80057281", "tt5180504", "The Witcher S1", 2019, 3600),
    SeedTitle("netflix", "80014749", "tt2442560", "Peaky Blinders S1", 2013, 3600),
    SeedTitle("netflix", "80025678", "tt4574334", "Stranger Things S1", 2016, 3000),
    SeedTitle("netflix", "80192098", "tt5071412", "Ozark S1", 2017, 3600),
    SeedTitle("netflix", "80186863", "tt7366338", "Chernobyl", 2019, 3900),

    # === Amazon Prime Video ===
    SeedTitle("amazon", "B0875LCLG4", "tt7631058", "The Boys S1", 2019, 3600),
    SeedTitle("amazon", "B0B96TKQFB", "tt7160372", "The Lord of the Rings: Rings of Power S1", 2022, 3600),
    SeedTitle("amazon", "B09SVT6YDC", "tt13443470", "Reacher S1", 2022, 3000),
    SeedTitle("amazon", "B08B47MMSR", "tt8358844", "The Wheel of Time S1", 2021, 3600),
    SeedTitle("amazon", "B07YQ61GQ1", "tt2560140", "Attack on Titan S1", 2013, 1500),

    # === Disney+ ===
    SeedTitle("disney", "d0c6a3c6-c6e7", "tt4154756", "Avengers: Infinity War", 2018, 9480),
    SeedTitle("disney", "a3b1e325-ff1e", "tt2380307", "Coco", 2017, 6300),
    SeedTitle("disney", "b5f5a54b-7f72", "tt6105098", "The Lion King (2019)", 2019, 7080),
    SeedTitle("disney", "c8d2e3f4-a1b2", "tt4633694", "Spider-Man: Into the Spider-Verse", 2018, 7080),
    SeedTitle("disney", "e5f6a7b8-c9d0", "tt9362722", "Spider-Man: Across the Spider-Verse", 2023, 8400),

    # === Max (HBO) ===
    SeedTitle("max", "urn:hbo:feature:GX", "tt0944947", "Game of Thrones S1", 2011, 3600),
    SeedTitle("max", "urn:hbo:feature:GY", "tt0903747", "Breaking Bad S1", 2008, 2880),
    SeedTitle("max", "urn:hbo:feature:GZ", "tt0306414", "The Wire S1", 2002, 3600),
    SeedTitle("max", "urn:hbo:feature:G1", "tt0141842", "The Sopranos S1", 1999, 3300),
    SeedTitle("max", "urn:hbo:feature:G2", "tt0386676", "The Office S1", 2005, 1380),

    # === YouTube (freely available films) ===
    SeedTitle("youtube", "dQw4w9WgXcQ", "tt0096895", "Batman (1989)", 1989, 7560),

    # === Family / faith titles (high priority for our audience) ===
    SeedTitle("netflix", "81059803", "tt9471404", "The Chosen S1", 2019, 3000),
    SeedTitle("amazon", "B001EBWING", "tt0335345", "The Passion of the Christ", 2004, 7560),
    SeedTitle("disney", "f1a2b3c4-d5e6", "tt0317705", "The Incredibles", 2004, 6900),
    SeedTitle("disney", "a2b3c4d5-e6f7", "tt2948356", "Soul", 2020, 6180),
    SeedTitle("disney", "b3c4d5e6-f7a8", "tt5109280", "Moana", 2016, 6420),
    SeedTitle("netflix", "80014749", "tt1663202", "The Revenant", 2015, 9360),
    SeedTitle("amazon", "B08K3NTQJR", "tt6334354", "Silence (2016)", 2016, 10620),
    SeedTitle("netflix", "80057281", "tt1392190", "Mad Max: Fury Road", 2015, 7200),
    SeedTitle("amazon", "B083NWBQNT", "tt1853728", "Django Unchained", 2012, 9960),
    SeedTitle("netflix", "60004480", "tt0993846", "The Wolf of Wall Street", 2013, 10800),

    # === Known heavy-filter titles (lots of content to tag) ===
    SeedTitle("netflix", "80025678", "tt1856101", "Blade Runner 2049", 2017, 9840),
    SeedTitle("max", "urn:hbo:feature:G3", "tt0993846", "Goodfellas", 1990, 8760),
    SeedTitle("amazon", "B08WJP4BBY", "tt11138512", "The Northman", 2022, 8280),
    SeedTitle("netflix", "70153404", "tt0468569", "The Dark Knight", 2008, 9120),
    SeedTitle("disney", "c4d5e6f7-a8b9", "tt3896198", "Guardians of the Galaxy Vol. 2", 2017, 8160),
]


def get_seed_titles() -> list[SeedTitle]:
    return SEED_TITLES


def summary() -> str:
    by_provider: dict[str, int] = {}
    for t in SEED_TITLES:
        by_provider[t.provider] = by_provider.get(t.provider, 0) + 1

    lines = [f"Total seed titles: {len(SEED_TITLES)}", ""]
    for provider, count in sorted(by_provider.items()):
        lines.append(f"  {provider}: {count}")
    return "\n".join(lines)


if __name__ == "__main__":
    print(summary())
    print()
    for t in SEED_TITLES:
        print(f"  [{t.provider:>8}] {t.imdb_id} | {t.title} ({t.year})")
