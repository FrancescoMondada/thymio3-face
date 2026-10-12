// Draws the face from the numbers of face.js, on a canvas of any size, in the style of a cartoon:
// the screen is the face (a warm skin colour, darker at the edges like a round head), everything is
// outlined in thick dark ink with a slightly irregular hand, and the shapes are filled: eyes with a
// big shiny iris, lids and brows that are solid shapes, a mouth with teeth and a tongue.
//
// The face lives in a 1000 x 500 drawing (a phone held in landscape is about 2:1) that is scaled to
// fit the screen and centred; the skin fills the rest of the screen.

export const W = 1000;
export const H = 500;

const COLOR = {
  skin: '#ffcf3a',
  skinEdge: '#f0a010',
  skinShade: 'rgba(176,96,0,0.20)',
  ink: '#2b1633',
  white: '#fffdf4',
  iris1: '#7fe3f2',
  iris2: '#1b86b3',
  mouthIn: '#8a1634',
  mouthDeep: '#5a0c22',
  tongue: '#ff7d92',
  tongueLine: '#d94a68',
  teeth: '#ffffff',
  blush: '255,96,126',
  sweat: '#9fd8ff',
  zzz: '#5e6fe0',
  night: '#0c1a52',
};

const EYE = { x: 224, y: 208, rx: 112, ry: 130 };
const MOUTH = { x: 500, y: 384, halfW: 118, depth: 34, gap: 100 };
const INK = { eye: 11, lid: 14, mouth: 14, brow: 9 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function drawFace(ctx, s, width, height) {
  ctx.save();
  ctx.fillStyle = COLOR.skin;
  ctx.fillRect(0, 0, width, height);
  // the head: lighter in the middle, a darker rim
  const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.hypot(width, height) * 0.56);
  g.addColorStop(0, COLOR.skin);
  g.addColorStop(0.62, COLOR.skin);
  g.addColorStop(1, COLOR.skinEdge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  const k = Math.min(width / W, height / H);
  ctx.translate(width / 2, height / 2);
  ctx.scale(k, k);
  ctx.translate(-W / 2, -H / 2);

  // the whole face: breathing, nodding, shaking
  ctx.save();
  ctx.translate(W / 2 + s.dx, H / 2 + s.dy);
  ctx.rotate(s.rot);
  ctx.scale(s.scale, s.scale);
  ctx.translate(-W / 2, -H / 2);

  // the hand redraws the lines a little differently three times a second, as in an animated drawing
  const boil = Math.floor(s.time * 3) % 3;
  eye(ctx, s, -1, boil);
  eye(ctx, s, 1, boil);
  brow(ctx, s, -1);
  brow(ctx, s, 1);
  cheeks(ctx, s);
  mouth(ctx, s, boil);
  sweat(ctx, s);
  ctx.restore();

  night(ctx, s, width, height);
  ctx.restore();
  // the sleeper's Zs are in screen space, not on the face
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(k, k);
  ctx.translate(-W / 2, -H / 2);
  zzz(ctx, s);
  ctx.restore();
}

// ---- the eyes ---------------------------------------------------------------------------------------------

// The outline of an eye at angle t: an egg, a little uneven, the same every frame except for the
// boil. `side` makes the two eyes different, because a person does not draw two identical ones.
function eyePoint(t, rx, ry, side, boil) {
  const ph = side * 1.7 + boil * 0.9;
  const wob = 1 + 0.018 * Math.sin(3 * t + ph) + 0.011 * Math.sin(5 * t - ph * 1.3) + 0.006 * Math.sin(9 * t + ph);
  const c = Math.cos(t), sn = Math.sin(t);
  // a bit squarer than an ellipse, and fuller at the bottom
  const px = Math.sign(c) * Math.pow(Math.abs(c), 0.9) * rx * wob;
  const py = Math.sign(sn) * Math.pow(Math.abs(sn), 0.92) * ry * wob * (sn > 0 ? 1.03 : 0.97);
  return [px, py];
}

function eyeOutline(rx, ry, side, boil, n = 72) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(eyePoint((i / n) * Math.PI * 2, rx, ry, side, boil));
  return pts;
}

function tracePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// side: -1 the eye on the left of the screen, 1 the one on the right.
function eye(ctx, s, side, boil) {
  const cx = W / 2 + side * EYE.x;
  const cy = EYE.y;
  const rx = EYE.rx * s.eyeW;
  const ry = EYE.ry * s.eyeH;
  const inner = -side;                                   // the direction of the nose, in x
  const shape = eyeOutline(rx, ry, side, boil);

  ctx.save();
  ctx.translate(cx, cy);

  // a soft shadow under the eye gives the drawing some depth
  ctx.fillStyle = COLOR.skinShade;
  ctx.globalAlpha = 1 - smooth(0.4, 0.9, s.lid);
  ctx.beginPath();
  ctx.ellipse(4, ry * 0.12 + 12, rx + 8, ry + 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const lidY = (x) => -ry - 8 + s.lid * (2 * ry + 16) + s.lidTilt * 50 * ((x * inner) / rx);
  const Rr = rx * 1.3;
  const squintTop = s.squint * ry * 1.4;                 // how far the lower lid has come up
  const squintTopY = (x) => ry - squintTop + Rr - Math.sqrt(Math.max(0, Rr * Rr - x * x));
  const squinting = s.squint > 0.01;

  ctx.save();
  tracePath(ctx, shape);
  ctx.clip();
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(-rx - 8, -ry - 8, 2 * rx + 16, 2 * ry + 16);

  // the iris: big, with a dark ring, the pupil, and the two lights that make a drawn eye alive
  const R = 70 * s.pupil * Math.min(s.eyeW, s.eyeH);
  const px = clamp(s.gazeX, -1.1, 1.1) * (rx - R * 0.72);
  const py = clamp(s.gazeY, -1.1, 1.1) * (ry - R * 0.72);
  const ig = ctx.createRadialGradient(px - R * 0.15, py - R * 0.3, R * 0.1, px, py, R);
  ig.addColorStop(0, COLOR.iris1);
  ig.addColorStop(1, COLOR.iris2);
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.arc(px, py, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  ctx.fillStyle = COLOR.ink;
  ctx.beginPath();
  ctx.arc(px, py, R * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(px - R * 0.34, py - R * 0.36, R * 0.24, R * 0.28, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + R * 0.3, py + R * 0.34, R * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // the upper lid: skin, with a thick edge, lower and tilted as the mood wants
  const reach = rx + 16;
  ctx.fillStyle = COLOR.skin;
  ctx.beginPath();
  ctx.moveTo(-reach, -ry - 90);
  ctx.lineTo(reach, -ry - 90);
  ctx.lineTo(reach, lidY(reach));
  ctx.lineTo(-reach, lidY(-reach));
  ctx.closePath();
  ctx.fill();
  if ((s.lid > 0.03 || Math.abs(s.lidTilt) > 0.03) && s.lid < 0.97) {
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = INK.lid;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-reach, lidY(-reach));
    ctx.lineTo(reach, lidY(reach));
    ctx.stroke();
  }

  // the lower lid pushed up by a smile: a big disc whose top is the new bottom of the eye
  if (squinting) {
    ctx.fillStyle = COLOR.skin;
    ctx.beginPath();
    ctx.arc(0, ry - squintTop + Rr, Rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = INK.lid;
    ctx.stroke();
  }
  ctx.restore();

  // the outline, where it is not hidden by a lid
  ctx.strokeStyle = COLOR.ink;
  ctx.lineWidth = INK.eye;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const closed = smooth(0.8, 0.98, s.lid);
  if (closed < 1) {
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        ctx.beginPath();
        run.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      run = [];
    };
    // walk the outline twice over so that a run that crosses the start is not cut in two
    const n = shape.length;
    for (let i = 0; i <= n * 2; i++) {
      const [x, y] = shape[i % n];
      const hidden = y < lidY(x) - 1 || (squinting && y > squintTopY(x) + 1);
      if (hidden) flush(); else run.push([x, y]);
    }
    flush();
  }

  // closed: the lid is a line, curved like a sleeping eye, with a lash at the outer end
  if (closed > 0.01) {
    ctx.globalAlpha = closed;
    ctx.lineWidth = INK.lid + 2;
    const y0 = ry * 0.05;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.82, y0 - 4);
    ctx.quadraticCurveTo(0, y0 + 46, rx * 0.82, y0 - 4);
    ctx.stroke();
    ctx.lineWidth = 8;
    const outer = -inner;                                 // the side of the ear
    ctx.beginPath();
    ctx.moveTo(outer * rx * 0.82, y0 - 4);
    ctx.lineTo(outer * (rx * 0.82 + 24), y0 - 24);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ---- brows ---------------------------------------------------------------------------------------------------

// A brow is a solid shape, thick at the inner end and thin at the outer one, a little arched.
function brow(ctx, s, side) {
  const cx = W / 2 + side * EYE.x;
  const inner = -side;
  const y = Math.max(40, EYE.y - EYE.ry * s.eyeH - 46 - s.browRaise * 30);       // raised brows stay on the screen
  const half = 90;
  const drop = s.browTilt * 32;                           // positive: the inner end is lower
  const ax = cx - inner * half, ay = y - drop;            // the outer end
  const bx = cx + inner * half, by = y + drop;            // the inner end
  const arch = -16 - s.browRaise * 8 + Math.abs(s.browTilt) * 4;
  const n = 14;
  const top = [], bottom = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const yy = ay + (by - ay) * t + arch * 4 * t * (1 - t);
    const w = 6 + 14 * Math.pow(t, 0.8);                  // half thickness
    top.push([x, yy - w]);
    bottom.push([x, yy + w]);
  }
  ctx.fillStyle = COLOR.ink;
  ctx.strokeStyle = COLOR.ink;
  ctx.lineJoin = 'round';
  ctx.lineWidth = INK.brow;
  ctx.beginPath();
  top.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
  for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function cheeks(ctx, s) {
  if (s.blush < 0.02) return;
  for (const side of [-1, 1]) {
    const x = W / 2 + side * (EYE.x + 40), y = EYE.y + EYE.ry * s.eyeH + 30;
    const g = ctx.createRadialGradient(x, y, 4, x, y, 64);
    g.addColorStop(0, `rgba(${COLOR.blush},${0.75 * s.blush})`);
    g.addColorStop(1, `rgba(${COLOR.blush},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 66, 38, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- the mouth ---------------------------------------------------------------------------------------------

// The outline of the mouth: a parabola whose corners rise with the smile, and a lower lip that falls
// away from it by the opening.
function mouthLine(s, n, boil) {
  const halfW = MOUTH.halfW * s.width;
  const c = s.smile * MOUTH.depth;
  const gap = s.open * MOUTH.gap;
  const upper = [], lower = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * 2 - 1;
    let y = c * (1 - 2 * u * u) + 1.6 * Math.sin(u * 5 + boil * 2.1);
    if (s.wobble > 0.01) y += s.wobble * 5 * Math.sin(u * 15 + s.time * 38);
    const g = gap * Math.pow(1 - u * u, 0.75) * (1 + (s.wobble > 0.01 ? 0.08 * s.wobble * Math.sin(u * 11 - s.time * 31) : 0));
    upper.push([MOUTH.x + u * halfW, MOUTH.y + y]);
    lower.push([MOUTH.x + u * halfW, MOUTH.y + y + g]);
  }
  return { upper, lower, gap, halfW };
}

function mouth(ctx, s, boil) {
  const { upper, lower, gap, halfW } = mouthLine(s, 30, boil);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = COLOR.ink;
  if (gap > 4) {
    ctx.save();
    ctx.beginPath();
    upper.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i][0], lower[i][1]);
    ctx.closePath();
    const mg = ctx.createLinearGradient(0, upper[15][1], 0, lower[15][1]);
    mg.addColorStop(0, COLOR.mouthDeep);
    mg.addColorStop(1, COLOR.mouthIn);
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.clip();
    // the tongue, in a smile
    if (gap > 26 && s.smile > -0.2) {
      const tw = halfW * 0.5, th = gap * 0.52;
      ctx.fillStyle = COLOR.tongue;
      ctx.beginPath();
      ctx.ellipse(MOUTH.x, lower[15][1] + 8, tw, th, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLOR.tongueLine;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(MOUTH.x, lower[15][1] - th * 0.5);
      ctx.lineTo(MOUTH.x, lower[15][1] - th * 0.1);
      ctx.stroke();
    }
    // the upper teeth: one white band under the upper lip, cut into teeth by thin lines
    if (gap > 14 && s.smile > -0.6) {
      const th = clamp(gap * 0.3, 8, 30);
      ctx.fillStyle = COLOR.teeth;
      ctx.beginPath();
      upper.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = upper.length - 1; i >= 0; i--) ctx.lineTo(upper[i][0], upper[i][1] + th * Math.pow(1 - Math.pow((i / 30) * 2 - 1, 2), 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COLOR.ink;
      ctx.lineWidth = 3;
      for (const f of [-0.5, 0, 0.5]) {
        const i = Math.round(((f + 1) / 2) * 30);
        ctx.beginPath();
        ctx.moveTo(upper[i][0], upper[i][1]);
        ctx.lineTo(upper[i][0], upper[i][1] + th);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.strokeStyle = COLOR.ink;
  ctx.lineWidth = INK.mouth;
  const lines = gap > 4 ? [upper, lower] : [upper];
  for (const line of lines) {
    ctx.beginPath();
    line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  if (gap > 4) {                                          // close the lips at the corners
    ctx.beginPath();
    ctx.moveTo(upper[0][0], upper[0][1]); ctx.lineTo(lower[0][0], lower[0][1]);
    ctx.moveTo(upper.at(-1)[0], upper.at(-1)[1]); ctx.lineTo(lower.at(-1)[0], lower.at(-1)[1]);
    ctx.stroke();
  }
  // a smile has dimples: a small curve outside each corner
  if (s.smile > 0.45) {
    ctx.lineWidth = 8;
    for (const [pt, d] of [[upper[0], -1], [upper.at(-1), 1]]) {
      ctx.beginPath();
      ctx.moveTo(pt[0] + d * 14, pt[1] + 4);
      ctx.quadraticCurveTo(pt[0] + d * 30, pt[1] - 10, pt[0] + d * 18, pt[1] - 26);
      ctx.stroke();
    }
  }
}

// ---- extras --------------------------------------------------------------------------------------------------

function sweat(ctx, s) {
  if (s.sweat < 0.02) return;
  const slide = (s.time * 26) % 70;
  const x = W / 2 + EYE.x + 86;
  const y = 70 + slide * 0.5;
  ctx.globalAlpha = s.sweat * (1 - slide / 95);
  ctx.beginPath();
  ctx.moveTo(x, y - 38);
  ctx.bezierCurveTo(x + 28, y - 4, x + 28, y + 26, x, y + 26);
  ctx.bezierCurveTo(x - 28, y + 26, x - 28, y - 4, x, y - 38);
  ctx.fillStyle = COLOR.sweat;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = COLOR.ink;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(x - 9, y + 4, 5, 10, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// A sleeping robot is a dim one: the whole picture goes to a night colour.
function night(ctx, s, width, height) {
  const a = clamp(s.zzz, 0, 1);
  if (a < 0.02) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);                    // the whole canvas, whatever the scale of the drawing
  ctx.globalAlpha = 0.62 * a;
  ctx.fillStyle = COLOR.night;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function zzz(ctx, s) {
  if (s.zzz < 0.02) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const phase = (s.time * 0.45 + i / 3) % 1;
    const x = 790 + phase * 90;
    const y = 150 - phase * 110;
    ctx.globalAlpha = s.zzz * Math.sin(Math.PI * phase);
    ctx.font = `900 ${36 + phase * 44}px "Nunito", system-ui, sans-serif`;
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#fffdf4';
    ctx.strokeText('Z', x, y);
    ctx.fillStyle = COLOR.zzz;
    ctx.fillText('Z', x, y);
  }
  ctx.globalAlpha = 1;
}
