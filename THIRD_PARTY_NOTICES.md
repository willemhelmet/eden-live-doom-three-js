# Third-party notices

## Three.js Doom

Source: https://github.com/mrdoob/three-doom

Pinned upstream commit: `445dbf41f2fcf032c6dfce2a630851e00b9c6634`.

Original Doom by id Software. Three.js port by mrdoob with Claude and Codex, as credited in upstream README.md. Upstream identifies its code license as GPL v2. Its full fetched source and tests are retained in `vendor/three-doom/`.

Local modifications:

- `src/d_main.js`: dispatch `doom:frame` at the end of the display function, after HUD/menu composition and before WebGL's drawing buffer can be discarded.
- `src/d_keyboard.js`: invoke the optional `edenDeckInput` adapter after native command composition and before the pause-command override.

The iframe host, canvas capture and controller adapter are supplied in this repository's `doom.html` and `src/` directory, outside the vendored tree. The port is served with the same pinned Three.js 0.184.0 version it uses upstream, from the local npm dependency.

## Doom game data

`vendor/three-doom/doom1.wad` and `M_CONT.png` are included exactly as in upstream. The WAD is Doom shareware Episode 1, not GPL-covered game data. Its original asset terms remain applicable; the GPL code license does not relicense these assets. No registered/full-game WADs are included.

## Reactor brand artwork

The supplied Reactor core logo lockup, Dune Chip symbol, usage notes and color tokens are copied unchanged from the user's Reactor brand asset pack. The runtime uses `public/brand/symbol-wordmark-white.png`, `public/brand/symbol-dune.svg` and `src/brand-colors.css`. Reactor brand artwork remains subject to its owner's trademark and asset rights; the project's code license does not relicense these marks.

Aeonik Regular, Medium and Bold web fonts and IBM Plex Mono Regular are copied unchanged from the user's Reactor digital handover assets and served locally from `public/brand/fonts/`. Their respective font licenses remain applicable; the code license does not relicense the font files. Typography, palette hierarchy and spacing loosely follow the supplied Reactor Figma guidelines.

## Generated appearance asset

`public/appearance-greenhouse.png` was generated for this demo with the built-in image-generation tool on October 24, 2026, using a captured world-only E1M1 frame as the composition/edit target. It is an appearance reference, not a prerecorded gameplay video. The prompt is included in `docs/appearance-reference-prompt.md`.

## npm dependencies

Dependency versions and integrity hashes are in package-lock.json. Third-party notices/licenses are retained in their installed npm packages, including Three.js (MIT) and the Reactor JavaScript SDK (Apache-2.0). No SDK source or credentials are copied out of another private project into this repository. The published EdenLive model SDK is installed through npm.
