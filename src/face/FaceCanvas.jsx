import React, { useEffect, useRef } from 'react';
import { drawFace } from './draw.js';

// A canvas that draws a Face (face.js) at the screen's frame rate, sharp on any pixel ratio.
export default function FaceCanvas({ face, onFrame }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf = 0, last = performance.now();
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      fit();
      face.update(dt);
      onFrame?.(now, dt);
      drawFace(ctx, face.state, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [face, onFrame]);

  return <canvas ref={ref} className="face-canvas" aria-hidden="true" />;
}
