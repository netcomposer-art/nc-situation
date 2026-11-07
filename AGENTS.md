# AGENTS.md: nc-situation

For AI agents (and people) working in this repo. The [README](README.md) has the contract.

`@netcomposer/nc-situation`: the Situation contract (ARIA's signals to the Studio's instruments) and the pure maths
that make them. MIT; created by Peter Semmelhack (keep the credit in NOTICE).

## Commands

```sh
npm ci
npm run typecheck
npm test            # compiles the tests and runs them with plain node (no browser)
npm run build
```

CI runs `npm ci`, typecheck, test, build on Node 20, 22 and 24.

## Rules

- **Pure:** nothing in `src/` touches `window`, `document`, Web Audio, timers, `Worker`, clocks or randomness (a test
  enforces it). Deterministic: the same samples give the same tables and levels (a replay depends on it).
- **The contract is versioned.** A new kind or optional field is a minor release (receivers ignore what they don't
  know); changing or removing one is a major release and a new `SITUATION_VERSION`. CHANGELOG line for each.
- **Ground Wave is the reference** for the table (`test/table.test.ts` holds its `process()` verbatim). A change that
  alters the table needs Peter's yes.
- JSDoc on new exports, and a test for every behaviour change. No runtime dependencies.
- **Vendoring:** apps copy this repo at a pinned commit (`vendor/nc-situation`, `VENDORED_FROM`). Change it here, then
  re-vendor; never edit a copy.
- Commits and PRs need no attribution lines.

## Questions

Open an issue on [netcomposer-art/nc-situation](https://github.com/netcomposer-art/nc-situation/issues). Peter
Semmelhack decides product, sound and design questions.
