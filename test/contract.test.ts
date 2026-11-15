import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_ENERGY_FRAMES, MAX_MOTION_FRAMES, SITUATION_SIGNALS, SITUATION_VERSION, TABLE_SIZE, energyMessage, motionMessage,
  offMessage, parseSituationMessage, parseStation, parseWants, shakeMessage, situationSignal, stationId, tableMessage,
} from "../src/index.js";

const station = { net: "IU", sta: "ANMO", loc: "00", cha: "BHZ", name: "Albuquerque, New Mexico", rate: 20 };

test("energy: copied, clamped to 0–1, at most MAX_ENERGY_FRAMES", () => {
  const frames = Array.from({ length: 40 }, (_, i) => ({ at: i, value: i === 0 ? -1 : i === 1 ? 2 : 0.5 }));
  const m = parseSituationMessage({ v: 1, kind: "energy", source: "aria", frames });
  assert.ok(m && m.kind === "energy");
  assert.equal(m.frames.length, MAX_ENERGY_FRAMES);
  assert.equal(m.frames[0]!.value, 0);
  assert.equal(m.frames[1]!.value, 1);
  assert.notEqual(m.frames, frames);
  assert.equal(parseSituationMessage({ v: 1, kind: "energy", source: "aria", frames: [{ at: Number.NaN, value: 0 }] }), null);
});

test("table: TABLE_SIZE finite samples, copied into a fresh Float32Array; known speeds only", () => {
  const samples = new Float32Array(TABLE_SIZE).map((_, i) => Math.sin((i / TABLE_SIZE) * 2 * Math.PI));
  const msg = tableMessage("aria", { seq: 3, at: 1.5, speed: 1, station, behindSec: 24, samples, rms: 0.7 });
  const m = parseSituationMessage(msg);
  assert.ok(m && m.kind === "table");
  assert.notEqual(m.samples, samples);
  assert.deepEqual(Array.from(m.samples), Array.from(samples));
  assert.equal(m.station?.sta, "ANMO");
  assert.equal(parseSituationMessage({ ...msg, speed: 5 }), null);
  assert.equal(parseSituationMessage({ ...msg, samples: new Float32Array(512) }), null);
  const bad = Float32Array.from(samples);
  bad[7] = Number.NaN;
  assert.equal(parseSituationMessage({ ...msg, samples: bad }), null);
  assert.ok(parseSituationMessage({ ...msg, station: null, behindSec: null }), "a recording has no station lag");
  // Out-of-range samples are clamped, never passed on.
  const loud = Float32Array.from(samples);
  loud[0] = 4;
  const c = parseSituationMessage({ ...msg, samples: loud });
  assert.ok(c && c.kind === "table" && c.samples[0] === 1);
});

test("status and off", () => {
  const s = parseSituationMessage({
    v: 1, kind: "status", source: "aria", state: "offline", station, newestAgeSec: null, behindSec: 30, hold: false,
    credit: "Data: IU", retryAt: 123, recorded: true, extra: "dropped",
  });
  assert.deepEqual(s, {
    v: 1, kind: "status", source: "aria", state: "offline", station, newestAgeSec: null, behindSec: 30, hold: false,
    credit: "Data: IU", retryAt: 123, recorded: true,
  });
  assert.equal(parseSituationMessage({ ...s, state: "asleep" }), null);
  assert.deepEqual(parseSituationMessage(offMessage("aria", "hold")), { v: 1, kind: "off", source: "aria", reason: "hold" });
  assert.equal(parseSituationMessage({ v: 1, kind: "off", source: "aria", reason: "bored" }), null);
});

test("a newer major version, an unknown kind or a bad source is ignored", () => {
  const ok = energyMessage("aria", [{ at: 0, value: 0.5 }]);
  assert.ok(parseSituationMessage(ok));
  assert.equal(parseSituationMessage({ ...ok, v: SITUATION_VERSION + 1 }), null);
  assert.ok(parseSituationMessage({ ...ok, v: 1.2 }), "a minor version is read");
  assert.equal(parseSituationMessage({ ...ok, kind: "events" }), null);
  assert.equal(parseSituationMessage({ ...ok, source: "" }), null);
  assert.equal(parseSituationMessage({ ...ok, source: "x".repeat(200) }), null);
  assert.equal(parseSituationMessage(null), null);
  assert.equal(parseSituationMessage("energy"), null);
});

test("stations and wants", () => {
  assert.equal(stationId(station), "IU.ANMO.00.BHZ");
  assert.equal(parseStation({ ...station, net: "" }), null);
  assert.equal(parseStation({ ...station, sta: "A NMO" }), null);
  assert.deepEqual(parseWants({ energy: true, table: { speed: 10 } }), { energy: true, table: { speed: 10 } });
  assert.deepEqual(parseWants({ table: { speed: 3 }, energy: true }), { energy: true });
  assert.equal(parseWants({}), null);
});

test("motion (0.2.0): frames copied and clamped; heading wraps into 0..1; at most MAX_MOTION_FRAMES", () => {
  const frames = Array.from({ length: 40 }, (_, i) => ({ at: i, tiltX: i ? 0.25 : -3, tiltY: 2, heading: 1.25, shake: -1 }));
  const m = parseSituationMessage(motionMessage("aria", frames));
  assert.ok(m && m.kind === "motion");
  assert.equal(m.frames.length, MAX_MOTION_FRAMES);
  assert.deepEqual(m.frames[0], { at: 0, tiltX: -1, tiltY: 1, heading: 0.25, shake: 0 });
  assert.notEqual(m.frames[1], frames[1]);
  assert.equal(parseSituationMessage({ v: 1, kind: "motion", source: "aria", frames: [{ at: 0, tiltX: 0, tiltY: 0, heading: 0 }] }), null);
});

test("shake (0.2.0): a trigger with a strength 0–1", () => {
  assert.deepEqual(parseSituationMessage(shakeMessage("aria", 3.5, 4)), { v: 1, kind: "shake", source: "aria", at: 3.5, strength: 1 });
  assert.equal(parseSituationMessage({ v: 1, kind: "shake", source: "aria", at: Number.NaN, strength: 1 }), null);
});

test("status.motion (0.2.0) is optional: older statuses still parse; an unknown state is dropped", () => {
  const base = { v: 1, kind: "status", source: "aria", state: "live", station, newestAgeSec: 1, behindSec: 2, hold: false, credit: "" };
  const s = parseSituationMessage({ ...base, motion: "live" });
  assert.ok(s && s.kind === "status" && s.motion === "live");
  const old = parseSituationMessage(base);
  assert.ok(old && old.kind === "status" && !("motion" in old));
  const odd = parseSituationMessage({ ...base, motion: "dancing" });
  assert.ok(odd && odd.kind === "status" && !("motion" in odd));
});

test("wants: motion (0.2.0) alone is a want", () => {
  assert.deepEqual(parseWants({ motion: true }), { motion: true });
  assert.deepEqual(parseWants({ energy: true, motion: "yes" }), { energy: true });
});

test("signals: saved ids never change; ARIA Energy is shown as Ground Energy", () => {
  assert.deepEqual(SITUATION_SIGNALS.map((s) => s.id), [
    "aria:energy", "aria:phone-tilt-x", "aria:phone-tilt-y", "aria:phone-shake", "aria:phone-heading",
  ]);
  assert.equal(situationSignal("aria:energy")?.label, "Ground Energy");
  assert.equal(situationSignal("aria:phone-tilt-x")?.label, "Phone Tilt X");
  assert.equal(situationSignal("nope"), undefined);
});
