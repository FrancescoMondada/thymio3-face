// The face as a set of numbers that move: no drawing here (see draw.js), no DOM, so tests can run it.
//
// Every number follows its target like a heavy object on a spring that does not bounce (critically
// damped), which is what makes a change of mood look like a face and not like a slideshow. A mood is
// a table of targets; looking, blinking, speaking, nodding and shaking come on top of it.

// ---- the numbers -------------------------------------------------------------------------------------
// lid        0 open .. 1 closed (the upper lid)
// lidTilt    -1 sad (outer ends low) .. 1 angry (inner ends low)
// squint     0 .. 1, the lower lid pushes up: a smiling eye
// eyeW, eyeH size of the eyes; pupil: size of the iris
// browRaise  -1 low .. 1 high; browTilt: -1 worried (inner ends up) .. 1 angry
// smile      -1 frown .. 1 big smile; open: 0 closed .. 1 wide open; width of the mouth; wobble: a trembling mouth
// blush, sweat, zzz: little extras, 0 .. 1
// dy, dx, rot, scale: the whole face (breathing, nodding, shaking)
const BASE = {
  lid: 0, lidTilt: 0, squint: 0, eyeW: 1, eyeH: 1, pupil: 1,
  browRaise: 0, browTilt: 0,
  smile: 0.25, open: 0, width: 1, wobble: 0,
  blush: 0, sweat: 0, zzz: 0,
  dx: 0, dy: 0, rot: 0, scale: 1,
};

const mood = (o) => ({ ...BASE, ...o });

export const MOODS = {
  sleep: mood({ lid: 1, smile: 0.2, zzz: 1, dy: 14, scale: 0.97, browRaise: -0.2 }),
  sleepy: mood({ lid: 0.62, smile: 0.1, browRaise: -0.25, dy: 6, eyeH: 0.92 }),
  wake: mood({ lid: 0.3, smile: 0.2, eyeH: 0.96 }),
  neutral: mood({}),
  curious: mood({ eyeW: 1.05, eyeH: 1.08, browRaise: 0.45, smile: 0.2, pupil: 1.05 }),
  happy: mood({ squint: 0.3, smile: 0.85, open: 0.12, blush: 0.55, browRaise: 0.25, pupil: 1.1 }),
  excited: mood({ eyeW: 1.12, eyeH: 1.15, pupil: 1.15, smile: 1, open: 0.55, blush: 0.75, browRaise: 0.7, squint: 0.1 }),
  sad: mood({ lid: 0.28, lidTilt: -0.7, browTilt: -0.85, browRaise: 0.1, smile: -0.75, open: 0, pupil: 1.05, dy: 8 }),
  scared: mood({ eyeW: 1.18, eyeH: 1.3, pupil: 0.5, browRaise: 0.95, browTilt: -0.95, smile: -0.5, open: 0.6, wobble: 1, sweat: 1 }),
  relieved: mood({ lid: 0.34, squint: 0.2, smile: 0.6, open: 0.18, browRaise: 0.15, browTilt: -0.35, sweat: 0.7, blush: 0.25 }),
  thinking: mood({ browRaise: 0.5, browTilt: -0.2, smile: 0.05, eyeH: 1.04 }),
  laugh: mood({ squint: 0.8, smile: 1, open: 0.75, blush: 0.95, browRaise: 0.55, pupil: 1.1, width: 1.08 }),
};

export const PARAMS = Object.keys(BASE);

// Seconds a parameter takes to settle (SmoothDamp's smoothTime): the lids are quick, the face is slow.
const SETTLE = { lid: 0.07, squint: 0.1, open: 0.06, wobble: 0.12, dx: 0.05, dy: 0.05, rot: 0.06, scale: 0.15, sweat: 0.4, zzz: 0.5, blush: 0.3 };
const settleOf = (k) => SETTLE[k] ?? 0.18;

// Unity's SmoothDamp: a critically damped spring that does not overshoot a target that stays put.
function damp(cur, target, vel, smooth, dt) {
  const omega = 2 / Math.max(smooth, 1e-4);
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  const nv = (vel - omega * temp) * e;
  return [target + (change + temp) * e, nv];
}

