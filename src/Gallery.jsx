import React, { useMemo, useRef, useEffect } from 'react';
import { Face, MOODS } from './face/face.js';
import { drawFace } from './face/draw.js';

// `?faces`: every mood as a still picture, to look at the drawing. Not part of the demo.
function Still({ name, extra = {} }) {
  const ref = useRef(null);
  const face = useMemo(() => {
    const f = new Face({ rng: () => 0.5 });
    f.setMood(name);
    f.lookAt(extra.gx || 0, extra.gy || 0);
    if (extra.speaking) f.setSpeaking(true);
    for (let i = 0; i < 90; i++) {
        f.update(1 / 30);
    }
    return f;
  }, [name]);
  useEffect(() => {
    const c = ref.current;
    c.width = 800; c.height = 400;
    drawFace(c.getContext('2d'), face.state, 800, 400);
  }, [face]);
  return (
    <figure style={{ margin: 0 }}>
      <canvas ref={ref} style={{ width: '100%', borderRadius: 14, display: 'block' }} />
      <figcaption style={{ color: '#9fb4ff', font: '700 14px Nunito, sans-serif', padding: '4px 2px' }}>{name}{extra.note ? ` · ${extra.note}` : ''}</figcaption>
    </figure>
  );
}

export default function Gallery() {
  const names = Object.keys(MOODS);
  return (
    <div style={{ minHeight: '100vh', background: '#1b1b24', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
        {names.map((n) => <Still key={n} name={n} />)}
        <Still name="neutral" extra={{ gx: -0.8, gy: 0.2, note: 'looks left' }} />
        <Still name="happy" extra={{ speaking: true, note: 'speaking' }} />
        <Still name="scared" extra={{ gy: 1, note: 'looking down' }} />
      </div>
    </div>
  );
}
