import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, plain } from './helpers.js';

const present = (w, extra = {}) => Object.assign(w.person, { present: true, since: w.clock.now() }, extra);

test('asleep at first, and a face that only passes by does not wake it', async () => {
  const w = makeWorld();
  w.brain.start();
  assert.equal(w.face.mood, 'sleep');
  present(w);
  await w.run(400);
  w.person.present = false;
  await w.run(2000);
  assert.equal(w.brain.phase, 'asleep');
  assert.deepEqual(w.said(), []);
});

test('a face that stays wakes it, and it introduces itself in French, nodding at "oui" and shaking at "non"', async () => {
  const w = makeWorld();
  w.brain.start();
  present(w);
  await w.run(7400);                                // the question takes about 6 seconds to ask
  assert.equal(w.brain.phase, 'awake');
  const said = w.said();
  assert.equal(said[0], w.T.intro[0].say);
  assert.ok(said.slice(0, 5).join(' ').startsWith('Bonjour, je m\'appelle Thymio'));
  assert.deepEqual(said.slice(0, 5), w.T.intro.map((s) => s.say));
  const nod = w.face.calls.find((c) => c[0] === 'nod');
  const shake = w.face.calls.find((c) => c[0] === 'shake');
  const oui = w.speech.said.find((x) => x.text === 'oui');
  const non = w.speech.said.find((x) => x.text === 'non');
  assert.equal(nod[1], oui.t, 'the nod starts with "oui"');
  assert.equal(shake[1], non.t, 'the shake starts with "non"');
  assert.ok(w.robot.log.includes('shakeBody'), 'the body shakes with "no"');
});

test('the whole demonstration: yes, the hand, the tickle, the ground, the table, the fright, backing, goodnight, asleep', async () => {
  const w = makeWorld();
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.runToSleep();
  const T = w.T;
  const expected = [
    ...T.intro, ...T.yes, ...T.front, ...T.tickle, ...T.ground, ...T.edgeIntro, ...T.edge, ...T.bye,
  ].map((s) => s.say);
  assert.deepEqual(w.said(), expected);
  assert.equal(w.brain.phase, 'asleep');
  assert.equal(w.face.mood, 'sleep');
  const log = w.robot.log;
  const order = ['prepareHand', 'handStart', 'handEnd', 'prepareEdge', 'walk', 'walkEnd', 'prepareBack', 'back'];
  let at = -1;
  for (const name of order) { const i = log.indexOf(name, at + 1); assert.ok(i > at, `${name} comes after the previous one in ${log.join(' ')}`); at = i; }
  const moods = w.face.moods;
  assert.ok(moods.indexOf('scared') > moods.indexOf('curious'), 'scared after the walk began');
  assert.ok(moods.indexOf('relieved') > moods.indexOf('scared'));
  assert.equal(moods.filter((m) => m === 'scared').length, 1);
  assert.equal(log.at(-1), 'stop', 'the wheels are stopped when it sleeps');
  assert.ok(w.face.calls.some((c) => c[0] === 'giggle'), 'it giggled at the hand');
  assert.ok(w.face.moods.includes('laugh'));
});

test('the order of the steps: the hand before the ground, the fright at the edge', async () => {
  const w = makeWorld();
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  const seen = [];
  const watch = (t) => { if (!seen.length || seen.at(-1)[0] !== w.brain.stepName) seen.push([w.brain.stepName, t]); };
  const orig = w.brain.observe.bind(w.brain);
  w.brain.observe = (o) => { watch(w.clock.now()); orig(o); };
  await w.runToSleep();
  const names = seen.map((s) => s[0]);
  for (const n of ['wake', 'ask', 'listening', 'yes', 'front sensors', 'waiting for a hand', 'ground sensors', 'table', 'walking', 'the edge', 'backing', 'sleep', 'asleep']) {
    assert.ok(names.includes(n), `step "${n}" in ${names.join(' > ')}`);
  }
  assert.ok(names.indexOf('waiting for a hand') > names.indexOf('front sensors'));
  assert.ok(names.indexOf('ground sensors') > names.indexOf('waiting for a hand'));
  assert.ok(names.indexOf('walking') > names.indexOf('table'));
  assert.ok(names.indexOf('backing') > names.indexOf('the edge'));
});

test('"no" with the head: it is sad, says goodnight, goes to sleep, and does not move', async () => {
  const w = makeWorld();
  w.person.head = 'no';
  w.brain.start();
  present(w);
  await w.run(25000);
  assert.deepEqual(w.said(), [...w.T.intro, ...w.T.no].map((s) => s.say));
  assert.equal(w.brain.phase, 'asleep');
  assert.ok(w.face.moods.includes('sad'));
  assert.ok(!w.robot.log.some((l) => /walk|prepare|hand/.test(l)));
});

