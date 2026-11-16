# Breadboard Digitale  (v2.1.1)

**Creato da / Created by: Thomas Isabelli**

Simulatore desktop di circuiti su breadboard (Windows, macOS, Linux) con vista 3D, vista interna "X-Ray",
libreria di oltre 60 componenti, ispettore dei parametri in tempo reale, multimetro, oscilloscopio e
animazione di bruciatura/fumo quando un componente viene sovraccaricato.

Stack: **Electron + React + Tailwind CSS + Three.js** (motore di simulazione in JavaScript puro) + **Supabase** opzionale per il cloud.

## Novità della v2

- **Home 3D** "Breadboard Digitale": carosello di 4 breadboard che ruotano a 360° con circuiti funzionanti montati (resistenze, cavi colorati, LED che pulsano); pulsanti che si espandono in hover (Nuovo progetto, I miei circuiti, Tutorial, Importa, Impostazioni).
- **4 breadboard selezionabili** con collegamenti interni reali e X-Ray: *Full-Size 830* (doppie barre +/− sopra e sotto, canalina centrale), *Half-Size 400*, *Multi-Bus/Lab* (3 coppie +/− indipendenti: 3.3 V / 5 V / 12 V), *Mini 170* (senza barre).
- **Alimentatori/batterie in tempo reale**: Volt, Ampere e Watt (P = V·Imax) sono sincronizzati tra motore, display LCD sul modello 3D e Ispettore (valori + grafico V/A/W scorrevole), senza ricaricare né mettere in pausa. Niente più "9V" statico.
- **Nomi sempre corretti** in IT/EN (Ispettore, tooltip, libreria): niente più `comp.undefined`.
- **Account** Email + Password (nessun OAuth), ruolo Studente/Docente, validazione email (sintassi, domini reali, anti-domini usa-e-getta, suggerimento refusi, controllo DNS quando online).
- **Modalità Laboratorio Scolastico** per `@iisdavincisangiovanniinfiore.edu.it` e qualsiasi `.edu.it`: schermata "Benvenuto Studente / Docente", badge istituzionale, consigli didattici e tutorial proposto subito.
- **Salvataggio cloud** su Supabase (con fallback automatico su localStorage), "I miei circuiti" da qualsiasi PC, **Esporta file / Importa da file** (`.bbd.json`).
- **Banco di lavoro 3D** più ricco: tappetino ESD con griglia in mm, ombre morbide, luce regolabile (💡), riflessi sui pin metallici, evidenziazione dei fori collegati al passaggio del mouse, animazioni fumo/bruciatura.
- **Tutorial interattivo** passo-passo (alimentatore → resistenza → LED → multimetro → X-Ray), proposto al primo accesso e richiamabile dal pulsante "?".
- **Compatibilità strict-mode**: `i18n.js` e `Library.jsx` non assegnano più `.name` a funzioni (usa `t.L()`, `t.comp()`, `t.cat()`).
- Il motore di simulazione elettrica (MNA + Newton-Raphson) è invariato.

## v2.1.1 — causa trovata dello schermo nero: `removeChild` e traduzione del browser

Il paracadute ha catturato l'errore reale: `NotFoundError: Failed to execute 'removeChild' on 'Node'`. Non viene dal codice 3D (il canvas è gestito da React, non ci sono `removeChild` manuali) ma dalla **traduzione automatica del browser**: la pagina dichiarava `lang="en"` con interfaccia italiana, Chrome proponeva di tradurla, avvolgeva i testi in `<font>` e, al primo re-render di React (10 volte al secondo), `removeChild` falliva e tutta l'interfaccia veniva smontata. Riprodotto in isolamento: senza protezione `#root` resta vuoto, con la protezione no.

