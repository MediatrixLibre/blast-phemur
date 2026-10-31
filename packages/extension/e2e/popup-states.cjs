/**
 * Screenshots of the popup in its real states, in real Brave, light and dark.
 * Reuses the fake YouTube TV page of brave-e2e.cjs (video + caption DOM + an
 * imported subtitle track) and opens popup.html?tab=<id> pinned to that tab, so
 * every state shown is what the content script actually reported.
 *
 * Run: node e2e/popup-states.cjs <outDir>   (from packages/extension, after a build;
 * needs the sandbox off). Prints a JSON line per shot with the hero title read
 * back from the DOM, the page height, and controls under 24 px.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright-core');

const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const DIST = path.resolve(__dirname, '../dist');
const CLIP = require('./clip.cjs')();
const OUT = path.resolve(process.argv[2] || '/tmp/gs-states');
const OFFSET = 12;
const CUES = [
  [0, 3, 'The gold in this camp belongs to the men who dig it'],
  [4, 7, "You're a fucking fool if you think that wagon is safe"],
  [8, 11, 'I never asked for a partner in this business of yours'],
  [12, 15, 'Bring the wagon around before it starts to rain tonight'],
  [16, 19, 'You will answer for what happened at the creek yesterday'],
  [20, 23, 'Well shit, that was faster than anybody expected out here'],
  [24, 27, 'The doctor says the fever will break by morning light'],
  [28, 31, 'Nobody leaves this town until the sheriff gets back'],
  [32, 35, 'That cocksucker never paid a single dollar he owed us'],
  [36, 39, 'Pass the whiskey and tell me about the mountain road'],
  [40, 43, 'God damn it, I told you not to touch the ledger'],
];

function serveClip() {
  return new Promise((resolve) => {
    const size = fs.statSync(CLIP).size;
    const srv = http.createServer((rq, rs) => {
      const h = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
      const range = rq.headers.range;
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

const PAGE = (port, captions) => `<!doctype html><html><head><title>Test Show - YouTube TV</title></head>
<body style="background:#000;margin:0">
<div id="player" class="html5-video-player" style="position:relative;width:960px;height:540px">
  <video class="html5-main-video" src="http://127.0.0.1:${port}/clip.mp4" width="960" height="540" muted playsinline></video>
  <div class="ytp-caption-window-container" style="position:absolute;bottom:30px;width:100%;text-align:center;color:#fff;font:24px sans-serif"></div>
</div>
<script>
  const CUES = ${JSON.stringify(captions ? CUES : [])};
  const v = document.querySelector('video');
  const box = document.querySelector('.ytp-caption-window-container');
  let shown = null;
  setInterval(() => {
    const st = v.currentTime - ${OFFSET};
    const cue = CUES.find(c => st >= c[0] && st < c[1]);
    const text = cue ? cue[2] : null;
    if (text !== shown) {
      shown = text; box.innerHTML = '';
      if (text) { const s = document.createElement('span'); s.className = 'ytp-caption-segment'; s.textContent = text; box.appendChild(s); }
    }
  }, 50);
</script></body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serveClip();
  const port = srv.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-states-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: BRAVE, headless: false, viewport: { width: 1000, height: 640 },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`,
      '--disable-features=DisableLoadExtensionCommandLineSwitch,MediaRouter,DialMediaRouteProvider,LocalNetworkAccessChecks',
      '--mute-audio', '--disable-background-networking', '--autoplay-policy=no-user-gesture-required', '--no-first-run'],
  });
  const results = [];
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const id = new URL(sw.url()).host;
    // The welcome tab opens on install; keep it for its own shot
    await new Promise((r) => setTimeout(r, 1500));

    await sw.evaluate(({ cues }) => new Promise((res) => chrome.storage.local.set({
      'gs:subs:index': [{ key: 'test-show-s01e01', title: 'Test Show S01E01', cueCount: cues.length, addedAt: 1 }],
      'gs:subs:test-show-s01e01': cues,
    }, res)), { cues: CUES });

    const shot = async (name, url, { scheme = 'light', width = 376, open = [], full = true } = {}) => {
      const p = await ctx.newPage();
      await p.setViewportSize({ width, height: 600 });
      await p.emulateMedia({ colorScheme: scheme });
      await p.goto(url);
      await p.waitForTimeout(1800); // two status polls
      for (const sel of open) await p.click(sel);
      if (open.length) await p.waitForTimeout(300);
      const info = await p.evaluate(() => {
        const small = [...document.querySelectorAll('button, a, input, select, textarea, summary, [role=radio], label.gs-seg-opt')]
          .filter((e) => e.offsetParent !== null)
          .map((e) => ({ e, r: e.getBoundingClientRect() }))
          .filter(({ e, r }) => (r.height < 24 || r.width < 24) && !(e.tagName === 'INPUT' && e.type === 'radio'))
          .map(({ e, r }) => `${e.tagName.toLowerCase()}.${e.className}:${Math.round(r.width)}x${Math.round(r.height)}`);
        return {
          hero: document.querySelector('.gs-hero-title')?.textContent ?? document.querySelector('h1')?.textContent,
          detail: document.querySelector('.gs-hero-detail')?.textContent ?? null,
          recent: [...document.querySelectorAll('.gs-recent-words')].map((e) => e.textContent),
          height: document.documentElement.scrollHeight,
          small,
        };
      });
      await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
      results.push({ name, ...info });
      console.log(JSON.stringify({ name, ...info }));
      await p.close();
    };

    const popup = `chrome-extension://${id}/popup.html`;
    await shot('idle-unsupported-light', popup);
    await shot('idle-unsupported-dark', popup, { scheme: 'dark' });
    await shot('welcome-light', `${popup}?view=welcome`, { width: 900 });
    await shot('welcome-dark', `${popup}?view=welcome`, { width: 900, scheme: 'dark' });
    await shot('subtitles-light', `${popup}?view=subtitles`, { width: 900 });
    await shot('finetune-dark', popup, { scheme: 'dark', open: ['.gs-fold:nth-of-type(1) > summary'] });

    // A page with no captions at all: the "turn on CC" state
    const quiet = await ctx.newPage();
    await quiet.route('https://tv.youtube.com/watch/QUIET**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE(port, false) }));
    await quiet.goto('https://tv.youtube.com/watch/QUIET?x=1');
    await quiet.evaluate(() => { const v = document.querySelector('video'); v.muted = false; v.volume = 1; return v.play(); });
    await quiet.waitForTimeout(3000);
    const quietId = await sw.evaluate(() => chrome.tabs.query({ url: 'https://tv.youtube.com/watch/QUIET*' }).then((t) => t[0]?.id));
    await shot('attention-captions-off-light', `${popup}?tab=${quietId}`);
    await quiet.close();

    // The show: live captions first, then locked to the subtitle track
    const page = await ctx.newPage();
    await page.route('https://tv.youtube.com/watch/TEST123**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE(port, true) }));
    await page.goto('https://tv.youtube.com/watch/TEST123?x=1');
    await page.evaluate(() => { const v = document.querySelector('video'); v.muted = false; v.volume = 1; return v.play(); });
    const tabId = await sw.evaluate(() => chrome.tabs.query({ url: 'https://tv.youtube.com/watch/TEST123*' }).then((t) => t[0]?.id));
    const at = async (seconds) => { await page.bringToFront(); await page.waitForFunction((s) => document.querySelector('video').currentTime >= s, seconds, { timeout: 90000 }); };

    // The altered-showing notice comes at the start of the title, not on the first word
    await at(1.5);
    await page.screenshot({ path: path.join(OUT, 'player-notice.png') });
    await at(33.5);
    await shot('protected-light', `${popup}?tab=${tabId}`);
    // Four moments muted by now: two rows show, the rest are counted
    await at(55.6);
    await shot('protected-dark', `${popup}?tab=${tabId}`, { scheme: 'dark' });
    await shot('protected-levels-open', `${popup}?tab=${tabId}`, { open: ['.gs-section button[aria-controls="gs-levels"]'] });

    // Every group Off and no words of your own: never "Protected"
    const saved = await sw.evaluate(() => chrome.storage.local.get('config').then((r) => r.config ?? null));
    await sw.evaluate(() => chrome.storage.local.set({ config: { categories: { blasphemy: { threshold: 0, action: 'mute' }, language: { threshold: 0, action: 'mute' } }, customWords: { block: [], allow: [] } } }));
    await shot('nothing-selected-light', `${popup}?tab=${tabId}`);
    await sw.evaluate((c) => (c ? chrome.storage.local.set({ config: c }) : chrome.storage.local.remove('config')), saved);

    // Popup states with the master switch off
    await sw.evaluate(() => chrome.storage.local.set({ 'gs:enabled': false }));
    await shot('off-light', `${popup}?tab=${tabId}`);
    await sw.evaluate(() => chrome.storage.local.set({ 'gs:enabled': true }));
  } finally {
    fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(results, null, 1));
    await ctx.close();
    srv.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
