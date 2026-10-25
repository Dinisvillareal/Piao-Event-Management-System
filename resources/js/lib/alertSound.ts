// The soft single-strike bell used by the staff bell and the member feedback
// toasts. Synthesised with Web Audio, so there is no audio file to ship.
const PARTIALS: [number, number][] = [[1, 1], [2.76, 0.42], [5.4, 0.18], [8.93, 0.08]];

function strike(ctx: AudioContext, when: number, freq: number, level: number) {
  PARTIALS.forEach(([ratio, weight]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const peak = level * weight;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 1.5 / Math.sqrt(ratio));
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 1.6);
  });
}

export function playBell(ctx: AudioContext) {
  strike(ctx, ctx.currentTime, 1318.5, 0.22);
}

let shared: AudioContext | null = null;

// Browsers only allow audio after a user gesture, so the first click or key
// press anywhere quietly unlocks it for the rest of the session.
export function installAudioUnlock(): () => void {
  const unlock = () => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (!shared) shared = new Ctor();
      if (shared.state === "suspended") shared.resume();
    } catch { /* audio unavailable -- stay silent */ }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
}

export function chime() {
  if (shared && shared.state === "running") {
    try { playBell(shared); } catch { /* ignore */ }
  }
}

export const MEMBER_SOUND_KEY = "piao.member.alertSound";
export const SOUND_CHANGED_EVENT = "member:sound-changed";

export const getSoundPref = (key: string): boolean => {
  try { return localStorage.getItem(key) !== "off"; } catch { return true; }
};
export const setSoundPref = (key: string, on: boolean) => {
  try { localStorage.setItem(key, on ? "on" : "off"); } catch { /* private mode */ }
  window.dispatchEvent(new Event(SOUND_CHANGED_EVENT));
};
