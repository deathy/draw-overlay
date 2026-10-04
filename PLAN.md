# Draw Overlay — design decisions & roadmap

Working notes for `draw-overlay.codemonkey.ro`. Goals, the "why" behind choices,
and what's next. Kept in the repo as living documentation.

## Goal

Show a picture you already have as a semi-transparent layer over the live camera,
so you can prop the phone over paper and trace it. Personal tool, mobile-first,
fully client-side, deployable as static content to Cloudflare.

That is the whole app. It is not a drawing app, not a lesson app, and not a
content library.

## Where this came from

The Play Store category leader is `ar.drawing.sketch.paint.trace.draw.picture.paper`
("AR Drawing: Sketch & Paint", 10M+ installs, 4.2 stars). Its listed features are:
camera tracing, a template library, a flashlight, save-to-gallery, recording the
drawing process, sketch-and-paint, and sharing. Its Data safety entry declares that
it *shares* location and personal info plus five other categories, *collects* those
plus six more, and that **data isn't encrypted**. Its top reviews are uniformly
about ads on every button press and a subscription wall in front of importing your
own picture.

Two conclusions shaped this repo:

1. **There is no AR in it.** "Trace a *projected* picture on paper", a flashlight as
   the companion feature, and a 10M-install footprint on Android 8.0+ (ARCore's
   certified-device list would gut that reach) all point at a static camera
   passthrough with a positioned, semi-transparent bitmap on top. No plane
   detection, no pose tracking. That is a CSS transform on an `<img>`, which is why
   this is a small static web app and not a native project.
2. **The paywalled feature is the honest one.** "Import your own image" is what
   people actually want and what the subscription blocks. Here it is the *only* way
   to load a picture.

## What this deliberately does not do

