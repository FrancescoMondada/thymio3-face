import { GestureDetector } from '../vision/gesture.js';
import { Aim } from '../robot/aim.js';
import { textsFor } from './texts.js';

// The robot's behaviour: asleep until a face appears, then the introduction and the demonstration,
// then asleep again. It does not know how a face is found, how the robot is driven or how it speaks:
// those are handed in, so the whole story can be run in a test on a clock that is only a number.
//
//   face   (face/face.js)     setMood, lookAt, setSpeaking, nod, shake, giggle
//   robot  (robot/actions.js) stop, step, shakeBody, prepareHand, prepareEdge, prepareBack, abort
//   speech (speech.js)        speak(text, { onStart }) -> Promise, cancel()
//   clock                     now() in ms, sleep(ms) -> Promise
//
// What it is told, from the camera, many times a second: observe({ present, cx, cy, yaw, pitch }).

export const BRAIN = {
  wakeMs: 600,              // a face that stays this long wakes the robot (a passing one does not)
  gapMs: 300,               // a face that is missing for less than this is still there
  lostMs: 10000,            // no face for this long: the robot goes back to sleep
  absentMs: 3000,           // after a demonstration, nobody for this long before the next face wakes it
  rearmMs: 30000,           // ... or, with the same person still there, this long after it went to sleep
  answerMs: 9000,           // the time given to answer with the head
  moveStartMs: 2200,        // the robot starts to move this long into the sentence about the ground sensors
  bodyGestures: true,       // "no" also turns the robot's body from side to side
};

class Cancelled extends Error {}
export { Cancelled };

// One go through the story. Cancelling it ends every wait in it.
class Run {
  constructor() {
    this.cancelled = false;
    this.cancelled$ = new Promise((resolve) => { this.cancel = () => { this.cancelled = true; resolve(); }; });
  }
}

const quiet = (p) => { p.catch(() => {}); return p; };

export class Brain {
  constructor({ lang = 'fr', face, robot, speech, clock, config = {}, onState, log }) {
    this.cfg = { ...BRAIN, ...config };
    this.T = textsFor(lang);
    this.face = face;
    this.robot = robot;
    this.speech = speech;
    this.clock = clock;
    this.onState = onState;
    this.log = log || (() => {});
    this.aim = new Aim(config.aim);
    this.detector = new GestureDetector(config.gesture);
    this.phase = 'stopped';                   // 'asleep' | 'awake' | 'stopped'
    this.stepName = '';
    this.run = null;
    this.lastSeen = -Infinity;
    this.sleptAt = -Infinity;
    this.presentSince = null;
    this.absentSince = null;
    this.needAbsence = false;
    this.listening = false;
    this.onAnswer = null;
    this.hold = 0;                            // > 0: the robot must not turn to follow the face
    this.protected = 0;                       // > 0: a move on the robot is running; losing the face does not stop the story
    this.gazeLocked = false;
    this.bodyBusy = null;
    this.last = null;
    this.answer = null;
  }

  // ---- state --------------------------------------------------------------------------------------------------
  get canTrack() { return this.phase === 'awake' && !this.listening && this.hold === 0; }

  step(name) { this.stepName = name; this.log('info', `story: ${name}`); this.emit(); }

  emit() {
    this.onState?.({
      phase: this.phase,
      step: this.stepName,
      listening: this.listening,
      swings: this.detector.swings,
      answer: this.answer,
      lostFor: this.phase === 'awake' && Number.isFinite(this.lastSeen) ? Math.round(this.clock.now() - this.lastSeen) : 0,
    });
  }

  // ---- start and stop -----------------------------------------------------------------------------------------------
  start() {
    this.toSleep({ needAbsence: false });
  }

  // For good: the page goes back to the start screen, or closes.
  async stop() {
    const run = this.run;
    this.phase = 'stopped';
    this.run = null;
    this.listening = false;
    run?.cancel();
    this.speech.cancel();
    this.face.setSpeaking(false);
    await this.robot.abort();
    this.emit();
  }

