# Orbital HW

Local source for `orbitalHW.jacobdanderson.net`. Two connected, browser-only learning tools: Orbit & Code and Solar Components. The orbit-to-solar link transfers the current direction angles, rounded to the attached tool's whole-degree inputs.

## Run

```sh
python3 scripts/build.py
python3 scripts/serve.py --port 4178
```

Open `http://127.0.0.1:4178`. There is no site dependency installation, database, or backend. The site makes no external requests. Browser storage is optional and used only to retain orbit controls.

## Validate

```sh
npm run validate
ORBITALHW_URL=http://127.0.0.1:4178 npm run test:browser
```

Browser tests need Playwright; set `PLAYWRIGHT_MODULE` to an existing Playwright module path and `QA_OUTPUT` to a repository-local evidence directory if it is not installed locally. Use Node 24.18.1 and npm 12.0.2 for those commands.

## Structure and provenance

`src/orbit.html` and `src/solar-acceleration-visualizer.html` retain the supplied sources. `scripts/build.py` extracts local assets and applies only site integration changes. `dist/` is the complete static deployment tree. Shared presentation follows the minimal Vitesse Lite approach; the no-framework static delivery convention matches the local Liar's Dice site. Source hashes and adaptations are listed in `dist/source-info.json`.

This is a learning visualization, not a solver for homework thresholds or the optimized assignment orbit. The Solar Components page demonstrates geometry, not time integration. Imported angles are approximate to one degree, and its normalized arrows do not compare force magnitudes.

## Publishing boundary

Only `dist/` should be served. No public deployment, DNS changes, remote repository creation, or certificate provisioning are performed by these scripts. Apply `dist/_headers` on compatible static hosts, or use the reviewed Nginx snippet in `deploy/`. Confirm the actual hostname configuration before production use. This repository has no writable remote until an owner-controlled destination is selected.
