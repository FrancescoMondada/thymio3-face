// A clock that is only a number, and fakes for what the story drives, so that the whole demonstration
// (a minute of the robot's life) runs in a few milliseconds.
import { Brain } from '../src/story/brain.js';
import { textsFor, plain } from '../src/story/texts.js';

const flush = () => new Promise((r) => setImmediate(r));

export class VirtualClock {
  constructor() { this.t = 0; this.timers = []; this.seq = 0; }
  now() { return this.t; }
  sleep(ms) { return new Promise((res) => this.timers.push({ at: this.t + ms, res, seq: this.seq++ })); }
  async advance(ms) {
    const end = this.t + ms;
    for (;;) {
      await flush();
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.timers.splice(this.timers.indexOf(due), 1);
      this.t = Math.max(this.t, due.at);
      due.res();
    }
    await flush();
    this.t = end;
  }
}

export class FakeFace {
  constructor(clock) { this.clock = clock; this.moods = []; this.calls = []; this.speaking = false; this.gaze = null; }
  setMood(m) { this.moods.push(m); this.calls.push(['mood', m, this.clock.now()]); }
  lookAt(x, y) { this.gaze = [x, y]; }
  setSpeaking(on) { this.speaking = on; }
  nod() { this.calls.push(['nod', this.clock.now()]); }
  shake() { this.calls.push(['shake', this.clock.now()]); }
  giggle() { this.calls.push(['giggle', this.clock.now()]); }
  blink() {}
  get mood() { return this.moods.at(-1); }
}

export class FakeSpeech {
  constructor(clock, msPerChar = 40) { this.clock = clock; this.said = []; this.msPerChar = msPerChar; this.pending = null; }
  speak(text, { onStart } = {}) {
    this.said.push({ text, t: this.clock.now() });
    onStart?.();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; if (this.pending === finish) this.pending = null; resolve(); } };
      this.pending = finish;
      this.clock.sleep(200 + text.length * this.msPerChar).then(finish);
    });
  }
  cancel() { this.pending?.(); }
}

export class FakeRobot {
  // hand: 'comes' (the hand arrives `handAfterMs` after the script starts), 'never', or 'fails' (the script cannot be sent)
  constructor(clock, { edge = 'edge', edgeFails = false, walkMs = 6000, backMs = 1100, hand = 'comes', handAfterMs = 6500, handWaitMs = 16000 } = {}) {
    this.clock = clock;
    this.log = [];
    this.opt = { edge, edgeFails, walkMs, backMs, hand, handAfterMs, handWaitMs };
    this.moving = false;
    this.steps = [];
    this.handEvents = [];
  }
  stop() { this.log.push('stop'); }
  step(s) { this.steps.push({ ...s, t: this.clock.now() }); }
  async shakeBody() { this.log.push('shakeBody'); await this.clock.sleep(1100); }
  async prepareHand() {
    this.log.push('prepareHand');
    if (this.opt.hand === 'fails') throw new Error('upload failed');
    return {
      start: async (onEvent) => {
        this.log.push('handStart');
        const t0 = this.clock.now();
        if (this.opt.hand === 'never') {
          await this.clock.sleep(this.opt.handWaitMs);
          this.log.push('handEnd');
          return { outcome: 'nohand', events: [] };
        }
        await this.clock.sleep(this.opt.handAfterMs);
        const ev = { type: 'hand', sensor: 2, value: 2600, ms: this.clock.now() - t0 };
        this.handEvents.push(ev);
        onEvent?.(ev);
        await this.clock.sleep(1500);                       // the script keeps the proximity LEDs on a moment
        this.log.push('handEnd');
        return { outcome: 'hand', events: [ev] };
      },
    };
  }
  async prepareEdge() {
    this.log.push('prepareEdge');
    if (this.opt.edgeFails) throw new Error('upload failed');
    return { start: async () => { this.log.push('walk'); this.moving = true; await this.clock.sleep(this.opt.walkMs); this.moving = false; this.log.push('walkEnd'); return { outcome: this.opt.edge, events: [] }; } };
  }
  async prepareBack() {
    this.log.push('prepareBack');
    return { start: async () => { this.log.push('back'); this.moving = true; await this.clock.sleep(this.opt.backMs); this.moving = false; return { outcome: 'backed', events: [] }; } };
  }
  async abort() { this.log.push('abort'); }
}

// A person: `faceAt(t)` says whether, and where, the face is; `head` is what it does with its head while the
// robot listens: 'yes' nods, 'no' shakes, null stays still.
export function makeWorld({ lang = 'fr', robotOpt, config, scenario } = {}) {
  const clock = new VirtualClock();
  const face = new FakeFace(clock);
  const speech = new FakeSpeech(clock);
  const robot = new FakeRobot(clock, robotOpt);
  const brain = new Brain({ lang, face, robot, speech, clock, config });
  const world = { clock, face, speech, robot, brain, T: textsFor(lang), person: { present: false, cx: 0.5, cy: 0.5, head: null, since: 0 } };
  world.states = [];
  brain.onState = (s) => world.states.push(s);
  // run `ms` of life, the camera at 20 frames a second and the timer at 4 a second
  world.run = async (ms) => {
    const end = clock.now() + ms;
    while (clock.now() < end) {
      await clock.advance(50);
      const p = world.person;
      if (scenario) scenario(clock.now(), p, brain);
      const s = (clock.now() - p.since) / 1000;
      let yaw = 0, pitch = 0;
      if (brain.listening && p.head === 'yes') pitch = 0.06 * Math.sin(2 * Math.PI * 1.6 * s);
      if (brain.listening && p.head === 'no') yaw = 0.06 * Math.sin(2 * Math.PI * 1.6 * s);
      brain.observe({ present: p.present, cx: p.cx, cy: p.cy, yaw, pitch });
      if (Math.round(clock.now() / 50) % 5 === 0) brain.tick();
    }
  };
  // run until it has been awake and is asleep again (the first demonstration), at most `max` ms
  world.runToSleep = async (max = 80000) => {
    let awake = false;
    const end = clock.now() + max;
    while (clock.now() < end) {
      await world.run(100);
      if (brain.phase === 'awake') awake = true;
      if (awake && brain.phase === 'asleep') return;
    }
  };
  world.said = () => speech.said.map((x) => x.text);
  return world;
}

export { plain };
