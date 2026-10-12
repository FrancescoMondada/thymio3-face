import React, { useCallback, useEffect, useRef, useState } from 'react';
import StartScreen from './components/StartScreen.jsx';
import FaceScreen from './components/FaceScreen.jsx';
import { initialLang, rememberLang } from './i18n.js';
import { Session, SessionError } from './session.js';
import { enterImmersive, leaveImmersive } from './display.js';

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const PARAMS = {
  fakeface: q.has('fakeface'),
  debug: q.has('debug'),
  captions: q.has('captions'),
  fov: Number(q.get('fov')) || 0,
  lost: Number(q.get('lost')) || 0,
  rearm: Number(q.get('rearm')) || 0,
  voice: q.get('voice') || '',
};

export default function App() {
  const [lang, setLang] = useState(initialLang);
  const [screen, setScreen] = useState('start');          // 'start' | 'face'
  const [busy, setBusy] = useState(null);                  // null | 'robot' | 'camera' | 'vision' | 'voice'
  const [error, setError] = useState(null);
  const [, setTick] = useState(0);
  const session = useRef(null);
  const redraw = useCallback(() => setTick((t) => (t + 1) % 1e6), []);

  const pickLang = (l) => {
    setLang(l);
    rememberLang(l);
    enterImmersive();                                      // a tap: the only moment the browser allows full screen
  };

  const leave = useCallback(async (why) => {
    const s = session.current;
    session.current = null;
    setScreen('start');
    setBusy(null);
    setError(why || null);
    await s?.stop();
    await leaveImmersive();
  }, []);

  const connect = async () => {
    setError(null);
    const s = new Session({ lang, params: PARAMS, onChange: redraw });
    session.current = s;
    if (PARAMS.debug) window.faceSession = s;               // for the console, and for tests that play the person
    try {
      setBusy('robot');
      await s.connectRobot();                              // the Bluetooth chooser needs this very tap
      setBusy('camera');
      await s.startVision();
      setBusy('vision');
      await s.prepareEyes();
      setBusy('voice');
      await s.prepareVoice();
      s.begin();
      setBusy(null);
      setScreen('face');
    } catch (err) {
      console.warn('[face] start failed', err);
      session.current = null;
      setBusy(null);
      setError(err instanceof SessionError ? err.kind : 'robot');
      await s.stop();
    }
  };

  // the link gave up, or the face detector stopped: back to the start screen, with the reason
  const s = session.current;
  const linkState = s?.linkState;
  useEffect(() => {
    if (screen !== 'face') return;
    if (linkState === 'lost') leave('lost');
    if (linkState === 'crashed') leave('crashed');
  }, [screen, linkState, leave]);

  useEffect(() => () => { session.current?.stop(); }, []);

  if (screen === 'face' && session.current) {
    return <FaceScreen session={session.current} tick={0} onExit={() => leave(null)} params={PARAMS} />;
  }
  return <StartScreen lang={lang} onLang={pickLang} onConnect={connect} busy={busy} error={error} />;
}
