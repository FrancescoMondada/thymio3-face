import test from 'node:test';
import assert from 'node:assert/strict';
import { Aim, DEG_S_PER_UNIT } from '../src/robot/aim.js';

// A robot that turns on the spot in front of a person, seen by a camera that is late and a link that
// is late: the situation the step-by-step control is for.
function simulate({ start, personAt = 0, seconds = 20, cameraLagMs = 250, linkLagMs = 100, hfov = 62, frameMs = 66, aim = new Aim({ hfov }), flip = false }) {
  const dt = 10;
  let heading = start - personAt;            // degrees to the right of the person; the error is -heading... see below
  // `err` = how far to the right of the robot's front the person is
  let err = -heading;
  const frames = [];                          // what the camera saw, and when it will be available
  const commands = [];                        // wheel commands on their way to the robot
  let wheel = { left: 0, right: 0 };
  const history = [];
  let nextFrame = 0;
  let lastSeen = null;
  const trail = [];
  for (let t = 0; t < seconds * 1000; t += dt) {
    if (t >= nextFrame) { frames.push({ at: t + cameraLagMs, cx: 0.5 + (flip ? -err : err) / hfov }); nextFrame += frameMs; }
    while (frames.length && frames[0].at <= t) lastSeen = { ...frames.shift(), seen: t };
    if (lastSeen) {
      const step = aim.update(t, lastSeen.cx, lastSeen.seen);
      if (step) {
        commands.push({ at: t + linkLagMs, ...step });
        commands.push({ at: t + linkLagMs + step.ms, left: 0, right: 0 });
      }
    }
    while (commands.length && commands[0].at <= t) { const c = commands.shift(); wheel = { left: c.left, right: c.right }; }
    const rate = ((wheel.left - wheel.right) / 2) * DEG_S_PER_UNIT;       // degrees/s turning to the right
    err -= rate * (dt / 1000);
    trail.push({ t, err, moving: wheel.left !== 0 });
    history.push(err);
  }
  return { err, trail, history };
}

test('the robot turns to a face on its right, and one on its left, and stops in front of it', () => {
  for (const start of [25, 12, -18, -28]) {
    const { err, trail } = simulate({ start: -start });          // person at `start` degrees from the front
    assert.ok(Math.abs(err) < 4.5, `from ${start} degrees: ends ${err.toFixed(1)} degrees off`);
    const last = trail.slice(-300);
    assert.ok(last.every((p) => !p.moving), `from ${start}: still at the end`);
  }
});

test('it does not swing around the face', () => {
  for (const start of [30, -30, 15]) {
    const { history } = simulate({ start: -start });
    let crossings = 0;
    for (let i = 1; i < history.length; i++) if (history[i - 1] * history[i] < 0 && Math.abs(history[i]) > 0.01) crossings++;
    assert.ok(crossings <= 1, `from ${start} degrees it crossed the face ${crossings} times`);
  }
});

test('a face already in the middle does not move it, and noise inside the dead zone does not either', () => {
  const aim = new Aim();
  assert.equal(aim.update(0, 0.5), null);
  assert.equal(aim.update(100, 0.5 + 4 / 62), null, '4 degrees: still quiet');
  assert.equal(aim.update(200, 0.5 - 5 / 62), null, '5 degrees: still quiet');
  assert.ok(aim.update(300, 0.5 + 8 / 62), '8 degrees: it turns');
});

test('a face on the right turns the robot to the right: left wheel forward, right wheel back', () => {
  const aim = new Aim();
  const s = aim.update(0, 0.9);
  assert.ok(s.left > 0 && s.right < 0 && s.left === -s.right, JSON.stringify(s));
  const t = new Aim().update(0, 0.1);
  assert.ok(t.left < 0 && t.right > 0);
  const f = new Aim({ flip: true }).update(0, 0.9);
  assert.ok(f.left < 0 && f.right > 0, 'a mirrored camera turns the other way');
});

test('steps are bounded: slow enough to be safe, long enough to move', () => {
  const s = new Aim().update(0, 1);
  assert.ok(s.ms >= 120 && s.ms <= 450, `${s.ms} ms`);
  assert.ok(Math.abs(s.left) <= 190 && Math.abs(s.left) >= 70);
  const small = new Aim().update(0, 0.5 + 7 / 62);
  assert.ok(Math.abs(small.left) >= 70, 'never below the speed that moves the wheels');
});

test('it waits for the camera to show the result before the next step', () => {
  const aim = new Aim();
  const s = aim.update(0, 0.9);
  assert.equal(aim.update(s.ms + 100, 0.9), null, 'right after the step');
  assert.ok(aim.update(s.ms + 400, 0.9), 'then it looks again');
});

test('a face not seen for a while is no reason to turn', () => {
  const aim = new Aim();
  assert.equal(aim.update(1000, 0.9, 200), null, 'the last sighting is too old');
  assert.equal(aim.update(1000, null), null);
});
