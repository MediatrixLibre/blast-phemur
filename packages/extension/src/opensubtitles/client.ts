/**
 * OpenSubtitles.com REST API (v1), just enough to fetch subtitle files for a
 * viewer's own library.
 *
 *   - Searching needs the API key.
 *   - Downloading also needs a login token (the viewer's free account), and
 *     each download uses one of the account's daily credits.
 *
 * Everything that touches the network is injected so the rules can be tested.
 */

const HOST = 'api.opensubtitles.com';
const APP = 'GuardianStream v0.1.0';

export interface OsSettings {
  apiKey: string;
  username: string;
  password: string;
}

export type OsErrorKind = 'key' | 'login' | 'quota' | 'rate' | 'network' | 'other';

export class OsError extends Error {
  constructor(
    readonly kind: OsErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface StoredToken {
  token: string;
  host: string;
  at: number;
}

export interface TokenStore {
  get(): Promise<StoredToken | null>;
  set(t: StoredToken): Promise<void>;
  clear(): Promise<void>;
}

export interface Candidate {
  fileId: number;
  show: string;
  season: number;
  episode: number;
  release: string;
  downloads: number;
  hearingImpaired: boolean;
  aiTranslated: boolean;
  machineTranslated: boolean;
  trusted: boolean;
}

export interface Account {
  user: string;
  level: string;
  /** Downloads left in the current period, when the account says */
  remaining: number | null;
}

/** Tokens last a day; renew a little early */
const TOKEN_MAX_AGE_MS = 20 * 3600_000;

interface RawSubtitle {
  attributes?: {
    download_count?: number;
    hearing_impaired?: boolean;
    ai_translated?: boolean;
    machine_translated?: boolean;
    from_trusted?: boolean;
    release?: string;
    feature_details?: { title?: string; parent_title?: string; season_number?: number; episode_number?: number };
    files?: { file_id?: number }[];
  };
}

/** Parameters in alphabetical order, spaces as "+" (the API asks for both) */
export function queryString(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v !== undefined && v !== '') q.append(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

const simple = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Subtitle files for the named show, one candidate per file, from a search response */
export function candidatesFrom(data: RawSubtitle[], show: string): Candidate[] {
  const want = simple(show);
  const out: Candidate[] = [];
  for (const item of data) {
    const a = item.attributes;
    const d = a?.feature_details;
    const fileId = a?.files?.[0]?.file_id;
    if (!a || !d || !fileId || d.season_number == null || d.episode_number == null) continue;
    const name = simple(d.parent_title ?? d.title ?? '');
    if (!name || !(name === want || name.startsWith(want) || want.startsWith(name))) continue;
    out.push({
      fileId,
      show: d.parent_title ?? d.title ?? show,
      season: d.season_number,
      episode: d.episode_number,
      release: a.release ?? '',
      downloads: a.download_count ?? 0,
      hearingImpaired: !!a.hearing_impaired,
      aiTranslated: !!a.ai_translated,
      machineTranslated: !!a.machine_translated,
      trusted: !!a.from_trusted,
    });
  }
  return out;
}

/**
 * Which file to take for one episode: a human-made, ordinary-subtitle file
 * from a trusted uploader that many people have downloaded.
 */
export function score(c: Candidate): number {
  return (
    (c.machineTranslated ? 0 : 1000) +
    (c.aiTranslated ? 0 : 500) +
    (c.hearingImpaired ? 0 : 100) +
    (c.trusted ? 50 : 0) +
    Math.log10(1 + c.downloads) * 10
  );
}

/** The best candidate for each episode number */
export function bestPerEpisode(cands: Candidate[]): Map<number, Candidate> {
  const best = new Map<number, Candidate>();
  for (const c of cands) {
    const cur = best.get(c.episode);
    if (!cur || score(c) > score(cur)) best.set(c.episode, c);
  }
  return best;
}

export type Http = (url: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  http?: Http;
  store: TokenStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class OpenSubtitlesClient {
  private http: Http;
  private store: TokenStore;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;

  constructor(
    private settings: OsSettings,
    opts: ClientOptions,
  ) {
    this.http = opts.http ?? ((u, i) => fetch(u, i));
    this.store = opts.store;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private headers(token?: string): Record<string, string> {
    return {
      'Api-Key': this.settings.apiKey.trim(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': APP,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.http(url, init);
    } catch {
      throw new OsError('network', 'Could not reach OpenSubtitles. Check your connection and try again.');
    }
  }

  private async body(res: Response): Promise<Record<string, unknown>> {
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private fail(res: Response, body: Record<string, unknown>, loggedIn: boolean): OsError {
    const said = typeof body.message === 'string' ? body.message : '';
    if (res.status === 406) return new OsError('quota', said || 'The daily download limit for this account is used up.');
    if (res.status === 429) return new OsError('rate', 'OpenSubtitles asked us to slow down. Try again in a minute.');
    if (res.status === 401) {
      return loggedIn
        ? new OsError('login', 'OpenSubtitles did not accept the username and password.')
        : new OsError('key', 'OpenSubtitles did not accept the API key.');
    }
    if (res.status === 403) return new OsError('key', 'OpenSubtitles did not accept the API key. Check that it was copied whole.');
    return new OsError('other', said || `OpenSubtitles answered with an error (${res.status}).`);
  }

  /** Log in with the viewer's account; keeps the token, never the reply's other details */
  async login(): Promise<{ token: string; host: string; user: string; level: string }> {
    if (!this.settings.username || !this.settings.password) {
      throw new OsError('login', 'Downloads need your OpenSubtitles username and password (a free account is enough).');
    }
    const res = await this.send(`https://${HOST}/api/v1/login`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ username: this.settings.username, password: this.settings.password }),
    });
    const body = await this.body(res);
    if (!res.ok) {
      if (res.status === 401 || res.status === 400) throw new OsError('login', 'OpenSubtitles did not accept the username and password.');
      throw this.fail(res, body, true);
    }
    const token = String(body.token ?? '');
    if (!token) throw new OsError('login', 'OpenSubtitles did not return a login.');
    const host = typeof body.base_url === 'string' && body.base_url ? body.base_url : HOST;
    const user = (body.user ?? {}) as { level?: string };
    await this.store.set({ token, host, at: this.now() });
    return { token, host, user: this.settings.username, level: user.level ?? '' };
  }

  private async session(): Promise<StoredToken> {
    const kept = await this.store.get();
    if (kept && this.now() - kept.at < TOKEN_MAX_AGE_MS) return kept;
    const { token, host } = await this.login();
    return { token, host, at: this.now() };
  }

  /** A call that needs the login; renews an expired token once */
  private async authed(path: string, init: RequestInit = {}): Promise<{ res: Response; body: Record<string, unknown> }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = await this.session();
      const res = await this.send(`https://${s.host}/api/v1${path}`, {
        ...init,
        headers: { ...this.headers(s.token), ...(init.headers as Record<string, string> | undefined) },
      });
      const body = await this.body(res);
      if (res.status === 401 && attempt === 0) {
        await this.store.clear();
        continue;
      }
      if (!res.ok) throw this.fail(res, body, true);
      return { res, body };
    }
    throw new OsError('login', 'OpenSubtitles did not accept the login.');
  }

  /** Check the key and the login, and say how many downloads are left */
  async account(): Promise<Account> {
    const { body } = await this.authed('/infos/user');
    const d = (body.data ?? {}) as { level?: string; remaining_downloads?: number };
    return {
      user: this.settings.username,
      level: d.level ?? '',
      remaining: typeof d.remaining_downloads === 'number' ? d.remaining_downloads : null,
    };
  }

  /** Subtitle files for a show's season (all pages up to a sensible cap) */
  async searchSeason(show: string, season: number, language = 'en'): Promise<Candidate[]> {
    const all: Candidate[] = [];
    for (let page = 1; page <= 4; page++) {
      const url = `https://${HOST}/api/v1/subtitles${queryString({
        languages: language,
        page: page > 1 ? page : undefined,
        query: show,
        season_number: season,
        type: 'episode',
      })}`;
      const res = await this.send(url, { headers: this.headers() });
      const body = await this.body(res);
      if (!res.ok) throw this.fail(res, body, false);
      all.push(...candidatesFrom((body.data ?? []) as RawSubtitle[], show));
      const pages = typeof body.total_pages === 'number' ? body.total_pages : 1;
      if (page >= pages) break;
    }
    return all;
  }

  /** Fetch one subtitle file as text; uses one of the account's daily downloads */
  async download(fileId: number): Promise<{ text: string; remaining: number | null }> {
    const { body } = await this.authed('/download', {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId, sub_format: 'srt' }),
    });
    const link = typeof body.link === 'string' ? body.link : '';
    if (!link) throw new OsError('other', 'OpenSubtitles did not give a download link.');
    const res = await this.send(link, {});
    if (!res.ok) throw new OsError('other', `The subtitle file could not be fetched (${res.status}).`);
    return { text: await res.text(), remaining: typeof body.remaining === 'number' ? body.remaining : null };
  }
}

