/**
 * Real-episode run in Brave: imports every ~/subtitles/deadwood/*.srt into the
 * extension, then plays a densely profane stretch of ONE episode through the
 * fake tv.youtube.com page, using that episode's real captions.
 *
 *   node e2e/episode-e2e.cjs [s01e01]
 *
 * Proves: identification among many episodes, offset lock, muting ahead of
 * real dialogue, caption masking on real text. Does NOT prove alignment to
 * the actual audio (the video is a stand-in clip) or YouTube TV's real DOM.
 */
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright-core');

const DIST = path.resolve(__dirname, '../dist');
const CLIP = require('./clip.cjs')();
const SUBS = path.join(os.homedir(), 'subtitles', 'deadwood');
const EPISODE = (process.argv[2] || 's01e01').toLowerCase();
const OFFSET = 37;          // video time = subtitle time + 37 (ads / cold open)
const LEAD_IN = 30;         // start playing this many seconds before the first profane cue
const STRONG = /fuck|shit|cocksuck|cunt|goddamn|god damn|motherfuck/i;
// A sacred name mutes its whole line by design (compile.ts sacredWholeLine), so a long mute inside such a line is expected
const SACRED = /\bgod|jesus|christ/i;
const ANY = /fuck|shit|cock|cunt|damn|bastard|bitch|piss|\bass|dick|pussy|twat|christ|jesus|\bgod\b|hell/i;

function parseSrt(text) {
  const out = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n'); const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const t = (s) => { const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
    const [a, b] = lines[i].split('-->');
    const raw = lines.slice(i + 1).join(' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (raw) out.push([t(a), t(b), raw]);
  }
  return out;
}