- `index.html`: `translate="no"` + `class="notranslate"` su `<html>` e `#root`, meta `google: notranslate`.
- `<html lang>` ora segue la lingua dell'interfaccia (IT/EN).
- `src/domGuard.js` (caricato per primo): `removeChild`/`insertBefore` tollerano nodi spostati da traduttori o estensioni invece di lanciare.
- Il pannello 3D ha `translate="no"`; l'error boundary rimonta da solo un pannello colpito da questo tipo di errore (max 3 volte in 10 s).

## Novità della v2.1 — stabilità 3D e importazione (schermo nero)

Segnalato: dopo qualche secondo lo schermo diventava nero, sia importando un `.bbd.json` sia creando un circuito da zero (non nel tutorial guidato).

**Cosa ho verificato.** Il motore elettrico non c'entra: nuovo progetto vuoto, circuiti parziali, cortocircuiti e componenti che bruciano non producono mai `NaN` né eccezioni (test automatici). Nuovo progetto e tutorial partono ora dallo *stesso* stato (verificato su tutte e 4 le schede). La differenza reale tra tutorial e circuito "da zero" è ciò che accade dopo: il tutorial non brucia mai nulla, un circuito costruito a mano o importato spesso sì (LED senza resistenza, cortocircuiti).

**Cosa NON ho potuto fare.** Qui non c'è WebGL (né Three.js), quindi non ho potuto riprodurre il nero né vedere la riga esatta che lo causa. Ho quindi eliminato tutte le cause plausibili e fatto in modo che, anche se resta un errore, **non si arrivi più a uno schermo nero**:

- **Loop di rendering indistruttibile**: `requestAnimationFrame` viene ripianificato *prima* del frame, quindi un'eccezione non lo ferma più (prima bastava un'eccezione per fermarlo per sempre e lasciare il canvas nero). Ogni animazione "live" di un componente è isolata: se una fallisce viene disattivata solo per quel pezzo.
- **Perdita del contesto WebGL** (`webglcontextlost`): la vista 3D viene ricreata automaticamente su un canvas nuovo. Dopo 4 riavvii in 20 s compare un riquadro con l'errore e il pulsante "Riavvia la vista 3D".
- **Lampi di bruciatura**: le luci puntiformi sono ora un pool fisso creato all'avvio, invece di aggiungere/rimuovere luci a runtime (che ricompila tutti gli shader).
- **Error boundary React**: un errore di rendering in un pannello (Ispettore, Libreria, ecc.) resta confinato in quel pannello. Errori non gestiti mostrano un avviso con il messaggio reale.
- **Simulatore**: un errore nel passo di simulazione mette in pausa (Play per riprendere) invece di bloccare la finestra.
- **Importazione `.bbd.json`** (`loadProject`): ID sempre rigenerati; `board` validato (altrimenti Full); parametri `null`/`NaN` (il JSON salva `NaN` come `null`) sostituiti dai default del catalogo e controllati per tipo; posizioni verificate con le stesse regole del piazzamento manuale; fili e sonde con fori/pin inesistenti scartati; duplicati, auto-collegamenti e colori non validi ripuliti; limiti 400 componenti / 2000 fili / 8 MB. Un avviso indica quanti elementi sono stati ignorati.
- **Scena 3D ricostruita da zero** a ogni nuovo progetto, importazione, apertura dal cloud o cambio scheda (parti, fili, sonde, fumo, luci, fantasma).
- Il fantasma di piazzamento non perde più materiali/texture; un file importato non sovrascrive più per errore un circuito cloud esistente.

Se il nero dovesse comparire ancora, apri la console (Ctrl+Shift+I) e copia le righe che iniziano con `[3D]`, `[sim]` o `[UI]`: indicano il punto esatto.

---

