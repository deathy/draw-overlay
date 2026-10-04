import type { CameraOption } from '../lib/camera';
import { rotationDegrees, type Transform } from '../lib/transform';
import { Icon } from './Icon';

interface Props {
  hasImage: boolean;
  opacity: number;
  locked: boolean;
  hasTorch: boolean;
  torchOn: boolean;
  keepAwake: boolean;
  awakeHeld: boolean;
  awakeSupported: boolean;
  cameras: CameraOption[];
  cameraId: string | null;
  transform: Transform;
  panelOpen: boolean;
  onPickImage(): void;
  onOpacity(value: number): void;
  onToggleLock(): void;
  onToggleTorch(): void;
  onToggleKeepAwake(): void;
  onCamera(id: string): void;
  onTransform(next: Transform): void;
  /** Back to the picture's fitted (auto-oriented) placement. */
  onResetPlacement(): void;
  onPanel(open: boolean): void;
  onAbout(): void;
}

const QUARTER_TURN = Math.PI / 2;

export function Controls(props: Props) {
  const {
    hasImage,
    opacity,
    locked,
    hasTorch,
    torchOn,
    keepAwake,
    awakeHeld,
    awakeSupported,
    cameras,
    cameraId,
    transform,
    panelOpen
  } = props;

  const turn = (by: number) =>
    props.onTransform({ ...transform, rotation: transform.rotation + by });

  return (
    <>
      {panelOpen && (
        <div class="sheet" role="dialog" aria-label="Placement options">
          <div class="sheet-head">
            <span>Placement</span>
            <button class="icon-btn" onClick={() => props.onPanel(false)} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>

          <div class="row">
            <button class="chip" onClick={() => turn(-QUARTER_TURN)}>
              <Icon name="rotateLeft" size={18} /> 90&deg; left
            </button>
            <button class="chip" onClick={() => turn(QUARTER_TURN)}>
              <Icon name="rotateRight" size={18} /> 90&deg; right
            </button>
            <span class="readout">{rotationDegrees(transform)}&deg;</span>
          </div>

          <div class="row">
            <button
              class={`chip ${transform.mirrored ? 'on' : ''}`}
              aria-pressed={transform.mirrored}
              onClick={() => props.onTransform({ ...transform, mirrored: !transform.mirrored })}
            >
              <Icon name="mirror" size={18} /> Mirror
            </button>
            <button class="chip" onClick={props.onResetPlacement}>
              <Icon name="reset" size={18} /> Reset placement
            </button>
            <span class="readout">{Math.round(transform.scale * 100)}%</span>
          </div>

          <label class="toggle">
            <span>
              Keep screen awake
              {awakeSupported ? (
                keepAwake && !awakeHeld && <em> — not held (battery saver?)</em>
              ) : (
                <em> — not supported by this browser</em>
              )}
            </span>
            <input
              type="checkbox"
              checked={keepAwake}
              disabled={!awakeSupported}
              onChange={props.onToggleKeepAwake}
            />
          </label>

          {cameras.length > 1 && (
            <label class="select">
              <span>
                <Icon name="camera" size={18} /> Camera
              </span>
              <select
                value={cameraId ?? ''}
                onChange={(e) => props.onCamera((e.currentTarget as HTMLSelectElement).value)}
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button class="link" onClick={props.onAbout}>
            About &amp; privacy
          </button>
        </div>
      )}

      <div class={`bar ${locked ? 'locked' : ''}`}>
        {!locked && (
          <button class="icon-btn" onClick={props.onPickImage} aria-label="Choose picture">
            <Icon name="image" />
          </button>
        )}

        <label class="slider" title="Overlay opacity">
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(opacity * 100)}
            aria-label="Overlay opacity"
            onInput={(e) =>
              props.onOpacity(Number((e.currentTarget as HTMLInputElement).value) / 100)
            }
          />
        </label>

        {hasTorch && (
          <button
            class={`icon-btn ${torchOn ? 'on' : ''}`}
            aria-pressed={torchOn}
            onClick={props.onToggleTorch}
            aria-label="Torch"
          >
            <Icon name="torch" />
          </button>
        )}

        <button
          class={`icon-btn ${locked ? 'on' : ''}`}
          aria-pressed={locked}
          disabled={!hasImage}
          onClick={props.onToggleLock}
          aria-label={locked ? 'Unlock placement' : 'Lock placement'}
        >
          <Icon name={locked ? 'lock' : 'unlock'} />
        </button>

        {!locked && (
          <button
            class="icon-btn"
            disabled={!hasImage}
            onClick={() => props.onPanel(!panelOpen)}
            aria-label="More options"
          >
            <Icon name="more" />
          </button>
        )}
      </div>
    </>
  );
}
