import React, { useEffect, useRef, useState } from 'react';
import FaceCanvas from '../face/FaceCanvas.jsx';
import FakePerson from '../dev/FakePerson.jsx';
import Debug from './Debug.jsx';
import { uiFor } from '../i18n.js';

// The robot's face, full screen. Nothing to touch: a long press in the top left corner goes back to the
// start screen (and lets the robot go).
const HOLD_MS = 1600;

function ExitCorner({ onExit }) {
  const timer = useRef(0);
  const [held, setHeld] = useState(false);
  const down = () => { setHeld(true); timer.current = setTimeout(() => { setHeld(false); onExit(); }, HOLD_MS); };
  const up = () => { setHeld(false); clearTimeout(timer.current); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return <div className={`exit-corner${held ? ' held' : ''}`} onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} aria-hidden="true" />;
}

export default function FaceScreen({ session, tick, onExit, params }) {
  const ui = uiFor(session.lang);
  const showCaptions = params.captions || params.debug;
  return (
    <div className="face-screen">
      <FaceCanvas face={session.face} />
      {showCaptions && session.caption ? <div className="caption">{session.caption}</div> : null}
      {session.linkState === 'reconnecting' ? <div className="badge">{ui.reconnecting}</div> : null}
      <ExitCorner onExit={onExit} />
      {params.fakeface ? <FakePerson onObservation={session.observe} /> : null}
      {params.debug ? <Debug session={session} tick={tick} /> : null}
      <div className="rotate" aria-hidden="true">{ui.rotate}</div>
    </div>
  );
}
