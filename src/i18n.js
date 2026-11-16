// UI translations (English default, Italian). Component names live in data/catalog.js.
import { useMemo } from 'react';
import { useStore } from './store.js';
import { PART_TYPES, CATEGORIES } from './data/catalog.js';
import { EN2, IT2 } from './i18n2.js';

export const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'it', label: 'Italiano' },
];

const en = {
  'app.title': 'Breadboard Digital',
  'app.credit': 'Created by Thomas Isabelli',
  'clock.now': 'Time',
  'clock.session': 'Session',
  'lang': 'Language',
  'sim.play': 'Play', 'sim.pause': 'Pause', 'sim.reset': 'Reset', 'sim.speed': 'Speed', 'sim.time': 'Sim time',
  'view.perspective': 'Perspective', 'view.top': 'Horizontal (2D)', 'view.front': 'Vertical', 'view.side': 'Side',
  'view.rotL': 'Rotate left 90°', 'view.rotR': 'Rotate right 90°', 'view.tilt': 'Tilt', 'view.zoomIn': 'Zoom in', 'view.zoomOut': 'Zoom out',
  'view.auto': 'Auto-rotate',
  'xray.on': 'Hide internal pins', 'xray.off': 'Show internal pins', 'xray.hint': 'X-ray: plastic cover removed — metal strips coloured by voltage',
  'tool.select': 'Select / move', 'tool.wire': 'Jumper wire', 'tool.rotate': 'Rotate (R)', 'tool.delete': 'Delete (Del)',
  'wire.color': 'Wire colour',
  'lib.title': 'Component library', 'lib.search': 'Search any component…', 'lib.empty': 'No component found', 'lib.hint': 'Click a part, then click the board — or drag it onto the board.',
  'insp.title': 'Inspector', 'insp.none': 'Select a component on the board to edit its parameters.',
  'insp.readout': 'Live values', 'insp.v': 'Voltage', 'insp.i': 'Current', 'insp.p': 'Power', 'insp.rot': 'Rotate', 'insp.del': 'Delete', 'insp.repair': 'Replace with a new part',
  'insp.burnt': 'Component destroyed', 'insp.bands': 'Colour bands', 'insp.hold': 'Hold to press', 'insp.latch': 'Press / release',
  'insp.sketch': 'Sketch', 'insp.serial': 'Serial monitor', 'insp.wire': 'Jumper wire',
  'insp.error': 'Sketch error', 'insp.probe': 'Drag the probe tips onto any hole or terminal.',
  'insp.attached': 'attached', 'insp.parked': 'parked',
  'burn.overcurrent': 'Over-current', 'burn.overload': 'Overloaded (too much power / voltage)', 'burn.supply': 'Wrong supply voltage', 'burn.overheat': 'Overheated',
  'burn.fuse': 'Fuse blown', 'burn.breakdown': 'Voltage breakdown', 'burn.overvoltage': 'Over-voltage', 'burn.gate-oxide': 'Gate oxide destroyed',
  'f.V': 'Voltage', 'f.Imax': 'Max current', 'f.Rint': 'Internal resistance', 'f.on': 'Output on', 'f.wave': 'Waveform', 'f.amp': 'Amplitude',
  'f.f': 'Frequency', 'f.offset': 'DC offset', 'f.Vrms': 'Voltage (RMS)', 'f.R': 'Resistance', 'f.tol': 'Tolerance (%)', 'f.P': 'Power rating',
  'f.span': 'Lead spacing', 'f.C': 'Capacitance', 'f.Vmax': 'Max voltage', 'f.L': 'Inductance', 'f.Rdc': 'Series resistance', 'f.pos': 'Position',
  'f.R10': 'Resistance @10 lux', 'f.lux': 'Light level', 'f.gamma': 'Gamma', 'f.R25': 'Resistance @25 °C', 'f.B': 'Beta', 'f.temp': 'Temperature',
  'f.Tsw': 'Switching temp.', 'f.color': 'Light colour', 'f.vf': 'Threshold Vf', 'f.vfR': 'Vf red', 'f.vfG': 'Vf green', 'f.vfB': 'Vf blue',
  'f.common': 'Common pin', 'f.Vz': 'Zener voltage', 'f.Pmax': 'Max power', 'f.beta': 'Gain (hFE)', 'f.Vth': 'Threshold Vth', 'f.Kp': 'Transconductance',
  'f.mode': 'Mode', 'f.sw': 'Switches', 'f.keys': 'Keys', 'f.code': 'Program', 'f.sketch': 'Program', 'f.pos0': 'Position',
  'o.sine': 'Sine', 'o.square': 'Square', 'o.triangle': 'Triangle', 'o.saw': 'Sawtooth', 'o.momentary': 'Momentary', 'o.latching': 'Latching',
  'o.cathode': 'Common cathode', 'o.anode': 'Common anode', 'o.V': 'DC Voltmeter', 'o.Vac': 'AC Voltmeter (RMS)', 'o.A': 'Ammeter (series)', 'o.Ohm': 'Ohmmeter (power OFF)',
  'o.blink': 'Blink', 'o.fade': 'Fade (PWM)', 'o.button': 'Button → LED', 'o.analog': 'Analog → PWM', 'o.chase': 'LED chase', 'o.custom': 'Custom code',
  'o.0': 'Position A', 'o.1': 'Position B',
  'led.red': 'Red', 'led.orange': 'Orange', 'led.yellow': 'Yellow', 'led.green': 'Green', 'led.blue': 'Blue', 'led.white': 'White', 'led.custom': 'Custom',
  'scope.title': 'Oscilloscope', 'scope.tdiv': 'Time/div', 'scope.v1': 'CH1 V/div', 'scope.v2': 'CH2 V/div', 'scope.trig': 'Trigger level', 'scope.ch2': 'Show CH2',
  'mm.title': 'Multimeter', 'mm.check': 'Connect both probes to measure.',
  'status.hole': 'Hole', 'status.net': 'Net voltage',
  'status.ready': 'Ready', 'status.burnt': 'burnt', 'status.parts': 'parts', 'status.wires': 'wires',
  'file.save': 'Save', 'file.open': 'Open', 'file.examples': 'Examples', 'file.clear': 'Clear board',
  'ex.led': 'LED + resistor', 'ex.dimmer': 'Potentiometer dimmer', 'ex.blink555': '555 blinker (1 Hz)', 'ex.nano': 'Arduino Nano blink',
  'help.title': 'Quick help',
  'help.1': 'Left-click = select / place · Left-drag on empty space = orbit 360° · Right-drag = pan · Wheel = zoom',
  'help.2': 'R = rotate part · Del = delete · Esc = cancel · W = wire tool',
  'help.3': 'Wire tool: click a hole or bench terminal, then another one.',
  'help.4': 'Multimeter / scope: drag the coloured probe tips onto holes.',
};