test('no answer: it asks once more, then goes to sleep without a word', async () => {
  const w = makeWorld();
  w.brain.start();
  present(w);
  await w.run(45000);
  assert.deepEqual(w.said(), [...w.T.intro, ...w.T.reprompt].map((s) => s.say));
  assert.equal(w.brain.phase, 'asleep');
});

test('the answer is read in the window it is given, and not before the question is asked', async () => {
  const w = makeWorld();
  w.person.head = 'yes';                            // the person nods all the time, even during the question
  w.brain.start();
  present(w);
  await w.run(2500);
  assert.equal(w.brain.listening, false, 'still asking');
  assert.ok(!w.face.moods.includes('excited'));
});

test('without a face for 10 seconds it falls asleep, in the middle of a sentence, and stops talking', async () => {
  const w = makeWorld();
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.run(3000);                               // asking the question
  assert.equal(w.brain.phase, 'awake');
  w.person.present = false;
  await w.run(9000);
  assert.equal(w.brain.phase, 'awake', 'not yet: 9 seconds');
  await w.run(2500);
  assert.equal(w.brain.phase, 'asleep');
  assert.equal(w.face.mood, 'sleep');
  const spoken = w.said().length;
  await w.run(20000);
  assert.equal(w.said().length, spoken, 'it said nothing more');
  assert.ok(!w.robot.log.includes('walk'), 'and did not go anywhere');
});

test('the 10 seconds count from the last time the face was seen, also while it explains the sensors', async () => {
  const w = makeWorld();
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.run(9000);                               // answered, saying "super"
  w.person.present = false;
  await w.run(3000);
  w.person.present = true;                         // back after 3 seconds: nothing happened
  await w.run(1000);
  assert.equal(w.brain.phase, 'awake');
});

test('a face that comes back within the 10 seconds keeps it awake', async () => {
  const w = makeWorld();
  w.brain.start();
  present(w);
  await w.run(5000);
  w.person.present = false;
  await w.run(8000);
  present(w);
  await w.run(5000);
  assert.equal(w.brain.phase, 'awake');
});

test('losing the face while it walks to the edge does not stop it on the table', async () => {
  const w = makeWorld({ robotOpt: { walkMs: 14000 } });
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  let walking = 0;
  const watch = () => { if (w.robot.moving) walking++; };
  // the person looks away as soon as the robot sets off
  w.brain.onState = (s) => { if (s.step === 'walking') w.person.present = false; };
  for (let i = 0; i < 1400; i++) { await w.run(50); watch(); }
  assert.ok(walking > 0, 'it walked');
  assert.ok(w.robot.log.includes('walkEnd'), 'it got to the end of the walk: ' + w.robot.log.join(' '));
  assert.ok(w.robot.log.includes('back'), 'and backed away');
});

test('no edge found (a dark table): no fright, it says so, and still says goodnight', async () => {
  const w = makeWorld({ robotOpt: { edge: 'dark' } });
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.runToSleep();
  const said = w.said();
  assert.ok(said.includes(w.T.noEdge[0].say));
  assert.ok(!said.includes(w.T.edge[0].say));
  assert.ok(!w.face.moods.includes('scared'));
  assert.ok(!w.robot.log.includes('prepareBack'));
  assert.equal(said.at(-1), w.T.bye[0].say);
  assert.equal(w.brain.phase, 'asleep');
});

test('a script that cannot be sent does not stop the story', async () => {
  const w = makeWorld({ robotOpt: { edgeFails: true } });
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.runToSleep();
  assert.ok(w.said().includes(w.T.noEdge[0].say));
  assert.equal(w.brain.phase, 'asleep');
});

// Run until the robot has told its story and gone back to sleep.
async function runUntilAsleepAfterTheDemo(w) {
  for (let i = 0; i < 400; i++) {
    await w.run(500);
    if (w.said().length >= 12 && w.brain.phase === 'asleep') return;
  }
  assert.fail('the demonstration did not end');
}

test('after the demonstration it does not start again for the person who is still there, at once', async () => {
  const w = makeWorld();
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await runUntilAsleepAfterTheDemo(w);
  const first = w.said().length;
  await w.run(25000);                              // the person stays in front of the robot
  assert.equal(w.brain.phase, 'asleep');
  assert.equal(w.said().length, first);
});