  toSleep({ needAbsence = true } = {}) {
    this.run = null;
    this.phase = 'asleep';
    this.listening = false;
    this.onAnswer = null;
    this.hold = 0;
    this.protected = 0;
    this.gazeLocked = false;
    this.stepName = 'asleep';
    this.needAbsence = needAbsence;
    this.sleptAt = this.clock.now();
    this.face.setSpeaking(false);
    this.face.lookAt(0, 0);
    this.face.setMood('sleep');
    this.robot.stop();
    this.emit();
  }

  wake() {
    this.phase = 'awake';
    this.needAbsence = false;
    this.lastSeen = this.clock.now();
    this.hold = 0;
    this.protected = 0;
    this.answer = null;
    this.aim.reset();
    this.detector.reset();
    const run = new Run();
    this.run = run;
    this.story(run).catch((err) => {
      if (err instanceof Cancelled) return;
      this.log('err', `story: ${err?.stack || err}`);
      if (this.run === run) { this.speech.cancel(); this.toSleep(); }
    });
  }

  // Nobody for too long, in the middle of the story: it stops where it is.
  giveUp() {
    this.log('info', 'story: nobody there any more');
    const run = this.run;
    this.run = null;
    run?.cancel();
    this.speech.cancel();
    this.toSleep();
  }

  // ---- what the camera says ----------------------------------------------------------------------------------------------
  observe(obs) {
    if (this.phase === 'stopped') return;
    const t = this.clock.now();
    this.last = obs;
    if (obs.present) {
      this.lastSeen = t;
      this.absentSince = null;
      if (this.presentSince === null) this.presentSince = t;
    } else {
      if (this.absentSince === null) this.absentSince = t;
      if (t - this.absentSince >= this.cfg.gapMs) this.presentSince = null;
    }

    if (this.phase === 'asleep') {
      this.checkAbsence(t);
      if (!this.needAbsence && obs.present && this.presentSince !== null && t - this.presentSince >= this.cfg.wakeMs) this.wake();
      return;
    }

    if (!obs.present) return;
    if (!this.gazeLocked) this.face.lookAt(-(obs.cx - 0.5) * 2.2, (obs.cy - 0.5) * 1.6);
    if (this.listening) {
      const verdict = this.detector.push(t, obs.yaw, obs.pitch);
      if (verdict) {
        this.answer = verdict;
        if (verdict === 'yes') this.face.nod(); else this.face.shake();
        this.onAnswer?.(verdict);
      }
    } else if (this.canTrack) {
      const step = this.aim.update(t, obs.cx, t);
      if (step) this.robot.step(step);
    }
  }

  // After a demonstration the robot does not start again at once for the person who is still in front of
  // it. It can, when that person has gone and a face comes back (3 s without one), or when it has slept
  // long enough (30 s): then a face that is there wakes it, even the same one.
  checkAbsence(t) {
    if (!this.needAbsence) return;
    if (t - this.lastSeen >= this.cfg.absentMs || t - this.sleptAt >= this.cfg.rearmMs) this.needAbsence = false;
  }

  // Several times a second, camera or not: the rules about time.
  tick() {
    if (this.phase === 'stopped') return;
    const t = this.clock.now();
    if (this.phase === 'asleep') { this.checkAbsence(t); return; }
    if (this.protected === 0 && this.run && t - this.lastSeen > this.cfg.lostMs) this.giveUp();
    this.emit();
  }

  // ---- the story, step by step ------------------------------------------------------------------------------------------------
  guard(run) { if (run.cancelled || this.run !== run) throw new Cancelled(); }

  // Wait for a promise, or for the story to be cancelled (then throw).
  async race(run, promise) {
    await Promise.race([promise, run.cancelled$]);
    this.guard(run);
  }

  pause(run, ms) { return this.race(run, this.clock.sleep(ms)); }

  // What a sentence does besides sounding: nodding for "yes", shaking for "no".
  gesture(run, kind) {
    if (kind === 'nod') this.face.nod();
    if (kind === 'shake') {
      this.face.shake();
      if (this.cfg.bodyGestures) {
        this.bodyBusy = this.bodyShake(run).catch((err) => this.log('err', `story: the body gesture failed: ${err?.message || err}`));
      }
    }
  }

