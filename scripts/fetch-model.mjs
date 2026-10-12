// Fetches MediaPipe's face landmarker model (3.7 MB) into public/models, so that the site carries it
// and works with no network. Without it the page loads the same file from Google when it starts.
//   npm run model
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_ = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'models');
const file = join(dir, 'face_landmarker.task');

if (existsSync(file)) {
  console.log('fetch-model: public/models/face_landmarker.task is already there');
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
console.log(`fetch-model: ${URL_}`);
const res = await fetch(URL_);
if (!res.ok) {
  console.error(`fetch-model: HTTP ${res.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await res.arrayBuffer());
if (bytes.length < 1_000_000) {
  console.error(`fetch-model: only ${bytes.length} bytes, not the model`);
  process.exit(1);
}
writeFileSync(file, bytes);
console.log(`fetch-model: ${bytes.length} bytes written to public/models/face_landmarker.task`);
