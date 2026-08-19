# @kora/critical-path-method

[![CI](https://github.com/imlargo/cpm/actions/workflows/ci.yml/badge.svg)](https://github.com/imlargo/cpm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@kora/critical-path-method)](https://www.npmjs.com/package/@kora/critical-path-method)

Critical Path Method engine in TypeScript. Pure functions, zero runtime dependencies, injectable working calendar.

```bash
pnpm add @kora/critical-path-method
```

## Usage

```ts
import { PACKAGE_NAME } from '@kora/critical-path-method';
```

## Development

```bash
pnpm install
pnpm check   # format:check + lint + typecheck + test
pnpm build   # tsdown → dist/ (ESM + .d.mts)
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
