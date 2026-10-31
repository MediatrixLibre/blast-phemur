/**
 * A small indicator over the video that fades by itself. Used for quick
 * confirmations ("Won't hide h*ll again") and, with chips, for a one-key
 * choice between a few words.
 */

export interface ToastChip {
  label: string;
  onPick: () => void;
}

export interface ToastOptions {
  text: string;
  /** Small second line, e.g. the key that undoes it */
  hint?: string;
  chips?: ToastChip[];
  /** How long it stays before fading (ms) */
  holdMs?: number;
}

export interface ToastHandle {
  /** Choose chip number `i` (0-based). False if there is no such chip. */
  pick(i: number): boolean;
  dismiss(): void;
  readonly hasChips: boolean;
}

const FADE_MS = 350;
let current: ToastHandle | null = null;

function mountPoint(video: HTMLVideoElement): HTMLElement {
  // Inside the fullscreen element when there is one, or it would be hidden
  return (
    (document.fullscreenElement as HTMLElement | null) ??
    video.closest<HTMLElement>('.html5-video-player') ??
    video.parentElement ??
    document.body
  );
}

export function showToast(video: HTMLVideoElement, opts: ToastOptions): ToastHandle {
  current?.dismiss();

  const host = mountPoint(video);
  if (!host.style.position && getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const el = document.createElement('div');
  el.className = 'gs-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  Object.assign(el.style, {
    position: 'absolute',
    left: '20px',
    bottom: '84px',
    maxWidth: '70%',
    padding: '10px 14px 10px 12px',
    borderRadius: '10px',
    // The brand's night, deep enough for oat text over any picture (13.1:1 at worst, over white)
    background: 'rgba(30, 23, 18, 0.94)',
    color: '#f6eedf',
    font: '500 13.5px/1.4 system-ui, -apple-system, sans-serif',
    opacity: '0',
    transition: `opacity ${FADE_MS}ms ease`,
    zIndex: '2147483000',
    pointerEvents: opts.chips?.length ? 'auto' : 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  const line = document.createElement('div');
  line.textContent = opts.text;
  el.appendChild(line);

  if (opts.hint) {
    const hint = document.createElement('div');
    hint.textContent = opts.hint;
    // #b8a894 on the toast background is 6.5:1 at worst, readable at this size
    Object.assign(hint.style, { color: '#b8a894', fontSize: '12px', marginTop: '3px' });
    el.appendChild(hint);
  }

  let done = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const handle: ToastHandle = {
    hasChips: (opts.chips?.length ?? 0) > 0,
    pick(i) {
      const chip = opts.chips?.[i];
      if (!chip || done) return false;
      handle.dismiss();
      chip.onPick();
      return true;
    },
    dismiss() {
      if (done) return;
      done = true;
      if (holdTimer) clearTimeout(holdTimer);
      if (current === handle) current = null;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), FADE_MS + 50);
    },
  };

  if (opts.chips?.length) {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' });
    opts.chips.forEach((chip, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${i + 1}  ${chip.label}`;
      Object.assign(b.style, {
        font: 'inherit',
        color: '#fff',
        background: 'rgba(143, 207, 196, 0.16)',
        border: '1px solid rgba(143, 207, 196, 0.55)',
        borderRadius: '7px',
        padding: '5px 10px',
        minHeight: '28px',
        cursor: 'pointer',
      });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        handle.pick(i);
      });
      row.appendChild(b);
    });
    el.appendChild(row);
  }

  host.appendChild(el);
  // Two frames: the first paint at opacity 0, then the fade in
  requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '1')));
  holdTimer = setTimeout(() => handle.dismiss(), opts.holdMs ?? 2800);
  current = handle;
  return handle;
}
