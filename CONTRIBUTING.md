# Contributing to @kora/critical-path-method

This document is for anyone changing the source: the philosophy behind the design, the behavior
rules that must stay exact, and decisions already settled. For how to _use_ the library, see
[README.md](./README.md).

---

## Philosophy

Four rules that should survive every future PR:

- **Zero runtime dependencies.** A scheduling engine is arithmetic; nothing here earns a dependency.
- **Functions over classes, data over hidden state.** Every entry point is a pure function: the same
  input produces the same schedule, the caller's input is never mutated, and nothing is remembered
  between calls.
- **Errors are values.** Anything a caller could reasonably hit — a cycle, an unknown predecessor, a
  date past the end of the calendar — comes back inside a `Result`, never as a thrown exception, and
  validation reports every problem it finds rather than the first one.
- **Simple and separated beats clever and compact.** Small modules with one job each, in preference
  to anything that has to be decoded to be reviewed.

### Settled decisions

- **Dates are integers inside.** A `Day` is the number of days since 1970-01-01. Integers compare,
  subtract and index; `Date` appears only in `src/day.ts`, to convert once at the boundary. Nothing
  iterates over `Date` objects, and nothing should start.
- **The calendar index is precomputed once.** `defineCalendar` walks its range a single time and
  builds the lookup tables; every calendar question afterwards is an array lookup whose cost does
  not depend on the distance being moved. A change that reintroduces per-call scanning is a
  regression even if the tests stay green.
- **The library knows no holidays.** Which days are worked is always input. No country's calendar,
  no default holiday list, not even as a convenience export.
- **Durations count working days inclusively.** A one-day task starts and finishes the same day; a
  duration of `0` is a milestone. Lag is in working days too, and `0` lag means the next working day.
- **Unsupported is reported, not approximated.** Dependency types this version does not compute are
  rejected as issues rather than treated as finish-to-start.
- **`src/` is grouped by domain, not flat.** `day.ts` and `result.ts` sit at the root; the calendar
  and the CPM passes each have a directory, because they are two separate subjects and the calendar
  may eventually leave as its own package. Do not add a third directory for a handful of functions.

### Non-goals

- **Rendering, Gantt components, any UI.** The reason this library exists is that every other
  implementation buried the maths inside a visual component. Keep the maths free of it.
- **Resource levelling.** A different and much larger problem — constraint solving rather than graph
  traversal. It does not belong in the same package.
- **PERT, Monte Carlo, probabilistic analysis.** Out of scope in every version.
- **Persistence, I/O, or a notion of "the current date".** The engine is given everything it needs
  and returns a value; it reads no clock and touches no storage.

---

## Code conventions

- Prefer closures and factory functions over classes, unless a class is genuinely the better fit
  (e.g. it must extend `Error`).
- Named exports for everything the library re-exports from `src/index.ts`; a default export only
  if the library has one obvious primary thing to export.
- Small focused modules beat one large file, but don't build a directory tree for a handful of
  functions — see the settled decision on how `src/` is grouped.
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
- `scripts/smoke.mjs` covers what the vitest suite structurally cannot: it imports the **built**
  `dist/`, not `src/`, so a broken build (bad bundling, a dropped export) fails there even with a
  fully green test run. It schedules the same project the README documents and checks the finish
  date, the critical path and `acometida`'s float, so the published package is verified against the
  numbers the documentation promises. Keep it plain Node with no syntax past what `engines` in
  `package.json` claims, since CI also runs it on the oldest Node version that claim covers.

---

## CI and releasing

Two workflows in `.github/workflows/`:

- **`ci.yml`** — runs on every push to `main` and every PR, with two jobs:
  - `check` — `format:check`, `lint`, `typecheck`, `test`, `build`, then `pack:check` (`publint` +
    `@arethetypeswrong/cli`, validating the built package's `exports`/`types` actually resolve the
    way `package.json` claims). Runs on a single modern Node version.
  - `compat` — builds once on a modern Node, then runs `scripts/smoke.mjs` against the built
    `dist/` on every Node version `engines` in `package.json` claims to support (20/22/24). These
    two jobs exist on separate Node versions on purpose: **tsdown (the bundler) requires Node
    `^22.18 || >=24.11` to run at all** — a newer floor than the `>=20` this library promises
    consumers. Building on an old-enough-to-fail Node isn't a hypothetical; it's the default
    outcome of running `pnpm build` on the oldest supported version, which is exactly why `compat`
    builds once on a modern Node and only switches Node versions afterward, to test the artifact
    rather than the toolchain. If tsdown's own minimum ever rises, bump the `node-version` used to
    build in both jobs, not the `engines` field — those describe different things.
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
