// Nod or shake? Read from the head's two signals, one sample per camera frame.
//
// The signals are the ones of pose.js: `pitch` moves when the head nods, `yaw` when it is shaken. Only
// their changes matter, never their value (a person looks a little to one side, or up), so each one
// is cut into swings: a swing is a move of at least `swing` from one extreme to the next, made in
// less than `maxSwingMs`. An answer is several swings of one signal in a short time (a nod is down,
// up, down: three swings) while the other signal hardly moves. Looking around slowly makes one slow
// swing, a tremor makes small ones, a head that circles moves both: none of them is an answer.

export const GESTURE = {
  swing: 0.035,         // minimum size of a swing, in the units of pose.js (about 7 degrees of the head)
  maxSwingMs: 900,      // a swing slower than this is looking around, not answering
  minSwings: 3,         // down-up-down
  windowMs: 2600,       // all the swings must fit in this time
  dominance: 1.8,       // the answering signal must move this many times more than the other one
  gapMs: 400,           // no sample for this long (face lost): start again
};

// Follows one signal and keeps its recent swings.
class Swings {
  constructor(opt) {
    this.opt = opt;
    this.reset();
  }

  reset() {
    this.dir = 0;                    // 0 = no direction yet, 1 = rising, -1 = falling
    this.lo = this.hi = 0;           // extremes seen while there is no direction
    this.loT = this.hiT = 0;
    this.started = false;
    this.prev = 0;                   // the extreme a swing starts from
    this.prevT = 0;
    this.ext = 0;                    // the extreme it is going to (so far)
    this.extT = 0;
    this.list = [];                  // finished swings: { t, amp }
  }

  push(t, v) {
    const { swing, maxSwingMs, windowMs } = this.opt;
    if (!this.started) {
      this.started = true;
      this.lo = this.hi = v;
      this.loT = this.hiT = t;
    } else if (this.dir === 0) {
      if (v < this.lo) { this.lo = v; this.loT = t; }
      if (v > this.hi) { this.hi = v; this.hiT = t; }
      if (v - this.lo >= swing) {                    // the first move: a swing from the lowest point
        this.dir = 1;
        this.prev = this.lo; this.prevT = this.loT;
        this.ext = v; this.extT = t;
      } else if (this.hi - v >= swing) {
        this.dir = -1;
        this.prev = this.hi; this.prevT = this.hiT;
        this.ext = v; this.extT = t;
      }
    } else if ((v - this.ext) * this.dir > 0) {
      this.ext = v; this.extT = t;                   // still going the same way
    } else if (Math.abs(v - this.ext) >= swing) {
      // it turns back by a swing: the move to the extreme is finished
      if (this.extT - this.prevT <= maxSwingMs) this.list.push({ t: this.extT, amp: Math.abs(this.ext - this.prev) });
      this.prev = this.ext; this.prevT = this.extT;
      this.ext = v; this.extT = t;
      this.dir = -this.dir;
    }
    while (this.list.length && t - this.list[0].t > windowMs) this.list.shift();
  }

  get count() { return this.list.length; }
  // How much the signal has moved: the finished swings and the one in progress. Counting the swing in
  // progress keeps a head that circles (the two signals are a quarter of a turn apart, so one of them
  // finishes its third swing first) from being taken for a shake or a nod.
  get total() {
    const going = this.dir === 0 ? 0 : Math.abs(this.ext - this.prev);
    return this.list.reduce((s, x) => s + x.amp, going);
  }
}

export class GestureDetector {
  constructor(opt = {}) {
    this.opt = { ...GESTURE, ...opt };
    this.pitch = new Swings(this.opt);
    this.yaw = new Swings(this.opt);
    this.lastT = null;
    this.result = null;
  }

  reset() {
    this.pitch.reset();
    this.yaw.reset();
    this.lastT = null;
    this.result = null;
  }

  // Add a sample; returns 'yes' or 'no' once, when the gesture is complete, else null.
  push(t, yaw, pitch) {
    if (this.result) return null;
    if (this.lastT !== null && t - this.lastT > this.opt.gapMs) { this.pitch.reset(); this.yaw.reset(); }
    this.lastT = t;
    this.pitch.push(t, pitch);
    this.yaw.push(t, yaw);
    const { minSwings, dominance } = this.opt;
    const np = this.pitch.count, ny = this.yaw.count;
    const tp = this.pitch.total, ty = this.yaw.total;
    let verdict = null;
    if (np >= minSwings && tp >= dominance * ty) verdict = 'yes';
    else if (ny >= minSwings && ty >= dominance * tp) verdict = 'no';
    if (verdict) this.result = verdict;
    return verdict;
  }

  // For the debug display.
  get swings() { return { pitch: this.pitch.count, yaw: this.yaw.count }; }
}
