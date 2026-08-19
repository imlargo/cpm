# {{PACKAGE_NAME}}

[![CI](https://github.com/{{GITHUB_OWNER}}/{{REPO_NAME}}/actions/workflows/ci.yml/badge.svg)](https://github.com/{{GITHUB_OWNER}}/{{REPO_NAME}}/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/{{PACKAGE_NAME}})](https://www.npmjs.com/package/{{PACKAGE_NAME}})

{{PACKAGE_DESCRIPTION}}

```bash
pnpm add {{PACKAGE_NAME}}
```

## Usage

```ts
import { PACKAGE_NAME } from '{{PACKAGE_NAME}}';
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
