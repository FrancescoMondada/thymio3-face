# Thymio 3 - "put your hand in front of me": the front proximity sensors, for the face demo.
#
# The robot waits for a hand held close in front of it and says so as soon as it sees one. It runs
# here, on the robot, and not in the browser: the five front sensors are read every 20 ms and the
# browser is told at once, with no stream of sensor values over a Bluetooth link that is better left free.
#
# The proximity LEDs that the firmware links to these sensors (they light up by themselves, brighter as
# something comes closer) are switched on for the time of the script: the person sees them answer to the hand.
#
# A sensor reads 0 (nothing) to 4095 (touching). The reading before the hand is the reference, so an
# object that stays in front of the robot is not a hand: the hand must come closer than anything there
# was, and be close (see MIN_LEVEL, RISE: they are the settings to try on the real robot).
#
# What the script prints, one "@@word ..." line each (see say()):
#   @@hello hand                 started
#   @@base v0 v1 v2 v3 v4        the five sensors before the hand
#   @@hand <sensor> <value> <ms> a hand: the sensor that saw it (0 = left .. 4 = right), its reading, and
#                                how long the script had waited
#   @@nohand <ms>                no hand for that long
#   @@bye                        finished (the firmware has its behaviors back)
import thymio
import time

WAIT_MS = 16000         # how long to wait for a hand
HOLD_MS = 1500          # after the hand, the proximity LEDs stay on this long
SAMPLE_MS = 20
MIN_LEVEL = 700         # a hand reads at least this on one sensor ...
RISE = 450              # ... and at least this much more than before
HITS = 2                # readings in a row (40 ms): one glitch is not a hand
AVERAGE = 10            # readings for the reference

beh = thymio.BEHAVIORS()
sensors = [thymio.PROXIMITY(i) for i in range(5)]


def say(*parts):
    # The firmware sends stdout in batches: at 100 bytes, or after a second without output. A line
    # padded to 100 bytes goes out at once, ended by \x1e (record separator) instead of a newline
    # that would only follow in the next batch.
    s = "@@" + " ".join([str(p) for p in parts])
    print(s + " " * (99 - len(s)) + "\x1e", end="")


def since(t0):
    return time.ticks_diff(time.ticks_ms(), t0)


def wait_for_hand():
    base = [0, 0, 0, 0, 0]
    for _ in range(AVERAGE):
        for i in range(5):
            base[i] += sensors[i].value()
        time.sleep_ms(10)
    base = [b // AVERAGE for b in base]
    say("base", *base)
    limit = [max(MIN_LEVEL, b + RISE) for b in base]
    hits = 0
    t0 = time.ticks_ms()
    while since(t0) < WAIT_MS:
        best = -1
        best_over = 0
        best_value = 0
        for i in range(5):
            v = sensors[i].value()
            over = v - limit[i]
            if over >= 0 and over >= best_over:
                best = i
                best_over = over
                best_value = v
        if best >= 0:
            hits += 1
            if hits >= HITS:
                say("hand", best, best_value, since(t0))
                time.sleep_ms(HOLD_MS)
                return
        else:
            hits = 0
        time.sleep_ms(SAMPLE_MS)
    say("nohand", since(t0))


def run():
    beh.disable_behaviors()
    try:
        beh.enable_leds_proximity()
        say("hello", "hand")
        wait_for_hand()
    finally:
        beh.enable_behaviors()
        say("bye")
