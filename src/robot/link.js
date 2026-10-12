import { LineAssembler, parseRobotLine } from '../script-core.js';

// The Bluetooth link to the robot, for what this demo needs of it: a few short wheel turns, and the small
// scripts that run on the robot (table_edge.py, hand_sensor.py).
//
// `thymio` is the API of thymio3-ts-api (or the fake of dev/fake-thymio.js) and `events` its DOM event
// names; they are injected so that tests can run this without Bluetooth.
//
// Three things about the link shape this file:
//  - Each setActuatorState is two Bluetooth writes (about 60-100 ms) and they queue up if they are
//    made faster than they are sent: a stop would then wait behind old commands. So there is always
//    at most one write in flight, and what is sent next is the latest wanted state, not the ones in
//    between (`pump`).
//  - The wheels never run on a command alone: every motor command has a deadline, and past it the
//    state sent is "stopped" (`frame`), however late the next command is.
//  - A script that runs on the robot owns the wheels and the lights: nothing is sent while it runs,
//    and when it ends the firmware has switched everything off, so the whole state is sent again.

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rgb = () => ({ r: 0, g: 0, b: 0 });
export const emptyState = () => ({
  circleLEDs: Array(8).fill(0),
  frontLegoLEDs: Array(8).fill(0),
  rearLegoLEDs: Array(8).fill(0),
  flRGB: rgb(), frRGB: rgb(), blRGB: rgb(), brRGB: rgb(),
  motorLeft: 0, motorRight: 0,
  sound: 0,
  smallBottomRGB: rgb(), smallBackRGB: rgb(),
  buttonLEDs: [0, 0, 0, 0],
  receiverLED: 0,
  microphoneLED: false,
});

export const MAX_STEP_MS = 600;               // no wheel command lasts longer than this without a new one

export class RobotLink {
  constructor({ thymio, events, doc, win, onLog, onEvent, onConnection, now = clock }) {
    this.thymio = thymio;
    this.E = events;
    this.doc = doc || document;
    this.win = win || window;
    this.log = (kind, text) => onLog?.(kind, text);
    this.onEvent = onEvent;
    this.onConnection = onConnection;
    this.now = now;
    this.connected = false;
    this.ready = false;                       // connect() has finished: from then on a lost link is news
    this.attached = false;
    this.want = emptyState();
    this.sent = null;                         // the key of what the robot has
    this.sending = false;
    this.paused = false;                      // a script runs on the robot
    this.deadline = 0;                        // the wheels stop at this time unless a new command comes
    this.failures = 0;
    this.lines = new LineAssembler();
    this.run = null;                          // the script that runs: { events, resolve }
    this.watchdog = 0;
  }

  // ---- connecting -------------------------------------------------------------------------------------
  attach() {
    if (this.attached) return;
    this.attached = true;
    const E = this.E;
    this.onConnected = (e) => {
      if (!e.detail) {
        if (this.connected) this.log('info', 'link: disconnected');
        this.connected = false;
        this.sent = null;
        if (this.ready) this.onConnection?.('disconnected');
        return;
      }
      if (this.connected) return;             // the API says "connected" twice per connection
      this.connected = true;
      this.sent = null;
      this.log('info', 'link: connected');
      if (this.ready) this.prepare().then(() => this.onConnection?.('connected'));   // the API reconnected by itself
    };
    this.onGaveUp = () => { this.log('err', 'link: automatic reconnection gave up'); this.onConnection?.('lost'); };
    this.onStdout = (e) => {
      const text = String(e.detail ?? '');
      this.log('in', JSON.stringify(text.replace(/ {4,}/g, '␣')));
      for (const line of this.lines.push(text)) this.handleLine(line);
    };
    // "A script ended" also arrives, late, for the script that was stopped when connecting: only the
    // end of a script that has said hello is its own. Its "bye" or an error end the run anyway.
    this.onStatus = (e) => { if (e.detail === false && this.run?.hello) this.scriptEnded(); };
    this.onUnload = () => {
      this.emergencyStop();
      if (this.run) this.thymio.stopScriptExecution().catch(() => {});        // its own cleanup stops the wheels
      if (this.thymio.isConnected()) this.thymio.disconnect().catch(() => {});
    };
    this.onHidden = () => { if (this.doc.visibilityState === 'hidden') this.emergencyStop(); };
    this.doc.addEventListener(E.connected, this.onConnected);
    this.doc.addEventListener(E.manualReconnect, this.onGaveUp);
    this.doc.addEventListener(E.stdout, this.onStdout);
    this.doc.addEventListener(E.pyStatus, this.onStatus);
    this.doc.addEventListener('visibilitychange', this.onHidden);
    this.win.addEventListener('pagehide', this.onUnload);
    this.win.addEventListener('beforeunload', this.onUnload);
    this.watchdog = setInterval(() => this.guard(), 100);
    this.watchdog.unref?.();                  // (Node only: a test must be able to end)
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    const E = this.E;
    this.doc.removeEventListener(E.connected, this.onConnected);
    this.doc.removeEventListener(E.manualReconnect, this.onGaveUp);
    this.doc.removeEventListener(E.stdout, this.onStdout);
    this.doc.removeEventListener(E.pyStatus, this.onStatus);
    this.doc.removeEventListener('visibilitychange', this.onHidden);
    this.win.removeEventListener('pagehide', this.onUnload);
    this.win.removeEventListener('beforeunload', this.onUnload);
    clearInterval(this.watchdog);
  }