> **Nota onesta sullo stato dei test.** Verificati con test automatici: il motore (`npm test`, 15 prove), la geometria delle 4 breadboard,
> il flusso store/sincronizzazione V-A-W e la completezza delle traduzioni. L'interfaccia React è stata anche avviata in Chromium con le
> scene 3D sostituite da finti segnaposto (Home, registrazione scuola, benvenuto, tutorial, ispettore, tutti i 64 componenti, salvataggio, impostazioni, importazioni valide/ostili/corrotte e guasti 3D iniettati: nessun errore).
> **Non sono mai stati eseguiti** qui (niente npm, GPU, Electron, rete): il rendering WebGL/Three.js (aspetto di breadboard, tappetino, luci, carosello),
> la build reale Vite/Electron, Supabase dal vivo e il controllo DNS. Al primo `npm run dev` possono quindi emergere piccoli errori di runtime o di
> aspetto: apri la console (Ctrl+Shift+I) e segnalameli, sono in genere correzioni di una riga.

## Configurare Supabase (cloud, facoltativo)

Senza configurazione l'app funziona in **modalità locale** (account e circuiti salvati solo su questo PC).

1. Crea un progetto su https://supabase.com.
2. Dashboard → **SQL Editor** → New query → incolla il contenuto di `supabase/schema.sql` → **Run** (crea la tabella `circuits` con RLS: ogni utente vede solo i propri circuiti).
3. Copia `.env.example` in `.env` e inserisci `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
4. Authentication → Providers → **Email** attivo. Se vuoi che l'accesso sia immediato, disattiva "Confirm email"; se resta attiva, l'utente deve prima cliccare il link ricevuto.
5. Riavvia `npm run dev`. Gli stessi circuiti compaiono in "I miei circuiti" da qualsiasi computer con lo stesso account.

La chiave *anon* è pubblica per progettazione: la sicurezza è garantita dalle policy RLS dello schema.

## 1. Requisiti

- Node.js **18 o superiore** (consigliato 20/22) e npm
- Una GPU/driver con WebGL (qualsiasi PC recente)
- Connessione internet per il primo `npm install` (scarica Electron, ~100 MB)

## 2. Installazione ed esecuzione

```bash
cd breadboard-digital
npm install          # installa le dipendenze (una volta sola)

