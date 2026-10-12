import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { RobotLink, emptyState } from '../src/robot/link.js';
import { RobotActions } from '../src/robot/actions.js';
import { buildScriptFrom, buildPlainScript, LineAssembler, parseRobotLine, outcomeOf } from '../src/script-core.js';
import { makeApi, EV } from './fake-api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(here, '..', 'src', 'py', 'table_edge.py'), 'utf8');
const HAND_SOURCE = fs.readFileSync(path.join(here, '..', 'src', 'py', 'hand_sensor.py'), 'utf8');
const SCRIPTS = { edge: buildScriptFrom(SOURCE, 'edge'), back: buildScriptFrom(SOURCE, 'back'), hand: buildPlainScript(HAND_SOURCE) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(opt) {
  const fake = makeApi(opt);
  const events = [];
  const logs = [];
  const link = new RobotLink({ thymio: fake.api, events: EV, doc: fake.doc, win: fake.win, onLog: (k, t) => logs.push([k, t]), onConnection: (s) => events.push(s) });
  const actions = new RobotActions({ link, scripts: SCRIPTS });
  return { ...fake, link, actions, events, logs };
}

test('the scripts the interface builds are valid Python, and small', () => {
  for (const [mode, text] of Object.entries(SCRIPTS)) {
    const check = spawnSync('python3', ['-I', '-c', `import sys\ncompile(sys.stdin.read(), "${mode}", "exec")`], { input: text, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
    assert.ok(text.length < 2600, `${mode}: ${text.length} bytes`);
    if (mode !== 'hand') assert.ok(text.includes(`MODE = "${mode}"`));
    assert.ok(text.trimEnd().endsWith('run()'));
  }
});

test('the robot\'s lines are read whatever the pieces they arrive in', () => {
  const text = '@@hello edge' + ' '.repeat(87) + '\x1e@@ground 600 640' + ' '.repeat(80) + '\x1e@@edge 243 259 5136' + ' '.repeat(76) + '\x1e@@bye' + ' '.repeat(94) + '\x1e';
  for (const size of [1, 7, 11, 99, 100, 500]) {
    const a = new LineAssembler();
    const lines = [];
    for (let i = 0; i < text.length; i += size) lines.push(...a.push(text.slice(i, i + size)));
    const events = lines.map(parseRobotLine);
    assert.deepEqual(events.map((e) => e.type), ['hello', 'ground', 'edge', 'bye'], `pieces of ${size}`);
    assert.equal(events[2].ms, 5136);
    assert.equal(outcomeOf(events), 'edge');
  }
  assert.equal(parseRobotLine('Traceback (most recent call last):'), null);
  assert.equal(parseRobotLine('NameError: name \'x\' isn\'t defined').type, 'error');
  assert.equal(outcomeOf([{ type: 'hello' }, { type: 'dark' }]), 'dark');
  assert.equal(outcomeOf([]), 'none');
});

test('connecting: the previous client\'s streams and scripts are stopped first', async () => {
  const t = setup();
  await t.link.connect();
  assert.ok(t.link.connected && t.link.ready);
  assert.deepEqual(t.calls.slice(0, 3), ['connect', 'stopSensorStreaming', 'stopScript']);
  assert.deepEqual(t.events, [], 'the first connection is not news');
  await t.link.disconnect();
});

test('a connection that fails says why', async () => {
  const t = setup();
  t.api.requestAndConnect = async () => { console.error(new Error('NotSupportedError: GATT operation failed')); };
  await assert.rejects(() => t.link.connect(), /GATT operation failed/);
  assert.equal(t.link.ready, false);
});

test('wheel commands are not queued up: a stop is never behind old commands', async () => {
  const t = setup({ writeMs: 40 });
  await t.link.connect();
  for (let i = 0; i < 30; i++) { t.link.pulse(100 + i, -100 - i, 300); await sleep(3); }
  t.link.stopWheels();
  await sleep(250);
  assert.ok(t.writes.length <= 8, `${t.writes.length} writes for 31 commands`);
  const last = t.writes.at(-1).state;
  assert.equal(last.motorLeft, 0);
  assert.equal(last.motorRight, 0);
  await t.link.disconnect();
});

test('a wheel command stops by itself: nothing, not even a late Bluetooth link, keeps the wheels turning', async () => {
  const t = setup();
  await t.link.connect();
  t.link.pulse(150, -150, 200);
  await sleep(60);
  assert.equal(t.writes.at(-1).state.motorLeft, 150);
  await sleep(450);
  assert.equal(t.writes.at(-1).state.motorLeft, 0, 'stopped without being told');
  t.link.pulse(150, -150, 99999);
  await sleep(60);
  const sentAt = t.writes.at(-1).t;
  await sleep(900);
  assert.equal(t.writes.at(-1).state.motorLeft, 0, 'a step never lasts longer than the limit');
  assert.ok(t.writes.at(-1).t > sentAt);
  await t.link.disconnect();
});

test('a failed write is tried again, and the last wanted state gets there', async () => {
  const t = setup({ failWrites: 2 });
  await t.link.connect();
  t.link.pulse(120, -120, 500);
  await sleep(600);
  assert.ok(t.writes.some((w) => w.state.motorLeft === 120), 'the command got through after the failures');
  assert.ok(t.logs.some(([k]) => k === 'err'));
  await t.link.disconnect();
});

test('the walk to the edge: the real script runs on a virtual table, and the link says how it ended', async () => {
  const t = setup({ table: { edge_mm: 300 } });
  await t.link.connect();
  t.link.pulse(100, 100, 300);
  await sleep(50);
  const run = await t.actions.prepareEdge();
  const before = t.writes.length;
  const result = await run.start();
  assert.equal(result.outcome, 'edge', t.api.lastRun?.stdout);
  assert.deepEqual(result.events.map((e) => e.type), ['hello', 'ground', 'edge', 'bye']);
  assert.equal(t.writes.length, before, 'nothing is written to the robot while its script runs');
  // after the script the firmware has put everything off: the interface sends its whole state again
  await sleep(80);
  assert.ok(t.writes.length > before);
  assert.equal(t.writes.at(-1).state.motorLeft, 0, 'and the wheels are not left running');
  await t.link.disconnect();
});

test('the walk on a dark table, and backing up', async () => {
  const dark = setup({ table: { base: 40 } });
  await dark.link.connect();
  const r = await (await dark.actions.prepareEdge()).start();
  assert.equal(r.outcome, 'dark');
  await dark.link.disconnect();

  const t = setup();
  await t.link.connect();
  const b = await (await t.actions.prepareBack()).start();
  assert.equal(b.outcome, 'backed');
  await t.link.disconnect();
});

test('a "script ended" that arrives late, from the script stopped at connection, does not end the walk', async () => {
  const t = setup();
  await t.link.connect();
  const run = await t.link.prepareScript(SCRIPTS.edge);
  const done = run.start();
  await sleep(3);
  t.fire(EV.pyStatus, false);                      // the late one: our script has not said hello yet
  const events = await done;
  assert.deepEqual(events.map((e) => e.type), ['hello', 'ground', 'edge', 'bye']);
  await t.link.disconnect();
});

test('a script that never ends is stopped, and reported as an error', async () => {
  const t = setup({ hang: true });
  await t.link.connect();
  const run = await t.link.prepareScript(SCRIPTS.edge, { timeoutMs: 150 });
  const events = await run.start();
  assert.equal(outcomeOf(events), 'error');
  assert.ok(t.calls.filter((c) => c === 'stopScript').length >= 2, 'it was told to stop');
  await t.link.disconnect();
});

test('a script that ends without a word (a crash) ends through the end notice once it has said hello', async () => {
  const t = setup({ silent: false, table: { edge_mm: 300 } });
  await t.link.connect();
  const run = await t.link.prepareScript(SCRIPTS.edge);
  const events = await run.start();
  assert.ok(events.some((e) => e.type === 'hello'));
  await t.link.disconnect();
});

test('the link drops, and comes back by itself: the interface is told, and the robot is prepared again', async () => {
  const t = setup();
  await t.link.connect();
  t.fire(EV.connected, false);
  assert.deepEqual(t.events, ['disconnected']);
  t.api.isConnected = () => true;
  t.fire(EV.connected, true);
  await sleep(120);
  assert.deepEqual(t.events, ['disconnected', 'connected']);
  assert.ok(t.calls.filter((c) => c === 'stopSensorStreaming').length === 2);
  t.fire(EV.manualReconnect, null);
  assert.equal(t.events.at(-1), 'lost');
  await t.link.disconnect();
});

test('the page going away stops the wheels at once', async () => {
  const t = setup();
  await t.link.connect();
  t.link.pulse(150, -150, 500);
  await sleep(50);
  t.win.dispatchEvent(new Event('pagehide'));
  await sleep(50);
  assert.equal(t.writes.at(-1).state.motorLeft, 0);
  await t.link.disconnect();
});

test('the hand: the real script on a virtual hand; the interface hears "hand" before the script ends', async () => {
  const t = setup({ harness: 'test_hand_sensor.py', table: { hand_at: 2500 } });
  await t.link.connect();
  const run = await t.actions.prepareHand();
  const heard = [];
  let ended = false;
  const done = run.start((ev) => heard.push([ev.type, ended]));
  const result = await done;
  ended = true;
  assert.equal(result.outcome, 'hand', t.api.lastRun?.stdout);
  assert.deepEqual(result.events.map((e) => e.type), ['hello', 'base', 'hand', 'bye']);
  assert.deepEqual(heard.map((h) => h[0]), ['hello', 'base', 'hand', 'bye'], 'every line is passed on as it comes');
  assert.ok(heard.every(([, e]) => e === false), 'all of them before the end');
  const hand = result.events[2];
  assert.equal(hand.sensor, 2);
  assert.ok(hand.value > 700 && hand.ms >= 2400 && hand.ms < 2900, JSON.stringify(hand));
  await t.link.disconnect();
});

test('no hand: the script says so after its wait', async () => {
  const t = setup({ harness: 'test_hand_sensor.py', table: { noise: 20 } });
  await t.link.connect();
  const result = await (await t.actions.prepareHand()).start();
  assert.equal(result.outcome, 'nohand');
  assert.equal(result.events[2].type, 'nohand');
  assert.ok(result.events[2].ms >= 16000, `${result.events[2].ms} ms`);
  await t.link.disconnect();
});

test('a handler that throws does not stop the script from being heard to the end', async () => {
  const t = setup({ harness: 'test_hand_sensor.py', table: { hand_at: 1000 } });
  await t.link.connect();
  const result = await (await t.actions.prepareHand()).start(() => { throw new Error('handler bug'); });
  assert.equal(result.outcome, 'hand');
  assert.ok(t.logs.some(([k, m]) => k === 'err' && /handler bug/.test(m)));
  await t.link.disconnect();
});

test('the lines of the hand script are read whatever the pieces they arrive in', () => {
  const text = '@@hello hand' + ' '.repeat(87) + '\x1e@@base 10 12 8 9 11' + ' '.repeat(77) + '\x1e@@hand 3 2100 4260' + ' '.repeat(77) + '\x1e@@bye' + ' '.repeat(94) + '\x1e';
  for (const size of [1, 11, 100]) {
    const a = new LineAssembler();
    const lines = [];
    for (let i = 0; i < text.length; i += size) lines.push(...a.push(text.slice(i, i + size)));
    const ev = lines.map(parseRobotLine);
    assert.deepEqual(ev.map((e) => e.type), ['hello', 'base', 'hand', 'bye'], `pieces of ${size}`);
    assert.deepEqual(ev[1].values, [10, 12, 8, 9, 11]);
    assert.deepEqual([ev[2].sensor, ev[2].value, ev[2].ms], [3, 2100, 4260]);
  }
  assert.equal(outcomeOf([{ type: 'hello' }, { type: 'nohand' }]), 'nohand');
});
