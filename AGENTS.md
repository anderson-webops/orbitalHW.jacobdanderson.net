# Orbital HW

## Standing Dependency Completion Policy

Treat dependency remediation as part of completing authorized work on this
site, not as an optional follow-up. Proactively resolve vulnerabilities,
compatibility problems, broken installations and lockfile issues. Cover direct
and transitive dependencies, production and development dependencies,
workspaces and root-level tools. Do not dismiss findings because they are
pre-existing or development-only.

Before creating a release tag or publishing a release, require a clean locked
installation for every applicable dependency graph, zero known dependency
vulnerabilities in both full and production audits, and all applicable project
checks. An unavailable or incomplete audit is not a clean result. Use supported
upgrades, replacements or maintainable patches that preserve functionality.
Do not silence findings, weaken checks or force incompatible versions merely
to obtain a passing result.

Intermediate commits may capture coherent progress. Commit and push validated
work through this site's authorized delivery process, and complete meaningful
releases rather than stopping after reporting fixable dependency blockers.
Documentation-only housekeeping does not require an application release.

Preserve unrelated work, coordinate with other active chats, and retain existing
security, approval and production-access boundaries. Existing maintenance pauses
and repository exclusions remain in force; this policy does not expand access
or authorize otherwise excluded work. If a genuine blocker prevents completion,
preserve progress and report the exact blocker and remaining work. Distinguish
a published release from verified live deployment.

Treat this as a standing instruction for this site.

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
- Run `npm run validate` and the browser suite against the built site. Node 26.13.0 is the development baseline; no runtime packages are needed for the site itself.
- Preserve `script-src 'self'`; ship all scripts, styles and assets locally. Inline style attributes are extracted during build.
- Use local-only `.ai-work/` for browser evidence. It is excluded through `.git/info/exclude`.
