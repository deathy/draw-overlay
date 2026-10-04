// Camera plumbing. Deliberately small: this app only needs a sharp, close-focus
// rear preview plus a torch — no decoding, no frame grabbing, no stills.
//
// The camera-selection logic is carried over from qr.codemonkey.ro, where it was
// the single biggest lesson: `facingMode: 'environment'` is NOT reliably the main
// lens. On some phones it resolves to a secondary rear camera whose only
// focusMode is "manual", locked near infinity. For a barcode that meant failed
// scans; here it means the paper 30cm away is permanently blurred, which reads as
// "this app is broken". Enumerate and prefer the lowest-indexed rear camera.

export interface CameraOption {
  id: string;
  label: string;
}

export interface CameraHandle {
  track: MediaStreamTrack;
  /** Whether this device exposes a controllable torch (Android only, in practice). */
  hasTorch: boolean;
  /** deviceId actually in use, for persisting the user's pick. */
  deviceId: string | null;
  /** Every rear/front camera we could offer, for the picker. */
  devices: CameraOption[];
  setTorch(on: boolean): Promise<void>;
  /** Focus at a normalised (0..1) point in the frame. Best-effort. */
  focusAt(xNorm: number, yNorm: number): Promise<void>;
  /**
   * Get the preview moving again after the page was hidden. Resolves false when
   * the stream is beyond saving and the camera has to be reopened.
   */
  resume(): Promise<boolean>;
  stop(): void;
}

/** How long a resumed preview may sit without a new frame before we call it stuck. */
const RESUME_TIMEOUT_MS = 2000;

/**
 * Resolve true as soon as the video presents a new frame, false if none arrives
 * in time. `currentTime` advancing is the fallback where requestVideoFrameCallback
 * is missing (Firefox before 132).
 */
function waitForFrame(video: HTMLVideoElement, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    let poll: ReturnType<typeof setInterval> | undefined;
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => finish(true));
    } else {
      const t0 = video.currentTime;
      poll = setInterval(() => {
        if (video.currentTime !== t0) finish(true);
      }, 100);
    }
  });
}

/**
 * Android exposes several rear cameras and only the main one (index 0) reliably
 * has autofocus. Pull the number out of the label so we can prefer it.
 */
function cameraIndex(label: string): number {
  const m = label.match(/camera\s*(\d+)/i);
  return m ? Number(m[1]) : 99;
}

export async function listCameras(): Promise<CameraOption[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({ id: d.deviceId, label: d.label || 'Camera' }));
  } catch {
    return []; // labels are hidden until permission is granted
  }
}

async function pickMainRearCamera(): Promise<string | undefined> {
  const cams = await listCameras();
  const rear = cams.filter((c) => /back|rear|environment/i.test(c.label));
  if (!rear.length) return undefined;
  rear.sort((a, b) => cameraIndex(a.label) - cameraIndex(b.label));
  return rear[0].id;
}

/**
 * Ask for continuous autofocus. The default on Android is often a fixed/far
 * distance, which leaves paper at arm's length soft — exactly the working
 * distance this app lives at.
 */
async function applyContinuousFocus(track: MediaStreamTrack): Promise<void> {
  const caps = track.getCapabilities?.();
  if (!caps?.focusMode?.includes('continuous')) return;
  try {
    await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
  } catch {
    /* best-effort; capability names vary between devices */
  }
}

async function open(extra: MediaTrackConstraints): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    // 1080p keeps faint pencil lines legible under the overlay.
    video: { ...extra, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false
  });
}

export async function startCamera(
  video: HTMLVideoElement,
  preferredDeviceId: string | null,
  /** The OS took the camera away (a call, another app). Not fired by stop(). */
  onEnded?: () => void
): Promise<CameraHandle> {
  let stream: MediaStream | null = null;

  if (preferredDeviceId) {
    try {
      stream = await open({ deviceId: { exact: preferredDeviceId } });
    } catch {
      /* the remembered camera is gone; fall through to auto-selection */
    }
  }
  if (!stream) {
    const main = await pickMainRearCamera();
    if (main) {
      try {
        stream = await open({ deviceId: { exact: main } });
      } catch {
        /* fall through */
      }
    }
  }
  // First run: no labels yet, so no informed choice is possible. A plain
  // facingMode request is also what triggers the permission prompt.
  if (!stream) stream = await open({ facingMode: { ideal: 'environment' } });

  const track = stream.getVideoTracks()[0];
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  await video.play();

  await applyContinuousFocus(track);

  if (onEnded) track.addEventListener('ended', onEnded);

  const hasTorch = Boolean(track.getCapabilities?.().torch);

  return {
    track,
    hasTorch,
    deviceId: track.getSettings?.().deviceId ?? null,
    // Re-enumerate now that permission is granted and labels are visible.
    devices: await listCameras(),
    async setTorch(on: boolean) {
      if (!hasTorch) return;
      try {
        await track.applyConstraints({ advanced: [{ torch: on }] });
      } catch {
        /* some devices reject mid-stream torch toggles */
      }
    },
    async focusAt(xNorm: number, yNorm: number) {
      const caps = track.getCapabilities?.();
      const advanced: MediaTrackConstraintSet[] = [];
      if (caps && 'pointsOfInterest' in caps) {
        advanced.push({ pointsOfInterest: [{ x: xNorm, y: yNorm }] });
      }
      if (caps?.focusMode?.includes('single-shot')) {
        advanced.push({ focusMode: 'single-shot' });
      } else if (caps?.focusMode?.includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
      }
      if (!advanced.length) return;
      try {
        await track.applyConstraints({ advanced });
      } catch {
        /* best-effort */
      }
    },
    // Mobile browsers pause the <video> and suspend the track while the page is
    // hidden, and resume neither on return: the app keeps working over a frozen
    // last frame. Some devices hand the camera back as a live-but-silent track,
    // so "not ended" isn't enough — only a fresh frame proves the feed is back.
    async resume() {
      if (track.readyState === 'ended') return false;
      try {
        await video.play();
      } catch {
        /* judged by whether frames arrive, below */
      }
      return waitForFrame(video, RESUME_TIMEOUT_MS);
    },
    stop() {
      if (onEnded) track.removeEventListener('ended', onEnded);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  };
}

/** Turn a getUserMedia rejection into something worth showing a human. */
export function describeCameraError(err: unknown): string {
  const name = (err as Error)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow it for this site in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No usable camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is busy — another app or tab may be using it.';
    default:
      return 'The camera could not be started.';
  }
}
