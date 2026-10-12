import test from 'node:test';
import assert from 'node:assert/strict';
import { Speech, pickVoice, rankVoices, estimateMs, START_WAIT_MS } from '../src/speech.js';

// Timers that only move when told to, and a speech synthesis that does what the test says.
function world(behaviour = 'normal', voices = []) {
  let now = 0;
  const timers = [];
  const setTimer = (fn, ms) => { const t = { fn, at: now + ms, on: true }; timers.push(t); return t; };
  const clearTimer = (t) => { if (t) t.on = false; };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.on && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.on = false; now = due.at; due.fn();
    }
    now = end;
  };
  const spoken = [];
  const synth = {
    cancels: 0,
    getVoices: () => voices,
    speak(u) {
      spoken.push(u);
      if (behaviour === 'normal') { setTimer(() => u.onstart?.(), 50); setTimer(() => u.onend?.(), 1200); }
      if (behaviour === 'error') setTimer(() => u.onerror?.({ error: 'not-allowed' }), 10);
      if (behaviour === 'startsNeverEnds') setTimer(() => u.onstart?.(), 50);
      // 'silent': nothing ever happens
    },
    cancel() { this.cancels++; const last = spoken.at(-1); if (last && behaviour === 'normal') setTimer(() => last.onerror?.({ error: 'interrupted' }), 1); },
    addEventListener() {}, removeEventListener() {},
  };
  const makeUtterance = (text) => ({ text });
  const captions = [];
  const speech = new Speech({ tag: 'fr-FR', synth, makeUtterance, setTimer, clearTimer, onCaption: (t) => captions.push(t) });
  return { speech, synth, advance, spoken, captions, now: () => now, setTimerForTest: setTimer, clearTimerForTest: clearTimer };
}

const settle = async (w, ms) => { w.advance(ms); await Promise.resolve(); await Promise.resolve(); };

// What a Mac lists for French, in the order it lists them (the first of them is the worst).
const MAC_FR = ['Eddy (French (France))', 'Flo (French (France))', 'Grandma (French (France))', 'Grandpa (French (France))', 'Jacques', 'Rocko (French (France))', 'Sandy (French (France))', 'Shelley (French (France))', 'Thomas']
  .map((name) => ({ name, lang: 'fr-FR', localService: true }));

test('voices: a real voice, not the first one of the list: Thomas, not Eddy', () => {
  assert.equal(pickVoice(MAC_FR, 'fr-FR').name, 'Thomas');
  const de = [{ name: 'Eddy (German (Germany))', lang: 'de-DE', localService: true }, { name: 'Flo (German (Germany))', lang: 'de-DE', localService: true }, { name: 'Anna', lang: 'de-DE', localService: true }];
  assert.equal(pickVoice(de, 'de-DE').name, 'Anna');
  const it = [{ name: 'Eddy (Italian (Italy))', lang: 'it-IT', localService: true }, { name: 'Alice', lang: 'it-IT', localService: true }];
  assert.equal(pickVoice(it, 'it-IT').name, 'Alice');
  const en = [{ name: 'Eddy (English (United Kingdom))', lang: 'en-GB', localService: true }, { name: 'Daniel', lang: 'en-GB', localService: true }, { name: 'Zarvox', lang: 'en-US', localService: true }];
  assert.equal(pickVoice(en, 'en-GB').name, 'Daniel');
});

test('voices: neural, premium and Google voices come first; the novelty ones last', () => {
  const v = [...MAC_FR,
    { name: 'Google français', lang: 'fr-FR', localService: false },
    { name: 'Microsoft Denise Online (Natural) - French (France)', lang: 'fr-FR', localService: false },
    { name: 'Audrey (Premium)', lang: 'fr-FR', localService: true }];
  const names = rankVoices(v, 'fr-FR').map((x) => x.name);
  assert.equal(names[0], 'Microsoft Denise Online (Natural) - French (France)');
  assert.ok(names.indexOf('Audrey (Premium)') < names.indexOf('Thomas'));
  assert.ok(names.indexOf('Google français') < names.indexOf('Thomas'));
  assert.ok(names.indexOf('Thomas') < names.indexOf('Eddy (French (France))'));
  assert.ok(names.indexOf('Jacques') > names.indexOf('Thomas'));
});

test('voices: the language first (the exact one, else the same language, never another), a voice asked for wins', () => {
  const v = [
    { name: 'Amélie', lang: 'fr-CA', localService: true },
    { name: 'Thomas', lang: 'fr-FR', localService: true },
    { name: 'Anna', lang: 'de-DE', localService: true },
    { name: 'Sandy', lang: 'fr_FR', localService: true },
  ];
  assert.equal(pickVoice(v, 'fr-FR').name, 'Thomas');
  assert.equal(pickVoice(v.filter((x) => x.name !== 'Thomas'), 'fr-FR').name, 'Amélie', 'another French beats a novelty one of the exact language here');
  assert.equal(pickVoice(v, 'it-IT'), null);
  assert.equal(pickVoice([], 'fr-FR'), null);
  assert.equal(pickVoice(v, 'fr-FR', 'sandy').name, 'Sandy', 'asked for by name');
  assert.equal(pickVoice(v, 'fr-FR', 'nobody').name, 'Thomas', 'a name that does not exist asks for nothing');
});

