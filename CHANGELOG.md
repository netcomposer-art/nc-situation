# Changelog

All notable changes to nc-situation are documented here. The project uses [Semantic Versioning](https://semver.org/):
a new message kind or optional field is a minor release; changing or removing one is a major release (and a new
`SITUATION_VERSION`).

## 0.1.0 (2026-11-07)

- The Situation contract v1 (ARIA v1 = Ground; Peter, 2026-11-06): `energy`, `table`, `status` and `off` messages,
  `parseSituationMessage()` (checks and copies a foreign message; unknown kinds and a newer major version are null),
  builders, `Station`, `parseWants()`.
- `GroundEnergy`: a seismometer's Energy, 0–1 (10 s RMS of the 0.05 Hz high-passed signal against the median of the
  last 30 minutes; 0.5 + 0.25·log2(rms / baseline)). `energyLevel()`, `median()`, `Smoother` (one pole).
- `prepareTable()`: the Ground table as Ground Wave makes it (detrend, mirror with rounded folds, resample to 1024,
  remove the mean, peak 1), with its RMS; `tableWindow()`.