const it = {
  'app.title': 'Breadboard Digital',
  'app.credit': 'Creato da Thomas Isabelli',
  'clock.now': 'Ora',
  'clock.session': 'Sessione',
  'lang': 'Lingua',
  'sim.play': 'Avvia', 'sim.pause': 'Pausa', 'sim.reset': 'Reset', 'sim.speed': 'Velocità', 'sim.time': 'Tempo sim.',
  'view.perspective': 'Prospettiva', 'view.top': 'Orizzontale (2D)', 'view.front': 'Verticale', 'view.side': 'Laterale',
  'view.rotL': 'Ruota a sinistra di 90°', 'view.rotR': 'Ruota a destra di 90°', 'view.tilt': 'Inclinazione', 'view.zoomIn': 'Zoom avanti', 'view.zoomOut': 'Zoom indietro',
  'view.auto': 'Rotazione automatica',
  'xray.on': 'Nascondi pin interni', 'xray.off': 'Vedi pin interni', 'xray.hint': 'Raggi X: copertura in plastica rimossa — strisce metalliche colorate in base alla tensione',
  'tool.select': 'Seleziona / sposta', 'tool.wire': 'Cavo jumper', 'tool.rotate': 'Ruota (R)', 'tool.delete': 'Elimina (Canc)',
  'wire.color': 'Colore cavo',
  'lib.title': 'Libreria componenti', 'lib.search': 'Cerca qualsiasi componente…', 'lib.empty': 'Nessun componente trovato', 'lib.hint': 'Clicca un componente, poi clicca sulla breadboard — oppure trascinalo.',
  'insp.title': 'Ispettore', 'insp.none': 'Seleziona un componente sulla breadboard per modificarne i parametri.',
  'insp.readout': 'Valori in tempo reale', 'insp.v': 'Tensione', 'insp.i': 'Corrente', 'insp.p': 'Potenza', 'insp.rot': 'Ruota', 'insp.del': 'Elimina', 'insp.repair': 'Sostituisci con uno nuovo',
  'insp.burnt': 'Componente distrutto', 'insp.bands': 'Bande colorate', 'insp.hold': 'Tieni premuto', 'insp.latch': 'Premi / rilascia',
  'insp.sketch': 'Sketch', 'insp.serial': 'Monitor seriale', 'insp.wire': 'Cavo jumper',
  'insp.error': 'Errore nello sketch', 'insp.probe': 'Trascina le punte delle sonde su un foro o un morsetto.',
  'insp.attached': 'collegata', 'insp.parked': 'a riposo',
  'burn.overcurrent': 'Sovracorrente', 'burn.overload': 'Sovraccarico (troppa potenza / tensione)', 'burn.supply': 'Tensione di alimentazione errata', 'burn.overheat': 'Surriscaldamento',
  'burn.fuse': 'Fusibile bruciato', 'burn.breakdown': 'Rottura per tensione', 'burn.overvoltage': 'Sovratensione', 'burn.gate-oxide': 'Ossido di gate distrutto',
  'f.V': 'Tensione', 'f.Imax': 'Corrente massima', 'f.Rint': 'Resistenza interna', 'f.on': 'Uscita attiva', 'f.wave': 'Forma d\'onda', 'f.amp': 'Ampiezza',
  'f.f': 'Frequenza', 'f.offset': 'Offset DC', 'f.Vrms': 'Tensione (RMS)', 'f.R': 'Resistenza', 'f.tol': 'Tolleranza (%)', 'f.P': 'Potenza nominale',
  'f.span': 'Passo dei reofori', 'f.C': 'Capacità', 'f.Vmax': 'Tensione massima', 'f.L': 'Induttanza', 'f.Rdc': 'Resistenza serie', 'f.pos': 'Posizione',
  'f.R10': 'Resistenza @10 lux', 'f.lux': 'Luminosità', 'f.gamma': 'Gamma', 'f.R25': 'Resistenza @25 °C', 'f.B': 'Beta', 'f.temp': 'Temperatura',
  'f.Tsw': 'Temp. di commutazione', 'f.color': 'Colore della luce', 'f.vf': 'Tensione di soglia Vf', 'f.vfR': 'Vf rosso', 'f.vfG': 'Vf verde', 'f.vfB': 'Vf blu',
  'f.common': 'Pin comune', 'f.Vz': 'Tensione Zener', 'f.Pmax': 'Potenza massima', 'f.beta': 'Guadagno (hFE)', 'f.Vth': 'Soglia Vth', 'f.Kp': 'Transconduttanza',
  'f.mode': 'Modalità', 'f.sw': 'Interruttori', 'f.keys': 'Tasti', 'f.code': 'Programma', 'f.sketch': 'Programma', 'f.pos0': 'Posizione',
  'o.sine': 'Sinusoidale', 'o.square': 'Quadra', 'o.triangle': 'Triangolare', 'o.saw': 'Dente di sega', 'o.momentary': 'Momentaneo', 'o.latching': 'A scatto',
  'o.cathode': 'Catodo comune', 'o.anode': 'Anodo comune', 'o.V': 'Voltmetro DC', 'o.Vac': 'Voltmetro AC (RMS)', 'o.A': 'Amperometro (in serie)', 'o.Ohm': 'Ohmetro (circuito SPENTO)',
  'o.blink': 'Lampeggio', 'o.fade': 'Dissolvenza (PWM)', 'o.button': 'Pulsante → LED', 'o.analog': 'Analogico → PWM', 'o.chase': 'Sequenza LED', 'o.custom': 'Codice personalizzato',
  'o.0': 'Posizione A', 'o.1': 'Posizione B',
  'led.red': 'Rosso', 'led.orange': 'Arancione', 'led.yellow': 'Giallo', 'led.green': 'Verde', 'led.blue': 'Blu', 'led.white': 'Bianco', 'led.custom': 'Personalizzato',
  'scope.title': 'Oscilloscopio', 'scope.tdiv': 'Tempo/div', 'scope.v1': 'CH1 V/div', 'scope.v2': 'CH2 V/div', 'scope.trig': 'Livello trigger', 'scope.ch2': 'Mostra CH2',
  'mm.title': 'Multimetro', 'mm.check': 'Collega entrambe le sonde per misurare.',
  'status.hole': 'Foro', 'status.net': 'Tensione del nodo',
  'status.ready': 'Pronto', 'status.burnt': 'bruciati', 'status.parts': 'componenti', 'status.wires': 'cavi',
  'file.save': 'Salva', 'file.open': 'Apri', 'file.examples': 'Esempi', 'file.clear': 'Svuota breadboard',
  'ex.led': 'LED + resistenza', 'ex.dimmer': 'Dimmer con potenziometro', 'ex.blink555': 'Lampeggiatore 555 (1 Hz)', 'ex.nano': 'Arduino Nano lampeggio',
  'help.title': 'Guida rapida',
  'help.1': 'Clic sinistro = seleziona / posiziona · Trascina su spazio vuoto = orbita a 360° · Trascina destro = sposta · Rotella = zoom',
  'help.2': 'R = ruota componente · Canc = elimina · Esc = annulla · W = cavo',
  'help.3': 'Cavo: clicca un foro o un morsetto, poi un altro punto.',
  'help.4': 'Multimetro / oscilloscopio: trascina le punte colorate delle sonde sui fori.',
};

