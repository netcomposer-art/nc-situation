import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CENTRE_GIVE_UP_S,
  CENTRE_HOLD_S,
  DEFAULT_CENTRE,
  DEFAULT_MOTION_SETTINGS,
  GravityFilter,
  type MotionReading,
  MotionShaper,
  SHAKE_DECAY_SEC,
  SHAKE_EVENT_MS2,
  SHAKE_REFRACTORY_S,
  SMOOTH_MAX_SEC,
  STILL_DEG,
  ShakeDetector,
  StillCentre,
  TILT_RANGE_DEG,
  glide,
  sanitizeMotionSettings,
  screenAngleOf,
  smoothSec,
  tiltOf,
  turn,
} from "../src/index.js";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const reading = (t: number, p: Partial<MotionReading> = {}): MotionReading => ({
  t,
  beta: DEFAULT_CENTRE.pitch,
  gamma: 0,
  heading: null,
  accel: { x: 0, y: 0, z: 0 },
  accelG: null,
  ...p,
});

test("tilt: 0 at the centre, ±1 at ±TILT_RANGE_DEG and clamped past it; Tilt Y is + forward", () => {
  const c = { pitch: 40, roll: 0 };
  assert.deepEqual(tiltOf({ pitch: 40, roll: 0 }, c), { x: 0, y: 0 });
  near(tiltOf({ pitch: 40, roll: TILT_RANGE_DEG / 2 }, c).x, 0.5);
  assert.equal(tiltOf({ pitch: 40, roll: 90 }, c).x, 1);
  assert.equal(tiltOf({ pitch: 40, roll: -90 }, c).x, -1);
  // Forward: the top tipped away from you, toward flat (pitch falls).
  near(tiltOf({ pitch: 40 - TILT_RANGE_DEG / 2, roll: 0 }, c).y, 0.5);
  assert.equal(tiltOf({ pitch: 120, roll: 0 }, c).y, -1);
});

test("screen frame: a phone turned sideways still tilts left and right", () => {
  assert.deepEqual(screenAngleOf(30, 10, 0), { pitch: 30, roll: 10 });
  assert.deepEqual(screenAngleOf(30, 10, 90), { pitch: -10, roll: 30 });
  assert.deepEqual(screenAngleOf(30, 10, 180), { pitch: -30, roll: -10 });
  assert.deepEqual(screenAngleOf(30, 10, 270), { pitch: 10, roll: -30 });
  assert.deepEqual(screenAngleOf(30, 10, -90), screenAngleOf(30, 10, 270));
});

test("smoothing: Smooth 0 follows at once; Smooth 100 % glides with a SMOOTH_MAX_SEC time constant", () => {
  assert.equal(smoothSec(0), 0);
  assert.equal(smoothSec(1), SMOOTH_MAX_SEC);
  assert.equal(smoothSec(7), SMOOTH_MAX_SEC, "clamped");
  assert.equal(glide(0, 1, 0.1, 0), 1);
  near(glide(0, 1, SMOOTH_MAX_SEC, SMOOTH_MAX_SEC), 1 - Math.exp(-1));

  const instant = new MotionShaper({ ...DEFAULT_MOTION_SETTINGS, smooth: 0 });
  const smooth = new MotionShaper({ ...DEFAULT_MOTION_SETTINGS, smooth: 1 });
  for (const m of [instant, smooth]) m.step(reading(0));
  const tipped = DEFAULT_CENTRE.pitch;
  const right = (t: number) => reading(t, { beta: tipped, gamma: TILT_RANGE_DEG });
  assert.equal(instant.step(right(0.1)).values.tiltX, 1);
  near(smooth.step(right(0.1)).values.tiltX, 1 - Math.exp(-0.1 / SMOOTH_MAX_SEC));
  // Glides on toward it, never past it.
  let x = 0;
  for (let t = 0.2; t < 5; t += 0.05) x = smooth.step(right(t)).values.tiltX;
  assert.ok(x > 0.99 && x <= 1);
  // The same readings give the same values (a replay depends on it).
  const again = new MotionShaper({ ...DEFAULT_MOTION_SETTINGS, smooth: 1 });
  again.step(reading(0));
  near(again.step(right(0.1)).values.tiltX, 1 - Math.exp(-0.1 / SMOOTH_MAX_SEC));
});

test("invert flips Tilt X and Tilt Y on their own", () => {
  const r = reading(0, { beta: DEFAULT_CENTRE.pitch - 9, gamma: 9 });
  const plain = new MotionShaper({ ...DEFAULT_MOTION_SETTINGS, smooth: 0 }).step(r).values;
  near(plain.tiltX, 0.2);
  near(plain.tiltY, 0.2);
  const x = new MotionShaper({ ...DEFAULT_MOTION_SETTINGS, smooth: 0, invertX: true }).step(r).values;
  near(x.tiltX, -0.2);
  near(x.tiltY, 0.2);
  const y = new MotionShaper({ ...DEFAULT_MOTION_SETTINGS, smooth: 0, invertY: true }).step(r).values;
  near(y.tiltX, 0.2);
  near(y.tiltY, -0.2);
});

