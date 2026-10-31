/**
 * End-to-end check in real Brave: loads dist/ as an unpacked extension, serves a
 * fake YouTube TV page (video + caption DOM), imports a subtitle track into
 * extension storage, plays, and records when the video is muted.
 *
 * What this proves: manifest match on tv.youtube.com, content script boot,
 * episode identification, anchoring with a +12s offset, lookahead muting,
 * caption-mode fallback, caption masking on screen, and "that was fine here":
 * "[" passes one moment, which then plays on rewind (anchored, and again
 * after a restart while live captions lead), while other moments still mute.
 * What it does NOT prove: alignment against real speech (the clip's audio
 * is not the script), or YouTube TV's real caption DOM.
 *
 * Run: node e2e/brave-e2e.cjs [--live] [--debug]   (from packages/extension,
 * after pnpm run build; sandbox off). --live prints console lines and video
 * time as it plays; --debug prints what the content script logged after "[".
 * LocalNetworkAccessChecks is off because the fake page poses as a public
 * site and loads its clip from 127.0.0.1, which Chromium now blocks.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright-core');

const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const DIST = path.resolve(__dirname, '../dist');
const CLIP = require('./clip.cjs')();
const OFFSET = 12; // video time = subtitle time + 12
const RUN_SECONDS = 56;

// Subtitle script: [start, end, text]. Profane cues marked with *.
const CUES = [
  [0, 3, 'The gold in this camp belongs to the men who dig it'],
  [4, 7, "You're a fucking fool if you think that wagon is safe"], // * before lock (fallback)
  [8, 11, 'I never asked for a partner in this business of yours'],
  [12, 15, 'Bring the wagon around before it starts to rain tonight'],
  [16, 19, 'You will answer for what happened at the creek yesterday'],
  [20, 23, 'Well shit, that was faster than anybody expected out here'], // *
  [24, 27, 'The doctor says the fever will break by morning light'],
  [28, 31, 'Nobody leaves this town until the sheriff gets back'],
  [32, 35, 'That cocksucker never paid a single dollar he owed us'], // *
  [36, 39, 'Pass the whiskey and tell me about the mountain road'],
  [40, 43, 'God damn it, I told you not to touch the ledger'], // *
];
const PROFANE = [[4, 'fucking'], [20, 'shit'], [32, 'cocksucker'], [40, 'God damn']];

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

const PAGE = (port) => `<!doctype html><html><head><title>Test Show - YouTube TV</title></head>
<body style="background:#000;margin:0">
<div id="player" class="html5-video-player" style="position:relative;width:960px;height:540px">
  <video class="html5-main-video" src="http://127.0.0.1:${port}/clip.mp4" width="960" height="540" muted playsinline></video>
  <div id="tiles">${"<video width=170 height=96 muted></video>".repeat(6)}</div>
  <div class="ytp-caption-window-container" style="position:absolute;bottom:30px;width:100%;text-align:center;color:#fff"></div>
</div>
<script>
  const CUES = ${JSON.stringify(CUES)};
  const OFFSET = ${OFFSET};
  const v = document.querySelector('video');
  const box = document.querySelector('.ytp-caption-window-container');
  window.__log = [];
  let shown = null;
  setInterval(() => {
    const st = v.currentTime - OFFSET;
    const cue = CUES.find(c => st >= c[0] && st < c[1]);
    const text = cue ? cue[2] : null;
    if (text !== shown) {
      shown = text;
      box.innerHTML = '';
      if (text) { const s = document.createElement('span'); s.className = 'ytp-caption-segment'; s.textContent = text; box.appendChild(s); }
    }
  }, 50);
  setInterval(() => {
    const seg = document.querySelector('.ytp-caption-segment');
    window.__log.push({ t: +v.currentTime.toFixed(3), muted: v.muted || v.volume < 0.1, cap: seg ? seg.textContent : '' });
  }, 40);
</script></body></html>`;

const soften = (s) => String(s).replace(/\b(f)uck\w*|\b(s)hit\w*|(c)ocksuck\w*|(c)unt\w*|(g)od\s?damn\w*|(m)otherfuck\w*/gi, (m) => m[0] + '*'.repeat(m.length - 1));
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
    console.log('extension service worker:', sw.url());

    await sw.evaluate(({ cues }) => new Promise((res) => chrome.storage.local.set({
      'gs:subs:index': [{ key: 'test-show-s01e01', title: 'Test Show S01E01', cueCount: cues.length, addedAt: 1 }],
      'gs:subs:test-show-s01e01': cues,
    }, res)), { cues: CUES });

    const page = await ctx.newPage();
    const consoleLines = [];
    const live = process.argv.includes('--live');
    const t0 = Date.now();
    page.on('console', (m) => { if (m.text().includes('Blast Phemur')) { consoleLines.push(m.text()); if (live) console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m.text().slice(0, 140)}`); } });
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    await page.route('https://tv.youtube.com/watch/TEST123**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: PAGE(port) }));
    await page.goto('https://tv.youtube.com/watch/TEST123?noapp=1');

    if (live) {
      for (let i = 0; i < 3; i++) {
        const st = await Promise.race([page.evaluate(() => { const v = document.querySelector('video'); return { ready: document.readyState, vReady: v.readyState, net: v.networkState, err: v.error?.code ?? null }; }), new Promise((r) => setTimeout(() => r('NO ANSWER (page frozen)'), 2000))]);
        console.log('before play:', JSON.stringify(st));
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (live) console.log('play: asking');
    await page.evaluate(() => { const v = document.querySelector('video'); v.muted = false; v.volume = 1; return v.play(); });
    if (live) {
      console.log('play: started');
      for (let i = 0; i < RUN_SECONDS / 4; i++) {
        await page.waitForTimeout(4000);
        const t = await Promise.race([page.evaluate(() => document.querySelector('video').currentTime), new Promise((r) => setTimeout(() => r('NO ANSWER (page frozen)'), 2000))]);
        console.log(`  video t=${t}`);
      }
    } else await page.waitForTimeout(RUN_SECONDS * 1000);

    const log = await page.evaluate(() => window.__log);
    // Build mute intervals in video time
    const intervals = [];
    let cur = null;
    for (const s of log) {
      if (s.muted && !cur) cur = { from: s.t, to: s.t };
      else if (s.muted && cur) cur.to = s.t;
      else if (!s.muted && cur) { intervals.push(cur); cur = null; }
    }
    if (cur) intervals.push(cur);
    // Ignore the page's pre-playback muted state
    for (let i = intervals.length - 1; i >= 0; i--) if (intervals[i].to < 0.5) intervals.splice(i, 1);
    // Drop the harness's own initial state before playback starts
    const played = log.filter((s) => s.t > 0.2);

    console.log('\nBlast Phemur console:');
    consoleLines.slice(0, 12).forEach((l) => console.log('  ' + l));
    console.log('\nMute intervals (video seconds):');
    intervals.forEach((i) => console.log(`  ${i.from.toFixed(2)} -> ${i.to.toFixed(2)}  (${(i.to - i.from).toFixed(2)}s)`));

    let failures = 0;
    const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${soften(name)} ${soften(extra)}`); if (!ok) failures++; };

    check('content script ran on tv.youtube.com', consoleLines.some((l) => /Content script initialized/.test(l)));
    check('thumbnail-sized videos ignored (one session only)', consoleLines.filter((l) => /Caption monitoring active/.test(l)).length === 1);
    check('caption mode started', consoleLines.some((l) => /Caption monitoring active/.test(l)));
    check('anchored to the episode', consoleLines.some((l) => /Anchored to Test Show S01E01/.test(l)));
    check('offset locked near 12s', consoleLines.some((l) => /offset 1[12]\.\d/.test(l)));

    // Each profane cue after the lock must be muted around the word
    for (const [subStart, word] of PROFANE) {
      const cue = CUES.find((c) => c[0] === subStart);
      const vStart = cue[0] + OFFSET, vEnd = cue[1] + OFFSET;
      const hit = intervals.find((i) => i.to >= vStart && i.from <= vEnd);
      check(`muted during "${word}" cue (video ${vStart}-${vEnd}s)`, !!hit);
      // A sacred name mutes its whole line (+/-0.3 s) by design since 4adafb4: the
      // word estimate can land a fraction off and the Name must never be heard
      const sacred = /\bgod\b|jesus|christ/i.test(word);
      if (hit && sacred) check(`  sacred name: the whole line is muted`, hit.from <= vStart + 0.4 && hit.to >= vEnd - 0.4, `(${hit.from.toFixed(2)}-${hit.to.toFixed(2)}s)`);
      else if (hit) check(`  mute is short, not a 3s caption block`, subStart === 4 || hit.to - hit.from < 1.6, `(${(hit.to - hit.from).toFixed(2)}s)`);
    }
    const quiet = intervals.filter((i) => !PROFANE.some(([s]) => i.to >= s + OFFSET - 0.5 && i.from <= CUES.find((c) => c[0] === s)[1] + OFFSET + 3.5));
    check('no mutes away from profane cues', quiet.length === 0, JSON.stringify(quiet));

    const leaked = played.filter((s) => /fuck|shit|cocksucker|god\s*damn/i.test(s.cap));
    const masked = played.filter((s) => /f\*+|s\*+|c\*+/.test(s.cap));
    check('full profane words never visible on screen', leaked.length === 0, `(${leaked.length} frames)`);
    check('masked words shown instead', masked.length > 0);

    // ---- "That was fine here": pass the last muted moment (the sacred-name
    // line, as a prayer would be), rewind, and hear it play; the other words
    // still mute, and the pass is swapped in without restarting the session
    const intervalsOf = (entries) => {
      const out = [];
      let c = null;
      for (const s of entries) {
        if (s.muted && !c) c = { from: s.t, to: s.t };
        else if (s.muted && c) c.to = s.t;
        else if (!s.muted && c) { out.push(c); c = null; }
      }
      if (c) out.push(c);
      return out;
    };
    const sessionsBefore = consoleLines.filter((l) => /Caption monitoring active/.test(l)).length;
    const linesBefore = consoleLines.length;
    await page.bringToFront();
    await page.keyboard.press('[');
    await page.waitForTimeout(1200);
    const passes = await sw.evaluate(() => chrome.storage.local.get('config').then((r) => r.config?.customWords?.passes ?? []));
    check('"[" saved one pass for that moment, on the track and on live captions',
      passes.length === 2 && passes.some((p) => p.track === 'test-show-s01e01') && passes.some((p) => p.track.startsWith('captions:')), JSON.stringify(passes));
    const replay = async (from, seconds) => {
      await page.evaluate((t) => { window.__log = []; const v = document.querySelector('video'); v.currentTime = t; return v.play(); }, from);
      await page.waitForTimeout(seconds * 1000);
      return intervalsOf((await page.evaluate(() => window.__log)).filter((s) => s.t >= from + 0.2));
    };
    const again = await replay(49, 7.5);
    check('the passed moment plays on rewind', !again.some((i) => i.to >= 52 && i.from <= 55), JSON.stringify(again));
    const other = await replay(30, 6);
    check('a different moment still mutes ("s***" at 32-35s)', other.some((i) => i.to >= 32 && i.from <= 35), JSON.stringify(other));
    check('the pass did not restart the session', consoleLines.filter((l) => /Caption monitoring active/.test(l)).length === sessionsBefore);

    // A settings change restarts the session, which reads live captions until
    // it finds its place again: the pass must hold there too
    await sw.evaluate(() => chrome.storage.local.get('config').then((r) => chrome.storage.local.set({ config: { ...r.config, muteTransitionMs: 60 } })));
    await page.waitForTimeout(1500);
    const restarted = consoleLines.filter((l) => /Caption monitoring active/.test(l)).length > sessionsBefore;
    // Straight to just before the line, so the new session cannot have found its place yet
    const afterRestart = await replay(51.3, 5);
    // Which path held it: the live-captions pass logs "passed"; a quick re-lock leaves it to the track
    const viaCaptions = await sw.evaluate(() => chrome.tabs.query({ url: 'https://tv.youtube.com/watch/TEST123*' })
      .then((t) => chrome.tabs.sendMessage(t[0].id, { type: 'GET_DEBUG' }))
      .then((d) => (d.events || []).some((e) => e.kind === 'passed')));
    check('after a restart (live captions first), the passed moment still plays', restarted && !afterRestart.some((i) => i.to >= 52 && i.from <= 55), `restarted=${restarted} held-by=${viaCaptions ? 'live-captions pass' : 'track (re-locked first)'} ${JSON.stringify(afterRestart)}`);
    if (process.argv.includes('--debug')) console.log(consoleLines.slice(linesBefore).join('\n'));

    console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
    process.exitCode = failures ? 1 : 0;
  } finally {
    await ctx.close();
    srv.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
