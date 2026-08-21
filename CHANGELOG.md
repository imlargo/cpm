# Changelog

Notable changes to `@korastd/critical-path-method`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[semantic versioning](https://semver.org/spec/v2.0.0.html). Since 1.0.0 a breaking change means a
major bump; before it, while the major is `0`, a minor bump carries them.

Entries say what changed for someone _using_ the library. A refactor nobody can observe from the
outside does not get a line here — the git history already has it.

## [Unreleased]

## [0.2.0] - 2026-08-21

The engine is now a general activity network rather than a finish-to-start one. Every temporal
constraint — any relation type, a minimum lag, a maximum lag, a date bound — is reduced to the same
statement about two start times, so one algorithm computes them all instead of one per case.

### Added

- **All four relation types.** `type` on a dependency accepts `'FS'`, `'SS'`, `'FF'` and `'SF'`, and
  each is computed rather than rejected. The weight a relation becomes is one expression covering all
  four; the standardization is Bartusch, Möhring and Radermacher (1988).
- **Maximum lags.** `maxLag` bounds how _late_ a relation may be, where `lag` bounds how early. The
  two together pin an activity to a window around another one — `{ lag: 0, maxLag: 0 }` makes a
  successor follow its predecessor exactly.
- **Date windows.** `window` on an activity takes any of `startNotBefore`, `startNotAfter`,
  `finishNotBefore` and `finishNotAfter`. They are the same kind of constraint as a lag, stated
  against the project's start, so they cost no separate machinery. A date that is not a working day
  moves inward to the nearest one.
- **`analyzeSensitivity`** reports, for each activity, how the project's finish answers to it taking
  one working day more or less. Worth asking because relations attaching to both ends of an activity
  make "longer" and "later" come apart: a `finish → finish` relation followed by a `start → start` one
  is enough for a longer activity to pull the finish _earlier_. Measured by re-solving, so it costs
  two solves per activity, and a direction that leaves no satisfiable schedule reports `Infinity`.

### Changed

- **A circle in the dependencies is no longer automatically an error.** With constraints able to point
  backwards, activities pinned to each other form circles that are perfectly satisfiable. What makes a
  schedule impossible is a circle whose lags sum to more than zero. `circular-dependency` now carries
  `excess`, the working days by which the circle overshoots, and schedules that earlier versions
  refused — a lead and a lag that cancel out — now compute.
- One impossible circle is reported per run rather than every circle in the network: it is the proof
  the schedule cannot exist, and fixing it reveals any others.
- `criticalPath` is ordered by earliest start rather than by dependency order, which agrees with it
  wherever both are defined and stays meaningful when a maximum lag makes dependency order impossible.

### Removed

- The `unsupported-dependency-type` issue, since no dependency type is unsupported any more.

### Fixed

- Large networks with maximum lags no longer take time proportional to activities times relations:
  sweeps alternate direction, and the search for an impossible circle runs on doubling rounds.

## [0.1.0] - 2026-08-20

### Added

- First working version of the engine. `calculateSchedule` takes tasks with durations and
  finish-to-start dependencies with lag, and returns each task's earliest and latest start and
  finish, its total and free float, and whether it sits on the critical path.
- `defineCalendar` builds a working calendar from the weekdays that are worked plus the holidays
  and extra working days the caller supplies — the library ships no holidays of its own — and
  precomputes an index so every later calendar question is a lookup rather than a walk over the
  range.
- Working-day arithmetic over that calendar, in both directions: `countWorkingDays` turns two dates
  into a duration, `addWorkingDays` turns a duration into a date, forwards or backwards, and
  `nextWorkingDay` / `previousWorkingDay` snap a date onto a working day. `workingIndexOf` and
  `workingDayAt` expose the calendar's own coordinate — the position of a day in its sequence of
  working days — which is what the engine schedules in.
- Float follows the rule that the project is not over until its last task is: a task's latest finish
  never runs past the project's finish, and its free float never exceeds its total float, even where
  a lead — a negative lag — would otherwise let a task claim room the project's own finish date has
  to pay for.
- Problems in the input are returned, never thrown: both entry points answer with a `Result` whose
  issues carry a `code`, the ids involved and a human-readable `message`, and validation reports
  every problem it finds instead of stopping at the first. A circular dependency comes back as
  `{ code: 'circular-dependency', cycle }` naming the tasks that close the loop.
- Dependency types other than finish-to-start are reported as `unsupported-dependency-type` rather
  than silently computed as finish-to-start, so a schedule that uses them cannot be read as correct.
