import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const doom = path.join(dist, 'doom');
await fs.mkdir(doom, { recursive: true });
await fs.cp(path.join(root, 'vendor/three-doom/src'), path.join(doom, 'src'), { recursive: true });
for (const file of ['doom1.wad', 'M_CONT.png']) await fs.copyFile(path.join(root, 'vendor/three-doom', file), path.join(doom, file));
await fs.copyFile(path.join(root, 'doom.html'), path.join(doom, 'index.html'));
await fs.copyFile(path.join(root, 'src/doom-bridge.mjs'), path.join(doom, 'bridge.mjs'));
await fs.copyFile(path.join(root, 'src/deck-input.mjs'), path.join(doom, 'deck-input.mjs'));
const three = path.join(dist, 'three/build');
await fs.mkdir(three, { recursive: true });
for (const file of ['three.module.js', 'three.core.js']) await fs.copyFile(path.join(root, 'node_modules/three/build', file), path.join(three, file));
await fs.copyFile(path.join(root, 'node_modules/three/LICENSE'), path.join(dist, 'three/LICENSE'));
console.log('Static example ready in dist/: no token server or server-side API key required.');