test("centring: the new centre reads 0 there", () => {
  const m = new MotionShaper({ ...DEFAULT_MOTION_SETTINGS, smooth: 0 });
  const held = reading(0, { beta: 62, gamma: -7 });
  assert.notEqual(m.step(held).values.tiltX, 0);
  m.set({ ...m.settings, centre: { pitch: 62, roll: -7 } });
  const v = m.step({ ...held, t: 0.1 }).values;
  near(v.tiltX, 0);
  near(v.tiltY, 0);
});

test("hold still to centre: the mean angle after CENTRE_HOLD_S still; movement starts the count again", () => {
  const c = new StillCentre();
  assert.equal(c.remaining(0), CENTRE_HOLD_S);
  for (let t = 0; t < 1; t += 0.05) c.step({ pitch: 50 + (t * 10) % 1, roll: 4 }, t);
  near(c.remaining(1), CENTRE_HOLD_S - 1, 1e-6);
  // A move past STILL_DEG: the count starts again from here.
  c.step({ pitch: 50 + STILL_DEG + 2, roll: 6 }, 1);
  assert.equal(c.remaining(1), CENTRE_HOLD_S);
  for (let t = 1; t <= 1 + CENTRE_HOLD_S + 0.01; t += 0.05) c.step({ pitch: 55, roll: 6 }, t);
  assert.deepEqual(c.centre, { pitch: 55, roll: 6 });
  assert.equal(c.remaining(9), 0);
  // Never still: it gives up.
  const shaky = new StillCentre();
  for (let t = 0; t <= CENTRE_GIVE_UP_S + 0.1; t += 0.1) shaky.step({ pitch: (t * 100) % 40, roll: 0 }, t);
  assert.equal(shaky.centre, null);
  assert.ok(shaky.gaveUp);
});

test("shake detection: a jolt is one event, the level falls away, a second jolt within the refractory is not", () => {
  const d = new ShakeDetector();
  assert.equal(d.step(0.5, 0), null);
  assert.equal(d.level, 0, "a small movement is not a shake");
  const s = d.step(SHAKE_EVENT_MS2 + 4, 1);
  assert.ok(s !== null && s > 0.5);
  const peak = d.level;
  assert.equal(d.step(SHAKE_EVENT_MS2 + 8, 1 + SHAKE_REFRACTORY_S / 2), null, "too soon");
  // Falls away with SHAKE_DECAY_SEC.
  const after = d.level;
  d.step(0, 1 + SHAKE_REFRACTORY_S / 2 + SHAKE_DECAY_SEC);
  near(d.level, after * Math.exp(-1), 1e-9);
  assert.ok(peak > 0);
  assert.ok(d.step(SHAKE_EVENT_MS2, 3) !== null, "after the refractory, the next jolt counts");
  // Without `acceleration`, gravity is filtered out of accelerationIncludingGravity: holding still is no shake.
  const g = new GravityFilter();
  for (let t = 0; t < 2; t += 0.02) assert.ok(g.step({ x: 0, y: 6, z: 7.6 }, t) < 1e-9);
  assert.ok(g.step({ x: 18, y: 6, z: 7.6 }, 2) > SHAKE_EVENT_MS2);
  const m = new MotionShaper();
  m.step(reading(0, { accel: null, accelG: { x: 0, y: 6, z: 7.6 } }));
  const jolt = m.step(reading(0.02, { accel: null, accelG: { x: 20, y: 6, z: 7.6 } }));
  assert.ok(jolt.shake !== null && jolt.values.shake > 0);
});

test("heading: slow, the short way round, 0..1; a phone without a compass keeps it", () => {
  assert.equal(turn(350, 10), 20);
  assert.equal(turn(10, 350), -20);
  const m = new MotionShaper({ ...DEFAULT_MOTION_SETTINGS, smooth: 0 });
  m.step(reading(0, { heading: 350 }));
  near(m.values().heading, 350 / 360);
  // 350° → 10°: it goes through north, never back round through south.
  const v = m.step(reading(0.5, { heading: 10 })).values.heading * 360;
  assert.ok(v > 350 || v < 10, `went the long way: ${v}`);
  for (let t = 1; t < 15; t += 0.1) m.step(reading(t, { heading: 10 }));
  near(m.values().heading * 360, 10, 0.01);
  m.step(reading(16, { heading: null }));
  near(m.values().heading * 360, 10, 0.01);
});

test("settings: old or foreign values fall back field by field", () => {
  assert.deepEqual(sanitizeMotionSettings(null), DEFAULT_MOTION_SETTINGS);
  assert.deepEqual(sanitizeMotionSettings({ smooth: 5, centre: { pitch: "x", roll: 12 }, invertY: true }), {
    smooth: 1,
    centre: { pitch: DEFAULT_CENTRE.pitch, roll: 12 },
    invertX: false,
    invertY: true,
  });
});

test("off: reset puts tilt and Shake back to 0", () => {
  const m = new MotionShaper({ ...DEFAULT_MOTION_SETTINGS, smooth: 0 });
  m.step(reading(0, { gamma: 30, accel: { x: 30, y: 0, z: 0 } }));
  assert.ok(m.values().tiltX > 0 && m.values().shake > 0);
  m.reset();
  assert.deepEqual(m.values(), { tiltX: 0, tiltY: 0, heading: 0, shake: 0 });
});
