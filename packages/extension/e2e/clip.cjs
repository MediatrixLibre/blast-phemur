/**
 * The video the fake streaming pages play. The Sintel clip (gitignored, 191 MB) is
 * used when it is there; otherwise a plain clip of the same length is made once
 * with ffmpeg, so the e2e runs from a clean clone. The checks read video time,
 * volume and muted, never the picture or the sound. brave-e2e and episode-e2e pass
 * on either clip. background-e2e does not: in a hidden tab the plain clip pauses or
 * the page is lost (2 of 2 runs, 2026-10-31) while Sintel passed 2 of 2 on the same
 * build and machine, cause not found. It asks for the real clip ({ realOnly: true }).
 * No usable clip: exit 2 (could not check), never a silent pass.
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const SINTEL = path.resolve(__dirname, '../../ai-pipeline/test-data/sintel-clip.mp4');
const PLAIN = path.resolve(__dirname, '.cache/plain-clip.mp4');
const SECONDS = 888; // as long as the Sintel clip: the episode stretches seek up to ~870 s
// Wider than 400 px: only players at least that wide get a filter session
const ARGS = [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', `color=c=0x16555f:s=640x272:r=10:d=${SECONDS}`,
  '-f', 'lavfi', '-i', `sine=frequency=220:sample_rate=22050:duration=${SECONDS}`,
  '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '40', '-g', '50',
  '-c:a', 'aac', '-b:a', '24k', '-movflags', '+faststart', '-shortest',
];

module.exports = function clipPath({ realOnly = false } = {}) {
  if (fs.existsSync(SINTEL)) return SINTEL;
  if (realOnly) {
    console.error(`e2e: this check needs the Sintel clip at ${SINTEL}; the plain clip does not hold up in a hidden tab. Could not check.`);
    process.exit(2);
  }
  if (fs.existsSync(PLAIN)) return PLAIN;
  fs.mkdirSync(path.dirname(PLAIN), { recursive: true });
  const tmp = `${PLAIN}.part.mp4`;
  try {
    execFileSync('ffmpeg', [...ARGS, tmp], { stdio: 'inherit' });
    fs.renameSync(tmp, PLAIN);
  } catch (e) {
    console.error(`e2e: no Sintel clip at ${SINTEL}, and ffmpeg could not make a plain one (${e.message}). Could not check.`);
    process.exit(2);
  }
  console.log(`  [made plain clip ${path.relative(process.cwd(), PLAIN)}]`);
  return PLAIN;
};
