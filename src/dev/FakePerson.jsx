import React, { useEffect, useRef, useState } from 'react';

// `?fakeface`: a person for a computer with no camera. A bar at the bottom of the face screen makes a
// face appear and disappear, move it from left to right, nod or shake it, and put a hand in front of the
// robot (with `?fakerobot`); what it says goes where the camera's would (session.observe).
export default function FakePerson({ onObservation }) {
  const [present, setPresent] = useState(false);
  const [x, setX] = useState(0.5);
  const state = useRef({ present: false, x: 0.5, gesture: null });
  state.current.present = present;
  state.current.x = x;

  useEffect(() => {
    const id = setInterval(() => {
      const t = performance.now();
      const { present: p, x: cx, gesture } = state.current;
      let yaw = 0, pitch = 0;
      if (gesture && t < gesture.until) {
        const v = 0.06 * Math.sin(2 * Math.PI * 1.6 * ((t - gesture.start) / 1000));
        if (gesture.kind === 'yes') pitch = v; else yaw = v;
      }
      onObservation({ present: p, cx, cy: 0.5, w: 0.3, h: 0.4, yaw, pitch, t });
    }, 50);
    return () => clearInterval(id);
  }, [onObservation]);

  const gesture = (kind) => { state.current.gesture = { kind, start: performance.now(), until: performance.now() + 2600 }; };
  const b = { font: '700 13px Nunito, sans-serif', padding: '7px 12px', borderRadius: 10, border: '2px solid #ffcf3a', background: present ? '#ffcf3a' : '#1b2140', color: present ? '#2b1633' : '#ffcf3a' };
  return (
    <div className="fake-person" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" style={b} onClick={() => setPresent((v) => !v)} data-testid="fake-face">{present ? 'Visage ✓' : 'Visage'}</button>
      <input type="range" min="0" max="1" step="0.01" value={x} onChange={(e) => setX(Number(e.target.value))} aria-label="position" />
      <button type="button" style={{ ...b, background: '#1b2140', color: '#ffcf3a' }} onClick={() => gesture('yes')} data-testid="fake-yes">Oui</button>
      <button type="button" style={{ ...b, background: '#1b2140', color: '#ffcf3a' }} onClick={() => gesture('no')} data-testid="fake-no">Non</button>
      <button type="button" style={{ ...b, background: '#1b2140', color: '#ffcf3a' }} onClick={() => window.fakeRobot?.putHand?.()} data-testid="fake-hand">Main</button>
    </div>
  );
}
