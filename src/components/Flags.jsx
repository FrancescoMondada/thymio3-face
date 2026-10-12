import React from 'react';

// Small flags, drawn: the flag emoji do not show on every system (Windows has none).
const box = { width: 56, height: 38, borderRadius: 6, display: 'block', boxShadow: '0 0 0 2px #2b1633' };

const FR = () => (<svg viewBox="0 0 3 2" style={box} aria-hidden="true"><rect width="1" height="2" fill="#0055a4" /><rect x="1" width="1" height="2" fill="#fff" /><rect x="2" width="1" height="2" fill="#ef4135" /></svg>);
const DE = () => (<svg viewBox="0 0 5 3" style={box} aria-hidden="true"><rect width="5" height="1" fill="#000" /><rect y="1" width="5" height="1" fill="#dd0000" /><rect y="2" width="5" height="1" fill="#ffce00" /></svg>);
const IT = () => (<svg viewBox="0 0 3 2" style={box} aria-hidden="true"><rect width="1" height="2" fill="#009246" /><rect x="1" width="1" height="2" fill="#fff" /><rect x="2" width="1" height="2" fill="#ce2b37" /></svg>);
const GB = () => (
  <svg viewBox="0 0 60 30" style={box} aria-hidden="true" preserveAspectRatio="none">
    <rect width="60" height="30" fill="#012169" />
    <path d="M0 0L60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
    <path d="M0 0L60 30M60 0L0 30" stroke="#c8102e" strokeWidth="2.4" />
    <path d="M30 0V30M0 15H60" stroke="#fff" strokeWidth="10" />
    <path d="M30 0V30M0 15H60" stroke="#c8102e" strokeWidth="6" />
  </svg>
);

export const FLAGS = { fr: FR, de: DE, en: GB, it: IT };
