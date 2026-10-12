import { outcomeOf } from '../script-core.js';

// What the robot does, as the story asks for it (brain.js). Everything here goes through the link;
// the scripts that run on the robot are `scripts = { edge, back, hand }` (script.js), injected so that
// tests do not need Vite.

export class RobotActions {
  constructor({ link, scripts }) {
    this.link = link;
    this.scripts = scripts;
  }

  // ---- wheels --------------------------------------------------------------------------------------------
  // One step of the aim (aim.js): the wheels turn for `ms`, and stop by themselves.
  step({ left, right, ms }) { this.link.pulse(left, right, ms); }

  stop() { this.link.stopWheels(); }

  // "No", with the body: a quick turn to one side and back past the middle to the other, and back.
  // About 9 degrees each way at this speed (aim.js: 140 units turn the robot at 47 degrees per second).
  async shakeBody({ stopped = () => false, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    const U = 140;
    for (const [dir, ms] of [[1, 200], [-1, 400], [1, 200]]) {
      if (stopped()) break;
      this.link.pulse(dir * U, -dir * U, ms);
      await sleep(ms + 90);
    }
    this.link.stopWheels();
  }

  // ---- what runs on the robot ----------------------------------------------------------------------------------
  // Each has two parts, so that the script can be sent while something else happens: prepare*() sends it,
  // and the object it resolves with starts it. `start(onEvent)` resolves with how it ended, and calls
  // `onEvent` with each line the script prints as it comes.
  async prepare(text) {
    const run = await this.link.prepareScript(text);
    return {
      start: async (onEvent) => {
        const events = await run.start(onEvent);
        return { outcome: outcomeOf(events), events };
      },
    };
  }

  prepareEdge() { return this.prepare(this.scripts.edge); }
  prepareBack() { return this.prepare(this.scripts.back); }
  prepareHand() { return this.prepare(this.scripts.hand); }

  // The person went away, the page closes: whatever runs on the robot stops.
  async abort() {
    this.link.stopWheels();
    try { await this.link.abortScript(); } catch { /* the link is gone */ }
  }
}
