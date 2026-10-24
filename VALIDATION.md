# Validation — October 24, 2026

## Public BYOK version

- Production TypeScript, Vite and static packaging build pass. `dist/` contains the game source, WAD, bridge, Three.js modules, reference and Reactor brand assets.
- All **13 Node tests** and **7 Chromium browser tests** pass.
- Browser tests boot the actual game, inspect rendered source pixels, move the player with keyboard and emulated standard-gamepad input, verify slower movement and release, and restart the level.
- Key-entry validation hides the red notice only after Reactor accepts the key, without opening a model session. Clearing or rejecting the key restores the notice.
- Browser BYOK tests intercept the official Reactor token URL using a fake key. They verify direct key headers, single-session scope, sanitized provider errors, cleanup, no local token broker, no browser storage of the key, and an empty key field after reload. Copied settings exclude the key; Clear resets the reveal control.
- Static server tests verify game/brand dependency routes, hidden-file blocking, and the absence of a server-key fallback even with a server environment credential present.
- API CORS preflight accepts a cross-origin browser token request with the Reactor API key header. The browser tests mock token rejection; a new paid cloud session has not been run through the BYOK UI.
- Vite reports the SDK's browser-only `use client` directive and embedded-WASM chunk size as nonfatal warnings.
- `bash -n scripts/deck.sh` passes. Physical Steam Deck behavior remains unverified.

## Earlier live cloud smoke test (before BYOK)

### Slower camera and walking adjustment

Walking, strafing and turning now use a 0.25 multiplier after keyboard, mouse and gamepad commands are composed. Production build and all three input tests pass. The targeted Chromium movement test confirms the actual player's walking command is 6 (originally 25), controller turn commands are bounded by 320 (originally 1280), movement still changes the player's position, and turning stops on controller release. Cloud streaming was not rerun for this input-only adjustment; the smoke-test evidence below predates it.

### Cloud connection evidence

Endpoint: `https://api.reactor.inc`. Published client packages: EdenLive 2.1.3, Reactor JS SDK 3.3.0. This does not establish the fleet's deployed model version; the served schema was not recorded in this run.

- A scoped token created a cloud connection from this local demo.
- Source publication and acknowledged client-source/reference/prompt/start commands completed.
- An initial test exposed black transport frames before generation. Reveal now requires a started world, at least one completed chunk and nonblack decoded video.
- The corrected run revealed at chunk 1. A sampled generated frame had visible pixels throughout its 64×36 probe, rather than a black transport placeholder.
- Received video was 1280×704, readyState 4, with decoded frames advancing. The sample had 78 decoded frames at video time 20.363 seconds; that is an observation, not an FPS or model-latency measurement.
- The local Doom player moved while connected, and the view state switched to comparison. The test did not establish visual alignment across a long movement sequence.
- Stop completed, the output stream was detached, and the UI returned to the original with no pending disconnect. No browser page errors were recorded. The test GPU session was explicitly disconnected.

The final smoke test repeated the flow with the bundled orbital-greenhouse reference: reveal at chunk 1, 96.6% of sampled pixels above the black-frame threshold, advancing 1280×704 video, actual player movement, a rendered split view and completed disconnect. The sample had 163 decoded frames at video time 7.268 seconds; this is not a throughput benchmark. Screenshots were inspected to confirm the original and generated appearances were visibly distinct while the original HUD remained present.

Local, ignored evidence: `.runtime/cloud-result.json`, `.runtime/doom-eden-live.png`, `.runtime/doom-eden-split.png`. No credential values are stored in these artifacts. See `docs/appearance-reference-prompt.md` for the bundled reference's prompt and provenance.

## Still to check on the actual Deck

- SteamOS / Gaming Mode launcher and Chromium Flatpak device permissions.
- Physical gamepad axes, triggers, shortcut buttons, audio and fullscreen exit.
- Frame delivery under the Deck's own GPU/browser load, Wi-Fi and battery settings.
- The final appearance reference in a coherent filmed take.
- Long-session visual drift and end-to-end input-to-generated-video latency.

The app does not advertise fake generation, a prerecorded live view, on-device Eden inference or a measured latency. Model usage goes to the configured Reactor account. No social post or public deployment was made.