npm run dev          # modalità sviluppo: Vite + finestra Electron con hot-reload
npm start            # build di produzione + avvio dell'app Electron
npm test             # test headless del motore di simulazione (15 verifiche)
```

## 3. Creare l'eseguibile / installer

```bash
npm run dist         # installer per il sistema operativo corrente  -> cartella release/
npm run dist:win     # Windows: installer NSIS (.exe) + versione portable
npm run dist:mac     # macOS: .dmg   (va eseguito su un Mac)
npm run dist:linux   # Linux: .AppImage + .deb
```

Note:
- electron-builder crea gli installer **per il sistema su cui lo lanci** (il .dmg richiede macOS; il .exe si crea al meglio su Windows).
- Per un'icona personalizzata aggiungi `build/icon.png` (512×512) oppure `build/icon.ico` / `build/icon.icns`: verrà usata automaticamente.
- Su Linux, se Electron lamenta il sandbox: `npx electron . --no-sandbox`.

## 4. Come si usa

| Azione | Come |
|---|---|
| Aggiungere un componente | clic sul componente in libreria, poi clic sulla breadboard (Shift = ne posiziona più di uno) — oppure trascinalo |
| Cercare | barra di ricerca in alto nella libreria (nome IT/EN, tipo, parole chiave) |
| Spostare | trascina il componente (si aggancia ai fori; rosso = posizione non valida) |
| Ruotare | tasto **R** o pulsante "Ruota" |
| Eliminare | **Canc** o pulsante "Elimina" |
| Cavi jumper | tasto **W** (o "Cavo jumper"): clic su un foro / morsetto, poi su un altro. Colore scelto dalla paletta |
| Alimentazione | batterie e alimentatori stanno accanto alla breadboard: collega i loro morsetti con un cavo ai fori o alle rail (+ rosso / − blu) |
| Multimetro / oscilloscopio | trascina le punte colorate delle sonde su un foro o un morsetto; modalità dal pannello in basso |
| Orbita 360° | trascina con il tasto sinistro su uno spazio vuoto; destro = sposta; rotella = zoom |
| Viste | Prospettiva · Orizzontale (2D) · Verticale · Laterale, cursore **Inclinazione**, ⟲/⟳ 90°, rotazione automatica 360°, zoom ± |
| **Vedi Pin Interni** | pulsante in alto a destra (tasto **X**): la copertura di plastica diventa trasparente e si vedono le strisce metalliche interne (le colonne da 5 fori e i bus di alimentazione), colorate in base alla tensione (rosso = positivo, blu = negativo) |
| Simulazione | **Play / Pausa / Reset** + cursore velocità (×0.001 … ×100). Per segnali veloci (555, AC a kHz) abbassa la velocità e guarda l'oscilloscopio |
| Lingua | menu in alto a destra: English (default) / Italiano, cambia tutta l'interfaccia |
| Salvare / aprire | pulsanti Salva / Apri (file `.bbd.json`); menu **Esempi** con 4 circuiti pronti |

### Ispettore (pannello destro)
Clic su un componente per modificare i parametri in tempo reale:
batterie/alimentatori (Volt e limite di corrente → modalità CV/CC), resistenze (valore con Ω/kΩ/MΩ e **bande colorate aggiornate** anche sul modello 3D),
LED (colore, tensione di soglia Vf, corrente massima), condensatori (pF/nF/µF), induttori, potenziometri con **manopola interattiva 0–100 %**,
LDR (lux), NTC/PTC (temperatura), transistor (hFE, soglie), interruttori, DIP-switch, tastierino, e per Arduino/ESP32 un editor di sketch.
Sotto i parametri vedi tensione, corrente e potenza istantanee del componente.

### Bruciature
Ogni componente ha limiti (corrente massima del LED, potenza delle resistenze, tensione dei condensatori, tensione di alimentazione degli IC, 
dissipazione dei regolatori, fusibile del multimetro in modalità A…). Se il sovraccarico dura abbastanza, il componente si carbonizza, emette
scintille e fumo, e diventa un circuito aperto. Dall'ispettore puoi sostituirlo con uno nuovo. Esempio: LED con batteria da 9 V senza resistenza.

## 5. Libreria componenti

- **Alimentazione**: batterie 9V / AA / AAA / CR2032 / LiPo, alimentatore da banco 0–30 V (CV/CC), alimentatore duale ±V, AC dual-rail (presa centrale), generatore di funzioni
- **Passivi**: resistori, condensatori (elettrolitici, ceramici, poliestere), induttori, potenziometri (lineari/logaritmici), trimmer, LDR, termistori NTC/PTC
- **Semiconduttori**: LED (6 colori + personalizzato), LED RGB, diodi 1N4007 / 1N4148 / Schottky 1N5819 / Zener, transistor NPN (2N2222, BC547), PNP (2N2907, BC557), MOSFET N (2N7000, IRF540) e P (IRF9540)
- **Input & Switch**: pulsanti 6 mm (momentaneo/a scatto), interruttori SPST / SPDT / DPDT, DIP-switch a 8, tastierino 4×4
- **Circuiti integrati**: NE555 / TLC555, logica 74LSxx e 74HCxx (NOT, AND, OR, NAND, NOR, XOR), LM358, µA741, LM7805 / 7809 / 7812, LM317, Arduino Uno / Nano, ESP32 (pinout reale, montabili su breadboard Nano/ESP32)
- **Strumenti & Cavi**: cavi jumper colorati, multimetro digitale (V DC, V AC RMS, A, Ω), oscilloscopio a 2 canali con trigger

Gli sketch Arduino/ESP32 sono in JavaScript con API tipo Arduino (`pinMode`, `digitalWrite`, `analogRead`, `analogWrite`, `Serial.println`…):

```js
function setup() { pinMode(13, OUTPUT); }
function* loop() {
  digitalWrite(13, HIGH);
  yield delay(500);          // "yield delay(ms)" attende in tempo simulato
  digitalWrite(13, LOW);
  yield delay(500);
}
```

## 6. Come funziona il motore elettrico

`src/engine/` è un simulatore a **analisi nodale modificata (MNA)**: ogni foro/striscia/cavo viene unito in nodi (union-find), si costruisce
la matrice di conduttanza (Legge di Kirchhoff delle correnti + Legge di Ohm) e si risolve con eliminazione di Gauss.

- Componenti non lineari (diodi, LED, Zener, BJT Ebers-Moll, MOSFET, op-amp, regolatori) con iterazione di **Newton-Raphson**, limitazione delle giunzioni (pnjlim) e smorzamento adattivo.
- Condensatori e induttori con integrazione **Eulero all'indietro** (passo adattivo in funzione della velocità).
- Sorgenti con resistenza interna e **limite di corrente** (passaggio automatico CV → CC).
- Logica, 555 e microcontrollori sono modelli comportamentali con ritardo di un passo.
- `npm test` verifica: partitore, LED+R, bruciatura LED, carica RC, saturazione NPN, amplificatore invertente (guadagno −10), 555 astabile (~6.9 Hz), LM7805, Zener, porta NOT TTL, lampeggio Arduino.

### Limiti noti (modelli semplificati)
- Le rail di alimentazione sono continue (50 fori, 25 sulla Half-Size), non divise a metà come in alcune breadboard.
- Modelli dei componenti didattici (parametri tipici, non curve di datasheet); nessuna simulazione termica o RF.
- L'ohmmetro misura il circuito così com'è: come nella realtà, va usato a circuito spento.
- Gli sketch sono eseguiti con `new Function`: aprire solo file di progetto di cui ti fidi.
- Non c'è ancora annulla/ripristina (undo/redo).

## 7. Struttura del progetto

```
breadboard-digital/
├─ package.json            dipendenze, script, configurazione electron-builder
├─ vite.config.js / tailwind.config.js / postcss.config.js / index.html
├─ electron/
│  ├─ main.cjs             finestra Electron + dialoghi Salva/Apri
│  └─ preload.cjs          API sicura esposta alla UI
├─ src/
│  ├─ main.jsx, App.jsx, index.css, i18n.js + i18n2.js (EN/IT), store.js (stato), sim.js
│  ├─ auth/                emailCheck.js, supabase.js, auth.js (account, modalità scuola)
│  ├─ cloud/               circuits.js (salvataggio cloud + cache locale)
│  ├─ data/                catalog.js (tutti i componenti), examples.js, sketches.js, format.js
│  ├─ engine/              geometry.js (breadboard), netlist.js, engine.js (MNA), models.js, mcu.js, common.js, linalg.js
│  ├─ three/               BoardScene.js (editor), boardMesh.js (modello breadboard), ShowcaseScene.js (home), parts3d.js
│  └─ ui/                  Home, NewProject, BoardPicker, AuthModal, Welcome, Tutorial, MyCircuits, SaveDialog, SettingsModal,
│                          TopBar, Library, Viewport, Inspector, Instruments, fileio.js
├─ supabase/schema.sql     tabella circuits + RLS
└─ tests/engine.test.mjs   test del motore
```

Per aggiungere un componente: definiscilo in `src/data/catalog.js` (pin, parametri, campi dell'ispettore), crea/riusa il modello fisico in
`src/engine/models.js` e il modello 3D in `src/three/parts3d.js`.

## 8. Problemi comuni

- `npm install` fallisce scaricando Electron → controlla proxy/firewall, oppure `npm config set registry https://registry.npmjs.org/`.
- Finestra nera / niente 3D → aggiorna i driver video; prova `npx electron . --disable-gpu`.
- Simulazione "lenta" con circuiti grandi → abbassa la velocità o metti in pausa mentre costruisci.

---
© Thomas Isabelli — Breadboard Digitale
