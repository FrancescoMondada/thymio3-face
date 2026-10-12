// Screen: full screen, landscape, and awake. Each is a favour the browser may refuse (it needs a tap,
// or it is not available): none of it is needed for the demonstration to work.

export async function enterImmersive() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { /* a refusal is fine */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not allowed outside full screen, or not supported */ }
}

export async function leaveImmersive() {
  try { screen.orientation?.unlock?.(); } catch { /* nothing to undo */ }
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* nothing to undo */ }
}

// The screen is the robot's face: it must not go dark while the robot waits for someone.
export function keepAwake() {
  let lock = null;
  let wanted = true;
  const take = async () => {
    try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; }
  };
  const again = () => { if (wanted && document.visibilityState === 'visible') take(); };
  document.addEventListener('visibilitychange', again);
  take();
  return () => {
    wanted = false;
    document.removeEventListener('visibilitychange', again);
    lock?.release?.().catch(() => {});
  };
}
