// MediaPipe's WebAssembly files, from node_modules to public/mediapipe/wasm, so that the page serves
// them itself (a demo has to work with the venue's Wi-Fi gone). Run before dev and build.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const to = join(root, 'public', 'mediapipe', 'wasm');
if (!existsSync(from)) {
  console.warn('copy-wasm: @mediapipe/tasks-vision is not installed, run npm install first');
  process.exit(0);
}
mkdirSync(to, { recursive: true });
// the two builds the loader picks from (with and without SIMD); the "module" variants are for ES-module loading
for (const f of readdirSync(from)) {
  if (/^vision_wasm(_nosimd)?_internal\.(js|wasm)$/.test(f)) cpSync(join(from, f), join(to, f));
}
console.log(`copy-wasm: ${readdirSync(to).length} files in public/mediapipe/wasm`);
