# Changelog

All notable changes to nc-situation are documented here. The project uses [Semantic Versioning](https://semver.org/):
a new message kind or optional field is a minor release; changing or removing one is a major release (and a new
`SITUATION_VERSION`).

## 0.2.0 (2026-11-14)

- My phone (Peter, 2026-11-14): new kinds `motion` (frames of Tilt X and Tilt Y, −1..1 centred; Heading, 0..1, slow;
  Shake, 0..1, a level that falls away) and `shake` (a Shake event, a trigger); an optional `status.motion` (off,
  blocked, live, paused, none); the want `motion`. Additive: v stays 1, and older receivers ignore them.
- `SITUATION_SIGNALS`: the signals instruments offer, by saved id and shown name. "ARIA Energy" is now shown as
  "Ground Energy"; its id `aria:energy` stays, so old saves still load.
- `motion.ts`: the pure maths for My phone: tilt in the screen's frame against a centre, Smooth (one pole, up to
  0.6 s), Invert, a slow Heading on the circle, Shake level and events (`ShakeDetector`, `GravityFilter`),
  `MotionShaper` (the chain) and `StillCentre` (Hold still to centre).

## 0.1.0 (2026-11-07)

- The Situation contract v1 (ARIA v1 = Ground; Peter, 2026-11-06): `energy`, `table`, `status` and `off` messages,
  `parseSituationMessage()` (checks and copies a foreign message; unknown kinds and a newer major version are null),
  builders, `Station`, `parseWants()`.
- `GroundEnergy`: a seismometer's Energy, 0–1 (10 s RMS of the 0.05 Hz high-passed signal against the median of the
  last 30 minutes; 0.5 + 0.25·log2(rms / baseline)). `energyLevel()`, `median()`, `Smoother` (one pole).
- `prepareTable()`: the Ground table as Ground Wave makes it (detrend, mirror with rounded folds, resample to 1024,
  remove the mean, peak 1), with its RMS; `tableWindow()`.