  async bodyShake(run) {
    this.hold++;
    try {
      this.robot.stop();
      await this.robot.shakeBody({ stopped: () => run.cancelled });
    } finally {
      this.hold--;
      this.aim.reset();
      this.aim.until = this.clock.now() + 600;       // the camera has moved with the robot: let it see the face again first
    }
  }

  // A sentence: its segments one after the other, the mouth moving while the voice goes. `mood` is the
  // face that goes with it: it changes at the very moment the voice starts, not before (a voice takes a
  // moment to begin, and an expression that came first would leave the face waiting for the words).
  async say(run, segments, { mood } = {}) {
    let first = true;
    for (const seg of segments) {
      this.guard(run);
      const spoken = new Promise((resolve) => {
        this.face.setSpeaking(true);
        const done = () => { this.face.setSpeaking(false); resolve(); };
        const onStart = () => {
          if (first) { first = false; if (mood) this.face.setMood(mood); }
          this.gesture(run, seg.gesture);
        };
        // a voice that fails must not stop the story
        let said;
        try { said = this.speech.speak(seg.say, { onStart }); } catch (err) { this.log('err', `voice: ${err?.message || err}`); onStart(); said = Promise.resolve(); }
        said.then(done, (err) => { this.log('err', `voice: ${err?.message || err}`); done(); });
      });
      try {
        await this.race(run, spoken);
      } catch (err) {
        this.speech.cancel();
        this.face.setSpeaking(false);
        throw err;
      }
    }
  }

