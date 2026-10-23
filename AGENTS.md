# Orbital HW

Shared Sites policy (`../AGENTS.md` when available) applies. These essentials also apply in standalone checkouts:
- Never SSH, SCP, SFTP, tunnel to, or configure access to production. Source agents do not deploy; production activation belongs to protected server-side automation.
- GitGuardian quota, authentication, network, or service failure is not a commit/push blocker. Review outgoing changes, run another available local secret scan, preserve other hooks, and stop on real secret findings.
- Commit small, coherent, validated changes frequently as work progresses and push completed work through this repository's authorized source path, usually its default branch; use pull requests only when required.
- Group related changes into meaningful deployable milestones. Align version metadata, create a new immutable annotated semver tag, and publish its matching verified GitHub release with the required accepted artifacts.
- Complete finished deployable work through the published release consumed by protected deployment. Independently verify public release identity and acceptance read-only, or report the exact remaining blocker. Never move published tags or replace published release assets.

## Site Boundary and Validation

- Local, static teaching site. Serve only `dist/`; no backend, accounts, analytics, or provider calls. A built artifact does not establish a public custom-domain deployment.
- DNS and remote repository creation require separate authority.
- The original supplied visualizations are preserved in `src/`. Adaptations belong in `scripts/build.py`, shared assets, and tests.
- Keep the two demonstrations distinct: Orbit & Code integrates a teaching trajectory; Solar Components is normalized vector geometry, not another orbital propagator.
- No homework density thresholds, optimized homework orbit, solution PDFs, personal submissions, or confidential coursework belong in this public-ready tree.
- Run `npm run validate` and the browser suite against the built site. Node 24.18.1 is the development baseline; no package install is needed for the site itself.
- Preserve `script-src 'self'`; ship all scripts, styles and assets locally. Inline style attributes are extracted during build.
- Use local-only `.ai-work/` for browser evidence. It is excluded through `.git/info/exclude`.
