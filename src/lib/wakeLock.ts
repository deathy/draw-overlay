// Keep the screen on while tracing.
//
// This is the one capability that matters most to how the app *feels*: the phone
// is clamped over paper and untouched for twenty minutes, so a screen timeout
// mid-stroke ruins the alignment you just spent a minute setting up.
//
// Two things the spec makes easy to get wrong:
//  1. The lock is released automatically whenever the document becomes hidden,
//     and is NOT restored when it comes back — you have to re-request it.
//  2. Requesting requires a visible document, so a request fired while hidden
//     rejects; the visibilitychange handler is the only correct place to retry.
//
// No permission prompt is involved; it needs a secure context and nothing else.

export function wakeLockSupported(): boolean {
  return 'wakeLock' in navigator;
}

export interface WakeLockController {
  /** Ask for the lock and keep re-acquiring it across visibility changes. */
  enable(): Promise<void>;
  /** Release it and stop re-acquiring. */
  disable(): Promise<void>;
  /** Detach listeners; call on unmount. */
  dispose(): void;
}

export function createWakeLock(
  onChange?: (held: boolean) => void
): WakeLockController {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;

  const held = () => onChange?.(sentinel !== null);

  async function acquire(): Promise<void> {
    if (!wanted || sentinel || !wakeLockSupported()) return;
    if (document.visibilityState !== 'visible') return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
        held();
      });
    } catch {
      // Battery saver and some embedded webviews refuse outright. Nothing to do
      // but carry on without it; the UI reflects the real state via onChange.
      sentinel = null;
    }
    held();
  }

  async function release(): Promise<void> {
    const s = sentinel;
    sentinel = null;
    held();
    if (s) {
      try {
        await s.release();
      } catch {
        /* already gone */
      }
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    async enable() {
      wanted = true;
      await acquire();
    },
    async disable() {
      wanted = false;
      await release();
    },
    dispose() {
      wanted = false;
      document.removeEventListener('visibilitychange', onVisibility);
      void release();
    }
  };
}