| Dropped | Why |
|---|---|
| Bundled template library | 700 pieces of line art is the original's real moat and a licensing liability. Bring your own picture |
| Photo → line art conversion | Real work (edge detection, thresholding, UI for both). Wanted, but not what makes v1 useful |
| Recording the drawing process | iOS canvas `captureStream` + MediaRecorder is [documented as flaky](https://developer.apple.com/forums/thread/694867) (freezes on `stop()`, reloads past ~1 min), and a 20-minute composite is hundreds of MB in memory. Timelapse frames are the better shape if this ever lands |
| Share / save the result | There is no result — the drawing is on paper. The camera feed is not ours to hand around |
| AI generation, lessons, coloring | Need a backend, which is the one thing this repo is built to avoid |
| Accounts, history, analytics | Nothing to store. Nothing to measure |

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Name | `draw-overlay` | It is a drawing overlay. Calling it "AR" would be the same lie the category leader tells |
| Framework | Preact + Vite + TS | Matches the sibling apps; 11 KB gzipped for the whole thing |
| Rendering | CSS `transform` on an `<img>` | GPU-composited and free. A canvas would mean redrawing the picture every frame to achieve exactly nothing extra |
| Overlay geometry | `inset: 0; margin: auto` + `max-width/height: 100%` | Centres by layout, so the identity transform already means "fitted and centred" and `scale: 1` is a real baseline rather than a device-dependent pixel ratio |
| Gesture model | One pure function over two grips | Pan, pinch and twist reduce to (pivot, k, dTheta, pan). Pivot-anchored so the point between your fingers stays put — see below |
| Camera selection | Enumerate; prefer lowest-indexed rear | Carried over from `qr.codemonkey.ro` D10 and *more* important here — see "Permissions" |
| Torch | Feature-detected, hidden when absent | Never shipped on iOS and never will be; a dead button is worse than no button |
| Screen awake | Screen Wake Lock, re-acquired on `visibilitychange` | The phone sits untouched for twenty minutes. A screen timeout throws away the alignment you just set |
| Picture lifetime | Object URL, memory only, revoked on replace | There is no reason for it to outlive the tab, so it doesn't |
| Remove colour | Top-5 colour swatches + tolerance, keyed on a `<canvas>` | Backgrounds wash out the paper underneath. A 4096-bucket histogram finds them (the background is nearly always first); picking one swaps the `<img>` for a canvas with that colour cleared and a 32-level feather so outlines stay smooth. Per-pixel distances are computed once per colour, so the tolerance slider only re-runs a table lookup. Capped at 4096 px long edge |
| Storage | localStorage, three keys | Opacity, camera id, keep-awake. No IndexedDB because there is no data |
| PWA | `vite-plugin-pwa`, precache everything | No runtime-fetched data at all, so the app is fully offline after first load |
| Orientation | **Not** locked | Paper is landscape as often as portrait, and the overlay has its own rotation control |
| Deploy | Cloudflare static-assets Worker | Same as sibling projects; SPA fallback |
| License | Apache-2.0 | Intended open-source |

## Permissions and platform capabilities

The question this project started from was whether a browser can do this at all.
It can; the answer is "camera, and nothing else".

| Need | API | Prompt | Android Chrome | iOS Safari |
|---|---|---|---|---|
| Camera preview | `getUserMedia` | Yes (camera) | ✅ | ✅ |
| Keep screen on | Screen Wake Lock | **None** | ✅ 84+ | ✅ 16.4+ |
| Flashlight | `applyConstraints({torch})` | — | ✅ | ❌ never |
| Load a picture | `<input type=file>` / drop / paste | **None** | ✅ | ✅ |
| Autofocus control | `focusMode`, `pointsOfInterest` | — | partial | ❌ |
| Orientation lock | `screen.orientation.lock()` | needs fullscreen | ✅ | ❌ |

Notes that matter in practice:

- **Everything needs a secure context.** `localhost` counts, plain LAN HTTP does not
  — so phone testing means the live site or an HTTPS tunnel.
- **Wake Lock needs no permission**, unlike the native `WAKE_LOCK` manifest entry.
  It *is* released whenever the document is hidden and is **not** restored on
  return, so re-acquiring on `visibilitychange` is mandatory, not an optimisation.
  It can also be refused outright (battery saver, some embedded webviews); the UI
  reports the real state rather than assuming success.
- **Camera choice is a correctness issue here, not a nicety.** `facingMode:
  'environment'` is not reliably the main lens. On an S24 it resolves to "camera 2,
  facing back", whose only `focusMode` is `manual`, locked near infinity. For a
  barcode that meant failed scans; for paper at 30 cm it means the app looks
  permanently broken. Hence: enumerate, prefer the lowest-indexed rear camera,
  request continuous autofocus, offer a picker, and remember the choice.
- **Torch is an Android-only feature of the web platform.** WebKit has never
  implemented it and all iOS browsers are WebKit, so this is not a "someday".

## Privacy stance

This repo is meant to be published, and the whole pitch is the contrast with the
app described above.

- The picture is turned into an object URL and rendered. It is never uploaded,
  never written to storage, and is revoked when replaced or when the tab closes.
- Its pixels are read only for **Remove colour**, and only once asked: a 256 px
  thumbnail when the placement sheet opens (for the swatches), the full picture
  when a swatch is picked. In this tab, in memory, dropped with the picture.
- The camera frames are displayed and discarded. Nothing captures, encodes or
  retains them.
- No accounts, no analytics, no third-party requests, no fonts or scripts from a
  CDN. After the first load the app makes **no network requests at all**.
- `Permissions-Policy` switches off geolocation, microphone and the motion sensors
  at the header, rather than merely not calling them.
- localStorage holds exactly three preferences: opacity, camera id, keep-awake.

## The gesture model

`src/lib/transform.ts` is the only interesting code in the repo and is fully unit
tested.

A `Transform` is `{ x, y, scale, rotation, mirrored }`, where `x/y` is the offset of
the image centre from the stage centre in CSS pixels. Identity means "fitted and
centred", which is what the layout in `styles.css` already produces — the two are
coupled, so don't change the centring without changing the maths.

`gestureDelta(start, now)` reduces two grips to `{ pivot, k, dTheta, pan }`: one
pointer gives pure pan; two give scale from the change in span, rotation from the
change in the finger axis, and pan from the moving midpoint. `applyGesture` then
re-anchors around the pivot:

```
t1 = pivot + k·R(dTheta)·(t0 − pivot) + pan
```

Without the pivot term the image scales about its own centre and the point between
your fingers slides away, which feels like driving the picture rather than moving
it. The scale clamp is folded back into `k` before it is used for translation, so
pinching past the limit doesn't keep sliding the image while its size stays put.

`Stage.tsx` re-seats the gesture on every touch and lift, so adding or removing a
finger continues from where the image is now instead of snapping back to the
original grip.

## Open questions / known gaps

- **Heat and battery.** Camera plus a full-brightness screen held awake for twenty
  minutes is a warm phone. Same as the native app, but worth measuring and possibly
  warning about.
- **Zoom vs. resolution.** The overlay scales the decoded bitmap; a small picture
  blown up to 400% is soft. A downscale-on-load pass would cap memory but would also
  cap sharpness. Untested at both ends.
- **The physical rig.** The app assumes you have something to clamp the phone to.
  No amount of software fixes that; a short "how to prop your phone" note on the
  intro screen is probably worth more than any feature below.
- **Tap-to-focus feedback.** Tapping applies focus but shows nothing. Needs at least
  a ring, and there's no way to tell whether the device honoured it.
- **iOS testing.** All iOS behaviour here is from documentation, not a device. The
  torch button hiding, wake lock on 16.4+, and `playsinline` all need confirming.

## Roadmap

### Phase 1 — MVP (done)

- Camera preview with main-rear-lens selection, continuous autofocus, tap-to-focus.
- Load your own picture: file picker, drag-and-drop, paste.
- Pan / pinch / rotate / mirror, opacity, reset, 90-degree turns.
- Lock, which immobilises the overlay and collapses the UI out of the way.
- Torch where supported; screen wake lock with honest "not held" reporting.
- PWA, offline, Cloudflare Worker config, `Permissions-Policy` header.
- Unit tests for the transform maths.

### Phase 2 — next

- **Tap-to-focus indicator** and a focus/exposure lock, so a hand entering the frame
  stops re-triggering autofocus mid-stroke.
- **Contrast / invert / threshold on the overlay** — pure CSS `filter`, one line,
  and the single cheapest thing that makes faint pictures traceable. The closest
  thing to "line art" without writing an edge detector.
- **Grid overlay** (rule of thirds / quarters) for eyeballing proportions.
- **Brightness boost**: nudge the screen brighter while tracing, if the platform
  ever allows it without a permission.
- A "how to prop your phone" illustration on the intro screen.

### Phase 3 — maybe

- **On-device line art**: Sobel/Canny over the loaded picture in a worker. Fully
  local, and the honest version of the feature the original paywalls.
- **Timelapse**: a frame every N seconds, encoded at the end. The recording feature
  reshaped into something that works on both platforms.
- **Remember recent pictures** in IndexedDB — opt-in, and a deliberate walk-back of
  the "nothing is stored" line, so it needs to be worth it.
