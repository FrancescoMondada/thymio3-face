// From the landmarks of a face (MediaPipe's 478-point mesh, in image coordinates 0..1) to what the
// robot needs: where the face is, how big, and two signals that follow the head's nod and shake.
//
// The signals are ratios of distances inside the face, so they do not depend on where the face is in
// the image, how far it is, or how it is tilted:
//   yaw   = how far the nose tip is from the middle of the face, in face widths. Turning the head
//           moves the nose (it sticks out of the face) sideways across the face: 0.1 for about 20 degrees.
//   pitch = where the nose tip lies between the eye line and the chin. Bowing the head moves the
//           nose down on the face: it changes by about 0.1 for 20 degrees as well.
// Their sign does not matter (the gesture detector only reads how much they swing), and they are not
// degrees: one unit is a lot of head. tests/pose.test.js checks them on a model of a head.

export const LM = { nose: 1, chin: 152, top: 10, cheekA: 234, cheekB: 454, eyeA: 33, eyeB: 263 };

export const MIN_FACE_WIDTH = 0.06;          // a face narrower than this (6 % of the image) is too far to be the person

export function measureFace(lm) {
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const p of lm) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  const w = x1 - x0, h = y1 - y0;
  const nose = lm[LM.nose], a = lm[LM.cheekA], b = lm[LM.cheekB];
  const width = Math.abs(b.x - a.x);
  const eyeY = (lm[LM.eyeA].y + lm[LM.eyeB].y) / 2;
  const down = lm[LM.chin].y - eyeY;
  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    w, h,
    yaw: width > 1e-4 ? (nose.x - (a.x + b.x) / 2) / width : 0,
    pitch: down > 1e-4 ? (nose.y - eyeY) / down : 0,
  };
}

// The person: the biggest face that is not too far. `faces` is the list of landmark arrays.
export function pickPerson(faces) {
  let best = null;
  for (const lm of faces || []) {
    if (!lm || lm.length <= LM.cheekB) continue;
    const m = measureFace(lm);
    if (m.w < MIN_FACE_WIDTH) continue;
    if (!best || m.w * m.h > best.w * best.h) best = m;
  }
  return best;
}
