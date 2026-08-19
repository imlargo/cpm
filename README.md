# @kora/critical-path-method

[![CI](https://github.com/imlargo/cpm/actions/workflows/ci.yml/badge.svg)](https://github.com/imlargo/cpm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@kora/critical-path-method)](https://www.npmjs.com/package/@kora/critical-path-method)

Critical Path Method engine in TypeScript. Pure functions, zero runtime dependencies, injectable
working calendar.

The scheduling maths that sits inside every Gantt chart, on its own: give it tasks, durations and
dependencies, get back the dates, the float and the critical path. No rendering, no framework, no
opinion about which days your country takes off.

```bash
pnpm add @kora/critical-path-method
```

## Usage

```ts
import { calculateSchedule, defineCalendar, Weekday } from '@kora/critical-path-method';

// 1. Describe the working calendar. The library ships no holidays: these are yours.
const calendar = defineCalendar({
  workingWeekdays: [
    Weekday.Monday,
    Weekday.Tuesday,
    Weekday.Wednesday,
    Weekday.Thursday,
    Weekday.Friday,
  ],
  from: '2025-01-01',
  to: '2027-12-31',
  holidays: ['2025-12-25', '2026-01-01', '2026-01-12'],
});

if (!calendar.ok) throw new Error(calendar.issues.map((issue) => issue.message).join('\n'));

// 2. Schedule the work.
const result = calculateSchedule({
  calendar: calendar.value,
  projectStart: '2025-12-29',
  tasks: [
    { id: 'excavacion', duration: 4 },
    { id: 'cimentacion', duration: 6, dependencies: [{ predecessorId: 'excavacion' }] },
    { id: 'acometida', duration: 3, dependencies: [{ predecessorId: 'excavacion' }] },
    {
      id: 'estructura',
      duration: 8,
      dependencies: [{ predecessorId: 'cimentacion' }, { predecessorId: 'acometida' }],
    },
  ],
});

// 3. Nothing throws: a bad schedule comes back as issues.
if (!result.ok) {
  for (const issue of result.issues) console.error(issue.code, issue.message);
} else {
  console.log(result.value.finish); // 2026-01-23
  console.log(result.value.criticalPath); // [ 'excavacion', 'cimentacion', 'estructura' ]
}
```

`acometida` comes back with `totalFloat: 3`: it takes three days less than the branch it runs
alongside, so it can start — or slip — up to three working days later without moving the end of the
project. The other three tasks have zero float, which is what puts them on the critical path.

## What this computes, for readers who don't come from project management

A project is a set of tasks, each with a duration, some of which cannot start until others finish.
The **Critical Path Method** answers two questions about that set:

- **When can each task happen?** Walking the dependencies forward gives every task its _earliest_
  start and finish. Walking them backward from the project's end gives its _latest_ start and finish
  — the last moment it can happen without the whole project finishing later.
- **Which tasks actually control the deadline?** The gap between a task's earliest and latest start
  is its **total float**: how many working days it can slip before the project's finish date moves.
  Tasks with zero total float form the **critical path** — delay any of them by one day and the
  project ends one day later. Everything else has room to breathe.

**Free float** is the stricter cousin: how long a task can slip before the _next_ task has to move,
rather than before the project does. A task can have three days of total float but zero free float,
which means its slack is shared with the tasks after it rather than its own to spend.

A task with duration `0` is a **milestone**: it starts and finishes on the same day and marks an
event rather than work.

## The working calendar

The calendar is a value you build and hand in — the library has no idea which days Colombia, Spain
or your particular site takes off:

| Field              | Meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `workingWeekdays`  | Which days of the week are worked at all                                  |
| `from` / `to`      | The window the calendar covers, both ends included                        |
| `holidays`         | Dates not worked even though their weekday is                             |
| `extraWorkingDays` | Dates worked even though their weekday is not — a recovered Saturday, say |

`defineCalendar` walks that window **once** and builds a lookup index. Every later question —
is this a working day, how many working days between these two dates, what date is forty working
days from here — is an array lookup, not a walk. Build the calendar once, at startup, and reuse it:
that is where this library's speed lives.

Dates arrive and leave as `YYYY-MM-DD` strings. Inside, every date is an integer — days since
1970-01-01 — so date maths is integer maths and no `Date` object is ever created in a loop.

The engine goes one step further: it schedules in **positions**, the place of a day in the
calendar's sequence of working days. In that coordinate one working day later is `+1`, whatever
weekends and holidays lie in between, so the whole Critical Path Method is integer arithmetic and
the calendar is touched exactly twice per run — once to place the project's start, once to turn the
answer back into dates. `workingIndexOf` and `workingDayAt` convert between the two.

The same index is exported for direct use, in both directions:

```ts
import {
  addWorkingDays,
  countWorkingDays,
  formatISODate,
  parseISODate,
} from '@kora/critical-path-method';

const from = parseISODate('2025-12-29');
const to = parseISODate('2026-01-02');
if (from === undefined || to === undefined) throw new Error('not a date');

// Dates to duration: four working days, because 1 January is a holiday.
countWorkingDays(cal, from, to); // 4

// Duration to date, forwards and backwards.
formatISODate(addWorkingDays(cal, from, 3) ?? 0); // 2026-01-02
formatISODate(addWorkingDays(cal, to, -3) ?? 0); // 2025-12-29
```

## Errors are values

Nothing in this library throws. `defineCalendar` and `calculateSchedule` return a `Result`:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; issues: readonly E[] };
```

Every issue carries a machine-readable `code`, the ids involved, and a `message` you can show to a
human. Validation collects **all** the problems it finds rather than stopping at the first, so one
round trip tells the user everything that is wrong with their schedule.

A circular dependency is data too — `{ code: 'circular-dependency', cycle: ['a', 'b', 'c'] }` names
the tasks that close the loop, so you can point at them in the UI:

```ts
if (!result.ok) {
  for (const issue of result.issues) {
    if (issue.code === 'circular-dependency') highlight(issue.cycle);
  }
}
```

The calendar functions answer `undefined` when a date falls outside the calendar's window, for the
same reason: running off the end of the calendar is an answer, not a crash.

## API

| Export                                                 | What it does                                           |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `defineCalendar(spec)`                                 | Validates a calendar spec and precomputes its index    |
| `calculateSchedule({ tasks, calendar, projectStart })` | Runs the forward pass, backward pass and float         |
| `countWorkingDays(cal, from, to)`                      | Working days in a span, both ends included             |
| `addWorkingDays(cal, day, count)`                      | Move n working days forward (or backward, if negative) |
| `nextWorkingDay` / `previousWorkingDay`                | Snap a date onto a working day                         |
| `isWorkingDay` / `containsDay`                         | Ask the calendar about a single date                   |
| `workingIndexOf` / `workingDayAt`                      | Date ⇄ position in the sequence of working days        |
| `parseISODate` / `formatISODate`                       | `YYYY-MM-DD` ⇄ day integer                             |
| `dayFromDate` / `dayToDate`                            | `Date` ⇄ day integer, via the UTC calendar date        |
| `weekdayOf(day)`                                       | `0` Sunday … `6` Saturday                              |

Types for all of it — `Task`, `Dependency`, `Schedule`, `ScheduledTask`, `ScheduleIssue`,
`CalendarSpec`, `WorkingCalendar`, `CalendarIssue`, `Result`, `Day`, `Position`, `ISODate` — ship
with the package.

## Scope

**In, today:** finish-to-start dependencies with lag, forward and backward pass, total and free
float, critical path, injectable working calendar, working-day arithmetic in both directions,
circular dependency detection.

**Not yet:** start-to-start, finish-to-finish and start-to-finish dependencies, date constraints
("no earlier than", "must finish on"), summary tasks. A dependency of a type this version does not
compute is reported as `unsupported-dependency-type` rather than quietly treated as finish-to-start.

**Never here:** rendering or UI of any kind, resource levelling, PERT and probabilistic analysis,
persistence.

## Development

```bash
pnpm install
pnpm check   # format:check + lint + typecheck + test
pnpm build   # tsdown → dist/ (ESM + .d.mts)
```

| Script            | What it does                                                  |
| ----------------- | ------------------------------------------------------------- |
| `pnpm test`       | Run the suite with Vitest                                     |
| `pnpm test:watch` | Vitest in watch mode                                          |
| `pnpm coverage`   | Coverage with the v8 provider                                 |
| `pnpm lint`       | ESLint with type-checked rules                                |
| `pnpm typecheck`  | `tsc --noEmit` over `src` and `test`                          |
| `pnpm format`     | Prettier over the repo                                        |
| `pnpm pack:check` | `publint` + `attw` against the built tarball                  |
| `pnpm smoke`      | Build, then run `scripts/smoke.mjs` against the built `dist/` |

See [CHANGELOG.md](./CHANGELOG.md) for what changed in each release, and
[CONTRIBUTING.md](./CONTRIBUTING.md) for the design philosophy and behavior rules.

## License

MIT
