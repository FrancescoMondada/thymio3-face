// The words of the start screen and of its messages, in the four languages of the demonstration.
// (What the robot says is in story/texts.js.)
export { LANGS } from './story/texts.js';

export const UI = {
  fr: {
    name: 'Français',
    pick: 'Choisis la langue',
    connect: 'Connecter le robot',
    hint: 'Pose le téléphone sur le robot, en mode paysage, écran vers l’avant.',
    steps: { robot: 'Connexion au robot…', camera: 'Ouverture de la caméra…', vision: 'Je prépare mes yeux…', voice: 'Je prépare ma voix…' },
    rotate: 'Tourne le téléphone en mode paysage.',
    reconnecting: 'Reconnexion…',
    errors: {
      noBluetooth: 'Ce navigateur ne sait pas se connecter en Bluetooth. Utilise Chrome ou Edge (Android ou ordinateur), ou Bluefy sur iPhone.',
      noCamera: 'Aucune caméra utilisable.',
      cameraDenied: 'La caméra est refusée : autorise-la pour ce site, puis recommence.',
      noCameraApi: 'Ce navigateur ne donne pas accès à la caméra (il faut une adresse https).',
      vision: 'Impossible de charger la reconnaissance de visage (réseau ?).',
      robot: 'Connexion impossible avec le robot.',
      lost: 'La connexion avec le robot est perdue.',
      crashed: 'La reconnaissance de visage s’est arrêtée.',
    },
  },
  de: {
    name: 'Deutsch',
    pick: 'Sprache wählen',
    connect: 'Roboter verbinden',
    hint: 'Leg das Telefon quer auf den Roboter, mit dem Bildschirm nach vorn.',
    steps: { robot: 'Verbinde mit dem Roboter …', camera: 'Öffne die Kamera …', vision: 'Ich mache meine Augen bereit …', voice: 'Ich mache meine Stimme bereit …' },
    rotate: 'Dreh das Telefon ins Querformat.',
    reconnecting: 'Verbinde neu …',
    errors: {
      noBluetooth: 'Dieser Browser kann keine Bluetooth-Verbindung herstellen. Nimm Chrome oder Edge (Android oder Computer) oder Bluefy auf dem iPhone.',
      noCamera: 'Keine brauchbare Kamera.',
      cameraDenied: 'Die Kamera ist blockiert: erlaube sie für diese Seite und versuch es noch einmal.',
      noCameraApi: 'Dieser Browser gibt keinen Kamerazugriff (es braucht eine https-Adresse).',
      vision: 'Die Gesichtserkennung konnte nicht geladen werden (Netzwerk?).',
      robot: 'Verbindung mit dem Roboter nicht möglich.',
      lost: 'Die Verbindung zum Roboter ist abgebrochen.',
      crashed: 'Die Gesichtserkennung ist stehen geblieben.',
    },
  },
  en: {
    name: 'English',
    pick: 'Choose the language',
    connect: 'Connect the robot',
    hint: 'Lay the phone on the robot in landscape, screen facing forward.',
    steps: { robot: 'Connecting to the robot…', camera: 'Opening the camera…', vision: 'Getting my eyes ready…', voice: 'Getting my voice ready…' },
    rotate: 'Turn the phone to landscape.',
    reconnecting: 'Reconnecting…',
    errors: {
      noBluetooth: 'This browser cannot connect over Bluetooth. Use Chrome or Edge (Android or computer), or Bluefy on iPhone.',
      noCamera: 'No usable camera.',
      cameraDenied: 'The camera is blocked: allow it for this site, then try again.',
      noCameraApi: 'This browser gives no access to the camera (it needs an https address).',
      vision: 'Could not load the face recognition (network?).',
      robot: 'Could not connect to the robot.',
      lost: 'The connection to the robot was lost.',
      crashed: 'Face recognition stopped.',
    },
  },
  it: {
    name: 'Italiano',
    pick: 'Scegli la lingua',
    connect: 'Collega il robot',
    hint: 'Appoggia il telefono sul robot in orizzontale, con lo schermo in avanti.',
    steps: { robot: 'Mi collego al robot…', camera: 'Apro la fotocamera…', vision: 'Preparo i miei occhi…', voice: 'Preparo la mia voce…' },
    rotate: 'Ruota il telefono in orizzontale.',
    reconnecting: 'Riconnessione…',
    errors: {
      noBluetooth: 'Questo browser non può collegarsi via Bluetooth. Usa Chrome o Edge (Android o computer), oppure Bluefy su iPhone.',
      noCamera: 'Nessuna fotocamera utilizzabile.',
      cameraDenied: 'La fotocamera è bloccata: consentila per questo sito e riprova.',
      noCameraApi: 'Questo browser non dà accesso alla fotocamera (serve un indirizzo https).',
      vision: 'Impossibile caricare il riconoscimento dei volti (rete?).',
      robot: 'Impossibile collegarsi al robot.',
      lost: 'La connessione con il robot è stata persa.',
      crashed: 'Il riconoscimento dei volti si è fermato.',
    },
  },
};

export const uiFor = (lang) => UI[lang] || UI.fr;

const KEY = 'face.lang';
export function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && UI[saved]) return saved;
  } catch { /* private mode */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language || 'fr').slice(0, 2).toLowerCase();
  return UI[nav] ? nav : 'fr';
}
export function rememberLang(lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
}
