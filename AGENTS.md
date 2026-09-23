# Orbital HW

- Local, static teaching site. Serve only `dist/`; no backend, accounts, analytics, or provider calls.
- Read parent Sites/AGENTS.md. No DNS, remote repository creation, or production deployment without separate authority.
- The original supplied visualizations are preserved in `src/`. Adaptations belong in `scripts/build.py`, shared assets, and tests.
- Keep the two demonstrations distinct: Orbit & Code integrates a teaching trajectory; Solar Components is normalized vector geometry, not another orbital propagator.
- No homework density thresholds, optimized homework orbit, solution PDFs, personal submissions, or confidential coursework belong in this public-ready tree.
- Run `npm run validate` and the browser suite against the built site. Node 24.18.1 is the development baseline; no package install is needed for the site itself.
- Preserve `script-src 'self'`; ship all scripts, styles and assets locally. Inline style attributes are extracted during build.
- Use local-only `.ai-work/` for browser evidence. It is excluded through `.git/info/exclude`.
