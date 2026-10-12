import React from 'react';

// `?debug`: what the robot sees and thinks, to tune it on the real thing. The signals are the head's
// (pose.js); a nod needs pitch to swing by 0.035 or more three times, a shake yaw.
export default function Debug({ session, tick }) {
  const o = session.last || {};
  const s = session.state;
  const n = (v) => (typeof v === 'number' ? v.toFixed(3) : '–');
  const fake = typeof window !== 'undefined' ? window.fakeRobot : null;
  return (
    <div className="debug" onPointerDown={(e) => e.stopPropagation()} data-tick={tick}>
      <div><b>{s.phase}</b> · {s.step || '–'}{s.listening ? ' · listening' : ''}{s.answer ? ` · answer ${s.answer}` : ''}</div>
      <div>face {o.present ? 'yes' : 'no'} · x {n(o.cx)} · w {n(o.w)} · yaw {n(o.yaw)} · pitch {n(o.pitch)}</div>
      <div>swings pitch {s.swings?.pitch ?? 0} · yaw {s.swings?.yaw ?? 0} · {session.fps} fps · lost {Math.round((s.lostFor || 0) / 100) / 10}s</div>
      <div>link {session.linkState}{fake ? ` · motors ${fake.motors.join(' / ')} · scripts ${fake.scripts.join(',') || '–'}` : ''}</div>
      <div>voice {session.speech.voice ? `${session.speech.voice.name} (${session.speech.voice.lang})` : 'none'} <button type="button" onClick={() => session.testVoice()}>next voice</button></div>
      <label><input type="checkbox" checked={session.flip} onChange={(e) => session.setFlip(e.target.checked)} /> turn the other way (mirrored camera)</label>
      <pre>{session.logs.slice(-8).join('\n')}</pre>
    </div>
  );
}
