import { describe, it, expect } from 'vitest';
import {
  OpenSubtitlesClient,
  OsError,
  bestPerEpisode,
  candidatesFrom,
  fillSeason,
  queryString,
  type Candidate,
  type StoredToken,
  type TokenStore,
} from '../src/opensubtitles/client.js';
import { episodeFromFilename } from '../src/subtitles/library.js';

const memStore = (): TokenStore & { value: StoredToken | null } => {
  const s = {
    value: null as StoredToken | null,
    get: async () => s.value,
    set: async (t: StoredToken) => void (s.value = t),
    clear: async () => void (s.value = null),
  };
  return s;
};

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });

const raw = (over: Record<string, unknown> = {}, episode = 1, fileId = 100 + episode) => ({
  attributes: {
    download_count: 50,
    release: 'Show.S01E0' + episode,
    feature_details: { title: 'ep', parent_title: 'Deadwood', season_number: 1, episode_number: episode },
    files: [{ file_id: fileId }],
    ...over,
  },
});

const settings = { apiKey: ' KEY ', username: 'viewer', password: 'pw' };

describe('request shape', () => {
  it('sorts parameters alphabetically, uses + for spaces and drops empty ones', () => {
    expect(queryString({ type: 'episode', query: 'the shield', season_number: 2, page: undefined, languages: 'en' })).toBe(
      '?languages=en&query=the+shield&season_number=2&type=episode',
    );
  });
});

describe('choosing files', () => {
  it('keeps only the named show, with a season, an episode and a file', () => {
    const c = candidatesFrom(
      [
        raw(),
        raw({ feature_details: { title: 'x', parent_title: 'Another Show', season_number: 1, episode_number: 1 } }),
        raw({ files: [] }),
        raw({ feature_details: { parent_title: 'Deadwood' } }),
      ] as never,
      'deadwood',
    );
    expect(c).toHaveLength(1);
    expect(c[0].fileId).toBe(101);
  });

  it('prefers human-made, ordinary, trusted, popular files', () => {
    const base: Candidate = { fileId: 1, show: 'D', season: 1, episode: 4, release: '', downloads: 10, hearingImpaired: false, aiTranslated: false, machineTranslated: false, trusted: false };
    const best = bestPerEpisode([
      { ...base, fileId: 1, machineTranslated: true, downloads: 99999 },
      { ...base, fileId: 2, hearingImpaired: true, downloads: 500 },
      { ...base, fileId: 3, downloads: 20 },
      { ...base, fileId: 4, downloads: 20, trusted: true },
    ]);
    expect(best.get(4)?.fileId).toBe(4);
  });
});

