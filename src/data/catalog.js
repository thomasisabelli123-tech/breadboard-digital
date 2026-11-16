// Component catalog: single source of truth for the library panel, the inspector,
// the 3D models and the simulation models.
//
// pins(params) -> [{ n: 'name', dx, dy }]   offsets in board pitches (before rotation)
// params       -> default parameters (edited from the inspector)
// fields       -> inspector descriptors
// model        -> key into engine/models.js
// m3d          -> key into three/parts3d.js
// bench: true  -> sits next to the board and is wired with jumper leads (no hole snapping)

const L = (en, it) => ({ en, it });

export const CATEGORIES = [
  { id: 'power', name: L('Power', 'Alimentazione'), icon: '⚡' },
  { id: 'passive', name: L('Passive components', 'Componenti passivi'), icon: '〰' },
  { id: 'semi', name: L('Semiconductors', 'Semiconduttori'), icon: '▶' },
  { id: 'input', name: L('Input & Switches', 'Input e Switch'), icon: '⏻' },
  { id: 'ic', name: L('Integrated circuits', 'Circuiti integrati'), icon: '▦' },
  { id: 'tools', name: L('Tools & Wires', 'Strumenti e Cavi'), icon: '🔧' },
];

export const UNITS = {
  R: [['Ω', 1], ['kΩ', 1e3], ['MΩ', 1e6]],
  C: [['pF', 1e-12], ['nF', 1e-9], ['µF', 1e-6], ['mF', 1e-3]],
  L: [['µH', 1e-6], ['mH', 1e-3], ['H', 1]],
};

export const LED_COLORS = [
  { id: 'red', hex: '#ff2b2b', vf: 1.9 },
  { id: 'orange', hex: '#ff8a1f', vf: 2.0 },
  { id: 'yellow', hex: '#ffe12e', vf: 2.1 },
  { id: 'green', hex: '#2bff4a', vf: 2.2 },
  { id: 'blue', hex: '#2f6bff', vf: 3.0 },
  { id: 'white', hex: '#fff3d6', vf: 3.1 },
  { id: 'custom', hex: '#c04bff', vf: 2.5 },
];

// ---------- pin layout helpers ----------
const axial = (p) => [{ n: 'A', dx: 0, dy: 0 }, { n: 'B', dx: p.span ?? 4, dy: 0 }];
const polar2 = (p, a = '+', b = '-') => [{ n: a, dx: 0, dy: 0 }, { n: b, dx: p.span ?? 1, dy: 0 }];
const row = (names, dy = 0, dx0 = 0) => names.map((n, i) => ({ n, dx: dx0 + i, dy }));
const dip = (names) => {
  const n = names.length;
  const out = [];
  for (let i = 1; i <= n / 2; i++) {
    out.push({ n: names[i - 1], dx: i - 1, dy: 3 });
    out.push({ n: names[n - i], dx: i - 1, dy: 0 });
  }
  return out;
};

