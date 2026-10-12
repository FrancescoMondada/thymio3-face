// A demonstration robot with the interface of thymio3-ts-api (used with `?fakerobot` in the address).
//
// It stands in for Web Bluetooth and the robot, so that the whole demo (connecting, lights, turning,
// the two scripts) runs in a browser with no hardware: the same DOM events, the delays of the real
// link, and the firmware's habit of sending stdout in lines padded to 100 bytes. The scripts are not
// run: their output is played from a script (`window.fakeRobot.flags` changes the outcome).
//
// window.fakeRobot shows what the "robot" has been told: state (the last actuator state), motors,
// scripts (what was run), and lets a test play the table: flags.edge = 'edge' | 'dark' | 'timeout', and the
// hand: putHand() while the hand script runs (flags.hand = 'never' lets the wait time out).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail }));

let connected = false;
let loaded = '';
let running = false;

export const fake = {
  flags: { edge: 'edge', walkMs: 3500, backMs: 1000, hand: 'button', handWaitMs: 16000 },
  putHand: () => {},                                // while the hand script runs: a hand is put in front of the robot
  state: null,
  motors: [0, 0],
  writes: 0,
  scripts: [],
  log: [],
};
if (typeof window !== 'undefined') window.fakeRobot = fake;

const say = (...parts) => {
  const s = `@@${parts.join(' ')}`;
  fire('thymio-std-out-values', `${s}${' '.repeat(Math.max(0, 99 - s.length))}\x1e`);
};

export async function requestAndConnect() {
  await sleep(500);
  connected = true;
  fire('thymio-connected', true);
  fire('thymio-connected', true);                  // the real API says it twice
}
export const isConnected = () => connected;
export async function disconnect() { connected = false; fire('thymio-connected', false); }
export const getDeviceName = () => 'THYMIO3-FAKE';
export async function stopSensorStreaming() { await sleep(30); }

export async function setActuatorState(state) {
  await sleep(45);
  if (running) throw new Error('fakerobot: written while a script runs');
  fake.state = JSON.parse(JSON.stringify(state));
  fake.motors = [state.motorLeft, state.motorRight];
  fake.writes++;
}

export async function sendPythonScript(text) {
  await sleep(120);
  loaded = text;
  fire('thymio-python-load-result', { success: true, code: 0, message: 'Script loaded successfully' });
  fire('thymio-python-execution-status', true);
}

export async function executeLoadedScript() {
  await sleep(80);
  if (running) return;
  const mode = loaded.includes('nohand') ? 'hand' : /MODE = "(\w+)"/.exec(loaded)?.[1] || '?';
  fake.scripts.push(mode);
  if (mode === 'hand') { runHand(); return; }
  fake.motors = [mode === 'back' ? -250 : 250, mode === 'back' ? -250 : 250];
  running = true;
  const end = () => {
    fake.motors = [0, 0];
    say('bye');
    running = false;
    setTimeout(() => fire('thymio-python-execution-status', false), 100);
  };
  say('hello', mode);
  if (mode === 'back') {
    setTimeout(() => { say('backed', 1000); end(); }, fake.flags.backMs);
    return;
  }
  say('ground', 600, 640);
  if (fake.flags.edge === 'dark') { setTimeout(() => { say('dark', 30, 600); end(); }, 150); return; }
  setTimeout(() => {
    if (fake.flags.edge === 'timeout') say('timeout', 14000);
    else say('edge', 243, 259, fake.flags.walkMs);
    end();
  }, fake.flags.edge === 'timeout' ? 3000 : fake.flags.walkMs);
}

// The hand script: it waits for a hand (the button of the fake person, or window.fakeRobot.putHand()).
function runHand() {
  const t0 = Date.now();
  let over = false;
  const finish = (word, ...args) => {
    if (over) return;
    over = true;
    fake.putHand = () => {};
    clearTimeout(waitTimer);
    say(word, ...args);
    setTimeout(() => { say('bye'); running = false; setTimeout(() => fire('thymio-python-execution-status', false), 100); }, word === 'hand' ? 1500 : 30);
  };
  const waitTimer = setTimeout(() => finish('nohand', Date.now() - t0), fake.flags.handWaitMs);
  say('hello', 'hand');
  say('base', 12, 15, 9, 11, 14);
  fake.putHand = () => finish('hand', 2, 2600, Date.now() - t0);
}

export async function stopScriptExecution() {
  await sleep(40);
  if (running) { running = false; fake.motors = [0, 0]; fire('thymio-python-execution-status', false); }
}
