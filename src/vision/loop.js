// Feeds the camera pictures to the face detector, one at a time, as fast as it can go, but no faster
// than the picture changes, and slowly while the robot sleeps (nobody to watch closely: the phone does
// not need to get hot).

export function startDetection({ video, tracker, onObservation, intervalMs = () => 0, onError, now = () => performance.now() }) {
  let stopped = false;
  let lastTime = -1;
  let lastRun = 0;
  let timer = 0;
  const fps = { n: 0, since: now(), value: 0 };

  const next = () => {
    if (stopped) return;
    const wait = Math.max(0, lastRun + intervalMs() - now());
    if (wait > 4) { timer = setTimeout(next, wait); return; }
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(frame);
    else timer = setTimeout(() => frame(), 33);
  };

  const frame = () => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      lastRun = now();
      try {
        const obs = tracker.detect(video, lastRun);
        onObservation({ ...obs, t: lastRun });
        fps.n++;
        if (lastRun - fps.since >= 1000) { fps.value = Math.round((fps.n * 1000) / (lastRun - fps.since)); fps.n = 0; fps.since = lastRun; }
      } catch (err) {
        onError?.(err);
        stopped = true;
        return;
      }
    }
    next();
  };

  next();
  return {
    stop() { stopped = true; clearTimeout(timer); },
    get fps() { return fps.value; },
  };
}
