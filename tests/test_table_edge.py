"""Runs src/py/table_edge.py, the script that drives the robot to the edge of the table, on a virtual
robot: a table edge, ground sensors that read it, wheels, a clock that only moves when the script
sleeps. The script is the real one, as the interface builds it (MODE written in, run() at the end).

    python3 -I tests/test_table_edge.py
"""
import io
import os
import re
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = open(os.path.join(HERE, "..", "src", "py", "table_edge.py"), encoding="utf8").read()

MM_PER_S_PER_UNIT = 150.0 / 1.8 / 300.0       # the robot's own calibration: 15 cm in 1.8 s at speed 300


class Table:
    """A table whose edge is `edge_mm` ahead of the wheels' axle (per side, for an edge that is not square
    to the robot). The ground sensors are `ahead_mm` in front of the axle and read `base` over the table,
    0 beyond its edge, with a ramp of `ramp_mm` as the spot leaves the table."""

    def __init__(self, edge_mm=300.0, edge_right_mm=None, ahead_mm=45.0, base=(600, 640), ramp_mm=6.0,
                 glitch_ms=None, rear_obstacle_mm=None, fail_after_ms=None, lag_ms=60):
        self.t = 0
        self.pos = 0.0                        # axle position, mm, forward
        self.edge = (edge_mm, edge_mm if edge_right_mm is None else edge_right_mm)
        self.ahead = ahead_mm
        self.base = (base, base) if isinstance(base, int) else base
        self.ramp = ramp_mm
        self.glitch = glitch_ms               # one reading 0 at this time
        self.rear_obstacle = rear_obstacle_mm # an object this far behind the start (mm), seen by the rear sensors
        self.fail_after = fail_after_ms       # the sensors raise an error after this time
        self.speed_cmd = (0, 0)
        self.v = 0.0                          # mm/s, follows the command with a lag, like the motor PID
        self.lag = lag_ms
        self.speed_log = []
        self.behaviors = True
        self.out = io.StringIO()
        self.min_gap = 1e9

    # -- the world -------------------------------------------------------------------------
    def advance(self, ms):
        for _ in range(int(ms)):
            target = (self.speed_cmd[0] + self.speed_cmd[1]) / 2.0 * MM_PER_S_PER_UNIT
            self.v += (target - self.v) * min(1.0, 1.0 / self.lag)
            self.pos += self.v / 1000.0
            self.t += 1
            self.min_gap = min(self.min_gap, self.edge[0] - (self.pos + self.ahead), self.edge[1] - (self.pos + self.ahead))

    def ground(self, side):
        if self.fail_after is not None and self.t >= self.fail_after:
            raise RuntimeError("sensor failed")
        if self.glitch is not None and self.glitch <= self.t < self.glitch + 8:
            return 0
        over = self.edge[side] - (self.pos + self.ahead)             # mm of table left under the sensor
        return int(self.base[side] * max(0.0, min(1.0, over / self.ramp)))

    def rear(self):
        if self.rear_obstacle is None:
            return 0
        gap = self.rear_obstacle + self.pos                          # distance between the robot's tail and the object
        return 4000 if gap < 40 else 0

    # -- the modules the script imports -------------------------------------------------------------
    def modules(self):
        world = self

        class Ground:
            def __init__(self, i): self.i = i
            def value(self): return world.ground(self.i)

        class Prox:
            def __init__(self, i): self.i = i
            def value(self): return world.rear() if self.i >= 5 else 0

        class Motors:
            def set_speed(self, l, r):
                world.speed_cmd = (l, r)
                world.speed_log.append((world.t, l, r))

        class Behaviors:
            def disable_behaviors(self): world.behaviors = False
            def enable_behaviors(self): world.behaviors = True

        thymio = types.ModuleType("thymio")
        thymio.GROUND, thymio.PROXIMITY, thymio.MOTORS, thymio.BEHAVIORS = Ground, Prox, Motors, Behaviors
        clock = types.ModuleType("time")
        clock.sleep_ms = lambda ms: world.advance(ms)
        clock.ticks_ms = lambda: world.t
        clock.ticks_diff = lambda a, b: a - b
        return thymio, clock

    def run_script(self, mode, source=SOURCE):
        """What the interface sends: the source with MODE written in, and a call to run()."""
        text = re.sub(r'^MODE = ".*"$', 'MODE = "%s"' % mode, source, flags=re.M) + "\nrun()\n"
        return self.run_text(text)

    def run_text(self, text):
        """A complete script, as the interface built it (minified, MODE written in, run() at the end)."""
        thymio, clock = self.modules()
        saved = {k: sys.modules.get(k) for k in ("thymio", "time")}
        sys.modules["thymio"], sys.modules["time"] = thymio, clock
        old_out, sys.stdout = sys.stdout, self.out
        try:
            exec(compile(text, "table_edge.py", "exec"), {"__name__": "mp_script"})
        finally:
            sys.stdout = old_out
            for k, v in saved.items():
                if v is None:
                    sys.modules.pop(k, None)
                else:
                    sys.modules[k] = v
        return self

    @property
    def lines(self):
        return [l.strip() for l in re.split(r"[\x1e\n]", self.out.getvalue()) if l.strip()]