test('the voice chosen at the debug panel is remembered; the address can ask for another', async () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const w = world('normal', MAC_FR);
  const make = (extra = {}) => { const s = new Speech({ tag: 'fr-FR', synth: w.synth, makeUtterance: (text) => ({ text }), setTimer: () => 0, clearTimer: () => {}, storage, ...extra }); return s; };
  const a = make();
  await a.ready();
  assert.equal(a.voice.name, 'Thomas');
  const next = a.nextVoice();
  assert.notEqual(next.name, 'Thomas');
  const b = make();
  await b.ready();
  assert.equal(b.voice.name, next.name, 'the same voice next time');
  const c = make({ prefer: 'jacques' });
  await c.ready();
  assert.equal(c.voice.name, 'Jacques');
});

test('a voice that fails is replaced by another one of the phone before falling silent', async () => {
  const voices = [{ name: 'Google français', lang: 'fr-FR', localService: false }, { name: 'Thomas', lang: 'fr-FR', localService: true }];
  const used = [];
  const w = world('normal', voices);
  const speech = new Speech({
    tag: 'fr-FR', synth: w.synth, setTimer: (f, ms) => w.setTimerForTest(f, ms), clearTimer: (t) => w.clearTimerForTest(t), storage: null,
    makeUtterance: (text) => {
      const u = { text };
      return u;
    },
  });
  await speech.ready();
  assert.equal(speech.voice.name, 'Google français', 'the best first');
  // the network voice fails (offline), the phone's voice works
  w.synth.speak = (u) => {
    used.push(u.voice.name);
    if (u.voice.localService) { w.setTimerForTest(() => u.onstart?.(), 20); w.setTimerForTest(() => u.onend?.(), 900); }
    else w.setTimerForTest(() => u.onerror?.({ error: 'network' }), 20);
  };
  let started = null, done = false;
  speech.speak('Bonjour', { onStart: () => { started = w.now(); } }).then(() => { done = true; });
  await settle(w, 100);
  assert.deepEqual(used, ['Google français', 'Thomas']);
  assert.ok(started !== null && started < 200, 'it speaks at once with the other voice, not after a silence');
  await settle(w, 1000);
  assert.equal(done, true);
  assert.equal(speech.voice.name, 'Thomas', 'and goes on with it');
});

test('a sentence: onStart when the voice starts, resolved when it ends, the caption shown', async () => {
  const w = world('normal');
  let started = null;
  let done = false;
  w.speech.speak('Bonjour', { onStart: () => { started = w.now(); } }).then(() => { done = true; });
  assert.deepEqual(w.captions, ['Bonjour']);
  assert.equal(w.spoken[0].lang, 'fr-FR');
  await settle(w, 60);
  assert.equal(started, 50);
  assert.equal(done, false);
  await settle(w, 1200);
  assert.equal(done, true);
});

test('a voice that does not start is replaced by silence of the right length, with the gesture on time', async () => {
  const w = world('silent');
  let started = null, done = false;
  const text = 'Bonjour, je m\'appelle Thymio';
  w.speech.speak(text, { onStart: () => { started = w.now(); } }).then(() => { done = true; });
  await settle(w, START_WAIT_MS - 10);
  assert.equal(started, null, 'not yet');
  await settle(w, 20);
  assert.equal(started, START_WAIT_MS, 'the gesture goes at the moment the voice was given up');
  await settle(w, estimateMs(text) - 50);
  assert.equal(done, false, 'still "saying" it');
  await settle(w, 100);
  assert.equal(done, true);
  assert.ok(w.synth.cancels >= 1);
});

test('a voice that fails (not allowed) is replaced by silence at once, not by an instant end', async () => {
  const w = world('error');
  let done = false;
  const text = 'Super, je me réjouis !';
  w.speech.speak(text).then(() => { done = true; });
  await settle(w, 100);
  assert.equal(done, false, 'it has not ended in a flash');
  await settle(w, estimateMs(text) - 150);
  assert.equal(done, false, 'it takes the time the sentence takes');
  await settle(w, 100);
  assert.equal(done, true);
});

test('a voice that starts and never ends is not waited for for ever', async () => {
  const w = world('startsNeverEnds');
  let done = false;
  w.speech.speak('Oui').then(() => { done = true; });
  await settle(w, 60);
  assert.equal(done, false);
  await settle(w, estimateMs('Oui') * 2 + 2600);
  assert.equal(done, true);
});

test('cancelling ends the sentence now, and the next one is not mistaken for it', async () => {
  const w = world('normal');
  let first = false, second = false;
  w.speech.speak('un').then(() => { first = true; });
  await settle(w, 100);
  w.speech.cancel();
  await settle(w, 5);
  assert.equal(first, true);
  w.speech.speak('deux').then(() => { second = true; });
  await settle(w, 5);
  assert.equal(second, false, 'the cancelled one\'s late error does not end the new one');
  await settle(w, 1300);
  assert.equal(second, true);
});

test('with no speech synthesis at all, it is silent and takes the time the sentence takes', async () => {
  const w = world();
  w.speech.synth = null;
  let started = false, done = false;
  w.speech.speak('Bonne nuit', { onStart: () => { started = true; } }).then(() => { done = true; });
  assert.equal(started, true);
  assert.equal(done, false);
  assert.equal(w.speech.available, false);
  await settle(w, estimateMs('Bonne nuit') + 5);
  assert.equal(done, true);
});

test('the default timers work as a browser calls them (a method of another object throws there)', async () => {
  // a browser's setTimeout throws "Illegal invocation" when `this` is not the window: mimic it
  const real = globalThis.setTimeout;
  globalThis.setTimeout = function (fn, ms) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return real(fn, ms);
  };
  try {
    const speech = new Speech({ tag: 'fr-FR', synth: null });
    const t0 = Date.now();
    await speech.speak('a');
    assert.ok(Date.now() - t0 >= estimateMs('a') - 20);
  } finally { globalThis.setTimeout = real; }
});
