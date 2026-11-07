import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("src is pure: no DOM, Web Audio, timers, workers, clocks or randomness", () => {
  const dir = join(import.meta.dirname, "..", "..", "src");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
    const code = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const bad of ["window", "document", "AudioContext", "setTimeout", "setInterval", "Worker", "Date.now", "new Date", "Math.random", "performance"])
      assert.ok(!new RegExp(`\\b${bad.replace(".", "\\.")}\\b`).test(code), `${f} uses ${bad}`);
  }
});
