/**
 * IMDB ID <-> GuardianStream content ID mapping.
 *
 * Stremio identifies content by IMDB ID (tt0111161).
 * GuardianStream uses SHA-256 hashes of "provider:nativeId".
 * This module bridges the two.
 */

export interface TitleEntry {
  imdbId: string;
  provider: string;
  providerContentId: string;
  title: string;
  year: number;
  duration: number;
}

/**
 * Pre-seeded title mapping from the AI pipeline's seed_titles.py.
 * In production, this would be populated from the database.
 */
const SEED_TITLES: TitleEntry[] = [
  // Netflix -- Popular movies
  { imdbId: 'tt15398776', provider: 'netflix', providerContentId: '81131850', title: 'Oppenheimer', year: 2023, duration: 10800 },
  { imdbId: 'tt0111161', provider: 'netflix', providerContentId: '70111470', title: 'The Shawshank Redemption', year: 1994, duration: 8520 },
  { imdbId: 'tt0110912', provider: 'netflix', providerContentId: '60011128', title: 'Pulp Fiction', year: 1994, duration: 9240 },
  { imdbId: 'tt0816692', provider: 'netflix', providerContentId: '70305883', title: 'Interstellar', year: 2014, duration: 10140 },
  { imdbId: 'tt0137523', provider: 'netflix', providerContentId: '60004480', title: 'Fight Club', year: 1999, duration: 8280 },
  { imdbId: 'tt0109830', provider: 'netflix', providerContentId: '60003581', title: 'Forrest Gump', year: 1994, duration: 8520 },
  { imdbId: 'tt1375666', provider: 'netflix', providerContentId: '70202589', title: 'Inception', year: 2010, duration: 8880 },
  { imdbId: 'tt0133093', provider: 'netflix', providerContentId: '60031236', title: 'The Matrix', year: 1999, duration: 8160 },
  { imdbId: 'tt1345836', provider: 'netflix', providerContentId: '70153404', title: 'The Dark Knight Rises', year: 2012, duration: 9960 },
  { imdbId: 'tt4154796', provider: 'netflix', providerContentId: '80100172', title: 'Avengers: Endgame', year: 2019, duration: 10860 },
  // Netflix -- TV
  { imdbId: 'tt5180504', provider: 'netflix', providerContentId: '80057281', title: 'The Witcher S1', year: 2019, duration: 3600 },
  { imdbId: 'tt2442560', provider: 'netflix', providerContentId: '80014749', title: 'Peaky Blinders S1', year: 2013, duration: 3600 },
  { imdbId: 'tt4574334', provider: 'netflix', providerContentId: '80025678', title: 'Stranger Things S1', year: 2016, duration: 3000 },
  { imdbId: 'tt5071412', provider: 'netflix', providerContentId: '80192098', title: 'Ozark S1', year: 2017, duration: 3600 },
  { imdbId: 'tt7366338', provider: 'netflix', providerContentId: '80186863', title: 'Chernobyl', year: 2019, duration: 3900 },
  // Amazon
  { imdbId: 'tt7631058', provider: 'amazon', providerContentId: 'B0875LCLG4', title: 'The Boys S1', year: 2019, duration: 3600 },
  { imdbId: 'tt7160372', provider: 'amazon', providerContentId: 'B0B96TKQFB', title: 'The Lord of the Rings: Rings of Power S1', year: 2022, duration: 3600 },
  { imdbId: 'tt13443470', provider: 'amazon', providerContentId: 'B09SVT6YDC', title: 'Reacher S1', year: 2022, duration: 3000 },
  { imdbId: 'tt8358844', provider: 'amazon', providerContentId: 'B08B47MMSR', title: 'The Wheel of Time S1', year: 2021, duration: 3600 },
  { imdbId: 'tt2560140', provider: 'amazon', providerContentId: 'B07YQ61GQ1', title: 'Attack on Titan S1', year: 2013, duration: 1500 },
  // Disney+
  { imdbId: 'tt4154756', provider: 'disney', providerContentId: 'd0c6a3c6-c6e7', title: 'Avengers: Infinity War', year: 2018, duration: 9480 },
  { imdbId: 'tt2380307', provider: 'disney', providerContentId: 'a3b1e325-ff1e', title: 'Coco', year: 2017, duration: 6300 },
  { imdbId: 'tt6105098', provider: 'disney', providerContentId: 'b5f5a54b-7f72', title: 'The Lion King (2019)', year: 2019, duration: 7080 },
  { imdbId: 'tt4633694', provider: 'disney', providerContentId: 'c8d2e3f4-a1b2', title: 'Spider-Man: Into the Spider-Verse', year: 2018, duration: 7080 },
  { imdbId: 'tt9362722', provider: 'disney', providerContentId: 'e5f6a7b8-c9d0', title: 'Spider-Man: Across the Spider-Verse', year: 2023, duration: 8400 },
  // Max (HBO)
  { imdbId: 'tt0944947', provider: 'max', providerContentId: 'urn:hbo:feature:GX', title: 'Game of Thrones S1', year: 2011, duration: 3600 },
  { imdbId: 'tt0903747', provider: 'max', providerContentId: 'urn:hbo:feature:GY', title: 'Breaking Bad S1', year: 2008, duration: 2880 },
  { imdbId: 'tt0306414', provider: 'max', providerContentId: 'urn:hbo:feature:GZ', title: 'The Wire S1', year: 2002, duration: 3600 },
  { imdbId: 'tt0141842', provider: 'max', providerContentId: 'urn:hbo:feature:G1', title: 'The Sopranos S1', year: 1999, duration: 3300 },
  { imdbId: 'tt0386676', provider: 'max', providerContentId: 'urn:hbo:feature:G2', title: 'The Office S1', year: 2005, duration: 1380 },
  // YouTube
  { imdbId: 'tt0096895', provider: 'youtube', providerContentId: 'dQw4w9WgXcQ', title: 'Batman (1989)', year: 1989, duration: 7560 },
  // Family/Faith
  { imdbId: 'tt9471404', provider: 'netflix', providerContentId: '81059803', title: 'The Chosen S1', year: 2019, duration: 3000 },
  { imdbId: 'tt0335345', provider: 'amazon', providerContentId: 'B001EBWING', title: 'The Passion of the Christ', year: 2004, duration: 7560 },
  { imdbId: 'tt0317705', provider: 'disney', providerContentId: 'f1a2b3c4-d5e6', title: 'The Incredibles', year: 2004, duration: 6900 },
  { imdbId: 'tt2948356', provider: 'disney', providerContentId: 'a2b3c4d5-e6f7', title: 'Soul', year: 2020, duration: 6180 },
  { imdbId: 'tt5109280', provider: 'disney', providerContentId: 'b3c4d5e6-f7a8', title: 'Moana', year: 2016, duration: 6420 },
  { imdbId: 'tt1663202', provider: 'netflix', providerContentId: '80014749', title: 'The Revenant', year: 2015, duration: 9360 },
  { imdbId: 'tt6334354', provider: 'amazon', providerContentId: 'B08K3NTQJR', title: 'Silence (2016)', year: 2016, duration: 10620 },
  { imdbId: 'tt1392190', provider: 'netflix', providerContentId: '80057281', title: 'Mad Max: Fury Road', year: 2015, duration: 7200 },
  { imdbId: 'tt1853728', provider: 'amazon', providerContentId: 'B083NWBQNT', title: 'Django Unchained', year: 2012, duration: 9960 },
  { imdbId: 'tt0993846', provider: 'netflix', providerContentId: '60004480', title: 'The Wolf of Wall Street', year: 2013, duration: 10800 },
  { imdbId: 'tt1856101', provider: 'netflix', providerContentId: '80025678', title: 'Blade Runner 2049', year: 2017, duration: 9840 },
  { imdbId: 'tt0993846', provider: 'max', providerContentId: 'urn:hbo:feature:G3', title: 'Goodfellas', year: 1990, duration: 8760 },
  { imdbId: 'tt11138512', provider: 'amazon', providerContentId: 'B08WJP4BBY', title: 'The Northman', year: 2022, duration: 8280 },
  { imdbId: 'tt0468569', provider: 'netflix', providerContentId: '70153404', title: 'The Dark Knight', year: 2008, duration: 9120 },
  { imdbId: 'tt3896198', provider: 'disney', providerContentId: 'c4d5e6f7-a8b9', title: 'Guardians of the Galaxy Vol. 2', year: 2017, duration: 8160 },
];

/** Lookup by IMDB ID */
const byImdbId = new Map<string, TitleEntry>();
/** Lookup by provider:contentId */
const byProviderId = new Map<string, TitleEntry>();

for (const t of SEED_TITLES) {
  byImdbId.set(t.imdbId, t);
  byProviderId.set(`${t.provider}:${t.providerContentId}`, t);
}

export function findByImdbId(imdbId: string): TitleEntry | undefined {
  return byImdbId.get(imdbId);
}

export function findByProviderId(provider: string, contentId: string): TitleEntry | undefined {
  return byProviderId.get(`${provider}:${contentId}`);
}

export function getAllTitles(): TitleEntry[] {
  return SEED_TITLES;
}

export function getTitleCount(): number {
  return SEED_TITLES.length;
}
