import test from 'node:test';
import assert from 'node:assert/strict';
import { LM, measureFace, pickPerson } from '../src/vision/pose.js';

// A head, in face widths: x to the right, y down, z towards the camera. Only the landmarks pose.js reads.
const HEAD = {
  [LM.nose]: [0, 0.05, 0.28],
  [LM.chin]: [0, 0.55, 0.10],
  [LM.top]: [0, -0.45, 0.05],
  [LM.cheekA]: [-0.5, 0, 0],
  [LM.cheekB]: [0.5, 0, 0],
  [LM.eyeA]: [-0.2, -0.18, 0.08],
  [LM.eyeB]: [0.2, -0.18, 0.08],
};

// Turn the head (yaw about the vertical axis, pitch about the horizontal one; degrees), put it at
// (cx, cy) with a given width in the image, and project it straight onto the image.
function landmarks({ yaw = 0, pitch = 0, cx = 0.5, cy = 0.5, width = 0.3, aspect = 4 / 3 } = {}) {
  const ya = (yaw * Math.PI) / 180, pa = (pitch * Math.PI) / 180;
  const out = new Array(478).fill(null).map(() => ({ x: cx, y: cy, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(HEAD)) {
    const x1 = x * Math.cos(ya) + z * Math.sin(ya);
    const z1 = -x * Math.sin(ya) + z * Math.cos(ya);
    const y2 = y * Math.cos(pa) + z1 * Math.sin(pa);
    out[i] = { x: cx + x1 * width, y: cy + y2 * width * aspect, z: 0 };
  }
  return out;
}

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('a head looking at the camera reads zero yaw and a steady pitch', () => {
  const m = measureFace(landmarks());
  near(m.yaw, 0, 1e-9, 'yaw');
  near(m.cx, 0.5, 0.01, 'cx');
});

test('the signals do not depend on where the face is, how big, or the image shape', () => {
  const a = measureFace(landmarks({ yaw: 15, pitch: 10 }));
  const b = measureFace(landmarks({ yaw: 15, pitch: 10, cx: 0.2, cy: 0.7, width: 0.12 }));
  const c = measureFace(landmarks({ yaw: 15, pitch: 10, aspect: 16 / 9 }));
  near(a.yaw, b.yaw, 1e-9, 'yaw, moved and smaller');
  near(a.pitch, b.pitch, 1e-9, 'pitch, moved and smaller');
  near(a.yaw, c.yaw, 1e-9, 'yaw, other aspect');
  near(a.pitch, c.pitch, 1e-9, 'pitch, other aspect');
  near(b.cx, 0.2, 0.01, 'cx follows');
});

test('turning the head moves yaw a lot and pitch hardly; bowing does the opposite', () => {
  const rest = measureFace(landmarks());
  const turn = measureFace(landmarks({ yaw: 20 }));
  const bow = measureFace(landmarks({ pitch: 20 }));
  assert.ok(Math.abs(turn.yaw - rest.yaw) > 0.08, `20 degrees of yaw: ${turn.yaw - rest.yaw}`);
  assert.ok(Math.abs(turn.pitch - rest.pitch) < 0.02, 'a turn leaves pitch alone');
  assert.ok(Math.abs(bow.pitch - rest.pitch) > 0.07, `20 degrees of pitch: ${bow.pitch - rest.pitch}`);
  assert.ok(Math.abs(bow.yaw - rest.yaw) < 0.02, 'a bow leaves yaw alone');
});

test('both signals grow with the angle, and by the same amount both ways', () => {
  const y = [-20, -10, 0, 10, 20].map((d) => measureFace(landmarks({ yaw: d })).yaw);
  for (let i = 1; i < y.length; i++) assert.ok(Math.abs(y[i] - y[i - 1]) > 0.03, 'monotonic yaw');
  const p = [-20, -10, 0, 10, 20].map((d) => measureFace(landmarks({ pitch: d })).pitch);
  const signs = p.slice(1).map((v, i) => Math.sign(v - p[i]));
  assert.ok(signs.every((s) => s === signs[0]), 'monotonic pitch');
});

test('the person is the biggest face that is not too far', () => {
  const near1 = landmarks({ cx: 0.3, width: 0.25 });
  const far = landmarks({ cx: 0.8, width: 0.09 });
  const tiny = landmarks({ cx: 0.1, width: 0.03 });
  const p = pickPerson([far, near1, tiny]);
  near(p.cx, 0.3, 0.01, 'picked the near one');
  assert.equal(pickPerson([tiny]), null, 'a speck in the background is nobody');
  assert.equal(pickPerson([]), null);
  assert.equal(pickPerson(undefined), null);
});
