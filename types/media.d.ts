// Torch and focus control are part of the MediaStream Image Capture spec but are
// not in TypeScript's DOM lib. Declare only what src/lib/camera.ts touches.
interface MediaTrackCapabilities {
  torch?: boolean;
  focusMode?: string[];
}

interface MediaTrackSettings {
  torch?: boolean;
  focusMode?: string;
}

interface MediaTrackConstraintSet {
  torch?: ConstrainBoolean;
  focusMode?: ConstrainDOMString;
  pointsOfInterest?: { x: number; y: number }[];
}
