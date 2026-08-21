# @korastd/critical-path-method

[![CI](https://github.com/imlargo/cpm/actions/workflows/ci.yml/badge.svg)](https://github.com/imlargo/cpm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@korastd/critical-path-method)](https://www.npmjs.com/package/@korastd/critical-path-method)

Critical Path Method engine in TypeScript. Pure functions, zero runtime dependencies, injectable
working calendar.

The scheduling maths that sits inside every Gantt chart, on its own: give it activities, durations and
the relations between them, get back the dates, the float and the critical path. All four relation
types, minimum and maximum lags, date windows. No rendering, no framework, and no opinion about what
your activities are or which days your country takes off.

```bash
pnpm add @korastd/critical-path-method
```

## Usage

```ts
import { calculateSchedule, defineCalendar, Weekday } from '@korastd/critical-path-method';

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

// 2. Schedule the work: two branches out of `a`, both feeding `d`.
const result = calculateSchedule({
  calendar: calendar.value,
  projectStart: '2025-12-29',
  tasks: [
    { id: 'a', duration: 4 },
    { id: 'b', duration: 6, dependencies: [{ predecessorId: 'a' }] },
    { id: 'c', duration: 3, dependencies: [{ predecessorId: 'a' }] },
    { id: 'd', duration: 8, dependencies: [{ predecessorId: 'b' }, { predecessorId: 'c' }] },
  ],
});

// 3. Nothing throws: a schedule that cannot exist comes back as issues.
if (!result.ok) {
  for (const issue of result.issues) console.error(issue.code, issue.message);
} else {
  console.log(result.value.finish); // 2026-01-23
  console.log(result.value.criticalPath); // [ 'a', 'b', 'd' ]
}
```

`c` comes back with `totalFloat: 3`: it takes three days less than the branch it runs alongside, so it
can start — or slip — up to three working days later without moving the end of the project. The other
three have zero float, which is what puts them on the critical path.

## What this computes, for readers who don't come from scheduling

A project is a set of activities, each with a duration, constrained in when they may happen relative
to one another. The **Critical Path Method** answers two questions about that set:

- **When can each activity happen?** Walking the constraints forward gives every activity its
  _earliest_ start and finish. Walking them back from the project's end gives its _latest_ start and
  finish — the last moment it can happen without the whole project finishing later.
- **Which activities actually control the deadline?** The gap between an activity's earliest and
  latest start is its **total float**: how many working days it can slip before the project's finish
  date moves. Activities with zero total float form the **critical path** — delay any of them by one
  day and the project ends one day later. Everything else has room to breathe.

**Free float** is the stricter cousin: how long an activity can slip before the _next_ one has to
move, rather than before the project does. It never exceeds total float — room your successors would
tolerate is not room you have if taking it would push the project's own finish date.

An activity with duration `0` is a **milestone**: it starts and finishes on the same day and marks an
event rather than work.

## Relations

A relation attaches to one end of the predecessor and one end of the successor, which is all the four
classical types are:

| Type   | Reads as                                              |
| ------ | ----------------------------------------------------- |
| `'FS'` | the successor starts after the predecessor finishes   |
| `'SS'` | the successor starts after the predecessor starts     |
| `'FF'` | the successor finishes after the predecessor finishes |
| `'SF'` | the successor finishes after the predecessor starts   |

`lag` is the **minimum** distance the relation imposes, in working days. Zero is the tightest it
allows; negative overlaps the two activities, which schedulers call a lead.

`maxLag` is the optional **maximum**. Where `lag` says "no sooner than", `maxLag` says "no later
than", and the two together pin one activity to a window around the other:

```ts
// b starts the working day after a finishes, and no more than three days later.
{ predecessorId: 'a', type: 'FS', lag: 0, maxLag: 3 }

// b starts exactly when a starts, whenever that turns out to be.
{ predecessorId: 'a', type: 'SS', lag: 0, maxLag: 0 }
```

A `window` pins an activity to dates instead of to another activity. All four bounds are optional, and
a date that is not a working day moves inward to the nearest one, so a window never admits a day the
calendar does not have:

```ts
{ id: 'a', duration: 5, window: { startNotBefore: '2026-03-02', finishNotAfter: '2026-03-31' } }
```

## The model

None of the above is four features, or five. Every constraint this library understands — any relation
type, a minimum lag, a maximum lag, a date bound — is the same statement about two start times:

```
start(j) - start(i) >= lag
```

That reduction is the standardization of [Bartusch, Möhring and Radermacher (1988)][bmr], and it is
what makes the engine small. With every constraint in that form the earliest start times are the
**longest paths** from the project's start, and the latest start times are the project's finish minus
the longest paths to the end. One algorithm, not one per relation type.

The weight each relation becomes falls out of a single expression — how far the predecessor's chosen
end is from its own start, minus how far the successor's chosen end is from its start, plus the lag.
Writing `e` for the working days from an activity's start to just past its finish:

| Relation               | Constraint                     | Weight            |
| ---------------------- | ------------------------------ | ----------------- |
| start → start, lag d   | `start(j) ≥ start(i) + d`      | `d`               |
| finish → start, lag d  | `start(j) ≥ finish(i) + 1 + d` | `e(i) + d`        |
| finish → finish, lag d | `finish(j) ≥ finish(i) + d`    | `e(i) - e(j) + d` |
| start → finish, lag d  | `finish(j) + 1 ≥ start(i) + d` | `d - e(j)`        |

A maximum lag is the same weight negated on an edge pointing the other way. A date bound is the same
edge again, against the project's start rather than another activity. Which means `startNotAfter` and
`maxLag` and a plain lag are not three mechanisms with three sets of bugs — they are one.

### What that buys, and what it costs

**A circle is no longer automatically an error.** Once constraints can point backwards, activities
pinned to each other form circles that are perfectly satisfiable. What makes a schedule impossible is
a circle whose lags **sum to more than zero**, and the issue reports which one and by how much:

```ts
if (!result.ok) {
  for (const issue of result.issues) {
    if (issue.code === 'circular-dependency') highlight(issue.cycle, issue.excess);
  }
}
```

This is also why `a → b` with a lag of `-5` and `b → a` with a lag of `0` schedules cleanly rather
than being refused: it is a circle, but not an impossible one.

**Longer is not always later.** With relations attaching to both ends of an activity, giving one a day
more can pull the project's finish _earlier_ — the anomaly [Wiest (1981) described and Elmaghraby and
Kamburowski (1992) classified][ek]. `finish → finish` followed by `start → start` is enough to produce
it: if the middle activity must end when the first does, it has to _begin_ earlier in order to take
longer, and everything keyed to its start comes earlier too. Total float cannot tell you which way an
activity pushes, so `analyzeSensitivity` measures it:

```ts
const report = analyzeSensitivity(input);
// [{ id: 'middle', ifOneDayLonger: -1, ifOneDayShorter: 0 }, …]
```

It re-solves the schedule with each duration nudged by a day, which is exact but costs two solves per
activity — pay it deliberately, not in a loop. A direction that leaves no satisfiable schedule at all
reports `Infinity`.

## The working calendar

The calendar is a value you build and hand in — the library has no idea which days anywhere are
worked:

| Field              | Meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `workingWeekdays`  | Which days of the week are worked at all                                  |
| `from` / `to`      | The window the calendar covers, both ends included                        |
| `holidays`         | Dates not worked even though their weekday is                             |
| `extraWorkingDays` | Dates worked even though their weekday is not — a recovered Saturday, say |

`defineCalendar` walks that window **once** and builds a lookup index. Every later question — is this a
working day, how many working days between these two dates, what date is forty working days from here
— is an array lookup, not a walk.

Dates arrive and leave as `YYYY-MM-DD` strings. Inside, every date is an integer — days since
1970-01-01, converted by arithmetic rather than through `Date` — and the engine goes one step further:
it schedules in **positions**, the place of a day in the calendar's sequence of working days. In that
coordinate one working day later is `+1`, whatever weekends and holidays lie in between, so the whole
method is integer arithmetic and the calendar is touched exactly twice per run. `workingIndexOf` and
`workingDayAt` convert between the two.

The same index is exported for direct use, in both directions:

```ts
import {
  addWorkingDays,
  countWorkingDays,
  formatISODate,
  parseISODate,
} from '@korastd/critical-path-method';

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

Nothing in this library throws. `defineCalendar`, `calculateSchedule` and `analyzeSensitivity` return a
`Result`:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; issues: readonly E[] };
```

Every issue carries a machine-readable `code`, the ids involved, and a `message` you can show to a
human. Validation collects **all** the problems it finds rather than stopping at the first, so one
round trip tells the user everything that is wrong with their input. An impossible set of constraints
is reported one conflict at a time — the circle that proves it, with the working days by which it
overshoots.

The calendar functions answer `undefined` when a date falls outside the calendar's window, for the same
reason: running off the end of the calendar is an answer, not a crash.

## Performance

Building the calendar walks its range once; everything after that is integer arithmetic and array
lookups, so cost grows with the number of activities and relations, not with how far dates are being
moved or how many holidays the calendar holds. Measured under Node 25 on a laptop — fastest of nine
runs with a collection forced between each, on networks of parallel chains carrying three relations
per activity:

| Work                                               | Time    |
| -------------------------------------------------- | ------- |
| `defineCalendar` over 100 years, 900 holidays      | ~3 ms   |
| `calculateSchedule`, 1 000 activities              | ~2 ms   |
| `calculateSchedule`, 10 000 activities             | ~50 ms  |
| `calculateSchedule`, 50 000 activities             | ~420 ms |
| the same 50 000, every relation carrying a maximum | ~530 ms |

Only minimum lags keeps the network acyclic, and one pass in dependency order settles it. A maximum lag
or an upper date bound makes circles possible, and the general case then relaxes in rounds — sweeping
alternately in each direction, so a constraint pointing backwards along a chain crosses it in one round
rather than one activity per round.

Nothing recurses over the network, so a chain of tens of thousands of activities is walked, not stacked
— including the search for an impossible circle, which has to run on exactly the input that would
otherwise overflow.

## API

| Export                                                 | What it does                                         |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `defineCalendar(spec)`                                 | Validates a calendar spec and precomputes its index  |
| `calculateSchedule({ tasks, calendar, projectStart })` | Earliest and latest dates, float, critical path      |
| `analyzeSensitivity(input)`                            | How the finish answers to each duration, ±1 day      |
| `countWorkingDays(cal, from, to)`                      | Working days in a span, both ends included           |
| `addWorkingDays(cal, day, count)`                      | Move n working days forward, or backward if negative |
| `nextWorkingDay` / `previousWorkingDay`                | Snap a date onto a working day                       |
| `isWorkingDay` / `containsDay`                         | Ask the calendar about a single date                 |
| `workingIndexOf` / `workingDayAt`                      | Date ⇄ position in the sequence of working days      |
| `parseISODate` / `formatISODate`                       | `YYYY-MM-DD` ⇄ day integer                           |
| `dayFromDate` / `dayToDate`                            | `Date` ⇄ day integer, via the UTC calendar date      |
| `weekdayOf(day)`                                       | `0` Sunday … `6` Saturday                            |

Types for all of it — `Task`, `Dependency`, `TimeWindow`, `Schedule`, `ScheduledTask`, `ScheduleIssue`,
`TaskSensitivity`, `CalendarSpec`, `WorkingCalendar`, `CalendarIssue`, `Result`, `Day`, `Position`,
`ISODate` — ship with the package.

## Scope

**In:** all four relation types, minimum and maximum lags, date windows, forward and backward pass,
total and free float, critical path, feasibility with the circle that proves it, sensitivity of the
finish to each duration, an injectable working calendar, and working-day arithmetic in both
directions.

**Deliberately out:** anything that is not the arithmetic. No rendering or UI. No resource levelling — a
different and much larger problem, constraint solving rather than graph traversal. No PERT or
probabilistic analysis. No persistence, no I/O, no notion of "today". No hierarchy of activities
either: rolling a work breakdown up to its parents is a grouping over the answer, with no
critical-path content in it, and it belongs to whoever knows what the groups mean.

## Where the definitions come from

The arithmetic is not invented here. Reducing all four relation types to one form is the
standardization of [Bartusch, Möhring and Radermacher (1988)][bmr]; the temporal analysis of networks
with minimum and maximum lags, and the classification of the anomalies they permit, is [Elmaghraby and
Kamburowski (1992)][ek], building on Wiest (1981). Total float as `LS - ES`, free float as the earliest
successor start minus this activity's finish minus one — the minus one being the inclusive day counting
used here — and free float equal to total float for an activity with no successors, all follow the
standard treatment ([PMI][pmi], [PM Study Circle][float]). That a set of difference constraints is
satisfiable exactly when no circle has positive length is the classical feasibility condition for such
systems. The date conversions are Howard Hinnant's [`days_from_civil` and `civil_from_days`][hinnant].

[bmr]: https://link.springer.com/article/10.1007/s00291-015-0419-6
[ek]: https://pubsonline.informs.org/doi/10.1287/mnsc.38.9.1245
[pmi]: https://www.pmi.org/learning/library/basics-cpm-scheduling-software-axon-8170
[float]: https://pmstudycircle.com/total-float-versus-free-float/
[hinnant]: https://howardhinnant.github.io/date_algorithms.html

## Development

```bash
pnpm install
pnpm check   # format:check + lint + typecheck + test
pnpm build   # tsdown → dist/ (ESM + .d.mts)
pnpm smoke   # run the built dist/ against the numbers this README promises
```

| Script            | What it does                                 |
| ----------------- | -------------------------------------------- |
| `pnpm test`       | Run the suite with Vitest                    |
| `pnpm test:watch` | Vitest in watch mode                         |
| `pnpm coverage`   | Coverage with the v8 provider                |
| `pnpm lint`       | ESLint with type-checked rules               |
| `pnpm typecheck`  | `tsc --noEmit` over `src` and `test`         |
| `pnpm format`     | Prettier over the repo                       |
| `pnpm pack:check` | `publint` + `attw` against the built tarball |

See [CHANGELOG.md](./CHANGELOG.md) for what changed in each release, and
[CONTRIBUTING.md](./CONTRIBUTING.md) for the design philosophy and behavior rules.

## License

MIT