export interface FillOptions {
  show: string;
  season: number;
  /** Just this episode; otherwise every missing one in the season */
  episode?: number;
  /** Library keys already held (see episodeFromFilename) */
  have: ReadonlySet<string>;
  /** Library key for "<show> S<season>E<episode>" */
  keyFor: (show: string, season: number, episode: number) => string | null;
  save: (filename: string, text: string) => Promise<{ error: string } | object>;
  onProgress?: (line: string) => void;
}

export interface FillResult {
  added: number[];
  alreadyHad: number[];
  notFound: number[];
  failed: { episode: number; reason: string }[];
  stoppedEarly: string | null;
  remaining: number | null;
}

const code = (season: number, episode: number): string =>
  `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;

/** Fetch the missing episodes of one season, stopping cleanly when the day's downloads run out */
export async function fillSeason(client: OpenSubtitlesClient, o: FillOptions): Promise<FillResult> {
  const result: FillResult = { added: [], alreadyHad: [], notFound: [], failed: [], stoppedEarly: null, remaining: null };
  const say = o.onProgress ?? (() => {});

  say(`Looking up ${o.show} season ${o.season}…`);
  const best = bestPerEpisode(await client.searchSeason(o.show, o.season));
  const wanted = o.episode !== undefined ? [o.episode] : [...best.keys()].sort((a, b) => a - b);
  if (wanted.length === 0) {
    say('Nothing found. Check the show name and season.');
    return result;
  }

  const account = await client.account();
  result.remaining = account.remaining;
  say(account.remaining !== null ? `${account.remaining} downloads left on this account today.` : 'Connected.');

  for (const ep of wanted) {
    const key = o.keyFor(o.show, o.season, ep);
    if (key && o.have.has(key)) {
      result.alreadyHad.push(ep);
      continue;
    }
    const pick = best.get(ep);
    if (!pick) {
      result.notFound.push(ep);
      say(`${code(o.season, ep)}: not on OpenSubtitles.`);
      continue;
    }
    if (result.remaining !== null && result.remaining <= 0) {
      result.stoppedEarly = 'Today’s download limit is used up. Run this again tomorrow for the rest.';
      break;
    }
    try {
      const { text, remaining } = await client.download(pick.fileId);
      const saved = await o.save(`${o.show}.${code(o.season, ep)}.srt`, text);
      if ('error' in saved) {
        result.failed.push({ episode: ep, reason: String((saved as { error: string }).error) });
        say(`${code(o.season, ep)}: could not use the file.`);
      } else {
        result.added.push(ep);
        say(`${code(o.season, ep)}: added.`);
      }
      if (remaining !== null) result.remaining = remaining;
    } catch (e) {
      if (e instanceof OsError && e.kind === 'quota') {
        result.stoppedEarly = 'Today’s download limit is used up. Run this again tomorrow for the rest.';
        break;
      }
      if (e instanceof OsError && (e.kind === 'rate' || e.kind === 'network')) {
        result.stoppedEarly = e.message;
        break;
      }
      result.failed.push({ episode: ep, reason: e instanceof Error ? e.message : String(e) });
      say(`${code(o.season, ep)}: failed.`);
    }
  }
  return result;
}
