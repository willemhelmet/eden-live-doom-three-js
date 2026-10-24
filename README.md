# Doom, remixed live

A remixable [Reactor EdenLive](https://docs.reactor.inc/model-api-reference/eden-live/overview) example. Play the original Three.js Doom, bring your own Reactor API key, and transform its frames with a prompt and reference image. The game keeps control of movement, collisions, weapons, enemies, audio and the HUD.

## Try it locally

Requires Node.js 22.14+ and npm.

```sh
git clone https://github.com/willemhelmet/eden-live-doom-three-js.git
cd eden-live-doom-three-js
npm ci
npm run dev
```

Open **http://127.0.0.1:3210/**. The original game runs without a key. Paste your Reactor key, choose the environment matching it, edit the prompt/reference/seed, and select **Start Eden**. Cloud usage is charged to your Reactor account. **Stop Eden** disconnects and returns to the original; stop before changing settings. **Copy config** exports the appearance settings without credentials.

The key stays in the page's memory and is sent directly to the selected official Reactor API to obtain a scoped token for one EdenLive session. It is never sent to the demo host, saved in local/session storage, or included in copied configuration. Refresh or **Clear key** removes it. No server key or `.env` credential is needed. Never add a key to `VITE_*` variables or commit one to the repo.

## Deploy a public BYOK demo

```sh
npm ci
npm run build
```

Publish **`dist/`** to an HTTPS static host. On Vercel, import this repo with framework **Other**, build command **`npm run build`**, and output directory **`dist`**. The included `vercel.json` supplies those settings. No functions or environment secrets are required. The build copies the game, WAD, Three.js modules, reference image, fonts and brand assets into the output; it does not depend on the Node preview server. Preserve `/doom/index.html` directory routing and serve `.mjs` as JavaScript. Avoid a blanket SPA fallback that hides missing assets.

For a local production preview, use `npm run build && npm start`. Optional `.env` configuration only sets `PORT` (default 3210). HTTPS or localhost is required for browser capture and clipboard features. Initial model connection needs cloud capacity and internet access.

## Make it yours

| File | What to change |
| --- | --- |
| [`index.html`](index.html) | Default prompt, seed, controls and page copy |
| [`public/appearance-greenhouse.png`](public/appearance-greenhouse.png) | Bundled appearance reference ([generation prompt](docs/appearance-reference-prompt.md)) |
| [`src/session.ts`](src/session.ts) | Connection lifecycle, reference upload, source publication and acknowledged commands |
| [`src/auth.mjs`](src/auth.mjs) | Direct browser token request and permitted Reactor endpoints |
| [`src/doom-bridge.mjs`](src/doom-bridge.mjs) | Scene capture and local overlay; adapt this for a different game/canvas |
| [`src/main.ts`](src/main.ts) | Form controls, video reveal, comparison and cleanup |
| [`src/style.css`](src/style.css) | Reactor-branded developer workbench |

To use another scene, replace the Doom iframe/bridge with a canvas source and pass it to `EdenSession.start` with an API key, endpoint, reference, prompt and seed. The session publishes that canvas at a target 24 fps. Copy config is a starting point for those settings, not an exported image or API credential.

The original scene remains the input in every view; generated output never feeds back into the model. The app pauses local play during startup, waits for transport readiness, selects the client source, stages the appearance, and starts generation. It reveals generated video only after a completed model chunk and a decoded nonblack frame. Doom's gun and HUD are composited locally above the generated world; menus and automap show the original.

Stop explicitly before leaving for confirmed cleanup. Hiding the page requests a disconnect, closing it drops the connection, and scoped tokens cap a session at 15 minutes. Generated visuals arrive behind local input and can drift over time; long-session alignment and end-to-end latency are not established by this example.

## Controls

Click the game to play. WASD moves, mouse or arrows turn, Ctrl/left click fires, Space uses a door, Shift runs, Esc opens the menu, V cycles original/Eden/split, and F toggles fullscreen. The view button becomes available after generated video arrives. **Restart level** disconnects and reloads E1M1.

Walking, strafing and turning use one quarter of the original speed, for keyboard, mouse and gamepad. Tune `DEMO_PACE` in [`src/deck-input.mjs`](src/deck-input.mjs). Simulation still runs at 35 Hz. A standard gamepad supports left-stick movement, right-stick turn, RT fire, A use, LT/L3 run, bumpers for weapons, X connection, Y view toggle, View comparison and R3 fullscreen.

The optional `bash scripts/deck.sh` launcher still supports Steam Deck Desktop Mode and installs its runtime inside the checkout. Enter the key in the browser. SteamOS, Gaming Mode and physical controller behavior require verification on the device; they are not the primary setup path.

## Validation

```sh
npm run build
npm test
npx playwright install chromium   # Once for browser tests
npm run test:browser
```

Tests cover source rendering, actual player movement, slower inputs, controller release, direct BYOK requests, sanitized errors, credential persistence, copied configuration, static assets, cancellation and session cleanup. They use fake credentials and do not incur cloud usage. See [VALIDATION.md](VALIDATION.md) for results and the separate earlier live-cloud smoke test.

## Source and licensing

The pinned [mrdoob/three-doom](https://github.com/mrdoob/three-doom) port is included under its stated GPL v2 code license; this example's source is GPL-2.0-only. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance, adapter patches and asset boundaries. `doom1.wad` is upstream's shareware Episode 1 asset, separate from the code license. No registered Doom assets are included. Reactor branding, supplied fonts, hosted service and SDK dependencies retain their own terms and licenses.
