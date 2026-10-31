// Screenshot the popup in real Brave. Usage: node e2e/popup-shot.cjs /tmp/out.png [dark] [fold title to open]
// For the popup in its real states (pinned to a fake YouTube TV tab), use e2e/popup-states.cjs.
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright-core');
const DIST = path.resolve(__dirname, '../dist');
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-popup-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: false,
    viewport: { width: 380, height: 900 },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--disable-features=DisableLoadExtensionCommandLineSwitch,MediaRouter,DialMediaRouteProvider,LocalNetworkAccessChecks', '--mute-audio', '--disable-background-networking', '--no-first-run'],
  });
  try {
    let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const id = new URL(sw.url()).host;
    const page = await ctx.newPage()
    if (process.argv[3] === 'dark') await page.emulateMedia({ colorScheme: 'dark' });;
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.waitForSelector('.gs-hero');
    if (process.argv[4]) { await page.click(`.gs-fold > summary:has-text("${process.argv[4]}")`); }
    await page.waitForTimeout(400);
    await page.screenshot({ path: process.argv[2] || '/tmp/gs-popup.png', fullPage: true });
    console.log('ok', await page.locator('.gs-group').count(), 'word groups');
  } finally { await ctx.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
