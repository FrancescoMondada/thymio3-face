// Pure helpers around the script that runs on the robot: no Vite-only imports, so Node can test them.

// The script is uploaded over Bluetooth every time it runs: drop what the interpreter ignores.
// Lines that contain a quote keep their trailing comment (a '#' might be inside a string).
// Indentation goes from 4 spaces to 1 per level.
export function minify(src) {
  const out = [];
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const body = /["']/.test(line) ? line : line.replace(/\s+#.*$/, '');
    out.push(body.replace(/^( {4})+/, (m) => ' '.repeat(m.length / 4)));
  }
  return out.join('\n') + '\n';
}

export const MODES = ['edge', 'back'];

// table_edge.py with its MODE written in, and the call that runs it.
export function buildScriptFrom(source, mode) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}"`);
  const src = source.replace(/^MODE = ".*"$/m, `MODE = "${mode}"`) + '\nrun()\n';
  return minify(src);
}

// hand_sensor.py with the call that runs it.
export function buildPlainScript(source) {
  return minify(source + '\nrun()\n');
}

// stdout arrives in BLE notifications cut anywhere: rebuild complete lines.
// A line ends with a newline, or with \x1e (record separator): the script pads and ends its events
// that way so that the firmware sends them at once (see say() in table_edge.py).
export class LineAssembler {
  constructor() { this.rest = ''; }
  push(text) {
    const parts = (this.rest + text).split(/[\r\n\x1e]+/);
    this.rest = parts.pop();
    return parts.filter((l) => l.trim());
  }
}

// One line of stdout -> an event, or null for anything else.
export function parseRobotLine(line) {
  const l = line.trim();
  if (/^\w*(Error|Exception)\b/.test(l)) return { type: 'error', message: l };
  const m = /^@@(\w+)\s*(.*)$/.exec(l);
  if (!m) return null;
  const [, word, rest] = m;
  const a = rest.split(/\s+/).filter(Boolean);
  const n = (i) => Number(a[i]);
  switch (word) {
    case 'hello': return { type: 'hello', mode: a[0] };
    case 'ground': return { type: 'ground', left: n(0), right: n(1) };
    case 'edge': return { type: 'edge', left: n(0), right: n(1), ms: n(2) };
    case 'dark': return { type: 'dark', left: n(0), right: n(1) };
    case 'timeout': return { type: 'timeout', ms: n(0) };
    case 'backed': return { type: 'backed', ms: n(0) };
    case 'blocked': return { type: 'blocked', ms: n(0) };
    case 'base': return { type: 'base', values: a.map(Number) };
    case 'hand': return { type: 'hand', sensor: n(0), value: n(1), ms: n(2) };
    case 'nohand': return { type: 'nohand', ms: n(0) };
    case 'bye': return { type: 'bye' };
    default: return null;
  }
}

// How a run of the script ended, from the events it printed: what the story needs to know.
export function outcomeOf(events) {
  for (const e of events) {
    if (['edge', 'dark', 'timeout', 'backed', 'blocked', 'hand', 'nohand'].includes(e.type)) return e.type;
    if (e.type === 'error') return 'error';
  }
  return 'none';
}