// ---------- 74xx logic ----------
export const LOGIC = {
  '00': { fn: 'nand', title: L('Quad 2-input NAND', 'Quadruplo NAND a 2 ingressi'),
    labels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'] },
  '02': { fn: 'nor', title: L('Quad 2-input NOR', 'Quadruplo NOR a 2 ingressi'),
    labels: ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'] },
  '04': { fn: 'not', title: L('Hex inverter (NOT)', 'Sei inverter (NOT)'),
    labels: ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'] },
  '08': { fn: 'and', title: L('Quad 2-input AND', 'Quadruplo AND a 2 ingressi'),
    labels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'] },
  '32': { fn: 'or', title: L('Quad 2-input OR', 'Quadruplo OR a 2 ingressi'),
    labels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'] },
  '86': { fn: 'xor', title: L('Quad 2-input XOR', 'Quadruplo XOR a 2 ingressi'),
    labels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'] },
};

export function logicGates(code) {
  const { labels, fn } = LOGIC[code];
  const gates = [];
  const has = (s) => labels.includes(s);
  for (let g = 1; g <= 6; g++) {
    if (!has(`${g}Y`)) continue;
    const ins = [`${g}A`];
    if (has(`${g}B`)) ins.push(`${g}B`);
    gates.push({ ins, out: `${g}Y`, fn });
  }
  return gates;
}

// ---------- microcontroller boards ----------
const unoTop = ['AREF', 'GND1', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'];
const unoTop2 = ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'];
const unoBot = ['RESET', '3V3', '5V', 'GND2', 'GND3', 'VIN'];
const unoBot2 = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const unoPins = () => [
  ...row(unoTop, 0, 4), ...row(unoTop2, 0, 13),
  ...row(unoBot, 17, 5), ...row(unoBot2, 17, 13),
];
const nanoA = ['D1', 'D0', 'RESET', 'GND1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'];
const nanoB = ['D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RESET2', 'GND2', 'VIN'];
const espA = ['EN', 'G36', 'G39', 'G34', 'G35', 'G32', 'G33', 'G25', 'G26', 'G27', 'G14', 'G12', 'G13', 'GND1', 'VIN'];
const espB = ['G23', 'G22', 'G1', 'G3', 'G21', 'G19', 'G18', 'G5', 'G17', 'G16', 'G4', 'G2', 'G15', 'GND2', '3V3'];

function ioFrom(names, ana = []) {
  return names
    .map((n) => {
      const m = /^[DG](\d+)$/.exec(n);
      if (m) return { name: n, num: +m[1] };
      const a = /^A(\d)$/.exec(n);
      if (a) return { name: n, num: 14 + +a[1], analog: true };
      return null;
    })
    .filter(Boolean)
    .map((io) => (ana.includes(io.name) ? { ...io, analog: true } : io));
}

// ---------- param field shortcuts ----------
const F = {
  R: (k = 'R') => ({ k, t: 'eng', units: 'R', min: 0.001, max: 1e9 }),
  C: (k = 'C') => ({ k, t: 'eng', units: 'C', min: 1e-13, max: 1 }),
  L: (k = 'L') => ({ k, t: 'eng', units: 'L', min: 1e-7, max: 100 }),
  num: (k, unit, min, max, step) => ({ k, t: 'num', unit, min, max, step }),
  sel: (k, options) => ({ k, t: 'select', options }),
  bool: (k) => ({ k, t: 'bool' }),
  span: (min, max) => ({ k: 'span', t: 'int', min, max }),
  // derived field: electrical power limit of a source, P = V * Imax (editing it rewrites Imax)
  power: (imaxMax) => ({ k: 'Pset', t: 'power', unit: 'W', min: 0.001, max: 1e4, imaxMax }),
};

export const PART_TYPES = {};
function def(type, cat, en, it, o) {
  PART_TYPES[type] = { type, cat, name: L(en, it), tags: '', fields: [], params: {}, ...o };
}

// =============================================================== POWER
const battery = (type, en, it, V, Imax, Rint, tags) =>
  def(type, 'power', en, it, {
    model: 'battery', m3d: 'battery', bench: true, live3d: true, tags,
    pins: () => [{ n: '+', dx: 0, dy: 0 }, { n: '-', dx: 2, dy: 0 }],
    params: { V, Imax, Rint, kind: type },
    fields: [F.num('V', 'V', 0, 30, 0.01), F.num('Imax', 'A', 0.001, 50, 0.01), F.power(50), F.num('Rint', 'Ω', 0.005, 200, 0.01)],
  });
battery('bat_9v', 'Battery 9V', 'Batteria 9V', 9, 1, 2.0, 'battery pila 9v');
battery('bat_aa', 'Battery AA 1.5V', 'Batteria AA 1.5V', 1.5, 2, 0.15, 'battery pila stilo aa');
battery('bat_aaa', 'Battery AAA 1.5V', 'Batteria AAA 1.5V', 1.5, 1, 0.25, 'battery pila ministilo aaa');
battery('bat_cr2032', 'Coin cell CR2032 3V', 'Bottoncino CR2032 3V', 3, 0.1, 15, 'coin cell button bottone cr2032');
battery('bat_lipo', 'LiPo battery 3.7V', 'Batteria LiPo 3.7V', 3.7, 5, 0.08, 'lipo lithium litio');

def('psu_bench', 'power', 'Bench power supply 0-30V', 'Alimentatore da banco 0-30V', {
  model: 'psu', m3d: 'psu', bench: true, live3d: true, tags: 'power supply alimentatore regolabile dc',
  pins: () => [{ n: '+', dx: 0, dy: 0 }, { n: '-', dx: 2, dy: 0 }],
  params: { V: 5, Imax: 1, Rint: 0.02, on: true },
  fields: [F.num('V', 'V', 0, 30, 0.01), F.num('Imax', 'A', 0.001, 5, 0.001), F.power(5), F.bool('on')],
});
def('psu_dual', 'power', 'Dual-rail bench supply ±V', 'Alimentatore duale ±V', {
  model: 'psu_dual', m3d: 'psu_dual', bench: true, live3d: true, tags: 'dual rail power supply alimentatore simmetrico',
  pins: () => [{ n: '+', dx: 0, dy: 0 }, { n: 'COM', dx: 2, dy: 0 }, { n: '-', dx: 4, dy: 0 }],
  params: { V: 12, Imax: 1, Rint: 0.02, on: true },
  fields: [F.num('V', 'V', 0, 30, 0.01), F.num('Imax', 'A', 0.001, 5, 0.001), F.power(5), F.bool('on')],
});
def('ac_ct', 'power', 'AC dual-rail (center tap)', 'Alimentatore AC dual-rail (presa centrale)', {
  model: 'ac_ct', m3d: 'ac_ct', bench: true, tags: 'ac transformer trasformatore alternata',
  pins: () => [{ n: 'A', dx: 0, dy: 0 }, { n: 'CT', dx: 2, dy: 0 }, { n: 'B', dx: 4, dy: 0 }],
  params: { Vrms: 12, f: 50, Imax: 1, Rint: 0.5, on: true },
  fields: [F.num('Vrms', 'V rms', 0, 48, 0.1), F.num('f', 'Hz', 0.1, 20000, 0.1), F.num('Imax', 'A', 0.01, 5, 0.01), F.bool('on')],
});
def('func_gen', 'power', 'Function generator (AC)', 'Generatore di funzioni (AC)', {
  model: 'func_gen', m3d: 'funcgen', bench: true, tags: 'signal generator sine square triangle onda',
  pins: () => [{ n: 'OUT', dx: 0, dy: 0 }, { n: 'GND', dx: 2, dy: 0 }],
  params: { wave: 'sine', amp: 5, f: 1000, offset: 0, Rout: 50, on: true },
  fields: [F.sel('wave', ['sine', 'square', 'triangle', 'saw']), F.num('amp', 'V pk', 0, 30, 0.1), F.num('f', 'Hz', 0.01, 100000, 0.01), F.num('offset', 'V', -30, 30, 0.1), F.bool('on')],
});

// =============================================================== PASSIVE
def('resistor', 'passive', 'Resistor', 'Resistore', {
  model: 'resistor', m3d: 'resistor', tags: 'resistenza ohm',
  pins: axial, params: { R: 1000, tol: 5, P: 0.25, span: 4 },
  fields: [F.R(), F.sel('tol', [1, 2, 5, 10]), F.num('P', 'W', 0.01, 100, 0.01), F.span(2, 12)],
});
def('cap_elec', 'passive', 'Capacitor electrolytic', 'Condensatore elettrolitico', {
  model: 'cap', m3d: 'cap_elec', tags: 'condensatore capacitor polarized polarizzato',
  pins: (p) => polar2(p, '+', '-'), params: { C: 100e-6, Vmax: 16, pol: true, span: 1 },
  fields: [F.C(), F.num('Vmax', 'V', 1, 1000, 1)],
});
def('cap_ceramic', 'passive', 'Capacitor ceramic', 'Condensatore ceramico', {
  model: 'cap', m3d: 'cap_disc', tags: 'condensatore capacitor disc',
  pins: (p) => polar2(p, 'A', 'B'), params: { C: 100e-9, Vmax: 50, pol: false, span: 2 },
  fields: [F.C(), F.num('Vmax', 'V', 1, 1000, 1), F.span(1, 8)],
});
def('cap_poly', 'passive', 'Capacitor polyester', 'Condensatore in poliestere', {
  model: 'cap', m3d: 'cap_poly', tags: 'condensatore capacitor film mkt',
  pins: (p) => polar2(p, 'A', 'B'), params: { C: 100e-9, Vmax: 100, pol: false, span: 3 },
  fields: [F.C(), F.num('Vmax', 'V', 1, 1000, 1), F.span(2, 8)],
});
def('inductor', 'passive', 'Inductor', 'Induttore', {
  model: 'inductor', m3d: 'inductor', tags: 'induttanza coil bobina henry',
  pins: axial, params: { L: 10e-3, Rdc: 2, Imax: 0.5, span: 4 },
  fields: [F.L(), F.num('Rdc', 'Ω', 0, 1000, 0.1), F.num('Imax', 'A', 0.01, 20, 0.01), F.span(2, 10)],
});
const potPins = () => [{ n: 'A', dx: 0, dy: 0 }, { n: 'W', dx: 1, dy: 0 }, { n: 'B', dx: 2, dy: 0 }];
def('pot_lin', 'passive', 'Potentiometer (linear)', 'Potenziometro (lineare)', {
  model: 'pot', m3d: 'pot', tags: 'potentiometer potenziometro knob manopola',
  pins: potPins, params: { R: 10e3, pos: 0.5, taper: 'lin' },
  fields: [F.R(), { k: 'pos', t: 'knob' }],
});
def('pot_log', 'passive', 'Potentiometer (logarithmic)', 'Potenziometro (logaritmico)', {
  model: 'pot', m3d: 'pot', tags: 'potentiometer potenziometro audio',
  pins: potPins, params: { R: 10e3, pos: 0.5, taper: 'log' },
  fields: [F.R(), { k: 'pos', t: 'knob' }],
});
def('trimmer', 'passive', 'Trimmer', 'Trimmer', {
  model: 'pot', m3d: 'trimmer', tags: 'trimpot trimmer multiturn',
  pins: potPins, params: { R: 10e3, pos: 0.5, taper: 'lin' },
  fields: [F.R(), { k: 'pos', t: 'knob' }],
});
def('ldr', 'passive', 'Photoresistor (LDR)', 'Fotoresistenza (LDR)', {
  model: 'ldr', m3d: 'ldr', tags: 'ldr light sensor luce fotoresistore',
  pins: (p) => polar2(p, 'A', 'B'), params: { R10: 10e3, gamma: 0.7, lux: 100, span: 2 },
  fields: [F.R('R10'), F.num('lux', 'lux', 0.1, 100000, 1), F.num('gamma', 'γ', 0.3, 1.2, 0.01)],
});
def('ntc', 'passive', 'Thermistor NTC', 'Termistore NTC', {
  model: 'ntc', m3d: 'ntc', tags: 'thermistor temperatura temperature sensor',
  pins: (p) => polar2(p, 'A', 'B'), params: { R25: 10e3, B: 3950, temp: 25, span: 2 },
  fields: [F.R('R25'), F.num('B', 'K', 1000, 6000, 10), F.num('temp', '°C', -40, 200, 0.5)],
});
def('ptc', 'passive', 'Thermistor PTC', 'Termistore PTC', {
  model: 'ptc', m3d: 'ntc', tags: 'thermistor ptc temperatura temperature sensor',
  pins: (p) => polar2(p, 'A', 'B'), params: { R25: 100, Tsw: 100, temp: 25, span: 2 },
  fields: [F.R('R25'), F.num('Tsw', '°C', 40, 180, 1), F.num('temp', '°C', -40, 200, 0.5)],
});

// =============================================================== SEMICONDUCTORS
def('led', 'semi', 'LED', 'LED', {
  model: 'led', m3d: 'led', tags: 'light emitting diode luce',
  pins: (p) => polar2(p, 'A', 'K'), params: { colorId: 'red', color: '#ff2b2b', vf: 1.9, Imax: 0.03, span: 1 },
  fields: [{ k: 'color', t: 'ledcolor' }, F.num('vf', 'V', 0.5, 5, 0.01), F.num('Imax', 'A', 0.001, 1, 0.001)],
});
def('led_rgb', 'semi', 'RGB LED (4 pin)', 'LED RGB (4 pin)', {
  model: 'led_rgb', m3d: 'led_rgb', tags: 'rgb led tricolor',
  pins: () => [{ n: 'R', dx: 0, dy: 0 }, { n: 'K', dx: 1, dy: 0 }, { n: 'G', dx: 2, dy: 0 }, { n: 'B', dx: 3, dy: 0 }],
  params: { common: 'cathode', vfR: 2.0, vfG: 3.0, vfB: 3.0, Imax: 0.03 },
  fields: [F.sel('common', ['cathode', 'anode']), F.num('vfR', 'V', 0.5, 5, 0.01), F.num('vfG', 'V', 0.5, 5, 0.01), F.num('vfB', 'V', 0.5, 5, 0.01), F.num('Imax', 'A', 0.001, 1, 0.001)],
});
const diode = (type, en, it, vf, iref, n, imax, tags) =>
  def(type, 'semi', en, it, {
    model: 'diode', m3d: 'diode', tags,
    pins: axial, params: { vf, iref, n, Imax: imax, span: 4, band: type === 'diode_1n5819' ? '#c9c9c9' : '#d8d8d8' },
    fields: [F.num('Imax', 'A', 0.01, 100, 0.01), F.span(2, 10)],
  });
diode('diode_1n4007', 'Rectifier diode 1N4007', 'Diodo raddrizzatore 1N4007', 0.9, 1, 1.9, 1, 'rectifier diode raddrizzatore');
diode('diode_1n4148', 'Signal diode 1N4148', 'Diodo di segnale 1N4148', 0.72, 0.01, 1.9, 0.2, 'signal diode segnale');
diode('diode_1n5819', 'Schottky diode 1N5819', 'Diodo Schottky 1N5819', 0.45, 1, 1.1, 1, 'schottky diode');
def('zener', 'semi', 'Zener diode', 'Diodo Zener', {
  model: 'zener', m3d: 'zener', tags: 'zener diode regolatore',
  pins: axial, params: { Vz: 5.1, Pmax: 0.5, vf: 0.9, iref: 1, n: 1.9, Imax: 1, span: 4 },
  fields: [F.num('Vz', 'V', 1.8, 100, 0.1), F.num('Pmax', 'W', 0.1, 10, 0.1)],
});
const to92 = (names) => () => names.map((n, i) => ({ n, dx: i, dy: 0 }));
const bjt = (type, en, it, pol, order, beta, pmax, imax, color) =>
  def(type, 'semi', en, it, {
    model: 'bjt', m3d: 'to92', tags: 'transistor bjt',
    pins: to92(order), params: { pol, beta, Pmax: pmax, Imax: imax, label: type.split('_')[1].toUpperCase() },
    fields: [F.num('beta', 'hFE', 10, 1000, 1), F.num('Pmax', 'W', 0.05, 50, 0.05), F.num('Imax', 'A', 0.01, 50, 0.01)],
  });
bjt('npn_2n2222', 'NPN transistor 2N2222', 'Transistor NPN 2N2222', 1, ['E', 'B', 'C'], 150, 0.625, 0.8);
bjt('npn_bc547', 'NPN transistor BC547', 'Transistor NPN BC547', 1, ['C', 'B', 'E'], 250, 0.5, 0.1);
bjt('pnp_2n2907', 'PNP transistor 2N2907', 'Transistor PNP 2N2907', -1, ['E', 'B', 'C'], 100, 0.625, 0.6);
bjt('pnp_bc557', 'PNP transistor BC557', 'Transistor PNP BC557', -1, ['C', 'B', 'E'], 200, 0.5, 0.1);
const mos = (type, en, it, pol, order, vth, kp, pmax, vds, m3d) =>
  def(type, 'semi', en, it, {
    model: 'mosfet', m3d, tags: 'mosfet transistor fet canale channel',
    pins: to92(order), params: { pol, Vth: vth, Kp: kp, Pmax: pmax, Vdsmax: vds, label: type.split('_')[1].toUpperCase() },
    fields: [F.num('Vth', 'V', 0.5, 6, 0.1), F.num('Kp', 'A/V²', 0.01, 50, 0.01), F.num('Pmax', 'W', 0.1, 300, 0.1)],
  });
mos('nmos_2n7000', 'N-channel MOSFET 2N7000', 'MOSFET canale N 2N7000', 1, ['S', 'G', 'D'], 2.1, 0.25, 0.4, 60, 'to92');
mos('nmos_irf540', 'N-channel MOSFET IRF540', 'MOSFET canale N IRF540', 1, ['G', 'D', 'S'], 3.0, 12, 40, 100, 'to220');
mos('pmos_irf9540', 'P-channel MOSFET IRF9540', 'MOSFET canale P IRF9540', -1, ['G', 'D', 'S'], 3.0, 8, 40, 100, 'to220');

// =============================================================== INPUT & SWITCH
def('pushbutton', 'input', 'Pushbutton (6mm)', 'Pulsante (6mm)', {
  model: 'pushbutton', m3d: 'pushbutton', straddle: true, tags: 'button pulsante tactile',
  pins: () => [{ n: '1a', dx: 0, dy: 0 }, { n: '1b', dx: 2, dy: 0 }, { n: '2a', dx: 0, dy: 3 }, { n: '2b', dx: 2, dy: 3 }],
  params: { mode: 'momentary' },
  fields: [F.sel('mode', ['momentary', 'latching']), { k: 'press', t: 'press' }],
});
def('sw_spst', 'input', 'Toggle switch SPST', 'Interruttore SPST', {
  model: 'sw_spst', m3d: 'slide_sw', tags: 'switch interruttore on off',
  pins: () => [{ n: 'A', dx: 0, dy: 0 }, { n: 'B', dx: 2, dy: 0 }], params: { on: false },
  fields: [F.bool('on')],
});
def('sw_spdt', 'input', 'Slide switch SPDT', 'Interruttore SPDT', {
  model: 'sw_spdt', m3d: 'slide_sw', tags: 'switch deviatore slide',
  pins: () => [{ n: 'A', dx: 0, dy: 0 }, { n: 'COM', dx: 1, dy: 0 }, { n: 'B', dx: 2, dy: 0 }], params: { pos: 0 },
  fields: [F.sel('pos', [0, 1])],
});
def('sw_dpdt', 'input', 'Slide switch DPDT', 'Interruttore DPDT', {
  model: 'sw_dpdt', m3d: 'slide_sw2', straddle: true, tags: 'switch deviatore doppio slide',
  pins: () => [
    { n: '1A', dx: 0, dy: 0 }, { n: '1C', dx: 1, dy: 0 }, { n: '1B', dx: 2, dy: 0 },
    { n: '2A', dx: 0, dy: 3 }, { n: '2C', dx: 1, dy: 3 }, { n: '2B', dx: 2, dy: 3 },
  ],
  params: { pos: 0 }, fields: [F.sel('pos', [0, 1])],
});
def('dip_switch', 'input', 'DIP switch (8)', 'DIP-switch (8)', {
  model: 'dipsw', m3d: 'dip_sw', straddle: true, tags: 'dip switch dipswitch',
  pins: () => dip(Array.from({ length: 16 }, (_, i) => String(i + 1))),
  params: { sw: [0, 0, 0, 0, 0, 0, 0, 0] }, fields: [{ k: 'sw', t: 'sw8' }],
});
def('keypad', 'input', 'Matrix keypad 4x4', 'Tastierino a matrice 4x4', {
  model: 'keypad', m3d: 'keypad', tags: 'keypad tastierino matrix tastiera',
  pins: () => row(['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4']), params: {},
  fields: [{ k: 'keys', t: 'keypad' }],
});

// =============================================================== INTEGRATED CIRCUITS
const dip8 = (names) => () => dip(names);
def('ne555', 'ic', 'NE555 timer', 'Timer NE555', {
  model: 'ne555', m3d: 'dip', straddle: true, tags: '555 timer temporizzatore astable monostable',
  pins: dip8(['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC']),
  params: { cmos: false, label: 'NE555' }, fields: [],
});
def('tlc555', 'ic', 'TLC555 timer (CMOS)', 'Timer TLC555 (CMOS)', {
  model: 'ne555', m3d: 'dip', straddle: true, tags: '555 timer cmos ltc7555',
  pins: dip8(['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC']),
  params: { cmos: true, label: 'TLC555' }, fields: [],
});
for (const code of Object.keys(LOGIC)) {
  const lg = LOGIC[code];
  def(`ic_74${code}`, 'ic', `74LS${code} – ${lg.title.en}`, `74LS${code} – ${lg.title.it}`, {
    model: 'logic', m3d: 'dip', straddle: true, tags: `74xx ttl logic logica gate porta ${lg.fn} 74${code}`,
    pins: () => dip(lg.labels), params: { code, cmos: false, label: `74LS${code}` }, fields: [],
  });
  def(`ic_74hc${code}`, 'ic', `74HC${code} – ${lg.title.en}`, `74HC${code} – ${lg.title.it}`, {
    model: 'logic', m3d: 'dip', straddle: true, tags: `74hc cmos logic logica gate porta ${lg.fn} 74${code}`,
    pins: () => dip(lg.labels), params: { code, cmos: true, label: `74HC${code}` }, fields: [],
  });
}
def('lm358', 'ic', 'LM358 dual op-amp', 'Amplificatore operazionale LM358', {
  model: 'opamp', m3d: 'dip', straddle: true, tags: 'opamp op-amp operational operazionale amplifier',
  pins: dip8(['OUT1', 'IN1-', 'IN1+', 'V-', 'IN2+', 'IN2-', 'OUT2', 'V+']),
  params: { kind: 'lm358', label: 'LM358' }, fields: [],
});
def('ua741', 'ic', 'µA741 op-amp', 'Amplificatore operazionale µA741', {
  model: 'opamp', m3d: 'dip', straddle: true, tags: 'opamp op-amp 741 operational operazionale amplifier',
  pins: dip8(['NC1', 'IN-', 'IN+', 'V-', 'NC2', 'OUT', 'V+', 'NC3']),
  params: { kind: 'ua741', label: 'uA741' }, fields: [],
});
const reg = (type, label, vset, extra = {}) =>
  def(type, 'ic', `${label} regulator`, `Regolatore ${label}`, {
    model: 'regulator', m3d: 'to220', tags: 'voltage regulator regolatore tensione',
    pins: () => [{ n: 'IN', dx: 0, dy: 0 }, { n: 'GND', dx: 1, dy: 0 }, { n: 'OUT', dx: 2, dy: 0 }],
    params: { vset, drop: 2.0, Imax: 1.5, Iq: 0.005, label, adj: false, ...extra }, fields: [],
  });
reg('lm7805', 'LM7805 (5V)', 5);
reg('lm7809', 'LM7809 (9V)', 9);
reg('lm7812', 'LM7812 (12V)', 12);
def('lm317', 'ic', 'LM317 adjustable regulator', 'Regolatore regolabile LM317', {
  model: 'regulator', m3d: 'to220', tags: 'voltage regulator regolatore tensione adjustable lm317',
  pins: () => [{ n: 'ADJ', dx: 0, dy: 0 }, { n: 'OUT', dx: 1, dy: 0 }, { n: 'IN', dx: 2, dy: 0 }],
  params: { vset: 1.25, drop: 2.0, Imax: 1.5, Iq: 0.00005, label: 'LM317', adj: true }, fields: [],
});
def('arduino_uno', 'ic', 'Arduino Uno', 'Arduino Uno', {
  model: 'mcu', m3d: 'arduino_uno', bench: true, tags: 'arduino uno microcontroller microcontrollore atmega',
  pins: unoPins,
  mcu: { vdd: 5, adcMax: 1023, io: ioFrom([...unoTop, ...unoTop2, ...unoBot2]), supply: [{ pin: '5V', v: 5, r: 1 }, { pin: '3V3', v: 3.3, r: 2 }], gnd: ['GND1', 'GND2', 'GND3'] },
  params: { sketch: 'blink', code: '' }, fields: [{ k: 'code', t: 'code' }],
});
def('arduino_nano', 'ic', 'Arduino Nano', 'Arduino Nano', {
  model: 'mcu', m3d: 'nano', tags: 'arduino nano microcontroller microcontrollore atmega breadboard',
  pins: () => [...row(nanoA, 0), ...row(nanoB, 6)],
  mcu: { vdd: 5, adcMax: 1023, io: ioFrom([...nanoA, ...nanoB]), supply: [{ pin: '5V', v: 5, r: 1 }, { pin: '3V3', v: 3.3, r: 2 }], gnd: ['GND1', 'GND2'] },
  params: { sketch: 'blink', code: '' }, fields: [{ k: 'code', t: 'code' }],
});
def('esp32', 'ic', 'ESP32 DevKit', 'ESP32 DevKit', {
  model: 'mcu', m3d: 'esp32', tags: 'esp32 wifi microcontroller microcontrollore espressif breadboard',
  pins: () => [...row(espA, 0), ...row(espB, 9)],
  mcu: { vdd: 3.3, adcMax: 4095, io: ioFrom([...espA, ...espB]), supply: [{ pin: '3V3', v: 3.3, r: 1.5 }, { pin: 'VIN', v: 5, r: 1 }], gnd: ['GND1', 'GND2'] },
  params: { sketch: 'blink', code: '' }, fields: [{ k: 'code', t: 'code' }],
});

// =============================================================== TOOLS
def('jumper', 'tools', 'Jumper wire (male-male)', 'Cavo jumper (maschio-maschio)', {
  tool: 'wire', tags: 'wire cable cavo filo jumper',
  pins: () => [], params: {}, fields: [],
});
def('multimeter', 'tools', 'Digital multimeter', 'Multimetro digitale', {
  model: 'multimeter', m3d: 'multimeter', bench: true, probes: ['red', 'black'], tags: 'multimeter multimetro voltmeter amperometro ohmmeter tester',
  pins: () => [{ n: 'red', dx: 0, dy: 0 }, { n: 'black', dx: 2, dy: 0 }],
  params: { mode: 'V' }, fields: [F.sel('mode', ['V', 'Vac', 'A', 'Ohm'])],
});
def('scope', 'tools', '2-channel oscilloscope', 'Oscilloscopio a 2 canali', {
  model: 'scope', m3d: 'scope', bench: true, probes: ['ch1', 'ch2', 'gnd'], tags: 'oscilloscope oscilloscopio scope',
  pins: () => [{ n: 'ch1', dx: 0, dy: 0 }, { n: 'ch2', dx: 2, dy: 0 }, { n: 'gnd', dx: 4, dy: 0 }],
  params: { tdiv: 0.001, vdiv1: 1, vdiv2: 1, off1: 0, off2: 0, trig: 0, ch2on: true },
  fields: [],
});

export function partDef(type) {
  return PART_TYPES[type];
}

export function partPins(part) {
  return PART_TYPES[part.type].pins(part.params);
}

export function searchParts(query, lang = 'en') {
  const q = query.trim().toLowerCase();
  const list = Object.values(PART_TYPES);
  if (!q) return list;
  return list.filter((d) => {
    const hay = `${d.name.en} ${d.name.it} ${d.tags} ${d.type}`.toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
}
