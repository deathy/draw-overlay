// Preferences, in localStorage. There is deliberately no IndexedDB and no
// history: the picture you trace is yours, it is held in memory for the session
// and dropped when the tab closes. Only these few knobs persist.

const KEY = 'draw-overlay:settings';

export interface Settings {
  /** Overlay opacity, 0..1. */
  opacity: number;
  /** Remembered camera deviceId, so the app doesn't re-guess every launch. */
  cameraId: string | null;
  /** Whether the screen should be held awake. */
  keepAwake: boolean;
}

export const DEFAULTS: Settings = {
  opacity: 0.5,
  cameraId: null,
  keepAwake: true
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      opacity:
        typeof parsed.opacity === 'number' && parsed.opacity >= 0 && parsed.opacity <= 1
          ? parsed.opacity
          : DEFAULTS.opacity,
      cameraId: typeof parsed.cameraId === 'string' ? parsed.cameraId : null,
      keepAwake: typeof parsed.keepAwake === 'boolean' ? parsed.keepAwake : DEFAULTS.keepAwake
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota; preferences simply won't stick */
  }
}
