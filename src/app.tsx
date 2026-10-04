import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Controls } from './components/Controls';
import { Icon } from './components/Icon';
import { Stage } from './components/Stage';
import {
  describeCameraError,
  startCamera,
  type CameraHandle,
  type CameraOption
} from './lib/camera';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import { IDENTITY, type Transform } from './lib/transform';
import { createWakeLock, wakeLockSupported, type WakeLockController } from './lib/wakeLock';

type Phase = 'intro' | 'starting' | 'live' | 'error';

export function App() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [locked, setLocked] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [awakeHeld, setAwakeHeld] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const wakeRef = useRef<WakeLockController | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const objectUrl = useRef<string | null>(null);

  const patch = useCallback((next: Partial<Settings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      saveSettings(merged);
      return merged;
    });
  }, []);

  // ---- camera -------------------------------------------------------------

  // The camera's 'ended' handler is bound once per stream, but recovery needs the
  // latest closures; route it through a ref.
  const recoverRef = useRef<() => void>(() => {});
  const recovering = useRef(false);

  /** `quiet` reopens behind the live UI, keeping the picture and its placement. */
  const start = useCallback(
    async (deviceId: string | null, quiet = false) => {
      if (!quiet) setPhase('starting');
      setError('');
      try {
        cameraRef.current?.stop();
        cameraRef.current = null;
        const video = videoRef.current;
        if (!video) throw new Error('no video element');
        const cam = await startCamera(video, deviceId, () => recoverRef.current());
        cameraRef.current = cam;
        setHasTorch(cam.hasTorch);
        setTorchOn(false);
        setCameras(cam.devices);
        // Persist what we actually got, not what we asked for — the auto-picked
        // main rear lens is the thing worth remembering.
        if (cam.deviceId && cam.deviceId !== deviceId) patch({ cameraId: cam.deviceId });
        setPhase('live');
      } catch (err) {
        setError(describeCameraError(err));
        setPhase('error');
      }
    },
    [patch]
  );

  useEffect(() => () => cameraRef.current?.stop(), []);

  // Switching apps on a phone leaves the preview frozen on its last frame (or
  // the track ended outright). Coming back must get it moving again.
  const recover = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam || recovering.current || document.visibilityState !== 'visible') return;
    recovering.current = true;
    try {
      // Re-check identity: the user may have switched cameras meanwhile.
      if (!(await cam.resume()) && cameraRef.current === cam) {
        await start(cam.deviceId, true);
      }
    } finally {
      recovering.current = false;
    }
  }, [start]);
  recoverRef.current = () => void recover();

  useEffect(() => {
    if (phase !== 'live') return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void recover();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, recover]);

  // ---- wake lock ----------------------------------------------------------

  useEffect(() => {
    const wake = createWakeLock(setAwakeHeld);
    wakeRef.current = wake;
    return () => wake.dispose();
  }, []);

  useEffect(() => {
    const wake = wakeRef.current;
    if (!wake) return;
    if (phase === 'live' && settings.keepAwake) void wake.enable();
    else void wake.disable();
  }, [phase, settings.keepAwake]);

  // ---- the picture --------------------------------------------------------

  const useImageFile = useCallback((file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    setImageUrl(objectUrl.current);
    setTransform(IDENTITY);
    setLocked(false);
    setPanelOpen(false);
  }, []);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    []
  );

  // Drag-and-drop and paste cost a few lines and make the app usable on a
  // desktop browser, which is where most of the fiddling happens.
  useEffect(() => {
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      useImageFile(e.dataTransfer?.files?.[0]);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/')
      );
      if (item) useImageFile(item.getAsFile());
    };
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('paste', onPaste);
    };
  }, [useImageFile]);

  // ---- render -------------------------------------------------------------

  const toggleTorch = () => {
    const next = !torchOn;
    setTorchOn(next);
    void cameraRef.current?.setTorch(next);
  };

  const live = phase === 'live';

  return (
    <div class="app">
      <Stage
        videoRef={videoRef}
        imageUrl={live ? imageUrl : null}
        transform={transform}
        opacity={settings.opacity}
        locked={locked}
        onTransform={setTransform}
        onTapFocus={(x, y) => void cameraRef.current?.focusAt(x, y)}
      />

      {phase !== 'live' && (
        <div class="curtain">
          <div class="card">
            <h1>
              <Icon name="image" size={26} /> Draw Overlay
            </h1>
            <p>
              Prop your phone over paper, load a picture, and trace what you see through
              the camera.
            </p>
            <p class="fine">
              Your picture is never uploaded. There is no account, no server and no
              analytics — everything happens in this tab.
            </p>
            {phase === 'error' && <p class="error">{error}</p>}
            <button
              class="primary"
              disabled={phase === 'starting'}
              onClick={() => void start(settings.cameraId)}
            >
              {phase === 'starting'
                ? 'Starting camera…'
                : phase === 'error'
                  ? 'Try again'
                  : 'Start camera'}
            </button>
            <p class="fine">Needs camera permission, and a secure (HTTPS) connection.</p>
          </div>
        </div>
      )}

      {live && !imageUrl && (
        <button class="empty" onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={34} />
          <strong>Choose a picture to trace</strong>
          <span>From your gallery or files. It stays on your device.</span>
        </button>
      )}

      {aboutOpen && (
        <div class="curtain" onClick={() => setAboutOpen(false)}>
          <div class="card" onClick={(e) => e.stopPropagation()}>
            <h1>About</h1>
            <p>
              A tracing aid, not a drawing app: it shows your own picture as a
              semi-transparent layer over the live camera so you can copy it onto paper.
            </p>
            <p class="fine">
              The picture you load is held in this page and dropped when you close it.
              Nothing is uploaded, stored or measured. The only things kept between visits
              are your opacity, camera choice and screen-awake preference, in this
              browser&rsquo;s local storage.
            </p>
            <p class="fine">
              Apache-2.0 &middot;{' '}
              <a href="https://github.com/deathy/draw-overlay" rel="noreferrer noopener">
                source
              </a>{' '}
              &middot; build {__COMMIT__} ({__BUILD_TIME__.slice(0, 10)})
            </p>
            <button class="primary" onClick={() => setAboutOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {live && (
        <Controls
          hasImage={Boolean(imageUrl)}
          opacity={settings.opacity}
          locked={locked}
          hasTorch={hasTorch}
          torchOn={torchOn}
          keepAwake={settings.keepAwake}
          awakeHeld={awakeHeld}
          awakeSupported={wakeLockSupported()}
          cameras={cameras}
          cameraId={settings.cameraId}
          transform={transform}
          panelOpen={panelOpen}
          onPickImage={() => fileRef.current?.click()}
          onOpacity={(opacity) => patch({ opacity })}
          onToggleLock={() => {
            // Locking means "get out of the way so I can draw" — leaving the
            // placement sheet covering the paper would defeat the point.
            setPanelOpen(false);
            setLocked((v) => !v);
          }}
          onToggleTorch={toggleTorch}
          onToggleKeepAwake={() => patch({ keepAwake: !settings.keepAwake })}
          onCamera={(id) => {
            patch({ cameraId: id });
            void start(id);
          }}
          onTransform={setTransform}
          onPanel={setPanelOpen}
          onAbout={() => {
            setPanelOpen(false);
            setAboutOpen(true);
          }}
        />
      )}

      <input
        ref={fileRef}
        class="hidden-input"
        type="file"
        accept="image/*"
        onChange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          useImageFile(input.files?.[0]);
          // Reset so re-picking the same file fires a change event again.
          input.value = '';
        }}
      />
    </div>
  );
}
