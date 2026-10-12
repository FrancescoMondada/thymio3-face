// The robot's voice: the phone's speech synthesis.
//
// speak() resolves when the sentence has been said, however it ended. It never rejects and never
// hangs: Chrome sometimes does not fire `end` (a voice that fails, a page put to the background), so
// a timer based on the length of the text ends the wait; and with no speech synthesis at all the
// timer is the voice (the captions then say the words).
//
// `synth` and `makeUtterance` are injected for tests; the defaults are the browser's.

// Which voice to speak with. A browser lists whatever the system has, in no order of quality, and the
// first of a language is often the worst: on a Mac the French ones start with Eddy, Flo, Grandma...
// (robotic voices made for fun), while Thomas is a real one. So the voices are ranked:
//   - the language first (the exact one, French of France for fr-FR; another French is a poor second);
//   - then what is known to sound good: the neural voices of Edge ("Natural"), the premium and enhanced
//     voices of the system, Chrome's "Google ..." voices (they come over the network), the plain good
//     voices of macOS (Thomas, Anna, Alice, Daniel...);
//   - and what is known to sound bad is pushed to the end.
const NOVELTY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Jacques)\b/i;
const GOOD = /^(Thomas|Am[eé]lie|Audrey|Aur[eé]lie|Anna|Markus|Petra|Yannick|Alice|Luca|Federica|Paola|Daniel|Kate|Serena|Oliver|Samantha)\b/i;

const norm = (lang) => String(lang || '').toLowerCase().replace('_', '-');

export function voiceScore(v, tag) {
  const lang = norm(v.lang), want = norm(tag);
  let score = lang === want ? 100 : lang.split('-')[0] === want.split('-')[0] ? 40 : -1000;
  const name = String(v.name || '');
  if (/natural|neural/i.test(name)) score += 90;
  if (/online/i.test(name)) score += 10;
  if (/premium/i.test(name)) score += 60;
  if (/enhanced|siri/i.test(name)) score += 50;
  if (/^google\b/i.test(name)) score += 45;
  if (GOOD.test(name)) score += 30;
  if (NOVELTY.test(name)) score -= 90;
  if (v.localService) score += 3;                       // works with no network
  return score;
}

// The voices that speak the language, best first.
export function rankVoices(voices, tag) {
  return voices
    .map((v) => ({ v, score: voiceScore(v, tag) }))
    .filter((x) => x.score > -500)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.v);
}

// `prefer`: part of a voice's name, asked for by the person who runs the demo; it wins when there is one.
export const pickVoice = (voices, tag, prefer = '') => {
  const ranked = rankVoices(voices, tag);
  const want = String(prefer || '').toLowerCase();
  return (want && ranked.find((v) => v.name.toLowerCase().includes(want))) || ranked[0] || null;
};

// What a mute robot, or one whose voice does not answer, waits for a text: about 70 ms a character.
export const estimateMs = (text) => 500 + text.length * 70;
export const START_WAIT_MS = 3000;                      // a voice that has not started by then is not going to

const defaultStorage = () => { try { return localStorage; } catch { return null; } };