  // Wait for an answer given with the head: 'yes', 'no', or 'none' when the time is up.
  async listen(run, ms) {
    if (this.bodyBusy) { await this.race(run, this.bodyBusy); this.bodyBusy = null; }
    this.guard(run);
    this.face.setMood('thinking');
    this.robot.stop();
    this.detector.reset();
    this.answer = null;
    this.listening = true;
    this.step('listening');
    const answer = await new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; this.onAnswer = null; resolve(v); };
      this.onAnswer = finish;
      this.clock.sleep(ms).then(() => finish('none'));
      run.cancelled$.then(() => finish('none'));
    });
    this.listening = false;
    this.aim.reset();
    this.aim.until = this.clock.now() + 600;
    this.guard(run);
    return answer;
  }

  async story(run) {
    const T = this.T, face = this.face, robot = this.robot;

    this.step('wake');
    face.setMood('wake');
    await this.pause(run, 500);
    face.setMood('curious');
    face.blink?.();
    await this.pause(run, 450);

    this.step('ask');
    await this.say(run, T.intro);
    let answer = await this.listen(run, this.cfg.answerMs);
    if (answer === 'none') {
      this.step('ask again');
      await this.say(run, T.reprompt, { mood: 'curious' });
      answer = await this.listen(run, this.cfg.answerMs);
    }
    if (answer === 'none') { await this.goodnight(run, { sad: false }); return; }
    if (answer === 'no') {
      this.step('no');
      await this.say(run, T.no, { mood: 'sad' });
      await this.goodnight(run, { sad: true });
      return;
    }

    this.step('yes');
    const handScript = quiet(robot.prepareHand());
    await this.say(run, T.yes, { mood: 'excited' });

    // The front sensors, interactively: the script that waits for a hand is sent while the robot says
    // "Super"; it starts with the invitation, so that a hand that comes early is seen too.
    // No pause: "Voici" follows "Super" at once, and the face changes as the voice starts.
    this.step('front sensors');
    await this.handDemo(run, handScript);

    // The ground sensors: they stop the robot at the edge of the table. The script is sent while the
    // robot speaks, and starts during the second sentence.
    this.step('ground sensors');
    const edgeScript = quiet(robot.prepareEdge());
    await this.say(run, T.ground, { mood: 'curious' });
    this.step('table');
    const explaining = quiet(this.say(run, T.edgeIntro));
    await this.race(run, Promise.race([explaining, this.clock.sleep(this.cfg.moveStartMs)]));
    const found = await this.moveToTheEdge(run, edgeScript, explaining);

    if (found) {
      face.setMood('relieved');
      this.gazeLocked = false;
      await this.pause(run, 1000);
    } else {
      this.step('no edge');
      this.gazeLocked = false;
      await this.say(run, T.noEdge, { mood: 'thinking' });
      await this.pause(run, 400);
    }

    await this.say(run, T.bye, { mood: 'happy' });
    await this.goodnight(run, { sad: false });
  }

  // The front sensors: the robot asks for a hand and laughs when it feels one. The wait runs on the robot
  // (hand_sensor.py) and tells the story the moment the hand is there; the face laughs at once, the words
  // follow when the invitation is finished. No hand in the time given: it says so and goes on.
  async handDemo(run, handScript) {
    const face = this.face, robot = this.robot;
    this.hold++;
    this.protected++;
    try {
      const prepared = await this.race(run, handScript).then(() => handScript);
      robot.stop();
      let invited = null, laughing = null;
      const onEvent = (ev) => {
        if (ev.type !== 'hand' || laughing) return;
        this.log('info', `story: a hand, on sensor ${ev.sensor} (${ev.value}) after ${ev.ms} ms`);
        face.setMood('laugh');
        face.giggle();
        laughing = quiet((async () => {
          await invited;                                  // the invitation is finished first, if it is not yet
          await this.say(run, this.T.tickle, { mood: 'laugh' });
        })());
      };
      // the script starts with the invitation; the first thing the person hears is what to do
      const waiting = quiet(prepared.start(onEvent));
      invited = quiet(this.say(run, this.T.front, { mood: 'curious' }));
      await this.race(run, invited);
      this.step('waiting for a hand');
      const result = await this.race(run, waiting).then(() => waiting);
      this.log('info', `story: the wait for a hand ended with ${result.outcome}`);
      if (laughing) {
        await this.race(run, laughing);
        await this.pause(run, 250);
      } else {
        await this.say(run, this.T.noHand, { mood: 'happy' });
      }
    } catch (err) {
      if (err instanceof Cancelled) throw err;
      // the robot could not do it (the link, the script): the story goes on
      this.log('err', `story: the hand demonstration failed: ${err?.message || err}`);
    } finally {
      this.hold--;
      this.protected--;
      this.lastSeen = Math.max(this.lastSeen, this.clock.now() - (this.cfg.lostMs - 4000));
    }
  }

  // The walk to the edge, the fright and the step back. They run on the robot: the face being lost
  // meanwhile does not stop them. Returns true if the edge was found.
  async moveToTheEdge(run, edgeScript, explaining) {
    const face = this.face, robot = this.robot;
    this.hold++;
    this.protected++;
    let found = false;
    try {
      const prepared = await this.race(run, edgeScript).then(() => edgeScript);
      this.step('walking');
      face.lookAt(0, 0.45);
      this.gazeLocked = true;
      robot.stop();
      const result = await prepared.start();
      this.log('info', `story: the walk ended with ${result.outcome}`);
      await this.race(run, explaining);
      found = result.outcome === 'edge';
      if (found) {
        this.step('the edge');
        face.setMood('scared');
        face.lookAt(0, 1);
        const backScript = quiet(robot.prepareBack());
        const saying = quiet(this.say(run, this.T.edge));
        await this.pause(run, 700);
        const back = await backScript;
        this.step('backing');
        await back.start();
        await this.race(run, saying);
      }
    } catch (err) {
      if (err instanceof Cancelled) throw err;
      // the robot could not do it (the link, the script): the story goes on without the walk
      this.log('err', `story: the move failed: ${err?.message || err}`);
      found = false;
    } finally {
      this.hold--;
      this.protected--;
      this.lastSeen = Math.max(this.lastSeen, this.clock.now() - (this.cfg.lostMs - 4000));   // the walk was not watched: a few more seconds
    }
    return found;
  }

  async goodnight(run, { sad }) {
    this.step('sleep');
    this.face.setMood(sad ? 'sad' : 'sleepy');
    if (sad) { await this.pause(run, 700); this.face.setMood('sleepy'); }
    await this.pause(run, 1300);
    this.guard(run);
    this.toSleep();
  }
}
