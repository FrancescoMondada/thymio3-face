// Finds the person's face in the camera picture: MediaPipe's face landmarker, run in the page.
//
// It needs two things next to the page, so that a demonstration works with no network at all:
//   public/mediapipe/wasm/   the WebAssembly runtime (copied from node_modules by scripts/copy-wasm.mjs)
//   public/models/face_landmarker.task   the model, 3.7 MB (npm run model fetches it)
// When one of them is not there, the same file is taken from the internet (jsDelivr, Google).

import { pickPerson } from './pose.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
const LOCAL_WASM = `${BASE}mediapipe/wasm`;
const LOCAL_MODEL = `${BASE}models/face_landmarker.task`;
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm';
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// A file of the site, and not the page that the development server answers for any path.
async function there(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok && !(r.headers.get('content-type') || '').includes('html');
  } catch {
    return false;
  }
}

export async function createTracker({ log = () => {} } = {}) {
  const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');

  const localWasm = await there(`${LOCAL_WASM}/vision_wasm_internal.js`);
  const localModel = await there(LOCAL_MODEL);
  log('info', `vision: runtime ${localWasm ? 'from the site' : 'from the internet'}, model ${localModel ? 'from the site' : 'from the internet'}`);
  const fileset = await FilesetResolver.forVisionTasks(localWasm ? LOCAL_WASM : CDN_WASM);

  const make = (delegate) => FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: localModel ? LOCAL_MODEL : CDN_MODEL, delegate },
    runningMode: 'VIDEO',
    numFaces: 2,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  let landmarker, delegate = 'GPU';
  try {
    landmarker = await make('GPU');
  } catch (err) {
    log('err', `vision: GPU not available (${err?.message || err}), using the CPU`);
    delegate = 'CPU';
    landmarker = await make('CPU');
  }
  log('info', `vision: ready, ${delegate}`);

  let lastTs = 0;
  let errors = 0;
  return {
    delegate,
    // One picture of the camera -> { present, cx, cy, w, h, yaw, pitch, faces } (see pose.js)
    detect(video, nowMs) {
      const ts = Math.max(lastTs + 1, Math.round(nowMs));
      lastTs = ts;
      try {
        const res = landmarker.detectForVideo(video, ts);
        errors = 0;
        const person = pickPerson(res.faceLandmarks);
        return person ? { present: true, faces: res.faceLandmarks.length, ...person } : { present: false, faces: res.faceLandmarks.length };
      } catch (err) {
        if (++errors > 20) throw err;
        return { present: false, faces: 0 };
      }
    },
    close() { try { landmarker.close(); } catch { /* already closed */ } },
  };
}