  // The API does not throw when the connection fails: it writes the error to the console and announces
  // "disconnected". Listen to the console while it connects, to know why.
  async connect() {
    this.attach();
    const seen = [];
    const original = console.error;
    console.error = (...args) => { seen.push(...args); original.apply(console, args); };
    let failure = null;
    try {
      await this.thymio.requestAndConnect();
    } catch (err) {
      failure = err;
    } finally {
      console.error = original;
    }
    failure = failure || (this.thymio.isConnected() ? null : seen.find((a) => a instanceof Error) || new Error('not connected'));
    if (failure) {
      this.log('err', `link: ${failure.name}: ${failure.message}`);
      this.detach();
      throw failure;
    }
    this.connected = true;
    await this.prepare();
    this.ready = true;
  }

  // A previous page may have left the robot streaming its sensors at 50 Hz (the firmware does not
  // reset that when a client goes away), which leaves no room on the link for anything else, or running
  // a script. This demo uses neither the streams nor a script it did not start: stop both.
  async prepare() {
    try { await this.thymio.stopSensorStreaming?.(); } catch (err) { this.log('err', `sensor streaming off: ${err?.message || err}`); }
    try { await this.stopScript(); } catch (err) { this.log('err', `stop: ${err?.message || err}`); }
    this.sent = null;
    this.pump();
  }

  async disconnect() {
    this.emergencyStop();
    try { await this.stopScript(); } catch { /* nothing runs */ }
    try { await this.thymio.disconnect(); } catch { /* already gone */ }
    this.connected = false;
    this.ready = false;
    this.detach();
  }

  // ---- what the robot is told ----------------------------------------------------------------------------
  // Wheels for at most `ms` (and never more than MAX_STEP_MS): then they stop by themselves.
  pulse(left, right, ms) {
    this.want.motorLeft = Math.round(left);
    this.want.motorRight = Math.round(right);
    this.deadline = this.now() + Math.min(ms, MAX_STEP_MS);
    this.pump();
  }

  stopWheels() {
    this.want.motorLeft = 0;
    this.want.motorRight = 0;
    this.deadline = 0;
    this.pump();
  }

  // The state to send now. Past its deadline the wheels are stopped.
  frame() {
    const s = JSON.parse(JSON.stringify(this.want));
    if (this.now() >= this.deadline) { s.motorLeft = 0; s.motorRight = 0; }
    return s;
  }

  guard() {
    if (!this.connected || this.paused) return;
    const stopping = (this.want.motorLeft || this.want.motorRight) && this.now() >= this.deadline;
    if (stopping) { this.want.motorLeft = 0; this.want.motorRight = 0; }
    if (stopping && !this.sending) this.pump();
  }