describe('login and downloads', () => {
  it('asks for the account before downloading', async () => {
    const c = new OpenSubtitlesClient({ ...settings, username: '' }, { store: memStore(), http: async () => json(200, {}) });
    await expect(c.download(1)).rejects.toMatchObject({ kind: 'login' });
  });

  it('logs in once, keeps the token, and fetches the file from the link', async () => {
    const calls: string[] = [];
    const store = memStore();
    const http = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url.replace(/^https:\/\//, '')}`);
      if (url.endsWith('/login')) return json(200, { token: 'T1', base_url: 'api.opensubtitles.com', user: { level: 'Sub leecher' } });
      if (url.endsWith('/download')) {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer T1');
        expect((init?.headers as Record<string, string>)['Api-Key']).toBe('KEY');
        return json(200, { link: 'https://dl.opensubtitles.com/x.srt', remaining: 4 });
      }
      return new Response('1\n00:00:01,000 --> 00:00:02,000\nhi\n');
    };
    const c = new OpenSubtitlesClient(settings, { store, http });
    const a = await c.download(5);
    const b = await c.download(6);
    expect(a.remaining).toBe(4);
    expect(b.text).toContain('hi');
    expect(calls.filter((x) => x.endsWith('/login'))).toHaveLength(1);
  });

  it('renews an expired token once and carries on', async () => {
    const store = memStore();
    store.value = { token: 'OLD', host: 'api.opensubtitles.com', at: Date.now() };
    let logins = 0;
    const http = async (url: string, init?: RequestInit) => {
      if (url.endsWith('/login')) {
        logins++;
        return json(200, { token: 'NEW' });
      }
      if (url.endsWith('/infos/user')) {
        return (init?.headers as Record<string, string>).Authorization === 'Bearer NEW'
          ? json(200, { data: { level: 'x', remaining_downloads: 7 } })
          : json(401, { message: 'expired' });
      }
      return json(404, {});
    };
    const c = new OpenSubtitlesClient(settings, { store, http });
    const acct = await c.account();
    expect(acct.remaining).toBe(7);
    expect(logins).toBe(1);
  });

  it('names a refused key plainly', async () => {
    const c = new OpenSubtitlesClient(settings, { store: memStore(), http: async () => json(403, { message: 'You cannot consume this service' }) });
    const err = await c.searchSeason('Deadwood', 1).catch((e) => e);
    expect(err).toBeInstanceOf(OsError);
    expect(err.kind).toBe('key');
  });

  it('reports a network failure as one', async () => {
    const c = new OpenSubtitlesClient(settings, { store: memStore(), http: async () => { throw new TypeError('fetch failed'); } });
    await expect(c.searchSeason('Deadwood', 1)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('filling a season', () => {
  const setup = (opts: { have?: string[]; downloadsLeft?: number; quotaAt?: number } = {}) => {
    const saved: string[] = [];
    let left = opts.downloadsLeft ?? 10;
    let n = 0;
    const http = async (url: string, init?: RequestInit) => {
      if (url.includes('/subtitles?')) {
        return json(200, { total_pages: 1, data: [raw({}, 1), raw({}, 2), raw({}, 3), raw({}, 4)] });
      }
      if (url.endsWith('/login')) return json(200, { token: 'T' });
      if (url.endsWith('/infos/user')) return json(200, { data: { remaining_downloads: left } });
      if (url.endsWith('/download')) {
        n++;
        if (opts.quotaAt && n >= opts.quotaAt) return json(406, { message: 'quota' });
        left--;
        return json(200, { link: 'https://dl.example/x', remaining: left });
      }
      void init;
      return new Response('srt text');
    };
    const client = new OpenSubtitlesClient(settings, { store: memStore(), http });
    const run = (extra: Partial<Parameters<typeof fillSeason>[1]> = {}) =>
      fillSeason(client, {
        show: 'Deadwood',
        season: 1,
        have: new Set(opts.have ?? []),
        keyFor: (show, s, e) => episodeFromFilename(`${show}.S${s}E${e}.srt`)?.key ?? null,
        save: async (name) => {
          saved.push(name);
          return { ok: true };
        },
        ...extra,
      });
    return { run, saved };
  };

  it('gets only the episodes the library lacks, named so the library can read them', async () => {
    const { run, saved } = setup({ have: ['deadwood-s01e01', 'deadwood-s01e03'] });
    const r = await run();
    expect(r.added).toEqual([2, 4]);
    expect(r.alreadyHad).toEqual([1, 3]);
    expect(saved).toEqual(['Deadwood.S01E02.srt', 'Deadwood.S01E04.srt']);
    expect(episodeFromFilename(saved[0])?.key).toBe('deadwood-s01e02');
  });

  it('one episode on request, and says when OpenSubtitles has none', async () => {
    const { run, saved } = setup();
    const one = await run({ episode: 3 });
    expect(one.added).toEqual([3]);
    expect(saved).toEqual(['Deadwood.S01E03.srt']);
    const none = await run({ episode: 9 });
    expect(none.notFound).toEqual([9]);
  });

  it('stops before the daily limit instead of failing every file', async () => {
    const { run } = setup({ downloadsLeft: 2 });
    const r = await run();
    expect(r.added).toEqual([1, 2]);
    expect(r.stoppedEarly).toMatch(/tomorrow/);
  });

  it('stops when the service says the limit is reached', async () => {
    const { run } = setup({ quotaAt: 2 });
    const r = await run();
    expect(r.added).toEqual([1]);
    expect(r.stoppedEarly).toMatch(/tomorrow/);
  });

  it('reports a file the library could not use, and keeps going', async () => {
    const { run } = setup();
    let i = 0;
    const r = await run({ save: async () => (++i === 2 ? { error: 'too short' } : { ok: true }) });
    expect(r.failed).toEqual([{ episode: 2, reason: 'too short' }]);
    expect(r.added).toEqual([1, 3, 4]);
  });
});
