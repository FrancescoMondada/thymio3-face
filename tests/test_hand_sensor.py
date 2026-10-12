"""Runs src/py/hand_sensor.py, the script that waits for a hand in front of the robot, on a virtual
robot: five front proximity sensors that read what the test makes a hand do, and a clock that only moves
when the script sleeps. The script is the real one, as the interface builds it (run() at the end).

    python3 -I tests/test_hand_sensor.py
"""
import io
import os
import re
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = open(os.path.join(HERE, "..", "src", "py", "hand_sensor.py"), encoding="utf8").read()


class Front:
    """The five sensors: `background` is what they read all the time (a wall, noise), `hand` a function of
    time that gives the reading of one sensor (or None), `noise` a few counts of jitter."""

    def __init__(self, background=(0, 0, 0, 0, 0), hand_at=None, hand_sensor=2, hand_level=2600, hand_ms=3000,
                 noise=20, glitch_ms=None, fail_after_ms=None, ramp_ms=150, lag_start_high=False):
        self.t = 0
        self.background = list(background)
        self.hand_at, self.hand_sensor, self.hand_level, self.hand_ms = hand_at, hand_sensor, hand_level, hand_ms
        self.noise = noise
        self.glitch = glitch_ms
        self.fail_after = fail_after_ms
        self.ramp = ramp_ms
        self.out = io.StringIO()
        self.behaviors = None
        self.proximity_leds = False
        self.calls = []
        self.seed = 12345

    def rnd(self):
        self.seed = (self.seed * 1103515245 + 12345) & 0x7FFFFFFF
        return (self.seed >> 8) % 1000 / 1000.0 - 0.5

    def value(self, i):
        if self.fail_after is not None and self.t >= self.fail_after:
            raise RuntimeError("sensor failed")
        v = self.background[i] + self.noise * 2 * self.rnd()
        if self.hand_at is not None and self.hand_at <= self.t < self.hand_at + self.hand_ms:
            k = min(1.0, (self.t - self.hand_at) / float(self.ramp))             # the hand comes closer
            if i == self.hand_sensor:
                v = max(v, self.hand_level * k)
            elif abs(i - self.hand_sensor) == 1:
                v = max(v, self.hand_level * 0.35 * k)
        if self.glitch is not None and self.glitch <= self.t < self.glitch + 20:
            v = 4000
        return max(0, int(v))

    def modules(self):
        world = self

        class Prox:
            def __init__(self, i): self.i = i
            def value(self): return world.value(self.i)

        class Behaviors:
            def disable_behaviors(self): world.behaviors = False; world.proximity_leds = False; world.calls.append("disable_behaviors")
            def enable_behaviors(self): world.behaviors = True; world.proximity_leds = True; world.calls.append("enable_behaviors")
            def enable_leds_proximity(self): world.proximity_leds = True; world.calls.append("enable_leds_proximity")
            def disable_leds_proximity(self): world.proximity_leds = False

        thymio = types.ModuleType("thymio")
        thymio.PROXIMITY, thymio.BEHAVIORS = Prox, Behaviors
        clock = types.ModuleType("time")
        clock.sleep_ms = lambda ms: setattr(world, "t", world.t + int(ms))
        clock.ticks_ms = lambda: world.t
        clock.ticks_diff = lambda a, b: a - b
        return thymio, clock

    def run_text(self, text):
        thymio, clock = self.modules()
        saved = {k: sys.modules.get(k) for k in ("thymio", "time")}
        sys.modules["thymio"], sys.modules["time"] = thymio, clock
        old_out, sys.stdout = sys.stdout, self.out
        try:
            exec(compile(text, "hand_sensor.py", "exec"), {"__name__": "mp_script"})
        finally:
            sys.stdout = old_out
            for k, v in saved.items():
                if v is None:
                    sys.modules.pop(k, None)
                else:
                    sys.modules[k] = v
        return self

    def run_script(self):
        return self.run_text(SOURCE + "\nrun()\n")

    @property
    def lines(self):
        return [l.strip() for l in re.split(r"[\x1e\n]", self.out.getvalue()) if l.strip()]

    def words(self):
        return [l.split()[0] for l in self.lines]


