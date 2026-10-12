// A fake thymio3-ts-api for tests: the same functions and DOM events, a link with delays, and a robot
// that runs the real script (tests/test_table_edge.py plays the table, tests/test_hand_sensor.py the hand). stdout comes back in small pieces,
// like Bluetooth notifications.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const EV = { connected: 'c', manualReconnect: 'm', stdout: 'out', pyStatus: 'py', pyLoad: 'ld' };

export function makeApi({ table = { edge_mm: 300 }, harness = 'test_table_edge.py', writeMs = 15, chunk = 11, failWrites = 0, silent = false, lateStatusMs = 0, hang = false } = {}) {
  const doc = new EventTarget();
  const win = new EventTarget();
  const fire = (type, detail) => doc.dispatchEvent(new CustomEvent(type, { detail }));
  const calls = [];
  const writes = [];                             // every setActuatorState, with its time
  let connected = false;
  let loaded = '';
  let running = false;
  let failures = failWrites;
  const t0 = Date.now();

  const api = {
    async requestAndConnect() { calls.push('connect'); await sleep(5); connected = true; fire(EV.connected, true); fire(EV.connected, true); },
    isConnected: () => connected,
    async disconnect() { calls.push('disconnect'); connected = false; fire(EV.connected, false); },
    async stopSensorStreaming() { calls.push('stopSensorStreaming'); await sleep(2); },
    async setActuatorState(state) {
      if (running) throw new Error('written while a script runs');
      await sleep(writeMs);
      if (failures > 0) { failures--; throw new Error('GATT operation failed'); }
      writes.push({ t: Date.now() - t0, state: JSON.parse(JSON.stringify(state)) });
    },
    async sendPythonScript(text) { calls.push('send'); await sleep(5); loaded = text; fire(EV.pyStatus, true); },
    async executeLoadedScript() {
      calls.push('execute');
      await sleep(5);
      running = true;
      if (hang) return;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'face-link-'));
      const file = path.join(dir, 'script.py');
      fs.writeFileSync(file, loaded);
      const args = ['-I', path.join(here, harness), '--stdout', file, ...Object.entries(table).map(([k, v]) => `${k}=${v}`)];
      const run = spawnSync('python3', args, { encoding: 'utf8' });
      fs.rmSync(dir, { recursive: true, force: true });
      api.lastRun = { stdout: run.stdout, stderr: run.stderr, status: run.status };
      (async () => {
        await sleep(30);
        if (!silent) for (let i = 0; i < run.stdout.length; i += chunk) { fire(EV.stdout, run.stdout.slice(i, i + chunk)); await sleep(2); }
        running = false;
        if (lateStatusMs >= 0) setTimeout(() => fire(EV.pyStatus, false), lateStatusMs);
      })();
    },
    async stopScriptExecution() { calls.push('stopScript'); await sleep(5); if (running) { running = false; fire(EV.pyStatus, false); } },
    getDeviceName: () => 'THYMIO3-TEST',
  };
  return { api, doc, win, calls, writes, fire, get running() { return running; } };
}
