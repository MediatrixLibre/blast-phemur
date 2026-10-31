/**
 * Background-tab run in real Brave: plays a densely profane stretch of one
 * Deadwood episode through the fake tv.youtube.com page, then switches to
 * another tab so the player tab is HIDDEN (timers throttled, no animation
 * frames), and checks the filter still mutes the right lines.
 *
 *   node e2e/background-e2e.cjs [s01e01] [visible] [player]
 *
 * "visible" never switches tabs: the control run.
 * "player" imports no subtitles and instead gives the fake page a YouTube-style
 * player that offers its caption track; the filter must find it by itself.
 * Like the real site, the fake page stops drawing captions while hidden.
 *
 * Talks to Brave over raw CDP on purpose. Playwright forces every page it
 * attaches to report "focused and visible", which makes a hidden-tab test
 * meaningless (document.hidden stays false).
 */
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), { spawn } = require('child_process');

const DIST = path.resolve(__dirname, '../dist');
const CLIP = require('./clip.cjs')({ realOnly: true });
const SUBS = path.join(os.homedir(), 'subtitles', 'deadwood');
const EPISODE = (process.argv[2] || 's01e01').toLowerCase();
const VISIBLE = process.argv.includes('visible');
// "player": no subtitle library at all. Only the player's own caption track can help, as on a title you never imported.
const PLAYER = process.argv.includes('player');
// "keys": visible run that presses the correction keys right after a strong line, then checks the indicator and the saved lists.
const KEYS = process.argv.includes('keys');
const PORT = 9333;
const OFFSET = 37;           // video time = subtitle time + 37
const LEAD_IN = 30;
const HIDE_AFTER_S = PLAYER ? 8 : 16;     // library mode: long enough for the anchor to lock; player mode: barely started
const STRONG = /fuck|shit|cocksuck|cunt|goddamn|god damn|motherfuck/i;
// A sacred name mutes its whole line by design (compile.ts sacredWholeLine), so a long mute inside such a line is expected
const SACRED = /\bgod|jesus|christ/i;
const ANY = /fuck|shit|cock|cunt|damn|bastard|bitch|piss|\bass|dick|pussy|twat|christ|jesus|\bgod\b|hell/i;
const soften = (s) => String(s).replace(/\b(f)uck\w*|\b(s)hit\w*|(c)ocksuck\w*|(c)unt\w*|(g)od\s?damn\w*|(m)otherfuck\w*/gi, (m) => m[0] + '*'.repeat(m.length - 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Minimal raw CDP connection */
function conn(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); let id = 0; const pend = new Map(); const handlers = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
      else if (d.method && handlers.has(d.method)) handlers.get(d.method).forEach((f) => f(d.params));
    };
    ws.onopen = () => res({
      send: (method, params = {}) => new Promise((r, rejectSend) => {
        const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
        setTimeout(() => { if (pend.has(i)) { pend.delete(i); rejectSend(new Error(`CDP ${method} timed out after 40s`)); } }, 40000);
      }),
      on: (method, f) => { if (!handlers.has(method)) handlers.set(method, []); handlers.get(method).push(f); },
      close: () => ws.close(),
    });
    ws.onerror = rej;
  });
}
const json = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();

