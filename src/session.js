import { thymio, EVENTS, isFakeRobot, supportsBluetooth } from './api.js';
import { RobotLink } from './robot/link.js';
import { RobotActions } from './robot/actions.js';
import { edgeScript, backScript, handScript } from './script.js';
import { Face } from './face/face.js';
import { Speech } from './speech.js';
import { Brain } from './story/brain.js';
import { textsFor } from './story/texts.js';
import { startCamera } from './vision/camera.js';
import { createTracker } from './vision/tracker.js';
import { startDetection } from './vision/loop.js';
import { keepAwake } from './display.js';

// Everything that makes the robot live, built in the order it needs a tap, a permission or a download:
// the robot first (Bluetooth wants the tap), then the camera, the eyes (the face detector) and the voice.
// The screens only show it; they do not hold any of it.

const clock = { now: () => performance.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

export class SessionError extends Error {
  constructor(kind, cause) { super(`${kind}: ${cause?.message || cause || ''}`); this.kind = kind; this.cause = cause; }
}

const FLIP_KEY = 'face.flip';
const readFlip = () => { try { return localStorage.getItem(FLIP_KEY) === '1'; } catch { return false; } };

export class Session {
  constructor({ lang, params, onChange }) {
    this.lang = lang;
    this.params = params;                          // the address' parameters: fakeface, debug, fov, lost
    this.onChange = onChange || (() => {});
    this.logs = [];
    this.link = null;
    this.camera = null;
    this.tracker = null;
    this.detection = null;
    this.face = new Face();
    this.speech = new Speech({ tag: textsFor(lang).tag, prefer: params.voice || '', onCaption: (text) => { this.caption = text; this.onChange(); } });
    this.caption = '';
    this.state = { phase: 'stopped', step: '', listening: false, swings: { pitch: 0, yaw: 0 }, answer: null, lostFor: 0 };
    this.linkState = 'ok';                         // 'ok' | 'reconnecting' | 'lost'
    this.last = null;
    this.fps = 0;
    this.stopped = false;
    this.cleanups = [];
  }

  log = (kind, text) => {
    const line = `${(performance.now() / 1000).toFixed(1)} ${kind} ${text}`;
    this.logs.push(line);
    if (this.logs.length > 60) this.logs.shift();
    if (kind === 'err') console.warn('[face]', text);
    this.onChange();
  };

  // 1. the robot (call from a tap)
  async connectRobot() {
    if (!supportsBluetooth()) throw new SessionError('noBluetooth');
    this.link = new RobotLink({
      thymio, events: EVENTS,
      onLog: this.log,
      onConnection: (s) => {
        this.linkState = s === 'connected' ? 'ok' : s === 'lost' ? 'lost' : 'reconnecting';
        this.log('info', `link: ${s}`);
        this.onChange();
      },
    });
    try {
      await this.link.connect();
    } catch (err) {
      throw new SessionError('robot', err);
    }
  }

  // 2. the camera and the eyes
  async startVision() {
    if (this.params.fakeface) return;
    try {
      this.camera = await startCamera();
      this.log('info', `camera: ${JSON.stringify(this.camera.settings)}`);
    } catch (err) {
      const kind = err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'cameraDenied' : err?.name === 'NoCameraApi' ? 'noCameraApi' : 'noCamera';
      throw new SessionError(kind, err);
    }
  }

  async prepareEyes() {
    if (this.params.fakeface) return;
    try {
      this.tracker = await createTracker({ log: this.log });
    } catch (err) {
      throw new SessionError('vision', err);
    }
  }

  // 3. the voice
  async prepareVoice() {
    await this.speech.ready();
    this.log('info', `voice: ${this.speech.voice ? `${this.speech.voice.name} (${this.speech.voice.lang})` : this.speech.available ? 'the browser\'s default' : 'none, the captions say it'}`);
  }

  // 4. life
  begin() {
    const p = this.params;
    this.actions = new RobotActions({
      link: this.link,
      scripts: { edge: edgeScript, back: backScript, hand: handScript },
    });
    this.brain = new Brain({
      lang: this.lang,
      face: this.face,
      robot: this.actions,
      speech: this.speech,
      clock,
      config: {
        ...(p.lost ? { lostMs: p.lost * 1000 } : {}),
        ...(p.rearm ? { rearmMs: p.rearm * 1000 } : {}),
        aim: { ...(p.fov ? { hfov: p.fov } : {}), flip: readFlip() },
      },
      onState: (s) => { this.state = s; this.onChange(); },
      log: this.log,
    });
    this.brain.start();
    const ticker = setInterval(() => this.brain.tick(), 250);
    this.cleanups.push(() => clearInterval(ticker));
    this.cleanups.push(keepAwake());
    if (this.camera && this.tracker) {
      this.detection = startDetection({
        video: this.camera.video,
        tracker: this.tracker,
        intervalMs: () => (this.brain.phase === 'asleep' ? 160 : 0),
        onObservation: (obs) => this.observe(obs),
        onError: (err) => { this.log('err', `vision: ${err?.message || err}`); this.linkState = 'crashed'; this.onChange(); },
      });
      this.cleanups.push(() => this.detection.stop());
    }
  }

  observe = (obs) => {
    this.last = obs;
    this.fps = this.detection?.fps ?? this.fps;
    this.brain?.observe(obs);
  };

  // From the debug panel: the next voice of the language, and a sentence to hear it with.
  testVoice() {
    this.speech.nextVoice();
    this.log('info', `voice: ${this.speech.voice?.name} (${this.speech.voice?.lang})`);
    this.speech.speak(textsFor(this.lang).intro[0].say);
    this.onChange();
  }

  get flip() { return Boolean(this.brain?.aim.flip); }
  setFlip(on) {
    if (this.brain) this.brain.aim.flip = on;
    try { localStorage.setItem(FLIP_KEY, on ? '1' : '0'); } catch { /* private mode */ }
    this.onChange();
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const c of this.cleanups.splice(0)) { try { c(); } catch { /* going away */ } }
    try { await this.brain?.stop(); } catch { /* the link may be gone */ }
    this.speech.cancel();
    this.camera?.stop();
    this.tracker?.close();
    try { await this.link?.disconnect(); } catch { /* already gone */ }
  }
}

export { isFakeRobot };