test('thirty seconds after it went to sleep, the same person still there wakes it again', async () => {
  const w = makeWorld();
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await runUntilAsleepAfterTheDemo(w);
  const first = w.said().length;
  const slept = w.clock.now();
  await w.run(28000);
  assert.equal(w.brain.phase, 'asleep', 'not yet, at 28 s');
  await w.run(4000);                               // 32 s
  assert.equal(w.brain.phase, 'awake');
  assert.ok(w.clock.now() - slept < 36000);
  assert.ok(w.said().length > first, 'and it speaks again');
  assert.equal(w.said()[first], w.T.intro[0].say, 'from the start');
});

test('a new face, after the person has gone, wakes it before the 30 seconds', async () => {
  const w = makeWorld();
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await runUntilAsleepAfterTheDemo(w);
  const first = w.said().length;
  w.person.present = false;                        // leaves
  await w.run(3500);
  present(w);                                      // someone comes
  await w.run(4000);
  assert.equal(w.brain.phase, 'awake');
  assert.ok(w.said().length > first);
});

test('asleep from the 10 seconds without a face: a face that comes back wakes it at once', async () => {
  const w = makeWorld();
  w.brain.start();
  present(w);
  await w.run(3000);
  w.person.present = false;
  await w.run(11000);
  assert.equal(w.brain.phase, 'asleep');
  present(w);
  await w.run(2000);
  assert.equal(w.brain.phase, 'awake');
});

test('it turns to a face on its side, and keeps still while it listens and while it walks', async () => {
  const w = makeWorld();
  w.brain.start();
  present(w, { cx: 0.5 });
  await w.run(1500);                               // awake, asking
  assert.equal(w.brain.phase, 'awake');
  const before = w.robot.steps.length;
  w.person.cx = 0.9;
  await w.run(1200);
  assert.ok(w.robot.steps.length > before, 'it turned');
  const s = w.robot.steps.at(-1);
  assert.ok(s.left > 0 && s.right < 0, 'to the right');
  // listening: no turning
  await w.run(8000);
  assert.ok(w.brain.listening || w.said().length >= 5);
  const n = w.robot.steps.length;
  const listening = w.brain.listening;
  if (listening) {
    w.person.cx = 0.1;
    await w.run(1000);
    assert.equal(w.robot.steps.length, n, 'no turning while it listens');
  }
});

test('the eyes follow the face, mirrored: a face to the robot\'s right is to the left of the screen', async () => {
  const w = makeWorld();
  w.brain.start();
  present(w, { cx: 0.5 });
  await w.run(1500);
  w.person.cx = 0.8;
  await w.run(100);
  assert.ok(w.face.gaze[0] < -0.4, `gaze x ${w.face.gaze[0]}`);
  w.person.cy = 0.2;
  await w.run(100);
  assert.ok(w.face.gaze[1] < 0, 'a face high in the picture is looked up at');
});

test('it speaks the language it was started with', async () => {
  for (const lang of ['de', 'en', 'it']) {
    const w = makeWorld({ lang });
    w.brain.start();
    present(w);
    await w.run(3500);
    assert.equal(w.said()[0], w.T.intro[0].say, lang);
    assert.notEqual(w.said()[0], makeWorld({ lang: 'fr' }).T.intro[0].say);
  }
});

test('stopping for good cancels the speech, stops the robot and ends the story', async () => {
  const w = makeWorld();
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.run(14000);
  await w.brain.stop();
  assert.equal(w.brain.phase, 'stopped');
  assert.ok(w.robot.log.includes('abort'));
  const n = w.said().length;
  await w.run(20000);
  assert.equal(w.said().length, n);
});

test('"Voici" follows "Super" at once, and each face changes at the moment its sentence starts', async () => {
  const w = makeWorld();
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.runToSleep();
  const said = (text) => w.speech.said.find((x) => x.text === text);
  const moodAt = (mood, after) => w.face.calls.find((c) => c[0] === 'mood' && c[1] === mood && c[2] >= after)?.[2];

  const yes = said(w.T.yes[0].say);
  const yesEnds = yes.t + 200 + yes.text.length * 40;           // the fake voice's length
  const voici = said(w.T.front[0].say);
  assert.ok(voici.t - yesEnds <= 60, `"Voici" starts ${voici.t - yesEnds} ms after "Super" ended`);
  assert.equal(moodAt('excited', yes.t - 1), yes.t, 'excited as "Super" starts');
  assert.equal(moodAt('curious', yes.t + 1), voici.t, 'curious exactly as "Voici" starts, not before');
  const ground = said(w.T.ground[0].say);
  assert.equal(moodAt('curious', voici.t + 1), ground.t, 'curious as the sentence about the ground starts');
  const bye = said(w.T.bye[0].say);
  assert.equal(moodAt('happy', bye.t - 1), bye.t, 'happy as the goodnight starts');
});

