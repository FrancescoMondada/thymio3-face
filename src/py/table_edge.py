# Thymio 3 - the two moves of the face demo that must not depend on the Bluetooth link.
#
# The robot drives toward the edge of the table, and a Bluetooth command takes anywhere from 60 ms to
# a second to arrive when the link is busy: a stop sent from the browser could come too late. These
# moves run here, on the robot, where the ground sensors are read every 8 ms and the motors stop
# within one reading of the edge. The browser only starts the script and listens to what it prints.
#
#   MODE "edge"  drive forward until a ground sensor no longer sees the table, then stop.
#   MODE "back"  drive backward for a short time (stopping early if something is behind).
#
# What the script prints, one "@@word ..." line each (see say()):
#   @@hello <mode>            started
#   @@ground <left> <right>   what the table looks like (the sensors' mean, before moving)
#   @@edge <l> <r> <ms>       stopped at the edge (the readings that told, and the driving time)
#   @@dark <left> <right>     did not move: a sensor sees nothing or a very dark surface, so the edge
#                             could not be told from the table (robot lifted, black table, already at the edge)
#   @@timeout <ms>            drove for the longest time allowed without finding an edge: stopped
#   @@backed <ms>             went back for that long;  @@blocked <ms>  stopped early by a rear sensor
#   @@bye                     finished (the motors are stopped, the firmware has its behaviors back)
import thymio
import time

MODE = "edge"

SPEED = 250             # wheel speed units: about 69 mm/s (the factory 15 cm timer is 1.8 s at 300)
BASE_MIN = 120          # a table reads at least this on both ground sensors (they read 0..1023, 0 = nothing)
FRACTION = 50           # percent of its own reading under which a sensor has left the table
MAX_MS = 14000          # no edge after this long (about 95 cm): stop
SAMPLE_MS = 8
HITS = 2                # readings in a row under the limit before stopping: one glitch is not an edge
BACK_MS = 1000          # about 7 cm backward
REAR_STOP = 1500        # a rear proximity sensor over this: something is behind, stop
AVERAGE = 8             # readings for the table's value

beh = thymio.BEHAVIORS()
mot = thymio.MOTORS()


def say(*parts):
    # The firmware sends stdout in batches: at 100 bytes, or after a second without output. A line
    # padded to 100 bytes goes out at once, ended by \x1e (record separator) instead of a newline
    # that would only follow in the next batch.
    s = "@@" + " ".join([str(p) for p in parts])
    print(s + " " * (99 - len(s)) + "\x1e", end="")


def since(t0):
    return time.ticks_diff(time.ticks_ms(), t0)


def edge():
    gl = thymio.GROUND(0)
    gr = thymio.GROUND(1)
    bl = 0
    br = 0
    for _ in range(AVERAGE):
        bl += gl.value()
        br += gr.value()
        time.sleep_ms(10)
    bl //= AVERAGE
    br //= AVERAGE
    say("ground", bl, br)
    if bl < BASE_MIN or br < BASE_MIN:
        say("dark", bl, br)
        return
    limit_l = bl * FRACTION // 100
    limit_r = br * FRACTION // 100
    hits = 0
    t0 = time.ticks_ms()
    mot.set_speed(SPEED, SPEED)
    while True:
        l = gl.value()
        r = gr.value()
        if l < limit_l or r < limit_r:
            hits += 1
            if hits >= HITS:
                mot.set_speed(0, 0)
                say("edge", l, r, since(t0))
                return
        else:
            hits = 0
        if since(t0) > MAX_MS:
            mot.set_speed(0, 0)
            say("timeout", since(t0))
            return
        time.sleep_ms(SAMPLE_MS)


def back():
    pl = thymio.PROXIMITY(5)
    pr = thymio.PROXIMITY(6)
    t0 = time.ticks_ms()
    mot.set_speed(-SPEED, -SPEED)
    while since(t0) < BACK_MS:
        if pl.value() > REAR_STOP or pr.value() > REAR_STOP:
            mot.set_speed(0, 0)
            say("blocked", since(t0))
            return
        time.sleep_ms(10)
    mot.set_speed(0, 0)
    say("backed", since(t0))


def run():
    beh.disable_behaviors()
    try:
        say("hello", MODE)
        if MODE == "edge":
            edge()
        else:
            back()
    finally:
        mot.set_speed(0, 0)
        beh.enable_behaviors()
        say("bye")
