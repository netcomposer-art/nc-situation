import assert from "node:assert/strict";
import { test } from "node:test";
import { TABLE_SIZE, prepareTable, tableWindow } from "../src/index.js";

/** Ground Wave's process() (calliope lab/ground-wave/page.html, shape Raw, seam Mirror), verbatim, as the reference. */
function groundWave(win: ArrayLike<number>): Float32Array | null {
  const N = 1024;
  let x = Array.from(win);
  if (x.length < 8) return null;
  const n = x.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += x[i]!; sxx += i * i; sxy += i * x[i]!; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), icpt = (sy - slope * sx) / n;
  for (let i = 0; i < n; i++) x[i]! -= icpt + slope * i;
  const cyc = x.concat(x.slice(1, -1).reverse());
  const m = cyc.length, r = Math.max(2, Math.round(m / 96)), avg = new Array(m);
  for (let i = 0; i < m; i++) { let a = 0; for (let k = -r; k <= r; k++) a += cyc[(i + k + m) % m]!; avg[i] = a / (2 * r + 1); }
  for (const c of [0, n - 1]) for (let k = -3 * r; k <= 3 * r; k++) { const i = (c + k + m) % m, w = Math.cos((k / (3 * r)) * (Math.PI / 2)) ** 2; cyc[i] = cyc[i]! * (1 - w) + avg[i] * w; }
  x = cyc;
  const out = new Float32Array(N), mm = x.length;
  for (let i = 0; i < N; i++) { const p = (i / N) * mm, i0 = Math.floor(p) % mm, i1 = (i0 + 1) % mm, fr = p - Math.floor(p); out[i] = x[i0]! * (1 - fr) + x[i1]! * fr; }
  let mean = 0; for (const v of out) mean += v; mean /= N;
  let peak = 0; for (let i = 0; i < N; i++) { out[i]! -= mean; peak = Math.max(peak, Math.abs(out[i]!)); }
  if (peak <= 0) return null;
  for (let i = 0; i < N; i++) out[i]! /= peak;
  return out;
}

function ground(n: number, seed = 5): number[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  return Array.from({ length: n }, (_, i) => 3000 + 40 * i + 900 * Math.sin(i * 0.21) + 400 * Math.sin(i * 0.9) + 300 * rnd());
}

test("matches Ground Wave's table exactly", () => {
  for (const seed of [1, 2, 3]) {
    const w = ground(256, seed);
    const ref = groundWave(w)!;
    const t = prepareTable(w)!;
    assert.equal(t.samples.length, TABLE_SIZE);
    assert.deepEqual(Array.from(t.samples), Array.from(ref));
  }
});

test("peak 1, zero mean, a seamless loop, rms reported", () => {
  const t = prepareTable(ground(256))!;
  let peak = 0, mean = 0, ss = 0;
  for (const v of t.samples) { peak = Math.max(peak, Math.abs(v)); mean += v; ss += v * v; }
  assert.ok(Math.abs(peak - 1) < 1e-6);
  assert.ok(Math.abs(mean / TABLE_SIZE) < 1e-6);
  assert.ok(Math.abs(t.rms - Math.sqrt(ss / TABLE_SIZE)) < 1e-6);
  // The wrap (last sample → first) is no bigger a step than the cycle's typical step: no click at the loop point.
  const steps = Array.from(t.samples, (v, i) => Math.abs(v - t.samples[(i + 1) % TABLE_SIZE]!));
  const typical = steps.slice().sort((a, b) => a - b)[Math.floor(TABLE_SIZE * 0.99)]!;
  assert.ok(steps[TABLE_SIZE - 1]! <= typical, `wrap ${steps[TABLE_SIZE - 1]} vs ${typical}`);
});

test("too short or flat: null", () => {
  assert.equal(prepareTable([1, 2, 3]), null);
  assert.equal(prepareTable(new Array(256).fill(5)), null);
  assert.equal(prepareTable(Array.from({ length: 256 }, (_, i) => i * 3)), null, "a straight line detrends to nothing");
});

test("tableWindow: the span ending at the playhead, clamped", () => {
  const b = Float64Array.from({ length: 1000 }, (_, i) => i);
  assert.deepEqual(Array.from(tableWindow(b, 600, 4)!), [596, 597, 598, 599]);
  assert.deepEqual(Array.from(tableWindow(b, 2, 4)!), [0, 1, 2, 3]);
  assert.deepEqual(Array.from(tableWindow(b, 5000, 4)!), [996, 997, 998, 999]);
  assert.equal(tableWindow(b.subarray(0, 3), 3, 4), null);
});
