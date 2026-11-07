import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_ENERGY_FRAMES, SITUATION_VERSION, TABLE_SIZE, energyMessage, offMessage, parseSituationMessage, parseStation,
  parseWants, stationId, tableMessage,
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
