# Changelog

Notable changes to `@kora/critical-path-method`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[semantic versioning](https://semver.org/spec/v2.0.0.html). Since 1.0.0 a breaking change means a
major bump; before it, while the major is `0`, a minor bump carries them.

Entries say what changed for someone _using_ the library. A refactor nobody can observe from the
outside does not get a line here — the git history already has it.

## [Unreleased]

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
  `nextWorkingDay` / `previousWorkingDay` snap a date onto a working day.
- Problems in the input are returned, never thrown: both entry points answer with a `Result` whose
  issues carry a `code`, the ids involved and a human-readable `message`, and validation reports
  every problem it finds instead of stopping at the first. A circular dependency comes back as
  `{ code: 'circular-dependency', cycle }` naming the tasks that close the loop.
- Dependency types other than finish-to-start are reported as `unsupported-dependency-type` rather
  than silently computed as finish-to-start, so a schedule that uses them cannot be read as correct.
