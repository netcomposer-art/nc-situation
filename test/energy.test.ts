import assert from "node:assert/strict";
import { test } from "node:test";
import { GroundEnergy, Smoother, energyLevel, median } from "../src/index.js";

test("energyLevel: the baseline reads 0.5, four times louder 1, four times quieter 0", () => {
  assert.equal(energyLevel(1, 1), 0.5);
  assert.equal(energyLevel(4, 1), 1);
  assert.equal(energyLevel(0.25, 1), 0);
  assert.equal(energyLevel(2, 1), 0.75);
  assert.equal(energyLevel(100, 1), 1);
  assert.equal(energyLevel(0, 1), 0);
  assert.equal(energyLevel(1, 0), 0.5);
});

test("median", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.ok(Number.isNaN(median([])));
});

/** Noise with a deterministic generator (an LCG), plus an offset the high-pass must remove. */
function noise(n: number, amp: number, seed = 1, offset = 0): Float64Array {
  let s = seed;
  return Float64Array.from({ length: n }, () => {
    s = (s * 16807) % 2147483647;
    return offset + amp * ((s / 2147483647) * 2 - 1);
  });
}

test("one level per second of input; steady ground sits near 0.5 whatever its scale (auto-ranging)", () => {
  for (const amp of [1e-3, 1, 5e4]) {
    const e = new GroundEnergy({ rate: 20 });
    const levels = e.push(noise(20 * 600, amp, 7, 1e5));
    assert.equal(levels.length, 600);
    const last = levels.slice(-60);
    for (const l of last) assert.ok(Math.abs(l - 0.5) < 0.06, `amp ${amp}: ${l}`);
  }
});

test("a burst four times louder rises toward 1; a lull falls toward 0", () => {
  const e = new GroundEnergy({ rate: 20 });
  e.push(noise(20 * 600, 100, 3));
  const loud = e.push(noise(20 * 20, 400, 4));
  assert.ok(loud.at(-1)! > 0.9, `loud ${loud.at(-1)}`);
  const f = new GroundEnergy({ rate: 20 });
  f.push(noise(20 * 600, 100, 3));
  const quiet = f.push(noise(20 * 20, 25, 4));
  assert.ok(quiet.at(-1)! < 0.1, `quiet ${quiet.at(-1)}`);
});

test("deterministic: the same samples give the same levels, however they are split", () => {
  const x = noise(20 * 120, 50, 11);
  const a = new GroundEnergy({ rate: 20 }).push(x);
  const g = new GroundEnergy({ rate: 20 });
  const b: number[] = [];
  for (let i = 0; i < x.length; i += 37) b.push(...g.push(x.subarray(i, i + 37)));
  assert.deepEqual(a, b);
});

test("reset forgets", () => {
  const e = new GroundEnergy({ rate: 10 });
  e.push(noise(100, 1));
  e.reset();
  assert.equal(e.level, null);
  assert.equal(e.push(noise(9, 1)).length, 0);
});

test("Smoother: one pole, τ 0 follows at once", () => {
  const s = new Smoother(0);
  assert.ok(Math.abs(s.step(1, 1, 1) - (1 - Math.exp(-1))) < 1e-12);
  assert.equal(new Smoother(0).step(0.7, 0.1, 0), 0.7);
});
