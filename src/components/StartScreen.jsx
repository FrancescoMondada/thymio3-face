import React from 'react';
import { LANGS, uiFor } from '../i18n.js';
import { FLAGS } from './Flags.jsx';

// Language, then connect. Nothing else: the robot does the rest.
export default function StartScreen({ lang, onLang, onConnect, busy, error }) {
  const ui = uiFor(lang);
  return (
    <main className="start">
      <div className="start-card">
        <div className="start-logo" aria-hidden="true">
          <svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#ffcf3a" /><ellipse cx="21" cy="26" rx="9" ry="11" fill="#fffdf4" stroke="#2b1633" strokeWidth="2.6" /><ellipse cx="43" cy="26" rx="9" ry="11" fill="#fffdf4" stroke="#2b1633" strokeWidth="2.6" /><circle cx="22" cy="28" r="5" fill="#2fb4d4" stroke="#2b1633" strokeWidth="2" /><circle cx="42" cy="28" r="5" fill="#2fb4d4" stroke="#2b1633" strokeWidth="2" /><circle cx="22" cy="28" r="2.4" fill="#2b1633" /><circle cx="42" cy="28" r="2.4" fill="#2b1633" /><path d="M21 46Q32 56 43 46" fill="none" stroke="#2b1633" strokeWidth="3.6" strokeLinecap="round" /></svg>
          <span>Thymio</span>
        </div>

        <p className="start-label">{ui.pick}</p>
        <div className="langs" role="radiogroup" aria-label={ui.pick}>
          {LANGS.map((l) => {
            const Flag = FLAGS[l];
            return (
              <button key={l} type="button" role="radio" aria-checked={lang === l} className={`lang${lang === l ? ' on' : ''}`} onClick={() => onLang(l)} disabled={Boolean(busy)}>
                <Flag />
                <span>{uiFor(l).name}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="big-button" onClick={onConnect} disabled={Boolean(busy)} data-testid="connect">
          {busy ? ui.steps[busy] : ui.connect}
        </button>

        {error ? <p className="start-error" role="alert">{ui.errors[error] || error}</p> : <p className="start-hint">{ui.hint}</p>}
      </div>
      <div className="rotate" aria-hidden="true">{ui.rotate}</div>
    </main>
  );
}