(async () => {
  const files = fs.readdirSync(SUBS).filter((f) => f.endsWith('.srt')).sort();
  const tracks = files.map((f) => {
    const m = f.match(/s(\d+)e(\d+)/i); const code = `s${m[1].padStart(2, '0')}e${m[2].padStart(2, '0')}`;
    return { key: `deadwood-${code}`, code, title: `Deadwood ${code.toUpperCase()}`, cues: parseSrt(fs.readFileSync(path.join(SUBS, f), 'utf8')) };
  });
  const ep = tracks.find((t) => t.code === EPISODE);
  if (!ep) throw new Error(`no subtitle file for ${EPISODE}`);
  const strong = ep.cues.filter((c) => STRONG.test(c[2]));
  let best = { n: 0, start: 0 };
  for (const c of strong) { const n = strong.filter((x) => x[0] >= c[0] && x[0] < c[0] + 55).length; if (n > best.n) best = { n, start: c[0] }; }
  const winStart = Math.max(0, best.start - LEAD_IN), winEnd = best.start + 60;
  const window = ep.cues.filter((c) => c[1] > winStart && c[0] < winEnd);
  const videoStart = winStart + OFFSET;
  const runSeconds = Math.ceil(winEnd - winStart) + 2;
  console.log(`${ep.title}: ${VISIBLE ? 'VISIBLE control' : 'tab hidden after ' + HIDE_AFTER_S + 's'}; ${best.n} strong cues in the stretch`);

  const srv = await serveClip(); const clipPort = srv.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-bg-'));
  const brave = spawn('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', [
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, `--load-extension=${DIST}`, `--disable-extensions-except=${DIST}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch,MediaRouter,DialMediaRouteProvider,LocalNetworkAccessChecks', '--mute-audio', '--disable-background-networking', '--remote-debugging-address=127.0.0.1', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  let fails = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${soften(n)} ${soften(x)}`); if (!ok) fails++; };
  const conns = [];
  try {
    // The port must be free: a leftover browser would be attached to by mistake
    if (await json('/json/version').then(() => true, () => false)) throw new Error(`port ${PORT} already answers; a previous Brave is still running`);
    brave.on('exit', (code) => console.log('  [brave exited]', code));
    let ver; for (let i = 0; i < 60 && !ver; i++) { try { ver = await json('/json/version'); } catch { await sleep(500); } }
    if (!ver) throw new Error('Brave did not start');
    const bro = await conn(ver.webSocketDebuggerUrl); conns.push(bro); console.log('  [brave up]');
    // Say what happens to tabs: a page that vanishes mid-run must not look like a filter failure
    const t0 = Date.now(); const at = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
    bro.on('Target.targetDestroyed', (e) => console.log(`  [target destroyed @${at()}]`, e.targetId.slice(0, 6)));
    bro.on('Target.targetCrashed', (e) => console.log(`  [target CRASHED @${at()}]`, e.targetId.slice(0, 6), e.status, e.errorCode));
    bro.on('Target.targetInfoChanged', (e) => { if (e.targetInfo.type === 'page') console.log(`  [target info @${at()}]`, e.targetInfo.targetId.slice(0, 6), e.targetInfo.url.slice(0, 30), 'attached=' + e.targetInfo.attached); });
    await bro.send('Target.setDiscoverTargets', { discover: true });

    // Give the extension its subtitle library (the format the popup writes)
    let swInfo; for (let i = 0; i < 40 && !swInfo; i++) { swInfo = (await json('/json/list')).find((t) => t.type === 'service_worker' && /^chrome-extension:\/\/[a-z]+\/background\.js$/.test(t.url)); if (!swInfo) await sleep(500); }
    if (!swInfo) throw new Error('extension service worker not found');
    const sw = await conn(swInfo.webSocketDebuggerUrl); conns.push(sw); console.log('  [service worker found]');
    await sw.send('Runtime.enable'); await sw.send('Runtime.runIfWaitingForDebugger');
    const items = PLAYER ? { 'gs:subs:index': [] } : { 'gs:subs:index': tracks.map((t) => ({ key: t.key, title: t.title, cueCount: t.cues.length, addedAt: 1 })) };
    if (!PLAYER) for (const t of tracks) items[`gs:subs:${t.key}`] = t.cues;
    await sw.send('Runtime.evaluate', { expression: `new Promise((r) => chrome.storage.local.set(${JSON.stringify(items)}, r))`, awaitPromise: true });

    await sw.send('Runtime.evaluate', { expression: `globalThis.__titles = []; const o = chrome.action.setTitle.bind(chrome.action); chrome.action.setTitle = (d) => { globalThis.__titles.push(d.title); return o(d); }; 1` });
    console.log('  [library stored]');
    // The fake player page
    const { result: { targetId } } = await bro.send('Target.createTarget', { url: 'about:blank' });
    let pInfo; for (let i = 0; i < 20 && !pInfo; i++) { pInfo = (await json('/json/list')).find((t) => t.id === targetId); await sleep(200); }
    const page = await conn(pInfo.webSocketDebuggerUrl); conns.push(page);
    const logs = []; page.on('Runtime.consoleAPICalled', (e) => { const t = (e.args || []).map((a) => a.value ?? '').join(' '); if (t.includes('GuardianStream')) logs.push(t); });
    await page.send('Runtime.enable');
    await page.send('Inspector.enable');
    page.on('Inspector.targetCrashed', () => console.log('  [!] PAGE CRASHED'));
    page.on('Inspector.detached', (e) => console.log('  [!] inspector detached:', e.reason));
    page.on('Page.frameNavigated', (e) => { if (!e.frame.parentId) console.log('  [nav]', e.frame.url.slice(0, 60)); });
    page.on('Runtime.exceptionThrown', (e) => console.log('  [exception]', (e.exceptionDetails.exception?.description || e.exceptionDetails.text || '').slice(0, 160)));
    await page.send('Page.enable');
    const html = `<!doctype html><title>Deadwood - YouTube TV</title><body style="background:#000;margin:0">
<div id="movie_player" class="html5-video-player" style="position:relative;width:960px;height:540px"><video class="html5-main-video" src="http://127.0.0.1:${clipPort}/clip.mp4" width="960" height="540" playsinline></video>
<div id="c" style="position:absolute;bottom:30px;width:100%;text-align:center;color:#fff"></div></div>
<script>
const CUES=${JSON.stringify(window)}, OFF=${OFFSET}, v=document.querySelector('video'), box=document.getElementById('c'); let shown=null;
setInterval(()=>{ if(document.hidden) return; /* YouTube TV draws no captions in a background tab */ const st=v.currentTime-OFF; const c=CUES.find(c=>st>=c[0]&&st<c[1]); const t=c?c[2]:null;
 if(t!==shown){shown=t; box.textContent=''; if(t){const s=document.createElement('span'); s.className='ytp-caption-segment'; s.textContent=t; box.appendChild(s);}}},50);
${PLAYER ? `const MP=document.getElementById('movie_player');
MP.getPlayerResponse=()=>({videoDetails:{videoId:'EP1'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:'/api/timedtext?v=EP1&lang=en',languageCode:'en',vssId:'.en',name:{simpleText:'English'}}]}}});
MP.getVideoData=()=>({video_id:'EP1'});
MP.getOption=()=>({languageCode:'en',vss_id:'.en'});` : ''}
window.__vis=[{hidden:document.hidden,t:0}]; document.addEventListener('visibilitychange',()=>window.__vis.push({hidden:document.hidden,t:+v.currentTime.toFixed(2)}));
// Events, not timers: a hidden tab throttles timers but not media events
window.__vc=[]; v.addEventListener('volumechange',()=>window.__vc.push({t:+v.currentTime.toFixed(3),w:Math.round(performance.now()),vol:+v.volume.toFixed(3),m:v.muted,s:v.muted||v.volume<0.1}));
</script>`;
    await page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://tv.youtube.com/*' }] });
    // The whole episode's captions, on the video's clock, in YouTube's own json3 shape
    const json3 = JSON.stringify({ events: ep.cues.map((c) => ({ tStartMs: Math.round((c[0] + OFFSET) * 1000), dDurationMs: Math.round((c[1] - c[0]) * 1000), segs: [{ utf8: c[2] }] })) });
    page.on('Fetch.requestPaused', (e) => {
      const isTrack = /\/api\/timedtext/.test(e.request.url);
      page.send('Fetch.fulfillRequest', { requestId: e.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: isTrack ? 'application/json' : 'text/html' }], body: Buffer.from(isTrack ? json3 : html).toString('base64') });
    });
    await page.send('Page.navigate', { url: 'https://tv.youtube.com/watch/EP1' }); console.log('  [navigated]');
    const ev = async (expression, awaitPromise = false) => { const r = await page.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
    for (let i = 0; i < 60 && !(await ev("!!document.querySelector('video')").catch(() => false)); i++) await sleep(250);
    for (let i = 0; i < 80 && !(await ev("document.querySelector('video').readyState >= 1").catch(() => false)); i++) await sleep(250);   // metadata first, or the seek never reports back
    // Poll the video's real state instead of waiting on a 'seeked' event that does not always report back
    const vstate = () => ev(`JSON.stringify((() => { const v = document.querySelector('video'); return { rs: v.readyState, seeking: v.seeking, t: +v.currentTime.toFixed(1), err: v.error && v.error.code, ns: v.networkState }; })())`).then(JSON.parse);
    let st = null;
    for (let i = 0; i < 80; i++) {
      if (i % 20 === 0) await ev(`(() => { const v = document.querySelector('video'); v.volume = 1; v.muted = false; v.currentTime = ${videoStart}; })()`);   // set, and set again if it did not take
      st = await vstate();
      if (!st.seeking && st.rs >= 3 && Math.abs(st.t - videoStart) < 2) break;
      await sleep(250);
    }
    console.log('  [video ready]', JSON.stringify(st));
    if (!(st.rs >= 3 && Math.abs(st.t - videoStart) < 2)) throw new Error('video never reached the start point: ' + JSON.stringify(st));
    await ev(`document.querySelector('video').play().then(() => 'ok', (e) => 'ERR ' + e.message)`, true);

    console.log('  [playing]');
    let hiddenState = null;
    const beat = async (label) => {
      const r = await Promise.race([ev('JSON.stringify([document.hidden, +document.querySelector("video").currentTime.toFixed(1), window.__vc.length, document.querySelector("video").paused])').catch((e) => 'ERR ' + e.message.slice(0, 60)), sleep(6000).then(() => 'NO ANSWER in 6s')]);
      console.log(`  [beat ${label}] ${r}`);
      if (/NO ANSWER/.test(r)) { const ts = (await bro.send('Target.getTargets')).result.targetInfos.map((t) => `${t.type}:${t.targetId.slice(0, 6)} ${t.url.slice(0, 30)} attached=${t.attached}`); console.log('  [targets]', JSON.stringify(ts)); }
    };
    if (KEYS) {
      // Wait until just after a strong line has been spoken (and so muted), then press "[" like a viewer would
      const cue = window.find((c) => STRONG.test(c[2]) && c[0] > window[0][0] + 12);
      const target = cue[1] + OFFSET + 1.0;
      for (let i = 0; i < 400 && (await ev('document.querySelector("video").currentTime')) < target; i++) await sleep(250);
      await page.send('Page.bringToFront');
      const press = async (key, code, vk) => { for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, text: type === 'keyDown' ? key : undefined, windowsVirtualKeyCode: vk }); };
      const toast = () => ev(`(() => { const t = document.querySelector('.gs-toast'); return t ? JSON.stringify({ text: t.textContent, op: getComputedStyle(t).opacity }) : null; })()`);
      const stored = async () => JSON.parse(await sw.send('Runtime.evaluate', { expression: `chrome.storage.local.get('config').then((r) => JSON.stringify((r.config && r.config.customWords) || null))`, awaitPromise: true, returnByValue: true }).then((r) => r.result.result.value));
      await press('[', 'BracketLeft', 219);
      await sleep(700);
      const t1 = await toast(); console.log('  [toast]', soften(t1 || 'none'));
      check('"[" shows an indicator', !!t1 && /won.t hide/i.test(t1), t1 || '');
      check('the indicator never spells the word out', !!t1 && !/fuck|shit|cunt|cock|damn/i.test(JSON.parse(t1).text));
      const w1 = await stored(); console.log('  [lists after "["]', soften(JSON.stringify(w1)));
      check('the word went on the never-hide list', !!w1 && w1.allow.length === 1 && w1.block.length === 0, soften(JSON.stringify(w1)));
      await sleep(4200);
      const gone = await toast();
      check('the indicator faded away by itself', gone === null, gone || '');
      await press('\\', 'Backslash', 220);
      await sleep(900);
      const t2 = await toast(); const w2 = await stored();
      check('"\\" undoes it', !!t2 && /undone/i.test(t2) && !!w2 && w2.allow.length === 0, `${t2 || 'none'} ${JSON.stringify(w2)}`);
      console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exitCode = fails ? 1 : 0;
      return;
    }
    if (VISIBLE) { for (let k = 0; k < Math.floor(runSeconds / 10); k++) { await sleep(10000); await beat(`${(k + 1) * 10}s`); } await sleep((runSeconds % 10) * 1000); }
    else {
      const tPlay = Date.now();
      for (let k = 0; k < Math.floor(HIDE_AFTER_S / 8); k++) { await sleep(8000); await beat(`${(k + 1) * 8}s visible`); }
      await bro.send('Target.createTarget', { url: 'about:blank' });     // opens and activates another tab
      await sleep(1500);
      hiddenState = await ev('JSON.stringify({hidden: document.hidden, vis: document.visibilityState})');
      console.log('  [tab state]', hiddenState);
      while (Date.now() - tPlay < runSeconds * 1000) { await sleep(8000); await beat(`${Math.round((Date.now() - tPlay) / 1000)}s hidden`); }
    }
    await sleep(2500);   // let the last fade settle
    console.log('  [reading results]');

    const titles = JSON.parse((await sw.send('Runtime.evaluate', { expression: 'JSON.stringify([...new Set(globalThis.__titles)])', returnByValue: true })).result.result.value);
    check('toolbar tooltip followed the state (protecting, muting a word)', titles.some((t) => /protecting this video/.test(t)) && titles.some((t) => /muting a word/.test(t)), JSON.stringify(titles));
    const end = JSON.parse(await ev('JSON.stringify({volume: document.querySelector("video").volume, muted: document.querySelector("video").muted})'));
    console.log('  [end state read]');
    const vc = JSON.parse(await ev('JSON.stringify(window.__vc)')).filter((e) => e.t >= videoStart - 0.1);
    const iv = []; let cur = null;
    for (const e of vc) { if (e.s && !cur) cur = { from: e.t, to: e.t }; else if (cur && e.s) cur.to = e.t; else if (cur) { cur.to = e.t; iv.push(cur); cur = null; } }
    if (cur) iv.push(cur);

    if (!VISIBLE) check('the tab really was in the background', /"hidden":true/.test(hiddenState || ''), hiddenState || '');
    // Hidden spans on the video's clock, from the page's own visibilitychange events
    const vis = JSON.parse(await ev('JSON.stringify(window.__vis)'));
    const hiddenSpans = []; let hs = null;
    for (const e of vis) { if (e.hidden && hs === null) hs = e.t; else if (!e.hidden && hs !== null) { hiddenSpans.push([hs, e.t]); hs = null; } }
    if (hs !== null) hiddenSpans.push([hs, Infinity]);
    console.log('  [hidden spans, video clock]', JSON.stringify(hiddenSpans.map(([a, b]) => [+a.toFixed(1), b === Infinity ? 'end' : +b.toFixed(1)])));
    const wasHidden = (t) => hiddenSpans.some(([a, b]) => t >= a && t < b);
    const status = logs.find((l) => /Anchored to/.test(l));
    check(PLAYER ? `locked on the player's own captions` : `anchored before the tab was hidden`, !!status && (!PLAYER || /captions from the player/.test(status)), status ? `(${status.replace('[GuardianStream] ', '')})` : '(never anchored)');

    // After lock: each strong cue must be covered by silence, and the silence must be short
    const lockedAt = (window[0] ? window[0][0] : 0) + OFFSET + (PLAYER ? 4 : 14);
    const later = window.filter((c) => STRONG.test(c[2]) && c[0] + OFFSET > lockedAt);
    let covered = 0; let coveredHidden = 0, hiddenLines = 0;
    for (const c of later) {
      const a = c[0] + OFFSET, b = c[1] + OFFSET;
      const overlap = iv.reduce((s, i) => s + Math.max(0, Math.min(i.to, b) - Math.max(i.from, a)), 0);
      const hid = wasHidden(a) && wasHidden(b); if (hid) hiddenLines++;
      if (overlap >= 0.4) { covered++; if (hid) coveredHidden++; } else console.log(`  missed: "${soften(c[2].slice(0, 70))}" (${a.toFixed(1)}-${b.toFixed(1)}), silent ${overlap.toFixed(2)}s of it`);
    }
    check(`strong lines silenced: ${covered}/${later.length}`, later.length > 0 && covered === later.length);
    if (!VISIBLE) check(`of those, spoken while the tab was hidden: ${coveredHidden}/${hiddenLines}`, hiddenLines >= 5 && coveredHidden === hiddenLines);
    const sacredLine = (i) => window.some((c) => SACRED.test(c[2]) && i.from >= c[0] + OFFSET - 1 && i.to <= c[1] + OFFSET + 1);
    const long = iv.filter((i) => i.from > lockedAt && i.to - i.from > 2.5 && !sacredLine(i));
    check('no mute drags on after the word', long.length === 0, JSON.stringify(long));
    const total = iv.reduce((a, i) => a + (i.to - i.from), 0);
    console.log(`  ${iv.length} mutes, ${total.toFixed(1)}s silent of ${runSeconds}s`);
    const stray = iv.filter((i) => !window.some((c) => ANY.test(c[2]) && i.to >= c[0] + OFFSET - 0.6 && i.from <= c[1] + OFFSET + 3.2));
    check('no mutes away from profane lines', stray.length === 0, JSON.stringify(stray));
    check('volume and mute restored afterwards', end.volume === 1 && end.muted === false, JSON.stringify(end));
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exitCode = fails ? 1 : 0;
  } finally {
    for (const c of conns) try { c.close(); } catch {}
    // Wait for the browser to be really gone: a dying instance still answering on the port
    // is what the next run would otherwise attach to.
    const gone = new Promise((r) => brave.once('exit', r));
    brave.kill();
    await Promise.race([gone, sleep(5000).then(() => brave.kill('SIGKILL'))]);
    await Promise.race([gone, sleep(3000)]);
    srv.close();
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch {}   // never let cleanup hide the real error
  }
})().catch((e) => { console.error(e); process.exit(1); });
