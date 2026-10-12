import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureDetector } from '../src/vision/gesture.js';

// A deterministic noise, so a failure can be replayed.
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
}

// Feed a detector with signals sampled at `fps` for `seconds`; returns the verdict and when it came.
function run({ fps = 20, seconds = 4, yaw = () => 0, pitch = () => 0, noise = 0.004, seed = 7, opt } = {}) {
  const d = new GestureDetector(opt);
  const r = rng(seed);
  const dt = 1000 / fps;
  for (let t = 0; t <= seconds * 1000; t += dt) {
    const v = d.push(t, yaw(t / 1000) + noise * r(), pitch(t / 1000) + noise * r());
    if (v) return { verdict: v, at: t, swings: d.swings };
  }
  return { verdict: null, at: null, swings: d.swings };
}

const wave = (amp, hz, start = 0.3) => (s) => (s < start ? 0 : amp * Math.sin(2 * Math.PI * hz * (s - start)));

test('a nod is a yes', () => {
  const r = run({ pitch: wave(0.06, 1.5), yaw: wave(0.004, 1.5) });
  assert.equal(r.verdict, 'yes');
  assert.ok(r.at < 2600, `detected after ${r.at} ms`);
});

test('a shake is a no', () => {
  const r = run({ yaw: wave(0.06, 1.6), pitch: wave(0.005, 1.6) });
  assert.equal(r.verdict, 'no');
  assert.ok(r.at < 2600, `detected after ${r.at} ms`);
});

test('a small nod, and a fast one, still count; at 10 and 30 frames per second', () => {
  for (const fps of [10, 15, 30]) {
    assert.equal(run({ fps, pitch: wave(0.03, 1.2) }).verdict, 'yes', `small nod at ${fps} fps`);
    assert.equal(run({ fps, pitch: wave(0.05, 2.2) }).verdict, 'yes', `fast nod at ${fps} fps`);
    assert.equal(run({ fps, yaw: wave(0.05, 1.8) }).verdict, 'no', `shake at ${fps} fps`);
  }
});

test('the head at rest, at any angle, says nothing', () => {
  assert.equal(run({ seconds: 10, pitch: () => 0.2, yaw: () => -0.1 }).verdict, null);
  assert.equal(run({ seconds: 10, noise: 0.012 }).verdict, null, 'landmark jitter alone is not an answer');
});

test('a tremor, or the slow drift of a person who looks around, is not an answer', () => {
  assert.equal(run({ seconds: 10, pitch: wave(0.012, 3) }).verdict, null, 'tremor');
  assert.equal(run({ seconds: 12, yaw: (s) => 0.08 * Math.sin((2 * Math.PI * s) / 6) }).verdict, null, 'looking around, 6 s a turn');
  assert.equal(run({ seconds: 12, pitch: (s) => 0.002 * s * 10 }).verdict, null, 'a long slow bow');
});

test('one big move, or two, is not enough: an answer takes several swings', () => {
  const once = (s) => (s < 0.5 ? 0 : s < 0.9 ? 0.08 : 0);
  assert.equal(run({ pitch: once }).verdict, null);
});

test('a head that circles moves both signals the same: no answer', () => {
  const r = run({ seconds: 8, pitch: wave(0.05, 1.5), yaw: (s) => 0.05 * Math.cos(2 * Math.PI * 1.5 * s) });
  assert.equal(r.verdict, null);
});

test('a nod with some turning along still reads as a nod, and the other way round', () => {
  assert.equal(run({ pitch: wave(0.06, 1.5), yaw: wave(0.025, 0.9) }).verdict, 'yes');
  assert.equal(run({ yaw: wave(0.07, 1.5), pitch: wave(0.025, 1.1) }).verdict, 'no');
});

test('the verdict comes once; a face lost for a moment starts the count again', () => {
  const d = new GestureDetector();
  let n = 0;
  for (let t = 0; t < 4000; t += 50) { if (d.push(t, 0, wave(0.06, 1.5, 0)(t / 1000))) n++; }
  assert.equal(n, 1);

  const e = new GestureDetector();
  const f = wave(0.06, 1.5, 0);
  let verdict = null;
  for (let t = 0; t < 700; t += 50) verdict = e.push(t, 0, f(t / 1000)) || verdict;      // part of a nod
  for (let t = 1500; t < 2200; t += 50) verdict = e.push(t, 0, f(t / 1000)) || verdict;  // the rest, after a gap
  assert.equal(verdict, null, 'two halves of a nod, a second apart, are not a nod');
});

test('reset forgets everything', () => {
  const d = new GestureDetector();
  for (let t = 0; t < 4000; t += 50) d.push(t, 0, wave(0.06, 1.5, 0)(t / 1000));
  d.reset();
  assert.equal(d.swings.pitch, 0);
  let v = null;
  for (let t = 0; t < 4000; t += 50) v = d.push(t, wave(0.06, 1.5, 0)(t / 1000), 0) || v;
  assert.equal(v, 'no');
});
