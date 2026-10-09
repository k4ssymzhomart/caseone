// Web build of the siren (DEPLOY_VM.md §4): Web Audio plus navigator.vibrate where the browser has it.
// Browsers keep audio locked until the person taps the page, so the audio context is created and resumed by the
// first tap anywhere (the PIN pad counts). A siren asked for while audio is still locked starts at that tap;
// the red screen shows either way. The sounds are rendered in code with the same waveforms as
// tools/gen-assets.ts (siren.wav, ding.wav), so nothing is fetched when an emergency arrives.

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let sirenBuffer: AudioBuffer | null = null;
let dingBuffer: AudioBuffer | null = null;
let source: AudioBufferSourceNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/** startSiren was called and stopSiren not yet: the loop plays as soon as audio is unlocked. */
let wanted = false;

const VIBRATION = [600, 200, 600];
const VIBRATE_EVERY_MS = 1500;
/**
 * Events that may carry a user activation (HTML spec). Not all of them do: a touch pointerdown does not, the
 * pointerup or touchend after it does. unlock() checks the activation itself, so audio starts on the first one
 * that counts and Chrome logs no «AudioContext was not allowed to start» warning.
 */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'keydown', 'click'] as const;

type UserActivation = { isActive: boolean; hasBeenActive: boolean };

function userActivation(): UserActivation | undefined {
  return (navigator as unknown as { userActivation?: UserActivation }).userActivation;
}

/** Siren: 2.0 s, 960 Hz and 770 Hz alternating every 250 ms, amplitude 0.7 with soft clipping (a whole loop). */
function renderSiren(c: Ctx): AudioBuffer {
  const rate = c.sampleRate;
  const buf = c.createBuffer(1, Math.round(rate * 2), rate);
  const out = buf.getChannelData(0);
  const drive = 1.6;
  const norm = Math.tanh(drive);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = Math.floor(i / (rate * 0.25)) % 2 === 0 ? 960 : 770;
    out[i] = (0.7 * Math.tanh(drive * Math.sin(phase))) / norm;
    phase += (2 * Math.PI * f) / rate;
  }
  return buf;
}

/** Ding: 0.35 s, 1320 Hz sine with an exponential decay and a 2 ms attack. */
function renderDing(c: Ctx): AudioBuffer {
  const rate = c.sampleRate;
  const n = Math.round(rate * 0.35);
  const buf = c.createBuffer(1, n, rate);
  const out = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const attack = Math.min(1, t / 0.002);
    const tail = Math.min(1, (n - i) / (rate * 0.01));
    out[i] = 0.8 * attack * tail * Math.exp(-t / 0.085) * Math.sin(2 * Math.PI * 1320 * t);
  }
  return buf;
}

function running(): Ctx | null {
  return ctx && ctx.state === 'running' ? ctx : null;
}

function playLoop(): void {
  const c = running();
  if (!wanted || source || !c) return;
  try {
    sirenBuffer ??= renderSiren(c);
    const s = c.createBufferSource();
    s.buffer = sirenBuffer;
    s.loop = true;
    s.connect(c.destination);
    s.start();
    source = s;
  } catch {
    source = null;
  }
}

function unlock(): void {
  if (running()) return;
  // Browsers without navigator.userActivation (Safari before 16.4) are tried on every event, as before.
  if (userActivation()?.isActive === false) return;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      // Safari 16.4+: play through the silent switch like the native siren (playsInSilentMode).
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      ctx = new Ctor();
    }
    const c = ctx;
    const resumed = c.resume();
    // Older iOS unlocks on the first sound started inside the gesture itself: one silent sample, right now.
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, c.sampleRate);
    s.connect(c.destination);
    s.start();
    void resumed.then(playLoop).catch(() => undefined);
  } catch {
    // no Web Audio: the red screen and the vibration still work
  }
}

if (typeof window !== 'undefined') {
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true });
}

function vibrate(pattern: number | number[]): void {
  try {
    // Chrome refuses (and logs) vibrate before the first tap; Safari has no vibrate at all.
    const activation = userActivation();
    if (activation && !activation.hasBeenActive) return;
    navigator.vibrate?.(pattern);
  } catch {
    // best effort
  }
}

export async function startSiren(): Promise<void> {
  stopSiren();
  wanted = true;
  playLoop();
  vibrate(VIBRATION);
  timer = setInterval(() => vibrate(VIBRATION), VIBRATE_EVERY_MS);
}

export function stopSiren(): void {
  wanted = false;
  if (timer) clearInterval(timer);
  timer = null;
  if (source) {
    try {
      source.stop();
      source.disconnect();
    } catch {
      // already stopped
    }
  }
  source = null;
  vibrate(0);
}

/** A short ding for in-app toasts; silent until the first tap unlocks audio. */
export function playDing(): void {
  const c = running();
  if (!c) return;
  try {
    dingBuffer ??= renderDing(c);
    const s = c.createBufferSource();
    s.buffer = dingBuffer;
    s.connect(c.destination);
    s.start();
  } catch {
    // sound is best effort
  }
}
