# Thymio 3 — Visage

Un **smartphone posé sur le Thymio 3** (en paysage, écran vers l'avant) devient son **visage** : deux yeux
très expressifs et une bouche, dessinés comme un dessin animé. La **caméra selfie** est sa vue : il
reconnaît un visage, se tourne pour le garder devant lui, comprend un **oui** ou un **non** fait avec la
tête, et se présente en montrant ses capteurs.

**Démo en ligne : <https://francescomondada.github.io/thymio3-face/?fakerobot&fakeface&debug>** : sans robot ni
caméra. Un robot de démonstration joue le Bluetooth, et une barre en bas de l'écran joue la personne : *Visage*
le fait apparaître (le robot se réveille), *Oui* / *Non* hochent ou secouent la tête, *Main* met une main devant
ses capteurs. Mettre le son : il parle (le navigateur choisit la meilleure voix de la langue). Avec un vrai robot
et un téléphone, ouvrir <https://francescomondada.github.io/thymio3-face/> (voir « Avec un vrai robot »).

Même base que [`thymio3-cockpit`](https://github.com/FrancescoMondada/thymio3-cockpit) et `thymio3-cards` :
React + Vite, l'API [`Mobsya/thymio3-ts-api`](https://github.com/Mobsya/thymio3-ts-api) prise sur GitHub (non
copiée ici), Web Bluetooth. Le robot est celui du firmware
[`Mobsya/thymio3-firmware-esp32`](https://github.com/Mobsya/thymio3-firmware-esp32).

```bash
npm install
npm run dev        # http://localhost:5176 sur l'ordinateur (le robot et le visage peuvent être simulés, voir plus bas)
npm test           # 80 tests JavaScript + 23 tests Python (les vrais scripts du robot, sur un robot virtuel)
npm run model      # (facultatif) met le modèle de reconnaissance de visage dans public/models, pour fonctionner hors ligne
npm run build      # site statique dans dist/
```

## La démonstration

1. **Écran de départ** : on choisit la langue (FR / DE / GB / IT) et on appuie sur *Connecter le robot*
   (choix du robot dans la fenêtre Bluetooth, puis autorisation de la caméra). C'est tout.
2. **Il dort** : yeux fermés, petits Z, écran assombri. La caméra le surveille au ralenti.
3. **Un visage reste devant lui 0,6 s** : il se réveille et le **suit** (les yeux le regardent, le robot
   pivote par petits pas pour le garder au centre).
4. Il dit *« Bonjour, je m'appelle Thymio, troisième génération. Tu veux découvrir mes fonctionnalités ?
   Réponds **oui** ou **non** avec la tête. »* : au mot « oui » le visage **hoche la tête**, au mot « non » il
   **secoue la tête** (et le corps du robot tourne d'environ 9° à gauche et à droite).
5. Il **lit la réponse** : hochement = oui, secouement = non (9 s ; sans réponse il redemande une fois, puis
   se rendort sans rien dire).
   - **Non** : visage triste, *« Dommage, bonne nuit. »*, il se rendort.
   - **Oui** : *« Super, je me réjouis ! »*, puis **deux démonstrations interactives** :
     1. **Les capteurs avant** : *« Voici mes capteurs de proximité avant. Mets ta main juste devant moi, tout
        près ! »* Dès qu'il sent une main (16 s d'attente au plus), il **rit et glousse**, *« Hi hi hi ! Ça me
        chatouille ! »* ; les LED que le firmware lie à ces capteurs s'allument d'elles-mêmes, de plus en plus fort
        quand la main s'approche. Sans main : *« Pas de main ? Ce n'est pas grave, on continue. »*
     2. **Les capteurs du sol** : *« J'ai aussi des capteurs pour regarder le sol. Les capteurs au sol me
        permettent de ne pas tomber de la table. »* Il **avance jusqu'à ce que ses capteurs détectent le bord** ;
        **visage épouvanté, les yeux vers le bas**, *« Ouf, là c'est la fin de la table ! »*, il **recule**.

     Soulagé, *« Bon, pour le moment je m'arrête là. Bonne nuit. »*, et il se rendort.
6. **S'il ne voit plus de visage pendant 10 s**, il se rendort, où qu'il en soit (sauf pendant l'attente de la
   main, la marche vers le bord et le recul, qu'il termine : la main peut cacher le visage). Un visage qui revient le réveille aussitôt.
7. **Après une démonstration**, il peut se réveiller de nouveau **30 s après s'être endormi**, même pour la
   personne restée devant lui (il recommence alors au début) ; un nouveau visage, après 3 s sans personne devant lui,
   le réveille tout de suite. Réglage : `rearmMs` dans `src/story/brain.js`, ou `?rearm=10` (en secondes).

Les textes sont dans [`src/story/texts.js`](src/story/texts.js), dans les quatre langues. Appui long (1,6 s) dans le
coin en haut à gauche de l'écran du visage : retour à l'écran de départ, le robot est libéré.

## Avec un vrai robot et un vrai téléphone

La caméra et le Bluetooth exigent **HTTPS** (ou `localhost`). Deux moyens :

- **GitHub Pages** : `.github/workflows/deploy.yml`, comme pour le cockpit et les cartes ; il met aussi le modèle de
  reconnaissance dans le site, qui fonctionne alors sans réseau une fois chargé.
- **Le téléphone branché à l'ordinateur** (Android, débogage USB) : `adb reverse tcp:5176 tcp:5176`, puis ouvrir
  `http://localhost:5176` dans Chrome sur le téléphone.

Il faut **Chrome ou Edge** (Web Bluetooth), sur Android ; sur iPhone, **Bluefy** (non essayé).

## Comment c'est fait

| Fichier | Rôle |
| --- | --- |
| `src/face/face.js`, `draw.js`, `FaceCanvas.jsx` | Le visage : ressorts amortis vers l'humeur voulue (`sleep`, `curious`, `happy`, `scared`…), clignements, regard, hochement/secouement ; dessin au canvas en style dessin animé (`?faces` montre toutes les humeurs) |
| `src/vision/tracker.js`, `pose.js`, `loop.js`, `camera.js` | Caméra selfie, détection de visage MediaPipe, position du visage et deux signaux de la tête |
| `src/vision/gesture.js` | Hochement ou secouement : suite de balancements d'un signal, l'autre restant presque immobile |
| `src/robot/aim.js` | Garder le visage au centre : le robot tourne **par petits pas** (regarde, tourne, s'arrête, attend la caméra) |
| `src/robot/link.js`, `actions.js` | Liaison Bluetooth : une seule écriture à la fois, la dernière demande gagne, les roues s'arrêtent toutes seules ; lancement des scripts du robot et lecture de leurs messages au fil de l'eau |
| `src/py/table_edge.py`, `hand_sensor.py` | **Les scripts qui tournent sur le robot** : avancer jusqu'au bord et reculer ; attendre une main devant les capteurs avant |
| `src/story/brain.js`, `texts.js` | Le comportement : sommeil, réveil, histoire, règle des 10 s ; textes en 4 langues |
| `src/speech.js` | La voix du téléphone (synthèse vocale) : classement des voix par qualité, autre voix si elle échoue, silence en dernier recours |
| `src/session.js`, `App.jsx`, `components/` | Mise en route (robot, caméra, yeux, voix), écrans |
| `src/dev/` | Robot de démonstration (`?fakerobot`) et visage simulé (`?fakeface`) |

**Les mouvements dangereux sont conduits sur le robot, en Python.** Une commande Bluetooth met de 60 ms à une
seconde à arriver quand la liaison est chargée : un « stop » envoyé par le navigateur pourrait arriver trop tard
au bord de la table. `table_edge.py` lit les deux capteurs du sol toutes les 8 ms et arrête les moteurs dès
que l'un d'eux ne voit plus la table (moins de 50 % de ce qu'il lisait sur la table, deux mesures de suite). Il
refuse de bouger si la table est trop sombre (capteur sous 120 : robot soulevé, table noire, déjà au bord) et
s'arrête de lui-même après 14 s. Le navigateur ne fait que l'envoyer (pendant la phrase précédente) et lire ce
qu'il imprime (`@@edge`, `@@dark`, `@@timeout`…). Les petits pas pour suivre le visage, eux, passent par
Bluetooth : ils ne durent jamais plus de 0,6 s et le robot les arrête de lui-même.

**La main** se détecte de la même façon : `hand_sensor.py` lit les cinq capteurs avant toutes les 20 ms et dit
`@@hand` dès que l'un d'eux dépasse **700** et ce qu'il lisait avant de **450** au moins, deux mesures de suite
(`MIN_LEVEL`, `RISE`, `HITS` en tête du fichier : les réglages à essayer sur le vrai robot). Un objet qui reste devant le
robot n'est donc pas une main : elle doit s'approcher plus près que lui. Le navigateur réagit à l'instant, sans
attendre la fin du script ; il n'écoute aucun flux de capteurs sur le Bluetooth.

Les **LED liées aux capteurs de proximité** sont gérées par le microcontrôleur STM32 du robot : le firmware les allume
tout seul selon la distance, et ne laisse ni le Python ni le Bluetooth en commander une : elles ne clignotent donc pas à
la demande. La démonstration de la main les utilise telles qu'elles sont : le
script les met en marche (`enable_leds_proximity()`) pendant l'attente, et on les voit répondre à la main.

À la déconnexion, le firmware éteint moteurs et LED ; la page arrêtée ou cachée arrête aussi les roues.

### La voix

C'est la synthèse vocale du navigateur : sa qualité dépend du téléphone ou de l'ordinateur. Un navigateur liste ses voix
dans le désordre, et la première d'une langue est souvent la pire (sur un Mac : Eddy, Flo, Grandma… des voix
robotiques faites pour s'amuser). `src/speech.js` **classe** donc les voix : d'abord la langue exacte (fr-FR, de-DE,
en-GB, it-IT), puis ce qui sonne bien (voix « Natural » d'Edge, voix *Premium* et *Enhanced* du système, voix « Google »
de Chrome, bonnes voix de macOS comme Thomas, Anna, Alice, Daniel), et ce qui sonne mal en dernier. Une voix qui
échoue (réseau coupé pour une voix « Google ») est remplacée par une autre du téléphone, et le ton est celui de la
voix, sans le changer (un ton plus aigu abîme la plupart des voix du système).

Pour une **meilleure voix**, le plus efficace est d'en installer une : sur un Mac, Réglages Système → Accessibilité →
Contenu énoncé → Voix du système → Gérer les voix → les versions *Premium* ou *Enhanced* (Audrey, Anna, Alice, Daniel…) ;
elles sont choisies d'elles-mêmes. Avec `?debug`, le bouton **next voice** essaie les voix de la langue l'une après
l'autre en disant la première phrase, et **retient** celle qu'on laisse (sur ce téléphone, pour cette langue) ; `?voice=`
en impose une.

## Pour essayer sans matériel, et pour régler

| Adresse | Effet |
| --- | --- |
| `?fakerobot` | robot de démonstration à la place du Bluetooth (mêmes événements, sorties des scripts jouées) |
| `?fakeface` | pas de caméra : une barre en bas fait apparaître un visage, le déplace, le fait dire oui ou non |
| `?debug` | ce que voit et pense le robot (visage, signaux `yaw` / `pitch`, balancements, images/s, journal) ; case « tourner dans l'autre sens » si la caméra est en miroir ; `window.faceSession` |
| `?captions` | les phrases en sous-titres (utile sans le son) |
| `?fov=70` | champ de vision horizontal de la caméra, en degrés (62 par défaut) |
| *(avec `?fakerobot&fakeface`)* | le bouton **Main** met une main devant le robot virtuel |
| `?lost=4` | délai sans visage avant de se rendormir, en secondes (10 par défaut) |
| `?rearm=10` | délai avant de pouvoir se réveiller pour la même personne, en secondes (30 par défaut) |
| `?voice=Thomas` | impose une voix (une partie de son nom) |
| `?faces` | galerie de toutes les expressions |

Les réglages du suivi sont dans `src/robot/aim.js` (`AIM`), ceux du oui/non dans `src/vision/gesture.js` (`GESTURE`),
les délais de l'histoire dans `src/story/brain.js` (`BRAIN`).

## Statut — à lire

**Pas encore essayé sur un vrai robot, ni sur un vrai téléphone.** Ce qui est vérifié, et comment :

- **L'histoire entière**, dans l'ordre voulu, avec des moments simulés (`tests/brain.test.js`, 18 cas : réveil,
  oui, non, pas de réponse, 10 s sans visage, visage qui part pendant la marche, bord non trouvé, script qui
  ne part pas, la main qui vient, qui vient tôt, qui ne vient pas, quatre langues, retour à l'écran de départ)
  **et dans un navigateur** avec `?fakerobot&fakeface` : réveil, question, « oui », main, rire, sol, marche, peur,
  recul, bonne nuit, endormi.
- **Le script du robot**, tel que l'interface l'envoie, sur un robot virtuel (`tests/test_table_edge.py`) : arrêt à
  quelques millimètres du bord, 4 distances, bord de travers, table sombre, robot soulevé, déjà au bord, pas
  de bord (arrêt après 14 s), une mesure parasite, un plantage en cours de route, recul, obstacle derrière. Les
  appels MicroPython utilisés ont été relus dans `ref/mp/ports/esp32/thymio_*.c`.
- **Le script de la main**, tel que l'interface l'envoie, sur un robot virtuel (`tests/test_hand_sensor.py`) : main sur
  chacun des cinq capteurs, main à quelques centimètres seulement et main trop loin, objet qui reste devant le
  robot, pas de main (attente de 16 s), bruit et mesure parasite, plantage en cours de route.
- **La liaison** (`tests/link.test.js`) : sans file d'attente de commandes, arrêt des roues sans nouvel ordre,
  reprise après échec d'écriture, scripts exécutés pour de vrai sur le robot virtuel et leurs lignes relues
  quelle que soit la découpe des paquets, « script terminé » tardif, déconnexion et reconnexion, page fermée.
- **Le oui/non** sur des signaux simulés (hochement, secouement, tremblement, regard qui se promène, tête qui
  tourne en rond, 10 à 30 images par seconde) et **la mesure de la tête** sur un modèle 3D de tête ; **le suivi**
  sur un robot simulé avec le retard de la caméra et du Bluetooth (arrive au centre sans osciller).
- **MediaPipe** se charge dans la page (WASM du site, modèle, GPU) et tourne sans erreur sur une image.

Ce qui reste à voir sur le matériel :

- **La détection d'un vrai visage et le oui/non d'une vraie tête.** Les seuils (`GESTURE.swing` = 0,035, soit
  environ 7° de la tête) sont raisonnés, pas mesurés : `?debug` montre les signaux en direct pour les ajuster.
- **Le sens de rotation** (une caméra qui renverrait l'image en miroir tournerait le robot du mauvais côté :
  case dans `?debug`) et le **champ de vision** (`?fov=`).
- **La main** : les seuils (700 et 450 sur 4095) sont raisonnés d'après l'échelle des capteurs, pas mesurés sur une
  vraie main ; et que les LED de proximité s'allument bien pendant l'attente. L'**arrêt au bord** sur votre table (un
  seuil à 50 % de ce que lisent les capteurs sur elle) et la **vitesse** (250, soit environ 7 cm/s).
- **Les voix** disponibles sur le téléphone (le classement a été vérifié sur la liste d'un Mac : Thomas, Anna, Alice,
  Daniel au lieu d'Eddy, mais pas écouté sur le téléphone) et le **temps de pose** du script sur le robot (100 à 300 ms
  attendus, envoyé pendant la phrase précédente).
- **Le 2:1 de l'écran** : le visage est dessiné dans un cadre 2:1 et centré.