// ---- the hand ----------------------------------------------------------------------------------------------------

// Run until the robot is waiting for a hand.
async function runToTheHand(w) {
  for (let i = 0; i < 400 && w.brain.stepName !== 'waiting for a hand'; i++) await w.run(100);
  assert.equal(w.brain.stepName, 'waiting for a hand');
}

test('the hand: it asks for it, laughs at once when it comes, and says "ça me chatouille" when the invitation is finished', async () => {
  const w = makeWorld({ robotOpt: { handAfterMs: 6500 } });
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.runToSleep();
  const said = (text) => w.speech.said.find((x) => x.text === text);
  const invite = said(w.T.front[0].say);
  const tickle = said(w.T.tickle[0].say);
  assert.ok(invite && tickle, 'both were said');
  assert.ok(tickle.t >= invite.t + 200 + invite.text.length * 40 - 5, 'the tickle comes after the invitation');
  const hand = w.robot.handEvents[0];
  const laugh = w.face.calls.find((c) => c[0] === 'mood' && c[1] === 'laugh');
  const giggle = w.face.calls.find((c) => c[0] === 'giggle');
  assert.ok(hand && laugh && giggle);
  assert.equal(giggle[1], laugh[2], 'giggling and laughing start together');
  assert.ok(laugh[2] - (invite.t) >= hand.ms - 60 && laugh[2] - invite.t <= hand.ms + 120, 'the face reacts when the hand is there, not when the script ends');
  assert.ok(!w.said().includes(w.T.noHand[0].say));
});

test('a hand that comes during the invitation is laughed at at once, and the words wait for the end of the invitation', async () => {
  const w = makeWorld({ robotOpt: { handAfterMs: 800 } });
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.runToSleep();
  const said = (text) => w.speech.said.find((x) => x.text === text);
  const invite = said(w.T.front[0].say);
  const tickle = said(w.T.tickle[0].say);
  const laugh = w.face.calls.find((c) => c[0] === 'mood' && c[1] === 'laugh');
  assert.ok(laugh[2] < invite.t + 1200, 'the face laughs at once');
  assert.ok(tickle.t >= invite.t + 200 + invite.text.length * 40 - 5, 'the invitation is not cut');
});

test('no hand in the time given: it says so, without a laugh, and goes on to the ground', async () => {
  const w = makeWorld({ robotOpt: { hand: 'never' } });
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.runToSleep();
  const said = w.said();
  assert.ok(said.includes(w.T.noHand[0].say));
  assert.ok(!said.includes(w.T.tickle[0].say));
  assert.ok(!w.face.moods.includes('laugh'));
  assert.ok(said.indexOf(w.T.noHand[0].say) < said.indexOf(w.T.ground[0].say));
  assert.ok(w.robot.log.includes('walkEnd'), 'the table demonstration still runs');
});

test('a hand script that cannot be sent does not stop the story', async () => {
  const w = makeWorld({ robotOpt: { hand: 'fails' } });
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.runToSleep();
  assert.ok(w.said().includes(w.T.ground[0].say), 'it went on');
  assert.equal(w.robot.log.includes('walkEnd'), true);
  assert.equal(w.brain.phase, 'asleep');
});

test('it does not turn to follow the face while it waits for a hand, and does not give up if the face is hidden by the hand', async () => {
  const w = makeWorld({ robotOpt: { hand: 'never', handWaitMs: 14000 } });
  w.person.head = 'yes';
  w.brain.start();
  present(w, { cx: 0.5 });
  await runToTheHand(w);
  const n = w.robot.steps.length;
  w.person.cx = 0.9;                               // the face moves to the side while the hand is in front
  await w.run(1500);
  assert.equal(w.robot.steps.length, n, 'no turning');
  w.person.present = false;                        // the hand hides the face for a long time
  await w.run(12000);
  assert.equal(w.brain.phase, 'awake', 'still there to see the hand');
});

test('the hand is looked for from the start of the invitation: a hand that is already there when the sentence ends is not missed', async () => {
  const w = makeWorld({ robotOpt: { handAfterMs: 500 } });
  w.person.head = 'yes';
  w.brain.start();
  present(w);
  await w.runToSleep();
  assert.ok(w.face.moods.includes('laugh'));
  const log = w.robot.log;
  assert.ok(log.indexOf('handStart') < log.indexOf('handEnd'));
});