function serveClip() {
  return new Promise((resolve) => {
    const size = fs.statSync(CLIP).size;
    const srv = http.createServer((rq, rs) => {
      const h = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' };
      const r = rq.headers.range;
      if (r) { const [a, b] = r.replace('bytes=', '').split('-'); const s = +a, e = b ? +b : size - 1;
        rs.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Content-Length': e - s + 1 }); fs.createReadStream(CLIP, { start: s, end: e }).pipe(rs);
      } else { rs.writeHead(200, { ...h, 'Content-Length': size }); fs.createReadStream(CLIP).pipe(rs); }
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const soften = (s) => String(s).replace(/\b(f)uck\w*|\b(s)hit\w*|(c)ocksuck\w*|(c)unt\w*|(g)od\s?damn\w*|(m)otherfuck\w*/gi, (m) => m[0] + '*'.repeat(m.length - 1));
(async () => {
  const files = fs.readdirSync(SUBS).filter((f) => f.endsWith('.srt')).sort();
  const tracks = files.map((f) => {
    const m = f.match(/s(\d+)e(\d+)/i); const code = `s${m[1].padStart(2, '0')}e${m[2].padStart(2, '0')}`;
    return { key: `deadwood-${code}`, code, title: `Deadwood ${code.toUpperCase()}`, cues: parseSrt(fs.readFileSync(path.join(SUBS, f), 'utf8')) };
  });
  const ep = tracks.find((t) => t.code === EPISODE);
  if (!ep) throw new Error(`no subtitle file for ${EPISODE}`);

  // Pick the 70s stretch of this episode with the most strong profanity
  const strong = ep.cues.filter((c) => STRONG.test(c[2]));
  let best = { n: 0, start: 0 };
  for (const c of strong) { const n = strong.filter((x) => x[0] >= c[0] && x[0] < c[0] + 55).length; if (n > best.n) best = { n, start: c[0] }; }
  const winStart = Math.max(0, best.start - LEAD_IN), winEnd = best.start + 60;
  const window = ep.cues.filter((c) => c[1] > winStart && c[0] < winEnd);
  const videoStart = winStart + OFFSET;
  const runSeconds = Math.ceil(winEnd - winStart) + 2;
  console.log(`${ep.title}: ${ep.cues.length} cues; playing subtitle time ${winStart.toFixed(0)}-${winEnd.toFixed(0)}s (${best.n} strong cues), video starts at ${videoStart.toFixed(0)}s, ${files.length} episodes loaded`);

  const srv = await serveClip(); const port = srv.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-ep-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: false,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--disable-features=DisableLoadExtensionCommandLineSwitch,MediaRouter,DialMediaRouteProvider,LocalNetworkAccessChecks', '--mute-audio', '--disable-background-networking', '--autoplay-policy=no-user-gesture-required', '--no-first-run'],
  });
  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    // Import through the extension's own storage format (what the popup writes)
    const items = { 'gs:subs:index': tracks.map((t) => ({ key: t.key, title: t.title, cueCount: t.cues.length, addedAt: 1 })) };
    for (const t of tracks) items[`gs:subs:${t.key}`] = t.cues;
    await sw.evaluate((it) => new Promise((r) => chrome.storage.local.set(it, r)), items);

    const page = await ctx.newPage();
    const logs = []; page.on('console', (m) => { if (m.text().includes('GuardianStream')) logs.push(m.text()); });
    const html = `<!doctype html><title>Deadwood - YouTube TV</title><body style="background:#000;margin:0">
<div id="p" style="position:relative;width:960px;height:540px"><video class="html5-main-video" src="http://127.0.0.1:${port}/clip.mp4" width="960" height="540" playsinline></video>
<div id="c" style="position:absolute;bottom:30px;width:100%;text-align:center;color:#fff"></div></div>
<script>
const CUES=${JSON.stringify(window)}, OFF=${OFFSET}, v=document.querySelector('video'), box=document.getElementById('c'); window.__log=[]; let shown=null;
setInterval(()=>{const st=v.currentTime-OFF; const c=CUES.find(c=>st>=c[0]&&st<c[1]); const t=c?c[2]:null;
 if(t!==shown){shown=t; box.innerHTML=''; if(t){const s=document.createElement('span'); s.className='ytp-caption-segment'; s.textContent=t; box.appendChild(s);}}},50);
setInterval(()=>{const s=document.querySelector('.ytp-caption-segment'); window.__log.push({t:+v.currentTime.toFixed(3),muted:v.muted||v.volume<0.1,cap:s?s.textContent:''});},40);
window.__vc=[]; v.addEventListener('volumechange',()=>window.__vc.push({t:+v.currentTime.toFixed(3),s:v.muted||v.volume<0.1}));
</script>`;
    await page.route(/tv\.youtube\.com\/watch\/EP1/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await page.goto('https://tv.youtube.com/watch/EP1');
    await page.evaluate((start) => new Promise((res) => { const v = document.querySelector('video'); v.currentTime = start; v.volume = 1; v.muted = false; v.onseeked = () => { v.play(); res(); }; if (v.readyState >= 1 && Math.abs(v.currentTime - start) < 0.01) { v.play(); res(); } }), videoStart);
    await page.waitForTimeout(runSeconds * 1000);

    // Let the last fade settle, then confirm the audio is back exactly as the viewer left it
    await page.waitForTimeout(1500);
    const end = await page.evaluate(() => { const v = document.querySelector('video'); return { volume: v.volume, muted: v.muted }; });
    const log = (await page.evaluate(() => window.__log)).filter((s) => s.t >= videoStart - 0.1);
    const vc = (await page.evaluate(() => window.__vc)).filter((e) => e.t >= videoStart - 0.1);
    const iv = []; let cur = null;
    for (const e of vc) { if (e.s && !cur) cur = { from: e.t, to: e.t }; else if (cur && e.s) cur.to = e.t; else if (cur) { cur.to = e.t; iv.push(cur); cur = null; } }
    if (cur) iv.push(cur);

    const status = logs.find((l) => /Anchored to/.test(l));
    let fails = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${soften(n)} ${soften(x)}`); if (!ok) fails++; };
    console.log('\n' + logs.slice(0, 8).map((l) => '  ' + l).join('\n') + '\n');
    check(`identified ${ep.title} among ${tracks.length} episodes`, new RegExp(`Anchored to ${ep.title}`, 'i').test(status || ''), status ? `(${status.replace('[GuardianStream] ', '')})` : '(never anchored)');
    const off = status && +(status.match(/offset (-?[\d.]+)s/) || [])[1];
    check(`offset within 0.6s of the true ${OFFSET}s`, Math.abs(off - OFFSET) < 0.6, `(got ${off})`);

    // After lock: every strong cue must be covered by a mute, and the mute must be short
    const lockedAt = (() => { const first = window.find(() => true); return first ? first[0] + OFFSET + 14 : 0; })();
    const later = window.filter((c) => STRONG.test(c[2]) && c[0] + OFFSET > lockedAt);
    let covered = 0;
    for (const c of later) { const hit = iv.find((i) => i.to >= c[0] + OFFSET && i.from <= c[1] + OFFSET); if (hit) covered++; else console.log(`  missed: "${soften(c[2].slice(0, 70))}" (${(c[0] + OFFSET).toFixed(1)}-${(c[1] + OFFSET).toFixed(1)})`); }
    check(`strong profanity muted after lock: ${covered}/${later.length}`, later.length > 0 && covered === later.length);
    const sacredLine = (i) => window.some((c) => SACRED.test(c[2]) && i.from >= c[0] + OFFSET - 1 && i.to <= c[1] + OFFSET + 1);
    const long = iv.filter((i) => i.to - i.from > 2.5 && !sacredLine(i));
    check('no long caption-style mutes after lock', long.filter((i) => i.from > lockedAt).length === 0, JSON.stringify(long.filter((i) => i.from > lockedAt)));
    const total = iv.reduce((a, i) => a + (i.to - i.from), 0);
    console.log(`  ${iv.length} mutes, ${total.toFixed(1)}s muted of ${(log.length ? log[log.length - 1].t - log[0].t : 0).toFixed(0)}s played`);
    const stray = iv.filter((i) => !window.some((c) => ANY.test(c[2]) && i.to >= c[0] + OFFSET - 0.6 && i.from <= c[1] + OFFSET + 3.2));
    check('no mutes away from profane lines', stray.length === 0, JSON.stringify(stray));
    const leaked = log.filter((s) => STRONG.test(s.cap));
    check('strong words never visible on screen', leaked.length === 0, `(${leaked.length} frames; first: "${(leaked[0] || {}).cap || ''}")`);
    check('volume and mute restored after dense filtering', end.volume === 1 && end.muted === false, JSON.stringify(end));
    // The pasteable debug report: has the timeline, and nothing unmasked
    const report = await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://tv.youtube.com/*' });
      return chrome.tabs.sendMessage(tab.id, { type: 'GET_DEBUG' });
    });
    const kinds = new Set((report.events || []).map((e) => e.kind));
    check('debug report has the timeline', ['video', 'caption', 'anchored', 'mute', 'unmute'].every((k) => kinds.has(k)), JSON.stringify([...kinds]));
    check('debug report has no unmasked strong words', !STRONG.test(JSON.stringify(report)), '');
    check('debug report reports the page and settings', report.provider === 'youtube' && report.captionSelector === '.ytp-caption-segment' && !!report.settings.language);
    console.log('  report sample:', soften(JSON.stringify({ status: report.status, videos: report.videos, main: report.main })).slice(0, 260));
    check('masked words shown', log.some((s) => /\b[a-z]\*{2,}/i.test(s.cap)));
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exitCode = fails ? 1 : 0;
  } finally { await ctx.close(); srv.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
