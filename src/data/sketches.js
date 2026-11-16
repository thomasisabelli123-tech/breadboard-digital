// Built-in sketches for the Arduino / ESP32 boards.
// Sketch API (Arduino-like, generator based):
//   function setup() { ... }                 runs once
//   function* loop() { ...; yield delay(500); }   repeats forever ("yield delay(ms)" waits in simulated time)
// Constants available: HIGH LOW INPUT OUTPUT INPUT_PULLUP A0..A7, LED_PIN BTN_PIN ANALOG_PIN PWM_PIN PINS
// Functions: pinMode digitalWrite digitalRead analogWrite analogRead millis micros delay map constrain random Serial.println

export const SKETCH_PRESETS = {
  blink: `// Blink: LED_PIN toggles every 500 ms
function setup() {
  pinMode(LED_PIN, OUTPUT);
}
function* loop() {
  digitalWrite(LED_PIN, HIGH);
  yield delay(500);
  digitalWrite(LED_PIN, LOW);
  yield delay(500);
}`,
  fade: `// Fade: PWM_PIN breathes smoothly (analogWrite)
function setup() {
  pinMode(PWM_PIN, OUTPUT);
}
function* loop() {
  for (let v = 0; v <= 255; v += 5) { analogWrite(PWM_PIN, v); yield delay(15); }
  for (let v = 255; v >= 0; v -= 5) { analogWrite(PWM_PIN, v); yield delay(15); }
}`,
  button: `// Button: BTN_PIN (to GND, internal pull-up) lights LED_PIN
function setup() {
  pinMode(BTN_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}
function* loop() {
  digitalWrite(LED_PIN, digitalRead(BTN_PIN) == LOW ? HIGH : LOW);
  yield delay(5);
}`,
  analog: `// Analog: ANALOG_PIN (pot / LDR divider) sets the brightness on PWM_PIN
function setup() {
  pinMode(PWM_PIN, OUTPUT);
}
function* loop() {
  const raw = analogRead(ANALOG_PIN);
  analogWrite(PWM_PIN, map(raw, 0, ADC_MAX, 0, 255));
  Serial.println(raw);
  yield delay(50);
}`,
  chase: `// Chase: PINS light up one after another
function setup() {
  for (const p of PINS) pinMode(p, OUTPUT);
}
function* loop() {
  for (const p of PINS) {
    digitalWrite(p, HIGH);
    yield delay(120);
    digitalWrite(p, LOW);
  }
}`,
  custom: `// Your own sketch
function setup() {
  pinMode(LED_PIN, OUTPUT);
}
function* loop() {
  digitalWrite(LED_PIN, HIGH);
  yield delay(1000);
  digitalWrite(LED_PIN, LOW);
  yield delay(1000);
}`,
};

export const SKETCH_NAMES = Object.keys(SKETCH_PRESETS);
