// Ready-made example circuits (ids are re-mapped when loaded).
import { PART_TYPES } from './catalog.js';

function builder() {
  let n = 0;
  const parts = [], wires = [];
  const part = (type, x, y, over = {}, rot = 0) => {
    const p = { id: `e${++n}`, type, x, y, rot, params: { ...JSON.parse(JSON.stringify(PART_TYPES[type].params)), ...over } };
    if (PART_TYPES[type].probes) p.probes = {};
    parts.push(p);
    return p;
  };
  const wire = (a, b, color = '#e53935') => { wires.push({ id: `w${++n}`, a, b, color }); };
  const H = (h) => ({ h });
  const P = (p, pin) => ({ p: p.id, n: pin });
  return { parts, wires, part, wire, H, P };
}

export const EXAMPLES = {
  led() {
    const b = builder();
    const bat = b.part('bat_9v', 6, 25);
    const r = b.part('resistor', 10, 10, { R: 470 });
    const led = b.part('led', 14, 12);
    b.wire(b.P(bat, '+'), b.H('10a'), '#e53935');
    b.wire(b.P(bat, '-'), b.H('15a'), '#212121');
    void r; void led;
    return b;
  },
  dimmer() {
    const b = builder();
    const bat = b.part('bat_9v', 6, 25);
    const pot = b.part('pot_lin', 8, 10, { R: 10000, pos: 0.4 });
    const r = b.part('resistor', 14, 10, { R: 220 });
    const led = b.part('led', 18, 12, { colorId: 'green', color: '#2bff4a', vf: 2.2 });
    b.wire(b.P(bat, '+'), b.H('8a'));
    b.wire(b.H('9a'), b.H('14a'), '#fbc02d');
    b.wire(b.P(bat, '-'), b.H('19b'), '#212121');
    void pot; void r; void led;
    return b;
  },
  blink555() {
    const b = builder();
    const psu = b.part('psu_bench', 8, 26, { V: 9 });
    b.part('ne555', 10, 7);
    b.part('resistor', 10, 5, { R: 1000, span: 1 });
    b.part('resistor', 11, 4, { R: 68000, span: 1 });
    b.part('cap_elec', 11, 12, { C: 10e-6 }, 2);
    b.part('resistor', 12, 13, { R: 330 });
    b.part('led', 16, 11);
    b.wire(b.P(psu, '+'), b.H('10i'), '#e53935');
    b.wire(b.P(psu, '-'), b.H('10b'), '#212121');
    b.wire(b.H('12j'), b.H('11a'), '#fbc02d');
    b.wire(b.H('13a'), b.H('10j'), '#43a047');
    b.wire(b.H('17a'), b.H('10a'), '#212121');
    return b;
  },
  nano() {
    const b = builder();
    b.part('arduino_nano', 5, 5, { sketch: 'blink' });
    b.part('resistor', 25, 13, { R: 330 });
    b.part('led', 29, 11, { colorId: 'blue', color: '#2f6bff', vf: 3.0 });
    b.wire(b.H('5a'), b.H('25a'), '#fbc02d');
    b.wire(b.H('30a'), b.H('18a'), '#212121');
    return b;
  },
};
