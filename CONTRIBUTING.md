# Contributing to @kora/critical-path-method

This document is for anyone changing the source: the philosophy behind the design, the behavior
rules that must stay exact, and decisions already settled. For how to _use_ the library, see
[README.md](./README.md).

---

## Philosophy

_Fill this in before the library grows past scaffolding. State the one or two rules that should
survive every future PR — the thing a contributor should know before writing the first line. Two
examples worth reusing verbatim if they apply:_

- **Zero runtime dependencies**, unless there's a specific reason one earns its place.
- **Functions over classes**, state as data over hidden mutation, errors as data where a caller is
  expected to handle them programmatically (vs. exceptions for programmer errors).

### Non-goals

_List what this library deliberately does not do, and why — so a future "why don't we just add X"
has an answer already written down instead of being re-litigated from scratch._

---

## Code conventions

- Prefer closures and factory functions over classes, unless a class is genuinely the better fit
  (e.g. it must extend `Error`).
- Named exports for everything the library re-exports from `src/index.ts`; a default export only
  if the library has one obvious primary thing to export.
- Keep `src/` flat until it genuinely hurts. Small focused modules beat one large file, but don't
  build a directory tree for a handful of functions.
- No barrel files other than `src/index.ts`.
- No comments explaining _what_ the code does — the code says that. Comment only _why_, and only
  for non-obvious decisions (spec quirks, runtime bugs being worked around, a change that was
  tried and reverted).

---

## Testing

- Vitest. Tests live in `test/`, never beside the source.
- Test real behavior through the public API, not internals. No test imports from `src/` except
  `src/index.ts`.
- Mock external dependencies (network, filesystem, timers) minimally — assert against what was
  actually passed, not through deep mocking machinery. When a mock and the real thing disagree,
  the mock is wrong.
- Type-level rules get type-level tests: `@ts-expect-error` on a value that must not compile.
  `pnpm typecheck` covers `test/`, so loosening a type fails the build.
- If the library does real I/O (network, filesystem, timers), consider an `examples/` integration
  lane once it matters: small scripts that exercise the _built_ `dist/` over the real thing (a
  local server, a real clock) rather than a mock, run in CI as a separate job. Not scaffolded here
  because it's shaped by what the library actually touches — add it when a bug slips through a
  green vitest run because the mock agreed with a wrong assumption.

---

## CI and releasing

Two workflows in `.github/workflows/`:

- **`ci.yml`** — runs on every push to `main` and every PR, on a Node matrix (20/22/24):
  `format:check`, `lint`, `typecheck`, `test`, `build`, then `pack:check` (`publint` +
  `@arethetypeswrong/cli`, validating the built package's `exports`/`types` actually resolve the
  way `package.json` claims).
- **`release.yml`** — runs on a pushed `v*` tag. Refuses to publish if the tag disagrees with
  `package.json`'s version, or if `CHANGELOG.md` has no section for it. Re-runs the same checks,
  then publishes via **npm trusted publishing (OIDC)** — no `NPM_TOKEN` secret anywhere. The
  trusted publisher must be configured on npmjs.com (package **Settings → Trusted Publisher**) to
  name this repository and this workflow's filename exactly; renaming `release.yml` breaks it
  until that setting is updated. As of npm's 2026-05-20 change, a trusted-publisher config must
  also explicitly allow the `publish` action — check this if publishing starts failing on an
  older config.

To cut a release: move the `Unreleased` entries in `CHANGELOG.md` under a new version heading,
bump `version` in `package.json`, commit, then:

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```

### Changelog

`CHANGELOG.md` is written by hand, in [Keep a Changelog](https://keepachangelog.com/) order —
newest first, grouped under `Added` / `Changed` / `Fixed` / `Removed`.

This is a deliberate choice over commit-driven tooling (`semantic-release`, `git-cliff`,
`conventional-changelog`, `release-please`) and file-per-PR tooling (`changesets`):

- **Commit-driven tooling** turns commit messages into changelog entries, but commits track how
  the work was built, not what changed for a user — the output tends to need hand-editing anyway,
  which erases the automation's value.
- **Changesets** solves a real problem — collecting changelog entries from many contributors
  without a merge-conflict-prone shared file — that a solo maintainer doesn't have. Revisit this
  choice if releases stop being one person's decision, or if `Unreleased` starts arriving from
  more than one contributor at a time.

Two rules for entries:

- **Only what is observable from outside.** A refactor, a test, a docs fix — none of them get a
  line. If a user cannot tell it happened, the git history is the right place for it.
- **Say why, not just what.** "Fixed streaming bodies" is not useful; explaining _why_ the bug
  existed (e.g. a mock hid it) is.

Add entries under `## [Unreleased]` as the work lands, not at release time — reconstructing them
from `git log` afterwards is how the "why" gets lost.

---

## Working agreements

- **Small diffs.** One concern per change.
- **Before adding a feature, ask:** would most users need this? Can it live in userland instead as
  a few lines the caller writes themselves? Is it typed without `any`?
- **Before removing one, ask the counterweight:** does this leave anything a user cannot do at
  all? A dead end is worse than an option nobody uses.
- **When in doubt, leave it out.** Removing a feature after release is a breaking change; never
  shipping it costs nothing.
- **When a change is reverted, write down why** — in a comment, a test name, or this file.
