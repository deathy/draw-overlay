# Draw Overlay — [draw-overlay.codemonkey.ro](https://draw-overlay.codemonkey.ro)

**▶ Live app: [draw-overlay.codemonkey.ro](https://draw-overlay.codemonkey.ro)** —
open it on your phone and add it to your home screen.

Prop your phone over a sheet of paper, load a picture, and trace it through the
camera. That's the whole app.

The tracing apps on the Android store are ad-infested and, almost without
exception, put "use your own picture" behind a subscription — while declaring in
their own Data safety entry that they collect and share your location and personal
info. This is the boring, honest alternative: a static web app where your picture
is **the only** way to load anything, and it never leaves the browser.

- **No backend.** Pure static HTML + CSS + JS, deployed on Cloudflare Workers
  (static assets). 11 KB of JavaScript, gzipped.
- **No accounts, no servers, no analytics, no tracking.** After the first load the
  app makes no network requests at all.
- **Your picture stays in the tab.** It's rendered from an object URL and dropped
  when you close the page — never uploaded, never stored.
- **Installable (PWA).** Add to your home screen and it works offline.
- **One permission: the camera.** Geolocation, microphone and the motion sensors are
  switched off in the `Permissions-Policy` header, not merely left uncalled.

## Features

- Live camera preview that picks the **main rear lens** — not whichever camera
  `facingMode: environment` happens to return, which on some phones is a
  fixed-focus lens that can't focus on paper at all
  ([why this matters](PLAN.md#permissions-and-platform-capabilities)).
- Load a picture from your gallery or files — or drag-and-drop / paste it on
  desktop.
- **Position it**: one finger pans, two fingers pinch, rotate and pan at once,
  anchored on the point between your fingers. Plus 90° turns, mirror, and reset.
- **Opacity slider**, always within thumb's reach.
- **Lock** freezes the placement and collapses the interface, so a stray hand can't
  nudge the alignment you just spent a minute setting up.
- **Torch** on devices that expose it (Android; WebKit has never implemented it).
- **Keeps the screen awake** while you draw, and says so honestly if the platform
  refuses.
- Tap anywhere to refocus the lens.

## What it deliberately doesn't do

No template library, no AI, no lessons, no coloring pages, no recording, no
sharing, no accounts. See [PLAN.md](PLAN.md#what-this-deliberately-does-not-do) for
the reasoning on each.

## How it works

There is no AR here, and the name says so. A `<video>` element shows the camera; an
`<img>` sits on top with a CSS `transform` and an opacity. Gestures are reduced to a
single pivot-anchored transform update in [`src/lib/transform.ts`](src/lib/transform.ts),
which is the only non-obvious code in the repo and is unit tested.

The overlay is centred by layout (`inset: 0; margin: auto` with
`max-width/height: 100%`), so the identity transform already means "fitted and
centred" and `scale: 1` is a meaningful baseline rather than a device-dependent
pixel ratio. The CSS and the maths are coupled on purpose.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173  (camera works on localhost)
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build locally
npm test         # transform maths
```

> **The camera and the wake lock need a secure context (HTTPS).** `localhost`
> counts, so desktop dev works. To test on your **phone**, plain LAN HTTP will
> *not* grant the camera — deploy to the live site, or expose dev over HTTPS with a
> tunnel (e.g. `cloudflared tunnel --url http://localhost:5173`).

Icons are generated from the logo in [`scripts/generate-icons.mjs`](scripts/generate-icons.mjs)
and committed; run `npm run icons` after changing it.

## Deploy (Cloudflare Workers — static assets)

Deploys as a **Workers static-assets** project, configured by
[`wrangler.jsonc`](wrangler.jsonc):

- Build command: `npm run build` → output `dist/`
- Deploy command: `npx wrangler deploy` (serves `dist` as static assets, SPA fallback)
- Node pinned to 22 via [`.nvmrc`](.nvmrc); Vite must be ≥ 6 (Cloudflare's build
  auto-config rejects older Vite) — currently on Vite 8.

## License

[Apache-2.0](LICENSE).