class TableEdge(unittest.TestCase):
    def test_stops_at_the_edge_with_the_wheels_still_on_the_table(self):
        w = Table(edge_mm=300).run_script("edge")
        words = [l.split()[0] for l in w.lines]
        self.assertEqual(words, ["@@hello", "@@ground", "@@edge", "@@bye"], w.lines)
        self.assertEqual(w.speed_cmd, (0, 0))
        self.assertLess(w.pos, 300 - 25, "the wheels' axle must stay well inside the table (%.0f mm of 300)" % w.pos)
        self.assertGreater(w.pos + w.ahead, 300 - 6, "it must not stop early either")
        self.assertLess(w.pos + w.ahead, 300 + 12, "the sensors may only just have passed the edge (%.1f mm)" % (w.pos + w.ahead - 300))

    def test_stops_whatever_the_distance(self):
        for edge in (120, 250, 500, 800):
            w = Table(edge_mm=edge).run_script("edge")
            self.assertTrue(any(l.startswith("@@edge") for l in w.lines), (edge, w.lines))
            self.assertLess(w.pos + w.ahead, edge + 12, edge)

    def test_an_edge_that_is_not_square_stops_at_the_first_sensor(self):
        w = Table(edge_mm=300, edge_right_mm=340).run_script("edge")          # the left side reaches it first
        self.assertTrue(any(l.startswith("@@edge") for l in w.lines))
        self.assertLess(w.pos + w.ahead, 300 + 12)

    def test_the_reaction_is_within_a_few_millimetres_at_the_driving_speed(self):
        # The sensor is half way over the edge (the 50 % limit) 3 mm past the start of its ramp; the
        # script reads every 8 ms, needs two readings and stops the motors: 40 ms at 69 mm/s is 3 mm more.
        w = Table(edge_mm=400).run_script("edge")
        past = w.pos + w.ahead - 400
        self.assertLess(past, 3 + 250 * MM_PER_S_PER_UNIT * 0.040, "%.1f mm past the edge" % past)

    def test_a_dark_table_or_a_lifted_robot_does_not_move(self):
        for base in ((40, 600), (600, 40), (0, 0)):
            w = Table(base=base).run_script("edge")
            self.assertEqual([l.split()[0] for l in w.lines], ["@@hello", "@@ground", "@@dark", "@@bye"], (base, w.lines))
            self.assertEqual(w.pos, 0.0)
            self.assertTrue(all((l, r) == (0, 0) for _, l, r in w.speed_log), "it never drove: %r" % w.speed_log)

    def test_already_at_the_edge_does_not_move(self):
        w = Table(edge_mm=30).run_script("edge")                 # the sensors are over the void already
        self.assertTrue(any(l.startswith("@@dark") for l in w.lines), w.lines)
        self.assertEqual(w.pos, 0.0)

    def test_no_edge_in_reach_stops_after_the_longest_time(self):
        w = Table(edge_mm=5000).run_script("edge")
        self.assertTrue(any(l.startswith("@@timeout") for l in w.lines), w.lines)
        self.assertEqual(w.speed_cmd, (0, 0))
        self.assertLess(w.pos, 1100, "one metre at most")

    def test_one_bad_reading_is_not_an_edge(self):
        w = Table(edge_mm=400, glitch_ms=1500).run_script("edge")
        edge_line = [l for l in w.lines if l.startswith("@@edge")][0]
        self.assertGreater(w.pos + w.ahead, 400 - 6, "it was fooled by the glitch: " + edge_line)

    def test_a_failure_in_the_middle_still_stops_the_motors_and_gives_the_behaviors_back(self):
        w = Table(edge_mm=900, fail_after_ms=1500)
        with self.assertRaises(RuntimeError):
            w.run_script("edge")
        self.assertEqual(w.speed_cmd, (0, 0))
        self.assertTrue(w.behaviors)
        self.assertTrue(any(l.startswith("@@bye") for l in w.lines))

    def test_back_goes_back_a_few_centimetres_and_stops(self):
        w = Table().run_script("back")
        self.assertEqual([l.split()[0] for l in w.lines], ["@@hello", "@@backed", "@@bye"], w.lines)
        self.assertEqual(w.speed_cmd, (0, 0))
        self.assertTrue(-90 < w.pos < -40, "%.0f mm" % w.pos)
        self.assertTrue(w.behaviors)

    def test_back_stops_early_for_something_behind(self):
        w = Table(rear_obstacle_mm=60).run_script("back")
        self.assertTrue(any(l.startswith("@@blocked") for l in w.lines), w.lines)
        self.assertGreater(w.pos, -60)

    def test_every_line_goes_out_at_once(self):
        # padded to 100 bytes and ended by the record separator, like the firmware batches expect
        w = Table().run_script("edge")
        for chunk in w.out.getvalue().split("\x1e")[:-1]:
            self.assertEqual(len(chunk), 99, repr(chunk))
        self.assertTrue(w.out.getvalue().endswith("\x1e"))

    def test_only_what_micropython_has(self):
        # the interpreter on the robot has no f-strings with format specs, no walrus, no type hints...
        for banned in (":=", "f\"", "f'", "->", "import os", "import sys", "global ", "async ", "await "):
            self.assertNotIn(banned, SOURCE, banned)


def cli(argv):
    """--stdout script.py key=value ...  runs a script the interface built on a virtual table and prints
    what it printed (tests/link.test.js uses it as the robot)."""
    text = open(argv[0], encoding="utf8").read()
    opts = {}
    for kv in argv[1:]:
        k, v = kv.split("=")
        opts[k] = float(v) if "." in v else int(v)
    w = Table(**opts)
    try:
        w.run_text(text)
    finally:
        sys.stdout.write(w.out.getvalue())
        sys.stdout.flush()
        sys.stderr.write("pos=%.1f\n" % w.pos)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--stdout":
        cli(sys.argv[2:])
    else:
        unittest.main()
