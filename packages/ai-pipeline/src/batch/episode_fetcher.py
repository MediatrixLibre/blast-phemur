"""
Episode subtitle fetcher: download English SRTs for a whole series in advance.

The browser extension imports these files (popup -> Subtitles & Captions) and
uses them to mute words just before they are spoken. Files are named
`<series-slug>.sNNeNN.srt`, which the extension reads to label the episode.

Usage (from packages/ai-pipeline):
    python3 -m src.batch.episode_fetcher --series Deadwood --year 2004 \\
        --episodes 1:12,2:12,3:12 --out ~/subtitles/deadwood

    # one episode
    python3 -m src.batch.episode_fetcher --series Deadwood --episodes 1:2 --only 1x2

Providers: podnapisi and addic7ed need no account. opensubtitlescom is added
automatically when OPENSUBTITLES_USERNAME / OPENSUBTITLES_PASSWORD are set.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def parse_episode_spec(spec: str) -> list[tuple[int, int]]:
    """'1:12,2:10' -> [(1,1)..(1,12),(2,1)..(2,10)]"""
    out: list[tuple[int, int]] = []
    for part in spec.split(","):
        season, count = part.split(":")
        out += [(int(season), e) for e in range(1, int(count) + 1)]
    return out


def count_cues(srt_text: str) -> int:
    return len(re.findall(r"-->", srt_text))


def fetch_episode(series: str, year: int | None, season: int, episode: int, providers: list[str],
                  provider_configs: dict) -> str | None:
    from babelfish import Language
    from subliminal import Video, download_best_subtitles

    name = f"{series}.S{season:02d}E{episode:02d}.mkv"
    video = Video.fromname(name)
    if year and getattr(video, "year", None) is None:
        video.year = year
    subs = download_best_subtitles(
        {video}, {Language("eng")}, providers=providers, provider_configs=provider_configs,
    )
    best = subs.get(video)
    if not best:
        return None
    return best[0].text  # decoded text, unlike .content (bytes)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--series", required=True)
    ap.add_argument("--year", type=int)
    ap.add_argument("--episodes", required=True, help="season:count pairs, e.g. 1:12,2:12")
    ap.add_argument("--only", help="limit to one episode, SxE (e.g. 1x2)")
    ap.add_argument("--out", default="subtitles", help="output directory")
    ap.add_argument("--min-cues", type=int, default=200, help="reject files with fewer subtitle lines")
    ap.add_argument("--delay", type=float, default=2.0, help="seconds between requests")
    args = ap.parse_args(argv)

    try:
        from subliminal import region
        region.configure("dogpile.cache.memory", replace_existing_backend=True)
    except ImportError:
        print("subliminal is not installed (pip install subliminal)", file=sys.stderr)
        return 2
    except Exception:
        pass  # already configured

    providers = ["podnapisi", "addic7ed"]
    configs: dict = {}
    user, pw = os.environ.get("OPENSUBTITLES_USERNAME"), os.environ.get("OPENSUBTITLES_PASSWORD")
    if user and pw:
        providers.insert(0, "opensubtitlescom")
        configs["opensubtitlescom"] = {"username": user, "password": pw}

    episodes = parse_episode_spec(args.episodes)
    if args.only:
        s, e = args.only.lower().split("x")
        episodes = [(int(s), int(e))]

    out = Path(args.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    slug = slugify(args.series)

    ok, missing, skipped = [], [], []
    for season, episode in episodes:
        code = f"s{season:02d}e{episode:02d}"
        path = out / f"{slug}.{code}.srt"
        if path.exists() and path.stat().st_size > 2000:
            skipped.append(code)
            continue
        try:
            text = fetch_episode(args.series, args.year, season, episode, providers, configs)
        except Exception as exc:  # network, provider outage, rate limit
            print(f"[{code}] error: {exc}")
            text = None
        if text and count_cues(text) >= args.min_cues:
            path.write_text(text, encoding="utf-8")
            ok.append(code)
            print(f"[{code}] saved {count_cues(text)} lines -> {path.name}")
        else:
            reason = "not found" if not text else f"only {count_cues(text)} lines"
            missing.append(code)
            print(f"[{code}] MISSING ({reason})")
        time.sleep(args.delay)

    print(f"\nsaved {len(ok)}, already had {len(skipped)}, missing {len(missing)}")
    if missing:
        print("missing: " + ", ".join(missing))
        print("Missing episodes can be downloaded by hand and named like deadwood.s01e05.srt")
    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main())
