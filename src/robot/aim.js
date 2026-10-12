// Keeping the face in front of the robot: a robot that turns in short steps.
//
// Between the moment a face is where the camera saw it and the moment the robot's wheels answer there
// are about 0.4 s (exposure, detection, Bluetooth). A robot that turns at a speed proportional to the
// error keeps turning for that long after it has arrived and swings around the face. So it turns in
// steps instead: look, turn for the time the angle needs (a little less), stop, wait for the camera
// to show the result, look again. Each step is a command { left, right, ms } for the wheels.
//
// Angles are in degrees, positive when the face is to the robot's right (the camera is not mirrored:
// a face in the right half of its image is to the right of the robot), and a turn to the right is the
// left wheel forward and the right wheel back.

export const WHEEL_UNIT_MM_S = 150 / 1.8 / 300;      // mm/s of a wheel per unit of speed (the factory 15 cm timer is 1.8 s at 300)
export const WHEEL_BASE_MM = 94;
// degrees per second the robot turns on the spot, per unit of wheel speed
export const DEG_S_PER_UNIT = ((2 * WHEEL_UNIT_MM_S) / WHEEL_BASE_MM) * (180 / Math.PI);

export const AIM = {
  hfov: 62,             // horizontal field of view of a front camera, degrees
  enter: 6,             // start turning when the face is further than this from the middle
  leave: 3.5,           // ... and stop caring when it is closer than this
  kp: 5,                // speed per degree of error
  minSpeed: 70,         // below this the wheels do not turn the robot
  maxSpeed: 190,
  share: 0.7,           // turn this part of the error in a step: the next look finishes the job
  minMs: 120,
  maxMs: 450,
  settleMs: 380,        // after a step: wait for the camera to see the result
  staleMs: 450,         // a face not seen for this long is not a reason to turn
};

export class Aim {
  constructor(opt = {}) {
    this.opt = { ...AIM, ...opt };
    this.flip = Boolean(this.opt.flip);           // a camera that mirrors its image
    this.reset();
  }

  reset() {
    this.until = 0;                   // no new step before this time (a step is running, or settling)
    this.holding = true;              // inside the dead zone: stay still until the error grows past `enter`
  }

  // The error in degrees from the face's place in the image (0..1, left to right).
  errorDeg(cx) {
    const e = (cx - 0.5) * this.opt.hfov;
    return this.flip ? -e : e;
  }

  // `t` ms, `cx` the face's x in the image, or null when it is not seen. Returns a step to run, or null.
  update(t, cx, seenAt = t) {
    if (cx == null || t - seenAt > this.opt.staleMs) return null;
    if (t < this.until) return null;
    const o = this.opt;
    const e = this.errorDeg(cx);
    const a = Math.abs(e);
    if (this.holding ? a < o.enter : a < o.leave) { this.holding = true; return null; }
    this.holding = false;
    const speed = Math.min(o.maxSpeed, Math.max(o.minSpeed, o.kp * a));
    const ms = Math.min(o.maxMs, Math.max(o.minMs, ((o.share * a) / (speed * DEG_S_PER_UNIT)) * 1000));
    this.until = t + ms + o.settleMs;
    const u = Math.sign(e) * Math.round(speed);
    return { left: u, right: -u, ms: Math.round(ms) };
  }
}