export class Face {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.mood = 'sleep';
    this.target = { ...MOODS.sleep };
    this.p = { ...MOODS.sleep };                        // what is drawn (before the gestures)
    this.vel = Object.fromEntries(PARAMS.map((k) => [k, 0]));
    this.gaze = { x: 0, y: 0 };
    this.gazeTarget = { x: 0, y: 0 };
    this.gazeVel = { x: 0, y: 0 };
    this.saccade = { x: 0, y: 0 };
    this.awake = false;
    this.speaking = false;
    this.mouthLevel = 0;
    this.anim = null;                                   // a nod or a shake in progress
    this.blinkAt = 3;
    this.blinkT = -1;
    this.saccadeAt = 1.5;
    this.time = 0;
  }

  // ---- what the story asks for ----------------------------------------------------------------
  setMood(name) {
    if (!MOODS[name]) throw new Error(`unknown mood "${name}"`);
    this.mood = name;
    this.target = { ...MOODS[name] };
    this.awake = name !== 'sleep';
  }

  // Where the eyes look, in screen coordinates (-1 left .. 1 right, -1 up .. 1 down).
  lookAt(x, y) {
    this.gazeTarget.x = Math.max(-1, Math.min(1, x));
    this.gazeTarget.y = Math.max(-1, Math.min(1, y));
  }

  setSpeaking(on) { this.speaking = Boolean(on); }

  nod() { this.anim = { kind: 'nod', t: 0, dur: 1.05 }; }
  shake() { this.anim = { kind: 'shake', t: 0, dur: 1.1 }; }
  giggle() { this.anim = { kind: 'giggle', t: 0, dur: 2.2 }; }
  blink() { this.blinkT = 0; }

  // ---- time -------------------------------------------------------------------------------------
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    for (const k of PARAMS) {
      const [v, nv] = damp(this.p[k], this.target[k], this.vel[k], settleOf(k), dt);
      this.p[k] = v;
      this.vel[k] = nv;
    }
    this.updateEyes(dt);
    this.updateGestures(dt);
    // the mouth moves while it speaks: an envelope that rises and falls a few times a second
    const talk = this.speaking ? 0.5 + 0.5 * Math.sin(this.time * 17.0 + 1.7 * Math.sin(this.time * 5.3)) : 0;
    const wanted = this.speaking ? 0.12 + 0.5 * talk * (0.6 + 0.4 * Math.sin(this.time * 3.1)) : 0;
    const k = 1 - Math.exp(-dt * (this.speaking ? 22 : 12));
    this.mouthLevel += (wanted - this.mouthLevel) * k;
  }

  updateEyes(dt) {
    // gaze follows its target quickly; small jumps (saccades) keep an awake face alive
    if (this.awake && this.time >= this.saccadeAt) {
      this.saccade = { x: (this.rng() - 0.5) * 0.14, y: (this.rng() - 0.5) * 0.1 };
      this.saccadeAt = this.time + 0.8 + this.rng() * 2.4;
    }
    if (!this.awake) this.saccade = { x: 0, y: 0 };
    for (const a of ['x', 'y']) {
      const want = this.gazeTarget[a] + this.saccade[a];
      const [v, nv] = damp(this.gaze[a], want, this.gazeVel[a], 0.07, dt);
      this.gaze[a] = v;
      this.gazeVel[a] = nv;
    }
    // blinking
    if (this.awake && this.blinkT < 0 && this.time >= this.blinkAt) this.blinkT = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT >= 0.2) {
        this.blinkT = -1;
        this.blinkAt = this.time + 2.2 + this.rng() * 4.2;
      }
    }
  }

  updateGestures(dt) {
    this.gx = { dx: 0, dy: 0, rot: 0, gazeX: 0, gazeY: 0, lid: 0, scale: 0 };
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const u = a.t / a.dur;
    if (u >= 1) { this.anim = null; return; }
    if (a.kind === 'nod') {
      const s = Math.sin(2 * Math.PI * 2.1 * u) * (1 - u);
      this.gx.dy = 40 * s;
      this.gx.gazeY = 0.5 * s;
      this.gx.scale = 0.02 * s;
      this.gx.lid = 0.12 * Math.max(0, s);
    } else if (a.kind === 'giggle') {
      // a laugh that shakes: quick small bounces, a little tilt, dying away
      const env = Math.min(1, u * 8) * Math.pow(1 - u, 0.6);
      const s = Math.sin(2 * Math.PI * 7 * a.t);
      this.gx.dy = 11 * s * env;
      this.gx.rot = 0.035 * Math.sin(2 * Math.PI * 3.5 * a.t) * env;
      this.gx.scale = 0.012 * s * env;
    } else {
      const env = Math.pow(1 - u, 0.7);
      const s = Math.sin(2 * Math.PI * 2.4 * u) * env;
      this.gx.dx = 52 * s;
      this.gx.rot = 0.07 * s;
      this.gx.gazeX = 0.55 * s;
      this.gx.scale = -0.02 * Math.abs(s);
    }
  }

  // The numbers to draw now.
  get state() {
    const g = this.gx || { dx: 0, dy: 0, rot: 0, gazeX: 0, gazeY: 0, lid: 0, scale: 0 };
    const p = this.p;
    const blink = this.blinkT >= 0 ? Math.sin((Math.PI * this.blinkT) / 0.2) : 0;
    const breath = Math.sin((this.time * 2 * Math.PI) / (this.mood === 'sleep' ? 4.2 : 5.5));
    const breathAmp = this.mood === 'sleep' ? 1 : 0.35;
    const open = Math.min(0.9, Math.max(0, p.open + this.mouthLevel));
    return {
      ...p,
      lid: Math.min(1, Math.max(p.lid, blink) + g.lid),
      open,
      gazeX: this.gaze.x + g.gazeX,
      gazeY: this.gaze.y + g.gazeY,
      dx: p.dx + g.dx,
      dy: p.dy + g.dy + breath * 3 * breathAmp,
      rot: p.rot + g.rot,
      scale: p.scale + g.scale + breath * 0.006 * breathAmp,
      time: this.time,
    };
  }
}
