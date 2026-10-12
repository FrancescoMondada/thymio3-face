// The phone's selfie camera, as a <video> that the face detector reads.
//
// The picture is NOT mirrored here: a face in the right half of the image is to the right of the
// camera, and so of the robot (the phone lies on the robot, facing the way it faces). The mirror that a
// selfie preview normally has would turn the robot the wrong way.

export async function startCamera({ width = 640, height = 480 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('this browser has no camera access (it needs https)');
    err.name = 'NoCameraApi';
    throw err;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30 } },
  });
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.autoplay = true;
  video.srcObject = stream;
  // Chrome keeps frames coming to a video that is in the page; hidden, not detached
  Object.assign(video.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(video);
  await video.play();
  return {
    video,
    stream,
    settings: stream.getVideoTracks()[0]?.getSettings?.() || {},
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      video.remove();
    },
  };
}
