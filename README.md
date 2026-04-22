# shadcn-to-solid

Thin CLI wrapper around `shadcn@latest` for Base UI-based output. It runs
`shadcn` commands, then rewrites generated React files into Solid-friendly code.

Built for generated component files, not full-app React migrations.

## Quick start

```bash
pnpm dlx @msviderok/shadcn-to-solid init
pnpm dlx @msviderok/shadcn-to-solid add button
pnpm dlx @msviderok/shadcn-to-solid transform
bunx @msviderok/shadcn-to-solid doctor
```

Requires Node `>=18.18.0`.

No local install needed. `npx`, `pnpm dlx`, `yarn dlx`, and `bunx` all work.

## Commands

| Command               | Description                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                | Runs `shadcn init`, forces `components.json` to `tsx: true`, patches common aliases, creates `shadcn-solid.config.ts` if missing, then transforms generated files. If `components.json` already exists, it can scaffold only the config for an existing project. |
| `add <names...>`      | Runs `shadcn add ...`, snapshots configured component and lib roots, then transforms only changed files.                                                                                                                                                         |
| `transform [glob...]` | Finds unported files, lists them, asks for confirmation, then rewrites only those files. Without globs, scans `componentsDir`. Use `-y` to skip the prompt.                                                                                                      |
| `doctor [glob...]`    | Finds leftover React patterns and post-transform issues, including invalid Solid `render` prop syntax. By default scans `componentsDir` and `libDir` `ts`/`tsx` files. Use `--write` to auto-fix where possible.                                                 |

Formatted with Prettier. Reports are printed per file.

## What it rewrites

| Area            | Changes                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Imports         | Rewrites `@base-ui/react` to `@msviderok/base-ui-solid`, plus `importMap` remaps like `lucide-react` to `lucide-solid`.        |
| Hooks           | Handles `useState`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, and simple `forwardRef`.               |
| Signals         | Converts safe signal reads like `open` to `open()` when needed.                                                                |
| Props           | Converts destructured props into Solid `splitProps` and `mergeProps`.                                                          |
| JSX             | Converts `className` to `class`, `htmlFor` to `for`, `onChange` to `onInput`, and `{items.map(...)}` to `<For each={...}>`.    |
| Styles          | Converts inline style objects from camelCase to kebab-case, with numeric normalization and `styleUnitMap` overrides.           |
| Types           | Handles common React types like `React.ComponentProps`, `ReactNode`, `React.HTMLAttributes`, and `React.CSSProperties`.        |
| Unsafe patterns | Leaves `TODO(shadcn-solid)` markers for cases that are not safe to infer, including `React.Children` and `React.cloneElement`. |

## Config

`init` creates `shadcn-solid.config.ts`:

```ts
export default {
  source: {
    package: "@base-ui/react",
    version: "^1.0.0",
  },
  target: {
    package: "@msviderok/base-ui-solid",
    version: "1.0.0-beta.9",
  },
  importMap: {
    "lucide-react": "lucide-solid",
  },
  componentsDir: "src/components/ui",
  libDir: "src/lib",
};
```

The config is import-free so repeated `dlx` or `bunx` runs keep working even
when this package is not installed in the project.

Available overrides:

| Key             | Purpose                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `source`        | Source package metadata for import rewriting                                                      |
| `target`        | Target package metadata for import rewriting                                                      |
| `componentsDir` | Components root                                                                                   |
| `libDir`        | Lib root                                                                                          |
| `importMap`     | Extra import remaps                                                                               |
| `styleUnitMap`  | Per-property CSS unit overrides                                                                   |
| `rules`         | Built-in rewrite toggles: `signalCallSites`, `onChangeToOnInput`, `mapToFor`, `styleCamelToKebab` |
| `customRules`   | `ts-morph` project hook                                                                           |

Package names drive import rewriting today. `version` fields are metadata only.

## Limits

- Best for Base UI-flavored generated component code, not arbitrary React codebases.
- `doctor --write` re-runs the transformer over files with auto-fixable findings.
- Ambiguous patterns are left as `TODO` instead of being guessed.
