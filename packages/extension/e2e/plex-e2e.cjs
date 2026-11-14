/**
 * End-to-end check in real Brave for the Plex path: loads dist/ as an unpacked
 * extension and serves a fake watch.plex.tv player page built the way Plex
 * builds it (one full-size <video>, two empty ones, a title link, and English
 * captions as a native TextTrack the browser draws, the whole film's cues
 * loaded at once, no caption DOM). Plays with the sound on and records when
 * the video is muted.
 *
 * What this proves: manifest match on watch.plex.tv, content script boot, the
 * empty <video>s ignored, the caption track found and anchored at offset 0,
 * each profane line muted around its word and nothing else muted, and the
 * words masked in the cue text the browser draws.
 * What it does NOT prove: Plex's real player (checked by hand 2026-11-14 on
 * The Grey: same track shape, 1,647 cues, muted and restored as expected) or
 * what an ad break does to the clock.
 *
 * Run: node e2e/plex-e2e.cjs [--live]   (from packages/extension, after
 * pnpm run build; sandbox off). Exit 2 when it could not check.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright-core');

const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const DIST = path.resolve(__dirname, '../dist');
const CLIP = require('./clip.cjs')();
const RUN_SECONDS = 30;

// Pop-on captions as Plex sends them: one whole line per cue, in video time
const CUES = [
  [1, 3.5, 'The gold in this camp belongs to the men who dig it'],
  [4.5, 7.5, "You're a fucking fool if you think that wagon is safe"], // *
  [8.5, 11.5, 'I never asked for a partner in this business of yours'],
  [12.5, 15.5, 'Well shit, that was faster than anybody expected out here'], // *
  [16.5, 19.5, 'The doctor says the fever will break by morning light'],
  [20.5, 23.5, 'God damn it, I told you not to touch the ledger'], // * sacred: whole line
  [24.5, 27.5, 'Pass the whiskey and tell me about the mountain road'],
];
const PROFANE = [[4.5, 'fucking'], [12.5, 'shit'], [20.5, 'God damn']];
const stamp = (s) => new Date(s * 1000).toISOString().slice(11, 23);
const VTT = 'WEBVTT\n\n' + CUES.map(([a, b, t]) => `${stamp(a)} --> ${stamp(b)}\n${t}\n`).join('\n');

function serveClip() {
  return new Promise((resolve) => {
    const size = fs.statSync(CLIP).size;
    const srv = http.createServer((rq, rs) => {
      const range = rq.headers.range;
      const h = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
      if (range) {
        const [a, b] = range.replace('bytes=', '').split('-');
        const start = +a, end = b ? +b : size - 1;
        rs.writeHead(206, { ...h, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        fs.createReadStream(CLIP, { start, end }).pipe(rs);
      } else {
        rs.writeHead(200, { ...h, 'Content-Length': size });
        fs.createReadStream(CLIP).pipe(rs);
      }
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const PAGE = (port) => `<!doctype html><html><head><title>Watch Live TV, Movies, and TV Shows Free Online</title></head>
<body style="background:#000;margin:0">
<div data-testid="player" style="position:relative;width:960px;height:540px">
  <video class="HtmlVideo-module__x__video" src="http://127.0.0.1:${port}/clip.mp4" width="960" height="540" muted playsinline></video>
  <video muted></video><video></video>
  <a data-testid="playerTitleLink" href="/movie/test-film" style="position:absolute;top:10px;left:10px;color:#fff">Test Film</a>
</div>
<script>
  const v = document.querySelector('video');
  // Plex adds the chosen subtitle as a TextTrack the browser draws; a blob keeps it same-origin
  const track = document.createElement('track');
  track.kind = 'subtitles'; track.label = 'English'; track.srclang = 'en'; track.default = true;
  track.src = URL.createObjectURL(new Blob([${JSON.stringify(VTT)}], { type: 'text/vtt' }));
  v.appendChild(track);
  track.track.mode = 'showing';
  window.__log = [];
  setInterval(() => {
    const t = [...v.textTracks].find((x) => x.label === 'English');
    const cues = t && t.cues ? [...t.cues].map((c) => c.text) : [];
    window.__log.push({ t: +v.currentTime.toFixed(3), muted: v.muted || v.volume < 0.1, cues });
  }, 40);
</script></body></html>`;

const soften = (s) => String(s).replace(/\b(f)uck\w*|\b(s)hit\w*|(g)od\s?damn\w*/gi, (m) => m[0] + '*'.repeat(m.length - 1));
(async () => {
  const srv = await serveClip();
  const port = srv.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-brave-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: BRAVE,
    headless: false,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--disable-features=DisableLoadExtensionCommandLineSwitch,MediaRouter,DialMediaRouteProvider,LocalNetworkAccessChecks', '--mute-audio', '--disable-background-networking',
      '--autoplay-policy=no-user-gesture-required',
      '--no-first-run',
    ],
  });
  try {
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const page = await ctx.newPage();
    const consoleLines = [];
    const live = process.argv.includes('--live');
    const t0 = Date.now();
    page.on('console', (m) => { if (m.text().includes('Blast Phemur')) { consoleLines.push(m.text()); if (live) console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m.text().slice(0, 140)}`); } });
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    await page.route('https://watch.plex.tv/watch/movie/test-film**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: PAGE(port) }));
    await page.goto('https://watch.plex.tv/watch/movie/test-film?uri=provider%3A%2F%2Ftv.plex.provider.vod%2Flibrary%2Fmetadata%2Ftest0001');
    await page.waitForTimeout(2500);
    const cuesLoaded = await page.evaluate(() => { const t = [...document.querySelector('video').textTracks].find((x) => x.label === 'English'); return t && t.cues ? t.cues.length : 0; });
    if (cuesLoaded === 0) { console.error('e2e: the browser loaded no cues from the fake track. Could not check.'); process.exitCode = 2; return; }
    // Sound on at the element (the browser itself is muted by --mute-audio), then play
    await page.evaluate(() => { const v = document.querySelector('video'); v.muted = false; v.volume = 1; return v.play(); });
    await page.waitForTimeout(RUN_SECONDS * 1000);

    const log = await page.evaluate(() => window.__log);
    const intervals = [];
    let cur = null;
    for (const s of log) {
      if (s.muted && !cur) cur = { from: s.t, to: s.t };
      else if (s.muted && cur) cur.to = s.t;
      else if (!s.muted && cur) { intervals.push(cur); cur = null; }
    }
    if (cur) intervals.push(cur);
    for (let i = intervals.length - 1; i >= 0; i--) if (intervals[i].to < 0.5) intervals.splice(i, 1);

    console.log('\nBlast Phemur console:');
    consoleLines.slice(0, 10).forEach((l) => console.log('  ' + l));
    console.log('\nMute intervals (video seconds):');
    intervals.forEach((i) => console.log(`  ${i.from.toFixed(2)} -> ${i.to.toFixed(2)}  (${(i.to - i.from).toFixed(2)}s)`));

    let failures = 0;
    const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${soften(name)} ${soften(extra)}`); if (!ok) failures++; };
    check('content script ran on watch.plex.tv', consoleLines.some((l) => /Content script initialized/.test(l)));
    check('the two empty <video>s got no session (one session only)', consoleLines.filter((l) => /Caption monitoring active/.test(l)).length === 1);
    check('Plex module chosen', consoleLines.some((l) => /Caption monitoring active on Plex/.test(l)));
    check('anchored to the title from the player link, offset 0', consoleLines.some((l) => /Anchored to Test Film: \d+ filters, offset 0\.0s/.test(l)));
    for (const [start, word] of PROFANE) {
      const cue = CUES.find((c) => c[0] === start);
      const hit = intervals.find((i) => i.to >= cue[0] && i.from <= cue[1]);
      check(`muted during "${word}" line (${cue[0]}-${cue[1]}s)`, !!hit);
      const sacred = /\bgod\b/i.test(word);
      if (hit && sacred) check('  sacred name: the whole line is muted', hit.from <= cue[0] + 0.4 && hit.to >= cue[1] - 0.4, `(${hit.from.toFixed(2)}-${hit.to.toFixed(2)}s)`);
      else if (hit) check('  mute is short, not the whole line', hit.to - hit.from < 1.6, `(${(hit.to - hit.from).toFixed(2)}s)`);
    }
    const quiet = intervals.filter((i) => !PROFANE.some(([s]) => i.to >= s - 0.5 && i.from <= CUES.find((c) => c[0] === s)[1] + 0.5));
    check('no mutes away from profane lines', quiet.length === 0, JSON.stringify(quiet));
    const last = log[log.length - 1] || { cues: [] };
    check('profane words masked in the cue text the browser draws', last.cues.some((c) => /f\*+|s\*+|G\*+/i.test(c)) && !last.cues.some((c) => /fuck|shit|god damn/i.test(c)), JSON.stringify(last.cues.filter((c) => /\*/.test(c))));
    check('clean lines left as they were', last.cues.includes('The gold in this camp belongs to the men who dig it'));

    console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
    process.exitCode = failures ? 1 : 0;
  } finally {
    await ctx.close();
    srv.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