export const DICT = { en: { ...en, ...EN2 }, it: { ...it, ...IT2 } };

export function translate(lang, key, fallback) {
  return (DICT[lang] && DICT[lang][key]) || DICT.en[key] || fallback || key;
}

// Pick the localised string of an { en, it } object (never undefined).
export function pickL(lang, obj, fallback = '') {
  if (!obj) return fallback;
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj.en || fallback;
}

// Localised component name for a part type id, a catalog definition or a placed part. Never "undefined".
export function compName(lang, ref) {
  if (!ref) return '';
  const type = typeof ref === 'string' ? ref : ref.type;
  const def = typeof ref === 'object' && ref.name ? ref : PART_TYPES[type];
  if (def && def.name) return pickL(lang, def.name, type);
  return type ? String(type) : '';
}

// Returns a translate function t(key, fallback). NOTE: helpers are attached with names other than `name`
// on purpose — assigning `.name` on a function throws a TypeError in strict mode (ES modules are strict).
export function useT() {
  const lang = useStore((s) => s.lang);
  return useMemo(() => {
    const t = (key, fallback) => translate(lang, key, fallback);
    t.lang = lang;
    t.L = (obj, fallback) => pickL(lang, obj, fallback);
    t.comp = (ref) => compName(lang, ref);
    t.cat = (id) => { const c = CATEGORIES.find((x) => x.id === id); return c ? pickL(lang, c.name, id) : String(id); };
    return t;
  }, [lang]);
}