class HandSensor(unittest.TestCase):
    def test_a_hand_is_seen_at_once_and_the_script_ends_cleanly(self):
        w = Front(hand_at=3000).run_script()
        self.assertEqual(w.words(), ["@@hello", "@@base", "@@hand", "@@bye"], w.lines)
        hand = [l for l in w.lines if l.startswith("@@hand")][0].split()
        sensor, value, ms = int(hand[1]), int(hand[2]), int(hand[3])
        self.assertEqual(sensor, 2)
        self.assertGreater(value, 700)
        # the hand crosses the limit (about 700 of 2600) after about 40 ms of its 150 ms approach: seen within 150 ms of it
        self.assertTrue(3000 - 150 < ms + 100 and ms < 3000 + 200, "%d ms" % ms)
        self.assertTrue(w.behaviors, "the firmware has its behaviors back")

    def test_the_proximity_leds_are_on_while_it_waits_and_the_firmware_gets_its_behaviors_back(self):
        w = Front(hand_at=1000).run_script()
        self.assertEqual(w.calls, ["disable_behaviors", "enable_leds_proximity", "enable_behaviors"])
        self.assertTrue(w.behaviors)

    def test_the_hand_can_be_at_any_of_the_five_sensors(self):
        for i in range(5):
            w = Front(hand_at=1500, hand_sensor=i).run_script()
            hand = [l for l in w.lines if l.startswith("@@hand")][0].split()
            self.assertEqual(int(hand[1]), i, (i, w.lines))

    def test_a_hand_a_few_centimetres_away_is_enough_but_not_a_far_one(self):
        near = Front(hand_at=1500, hand_level=1100).run_script()
        self.assertIn("@@hand", near.words())
        far = Front(hand_at=1500, hand_level=450).run_script()
        self.assertNotIn("@@hand", far.words(), "a reading of 450 is a wall, not a hand")

    def test_an_object_that_stays_in_front_is_not_a_hand_but_a_hand_closer_than_it_is(self):
        wall = (0, 300, 1500, 300, 0)                       # something at 10 cm, in front, all the time
        w = Front(background=wall).run_script()
        self.assertEqual(w.words()[-2], "@@nohand", w.lines)
        w = Front(background=wall, hand_at=2000, hand_level=3200).run_script()
        self.assertIn("@@hand", w.words(), "a hand that comes closer than the wall is a hand")
        w = Front(background=wall, hand_at=2000, hand_level=1900).run_script()
        self.assertNotIn("@@hand", w.words(), "a hand that does not come closer than the wall by the margin is not seen")

    def test_nothing_in_front_waits_the_whole_time_then_says_so(self):
        w = Front().run_script()
        self.assertEqual(w.words(), ["@@hello", "@@base", "@@nohand", "@@bye"], w.lines)
        ms = int([l for l in w.lines if l.startswith("@@nohand")][0].split()[1])
        self.assertTrue(16000 <= ms <= 16100, ms)

    def test_jitter_and_one_bad_reading_are_not_a_hand(self):
        w = Front(noise=120, glitch_ms=2000).run_script()
        self.assertNotIn("@@hand", w.words(), w.lines)

    def test_a_failure_in_the_middle_still_gives_the_behaviors_back(self):
        w = Front(fail_after_ms=500)
        with self.assertRaises(RuntimeError):
            w.run_script()
        self.assertTrue(w.behaviors)
        self.assertTrue(any(l.startswith("@@bye") for l in w.lines))

    def test_every_line_goes_out_at_once(self):
        w = Front(hand_at=1000).run_script()
        for chunk in w.out.getvalue().split("\x1e")[:-1]:
            self.assertEqual(len(chunk), 99, repr(chunk))

    def test_only_what_micropython_has(self):
        for banned in (":=", "f\"", "f'", "->", "import os", "import sys", "global ", "async ", "await "):
            self.assertNotIn(banned, SOURCE, banned)


def cli(argv):
    """--stdout script.py key=value ...  runs a script the interface built on a virtual hand and prints what it
    printed (tests/link.test.js uses it as the robot)."""
    text = open(argv[0], encoding="utf8").read()
    opts = {}
    for kv in argv[1:]:
        k, v = kv.split("=")
        opts[k] = float(v) if "." in v else int(v)
    w = Front(**opts)
    try:
        w.run_text(text)
    finally:
        sys.stdout.write(w.out.getvalue())
        sys.stdout.flush()


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--stdout":
        cli(sys.argv[2:])
    else:
        unittest.main()