  async pump() {
    if (this.sending || this.paused || !this.connected) return;
    this.sending = true;
    try {
      while (!this.paused && this.connected) {
        const state = this.frame();
        const key = JSON.stringify(state);
        if (key === this.sent) break;
        try {
          await this.thymio.setActuatorState(state);
          this.sent = key;
          this.failures = 0;
        } catch (err) {
          // a stop of a script cancels the writes waiting behind it; a busy link may fail one
          this.log('err', `actuators: ${err?.message || err}`);
          if (++this.failures >= 4) { this.failures = 0; break; }
          await sleep(120);
        }
      }
    } finally {
      this.sending = false;
    }
    if (!this.paused && this.connected && this.sent !== JSON.stringify(this.frame())) setTimeout(() => this.pump(), 150);
  }

  // Everything that moves, stopped, as fast as the link can: for a page that goes away.
  emergencyStop() {
    this.want.motorLeft = 0;
    this.want.motorRight = 0;
    this.deadline = 0;
    if (this.connected && !this.paused) {
      this.thymio.setActuatorState(this.frame()).catch(() => {});
    }
  }

  // ---- scripts on the robot ------------------------------------------------------------------------------
  handleLine(line) {
    const ev = parseRobotLine(line);
    if (!ev) { if (/^Traceback/.test(line)) this.log('err', line.trim()); return; }
    if (ev.type === 'error') this.log('err', ev.message);
    this.onEvent?.(ev);
    if (!this.run) return;
    this.run.events.push(ev);
    if (ev.type === 'hello') this.run.hello = true;
    try { this.run.onEvent?.(ev); } catch (err) { this.log('err', `script event: ${err?.message || err}`); }
    if (ev.type === 'bye' || ev.type === 'error') this.scriptEnded();
  }

  scriptEnded() {
    const r = this.run;
    if (!r || r.ending) return;
    r.ending = true;
    // after its "bye" the script is only leaving: a moment for the last words
    setTimeout(() => r.finish(), 40);
  }

  async stopScript() {
    // stopping nothing is harmless: the firmware discards a stop that finds no script
    await this.thymio.stopScriptExecution();
    await sleep(60);
  }

  // Send a script now (it takes 100-300 ms) and start it later: `start(onEvent)` runs it and resolves with
  // what it printed when it has ended; `onEvent` is called with each line as it arrives, so that the
  // interface can answer to "hand" without waiting for the end. Nothing is sent to the robot's wheels
  // from then on.
  async prepareScript(text, { timeoutMs = 20000 } = {}) {
    await this.waitIdle();
    await this.thymio.sendPythonScript(text);
    let started = false;
    return {
      start: (onEvent) => {
        if (started) throw new Error('script already started');
        started = true;
        return this.execute(timeoutMs, onEvent);
      },
    };
  }

  async waitIdle() {
    for (let i = 0; i < 100 && this.sending; i++) await sleep(20);
  }

  async execute(timeoutMs, onEvent) {
    this.paused = true;
    this.want.motorLeft = 0;
    this.want.motorRight = 0;
    await this.waitIdle();
    this.lines = new LineAssembler();
    const events = [];
    let timer = 0;
    const ended = new Promise((resolve) => {
      this.run = { events, onEvent, ending: false, hello: false, finish: () => { clearTimeout(timer); resolve(true); } };
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      await this.thymio.executeLoadedScript();
      const finished = await ended;
      if (!finished) {
        this.log('err', `script: no end after ${timeoutMs} ms, stopping it`);
        try { await this.stopScript(); } catch { /* the link is gone */ }
        events.push({ type: 'error', message: 'script did not end' });
      }
    } catch (err) {
      this.log('err', `script: ${err?.message || err}`);
      events.push({ type: 'error', message: String(err?.message || err) });
    } finally {
      this.run = null;
      this.paused = false;
      this.sent = null;                       // the firmware switched everything off at the end of the script
      this.deadline = 0;
      this.pump();
    }
    return events;
  }

  // The script on the robot must stop now (the person went away, the page is closing).
  async abortScript() {
    if (!this.run) return;
    try { await this.stopScript(); } catch { /* nothing to do */ }
    this.run?.finish();
  }
}
