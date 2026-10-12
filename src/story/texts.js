// What the robot says, in the four languages of the start screen.
//
// A sentence is a list of segments. A segment with a `gesture` is spoken as an utterance of its own,
// and the gesture starts with it: that is how "yes" is said with a nod and "no" with a shake whatever
// the voice does (the word boundary events that would tell where a word is are not reliable on
// Android). The cut makes a small pause around the two words, which suits them.

export const LANGS = ['fr', 'de', 'en', 'it'];

const seg = (say, gesture) => (gesture ? { say, gesture } : { say });

// "<lead> yes or no <tail>": the question and its two answers, as segments.
const askWith = (lead, yes, or, no, tail) => [seg(lead), seg(yes, 'nod'), seg(or), seg(no, 'shake'), seg(tail)];

export const STORY = {
  fr: {
    tag: 'fr-FR',
    intro: askWith("Bonjour, je m'appelle Thymio, troisième génération. Tu veux découvrir mes fonctionnalités ? Réponds", 'oui', 'ou', 'non', 'avec la tête.'),
    reprompt: askWith("Je n'ai pas compris. Réponds", 'oui', 'ou', 'non', 'avec la tête.'),
    no: [seg('Dommage, bonne nuit.')],
    yes: [seg('Super, je me réjouis !')],
    front: [seg('Voici mes capteurs de proximité avant. Mets ta main juste devant moi, tout près !')],
    tickle: [seg('Hi hi hi ! Ça me chatouille !')],
    noHand: [seg('Pas de main ? Ce n\'est pas grave, on continue.')],
    ground: [seg("J'ai aussi des capteurs pour regarder le sol.")],
    edgeIntro: [seg('Les capteurs au sol me permettent de ne pas tomber de la table.')],
    edge: [seg("Ouf, là c'est la fin de la table !")],
    noEdge: [seg('Hum, je ne vois pas bien le bord de la table. Je préfère ne pas bouger.')],
    bye: [seg("Bon, pour le moment je m'arrête là. Bonne nuit.")],
  },
  de: {
    tag: 'de-DE',
    intro: askWith('Hallo, ich heiße Thymio, dritte Generation. Möchtest du meine Funktionen entdecken? Antworte', 'ja', 'oder', 'nein', 'mit dem Kopf.'),
    reprompt: askWith('Ich habe dich nicht verstanden. Antworte', 'ja', 'oder', 'nein', 'mit dem Kopf.'),
    no: [seg('Schade, gute Nacht.')],
    yes: [seg('Super, ich freue mich!')],
    front: [seg('Hier sind meine vorderen Annäherungssensoren. Halte deine Hand ganz nah vor mich!')],
    tickle: [seg('Hihihi! Das kitzelt!')],
    noHand: [seg('Keine Hand? Nicht schlimm, weiter geht\'s.')],
    ground: [seg('Ich habe auch Sensoren, die auf den Boden schauen.')],
    edgeIntro: [seg('Die Bodensensoren verhindern, dass ich vom Tisch falle.')],
    edge: [seg('Puh, hier ist die Tischkante!')],
    noEdge: [seg('Hm, ich sehe die Tischkante nicht richtig. Ich bleibe lieber stehen.')],
    bye: [seg('So, für den Moment höre ich hier auf. Gute Nacht.')],
  },
  en: {
    tag: 'en-GB',
    intro: askWith('Hello, my name is Thymio, third generation. Would you like to discover my features? Answer', 'yes', 'or', 'no', 'with your head.'),
    reprompt: askWith("Sorry, I didn't understand. Answer", 'yes', 'or', 'no', 'with your head.'),
    no: [seg('Too bad, good night.')],
    yes: [seg("Great, I'm looking forward to it!")],
    front: [seg('These are my front proximity sensors. Put your hand right in front of me, very close!')],
    tickle: [seg('Hee hee hee! That tickles!')],
    noHand: [seg("No hand? That's fine, let's carry on.")],
    ground: [seg('I also have sensors that look at the ground.')],
    edgeIntro: [seg('The ground sensors stop me from falling off the table.')],
    edge: [seg('Phew, this is the edge of the table!')],
    noEdge: [seg("Hmm, I can't see the edge of the table properly. I'd rather not move.")],
    bye: [seg("Well, that's all for now. Good night.")],
  },
  it: {
    tag: 'it-IT',
    intro: askWith('Ciao, mi chiamo Thymio, terza generazione. Vuoi scoprire le mie funzioni? Rispondi', 'sì', 'o', 'no', 'con la testa.'),
    reprompt: askWith('Non ho capito. Rispondi', 'sì', 'o', 'no', 'con la testa.'),
    no: [seg('Peccato, buonanotte.')],
    yes: [seg("Che bello, non vedo l'ora!")],
    front: [seg('Ecco i miei sensori di prossimità anteriori. Metti la mano proprio davanti a me, vicinissima!')],
    tickle: [seg('Ih ih ih! Mi fai il solletico!')],
    noHand: [seg('Niente mano? Non importa, andiamo avanti.')],
    ground: [seg('Ho anche dei sensori che guardano il pavimento.')],
    edgeIntro: [seg('I sensori a terra mi impediscono di cadere dal tavolo.')],
    edge: [seg('Uff, questo è il bordo del tavolo!')],
    noEdge: [seg('Hm, non vedo bene il bordo del tavolo. Preferisco non muovermi.')],
    bye: [seg('Per ora mi fermo qui. Buonanotte.')],
  },
};

export const textsFor = (lang) => STORY[lang] || STORY.fr;

// The words of a sentence, for the captions and for the time a mute robot would take to say it.
export const plain = (segments) => segments.map((s) => s.say).join(' ');
