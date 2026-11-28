# Crate & Cover

Ein Ego-Shooter im Browser: Team Blau gegen Team Orange, je vier Spieler, gegen Bots.

**Spielen:** https://mbohnenkamp.github.io/crate-and-cover/

## Steuerung

| Taste | Aktion |
|---|---|
| W A S D | Laufen |
| Maus | Umsehen |
| Linke Maustaste | Schießen |
| Rechte Maustaste | Zielfernrohr (Scharfschützengewehr) |
| Leertaste | Springen |
| Strg oder C | Ducken |
| Shift | Schleichen (leise) |
| R | Nachladen |
| 1 – 4, Mausrad, Q | Waffe wechseln |
| Tab | Punktestand |
| Esc | Pause |

## Karten

Hafen, Altstadt, Baustelle und eine Testkarte mit Schießstand.

## Rückmeldung

Fehler oder Ideen bitte als [Issue](https://github.com/mbohnenkamp/crate-and-cover/issues) melden.

Online fehlen die aufgenommenen Geräusche; das Spiel erzeugt dann eigene.

## Modelle

Soldaten, Hände, Waffen, Containerkran und Bagger (`public/models/ki/`) sind 3D-Modelle, die mit KI erzeugt wurden (Meshy über Higgsfield),
zum Teil nach eigenen Entwürfen. Karten, Requisiten und die älteren Figuren stammen aus Blender-Skripten
(`blender/`). Mit `?soldat=alt` hinter der Adresse zeigt das Spiel die Blender-Fassung.

Die Oberflächen der Karten (`public/textures/`) sind KI-Bilder (GPT Image über Higgsfield), aufbereitet mit
`tools/texturen.py`: Naht geglättet, mittlere Farbe herausgerechnet, damit die Blockfarbe der Karte sie tönt.
Mit `?flaechen=alt` zeigt das Spiel die im Code gemalten Flächen.

Kleinkram (`public/models/polyhaven/`): Fässer, Kisten, Reifen, Säcke, Eimer, Pflanzen und Wandlaternen von
[Poly Haven](https://polyhaven.com), Lizenz CC0 (gemeinfrei). Geladen am 26.11.2026 in 1k, Texturen auf 512 px
verkleinert und mit `tools/komprimieren.sh` komprimiert (19,1 MB auf 1,5 MB). Maße und Kollision stehen in
`src/game/props.js`, gemeinsam für Kartenskripte, Kartenbauer und Spiel.
