// Tiny Arduino-like sketch runtime driven by simulated time.
import { SKETCH_PRESETS } from '../data/sketches.js';

export const INPUT = 0;
export const OUTPUT = 1;
export const INPUT_PULLUP = 2;

const FAMILY_PINS = {
  avr: { LED_PIN: 13, BTN_PIN: 2, ANALOG_PIN: 14, PWM_PIN: 9, PINS: [8, 9, 10, 11, 12] },
  esp: { LED_PIN: 2, BTN_PIN: 4, ANALOG_PIN: 34, PWM_PIN: 5, PINS: [16, 17, 18, 19, 21] },
};

export function effectiveCode(params) {
  if (params.sketch === 'custom') return params.code || SKETCH_PRESETS.custom;
  return SKETCH_PRESETS[params.sketch] || SKETCH_PRESETS.blink;
}

export class McuRuntime {
  constructor(spec, code) {
    this.spec = spec;
    this.family = spec.vdd > 4 ? 'avr' : 'esp';
    this.byNum = new Map(spec.io.map((io) => [io.num, io]));
    this.byName = new Map(spec.io.map((io) => [io.name, io]));
    this.pins = {};
    for (const io of spec.io) this.pins[io.name] = { mode: INPUT, out: 0, pwm: null, in: 0, vin: 0, pullup: false };
    this.log = [];
    this.code = code;
    this.compile(code);
  }

  resolve(p) {
    if (typeof p === 'string') return this.byName.get(p) || this.byName.get(p.toUpperCase());
    return this.byNum.get(p);
  }

  compile(code) {
    this.error = null;
    this.fns = {};
    this.task = null;
    this.phase = 'setup';
    this.cur = 0;
    const self = this;
    const fam = FAMILY_PINS[this.family];
    const pin = (p) => self.pins[self.resolve(p)?.name];
    const api = {
      HIGH: 1, LOW: 0, INPUT, OUTPUT, INPUT_PULLUP,
      A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, A7: 21,
      ADC_MAX: this.spec.adcMax,
      ...fam,
      LED_BUILTIN: fam.LED_PIN,
      pinMode(p, m) {
        const s = pin(p);
        if (!s) return;
        s.mode = m === OUTPUT ? OUTPUT : INPUT;
        s.pullup = m === INPUT_PULLUP;
        if (m !== OUTPUT) s.pwm = null;
      },
      digitalWrite(p, v) {
        const s = pin(p);
        if (!s) return;
        s.pwm = null;
        s.out = v ? 1 : 0;
        if (s.mode === INPUT) s.pullup = !!v; // AVR behaviour
      },
      analogWrite(p, v) {
        const s = pin(p);
        if (!s) return;
        s.mode = OUTPUT;
        const d = Math.max(0, Math.min(255, v)) / 255;
        s.pwm = d > 0 && d < 1 ? d : null;
        s.out = d >= 1 ? 1 : 0;
      },
      digitalRead(p) {
        return pin(p)?.in ?? 0;
      },
      analogRead(p) {
        let io = self.resolve(p);
        if (!io && typeof p === 'number') io = self.byNum.get(14 + p);
        const s = io && self.pins[io.name];
        if (!s) return 0;
        const raw = (s.vin / self.spec.vdd) * self.spec.adcMax;
        return Math.max(0, Math.min(self.spec.adcMax, Math.round(raw)));
      },
      delay: (ms) => ({ delay: Math.max(0, +ms || 0) }),
      delayMicroseconds: (us) => ({ delay: Math.max(0, +us || 0) / 1000 }),
      millis: () => Math.floor(self.cur),
      micros: () => Math.floor(self.cur * 1000),
      map: (x, a, b, c, d) => ((x - a) * (d - c)) / (b - a) + c,
      constrain: (x, a, b) => Math.max(a, Math.min(b, x)),
      random: (a, b) => (b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a))),
      abs: Math.abs, min: Math.min, max: Math.max, sqrt: Math.sqrt, pow: Math.pow,
      Serial: {
        begin() {},
        print(x) { self.logWrite(String(x), false); },
        println(x = '') { self.logWrite(String(x), true); },
      },
      console: { log: (...a) => self.logWrite(a.join(' '), true) },
      Math,
    };
    try {
      // eslint-disable-next-line no-new-func
      const factory = new Function(
        'api',
        `with (api) {\n${code}\n;return { setup: typeof setup === 'function' ? setup : null, loop: typeof loop === 'function' ? loop : null };\n}`
      );
      this.fns = factory(api);
    } catch (e) {
      this.error = String(e && e.message ? e.message : e);
    }
  }

  logWrite(text, nl) {
    if (!this._line) this._line = '';
    this._line += text;
    if (nl) {
      this.log.push(this._line);
      this._line = '';
      if (this.log.length > 60) this.log.shift();
    }
  }

  // Run the sketch up to simulated time `nowMs`. read(name) -> volts relative to GND.
  advance(nowMs, read) {
    const vdd = this.spec.vdd;
    for (const io of this.spec.io) {
      const s = this.pins[io.name];
      const v = read(io.name);
      s.vin = v;
      if (v > vdd * 0.6) s.in = 1;
      else if (v < vdd * 0.3) s.in = 0;
    }
    if (this.error) return;
    let guard = 0;
    while (this.cur <= nowMs && guard++ < 400) {
      try {
        this.stepTask();
      } catch (e) {
        this.error = String(e && e.message ? e.message : e);
        return;
      }
    }
    if (this.cur < nowMs - 5) this.cur = nowMs; // never fall far behind
  }

  stepTask() {
    if (!this.task) {
      const fn = this.phase === 'setup' ? this.fns.setup : this.fns.loop;
      if (!fn) {
        if (this.phase === 'setup') { this.phase = 'loop'; return; }
        this.cur += 1;
        return;
      }
      const r = fn();
      if (r && typeof r.next === 'function') this.task = r;
      else {
        if (this.phase === 'setup') this.phase = 'loop';
        else this.cur += 1;
        return;
      }
    }
    const n = this.task.next();
    if (n.done) {
      this.task = null;
      if (this.phase === 'setup') this.phase = 'loop';
      else this.cur += 0.001;
    } else {
      const d = n.value && typeof n.value === 'object' ? n.value.delay : Number(n.value);
      this.cur += Number.isFinite(d) ? d : 0;
      if (!(d > 0)) this.cur += 0.001;
    }
  }
}