export class Speech {
  constructor({ tag, synth, makeUtterance, rate = 0.95, pitch = 1, prefer = '', storage, onCaption, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t) } = {}) {
    this.tag = tag;
    this.synth = synth !== undefined ? synth : (typeof speechSynthesis !== 'undefined' ? speechSynthesis : null);
    this.makeUtterance = makeUtterance || ((text) => new SpeechSynthesisUtterance(text));
    // (a pitch above 1 makes most system voices sound worse: the voice is left as it was made)
    this.rate = rate;
    this.pitch = pitch;
    this.prefer = prefer;
    this.storage = storage !== undefined ? storage : defaultStorage();
    this.onCaption = onCaption;
    // (not `setTimeout` itself: called as a method of this object, a browser throws "Illegal invocation")
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.ranked = [];                        // the voices of the language, best first
    this.voice = null;
    this.current = null;                     // { finish } of the sentence being said
  }

  get available() { return Boolean(this.synth); }

  get key() { return `face.voice.${this.tag}`; }

  // The voices of a browser arrive a moment after the page: wait for them (but not for long).
  async ready(waitMs = 1500) {
    if (!this.synth) return false;
    const have = () => this.synth.getVoices?.() || [];
    if (!have().length && this.synth.addEventListener) {
      await new Promise((resolve) => {
        const done = () => { this.synth.removeEventListener('voiceschanged', done); this.clearTimer(timer); resolve(); };
        const timer = this.setTimer(done, waitMs);
        this.synth.addEventListener('voiceschanged', done);
      });
    }
    this.ranked = rankVoices(have(), this.tag);
    // the voice asked for in the address, then the one chosen on this phone before, then the best
    let saved = '';
    try { saved = this.storage?.getItem(this.key) || ''; } catch { /* private mode */ }
    this.voice = this.ranked.find((v) => this.prefer && v.name.toLowerCase().includes(String(this.prefer).toLowerCase()))
      || this.ranked.find((v) => v.name === saved)
      || this.ranked[0] || null;
    return true;
  }

  // The next voice of the language (to try them in turn, from the debug panel); remembered on this phone.
  nextVoice() {
    if (!this.ranked.length) return null;
    const i = this.ranked.indexOf(this.voice);
    this.voice = this.ranked[(i + 1) % this.ranked.length];
    try { this.storage?.setItem(this.key, this.voice.name); } catch { /* private mode */ }
    return this.voice;
  }

  // Say `text`. `onStart` runs when the voice begins (or when a mute robot would). Resolves when done.
  //
  // A voice that fails or does not start within a few seconds (no network for a network voice, no
  // permission yet, a voice that is gone) is replaced by another one of the phone, twice at most; if none
  // speaks, by silence of the length the sentence would take: the story goes at its own pace, with its
  // gestures and captions, whatever the voice does.
  speak(text, { onStart } = {}) {
    if (this.current) this.cancel();
    this.onCaption?.(text);
    return new Promise((resolve) => {
      let timer = 0, startTimer = 0, done = false, started = false, retries = 0;
      const start = () => { if (!started) { started = true; onStart?.(); } };
      const finish = () => {
        if (done) return;
        done = true;
        this.clearTimer(timer);
        this.clearTimer(startTimer);
        if (this.current === handle) this.current = null;
        resolve();
      };
      const handle = { finish };
      this.current = handle;
      // what a mute robot does
      const mute = () => {
        if (done) return;
        this.clearTimer(startTimer);
        this.clearTimer(timer);
        start();
        timer = this.setTimer(finish, estimateMs(text));
      };
      // this voice did not work: another one of the phone, if there is one
      const failed = () => {
        if (done || started) { mute(); return; }
        const other = retries < 2 ? this.ranked.find((v) => v !== this.voice && v.localService && !this.tried.has(v)) : null;
        if (!other) { mute(); return; }
        retries++;
        this.tried.add(this.voice);
        this.voice = other;
        go();
      };
      const go = () => {
        this.clearTimer(startTimer);
        try {
          const u = this.makeUtterance(text);
          u.lang = this.tag;
          if (this.voice) u.voice = this.voice;
          u.rate = this.rate;
          u.pitch = this.pitch;
          let mine = true;
          u.onstart = () => {
            if (done || !mine) return;
            this.clearTimer(startTimer);
            start();
            // a voice that starts and never says it is done is not waited for for ever
            this.clearTimer(timer);
            timer = this.setTimer(() => { finish(); try { this.synth.cancel(); } catch { /* nothing to stop */ } }, estimateMs(text) * 2 + 2500);
          };
          u.onend = () => { if (mine) finish(); };
          u.onerror = (e) => {
            if (!mine) return;
            mine = false;
            if (e?.error === 'canceled' || e?.error === 'interrupted') finish(); else failed();
          };
          this.tried = this.tried || new Set();
          this.synth.speak(u);
          startTimer = this.setTimer(() => { mine = false; try { this.synth.cancel(); } catch { /* nothing to stop */ } failed(); }, START_WAIT_MS);
        } catch {
          mute();
        }
      };
      this.tried = new Set();
      if (!this.synth) { mute(); return; }
      go();
    });
  }

  cancel() {
    const c = this.current;
    if (!c) return;
    this.current = null;
    try { this.synth?.cancel(); } catch { /* nothing to stop */ }
    c.finish();
  }
}
