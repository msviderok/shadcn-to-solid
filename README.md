# shadcn-to-solid

`shadcn-to-solid` is a thin CLI wrapper around `shadcn@latest` for Base UI-based output. It runs normal `shadcn` commands, then rewrites the generated React files into Solid-friendly code.

It is for generated component files, not full-app React migrations.

## What it does

- Runs `shadcn@latest` through your current package manager (`pnpm`, `npm`, `yarn`, or `bun`).
- `init`: runs `shadcn init`, forces `components.json` to `tsx: true`, patches common aliases, creates `shadcn-solid.config.ts` if missing, then transforms the generated files. If `components.json` already exists, it first offers to just scaffold `shadcn-solid.config.ts` for an existing project and skip rerunning `shadcn init`.
- `add <names...>`: runs `shadcn add ...`, snapshots the configured component/lib roots, and transforms only files that changed.
- `transform [glob...]`: scans for unported files, lists them, asks for confirmation, then rewrites only those files. With no globs it scans `componentsDir`. Use `-y` to skip the prompt.
- `doctor [glob...]`: scans for leftover React-specific patterns and post-transform issues such as invalid Solid `render` prop syntax. By default it scans `componentsDir` and `libDir` `ts/tsx` files. Use `--write` to auto-fix files when possible.
- Formats rewritten files with Prettier and prints a per-file report.

## What it rewrites

- Import sources from `@base-ui/react` to `@msviderok/base-ui-solid`, plus extra package remaps via `importMap` such as the default `lucide-react` -> `lucide-solid`.
- React hooks: `useState`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, and simple `forwardRef`.
- Safe signal call sites, so reads like `open` become `open()` when needed.
- Destructured component props into Solid `splitProps` and `mergeProps`.
- JSX props like `className` -> `class`, `htmlFor` -> `for`, and form `onChange` -> `onInput`.
- JSX `{items.map(...)}` into `<For each={...}>`.
- Inline style objects from camelCase to kebab-case, with numeric CSS normalization and `styleUnitMap` overrides.
- Common React types such as `React.ComponentProps`, `ReactNode`, `React.HTMLAttributes`, and `React.CSSProperties`.
- `TODO(shadcn-solid)` comments for anything that is not safe to guess, including React escape hatches like `React.Children` and `React.cloneElement`.

## Use

Requires Node `>=18.18.0`.

```bash
pnpm dlx @msviderok/shadcn-to-solid init
pnpm dlx @msviderok/shadcn-to-solid transform
pnpm dlx @msviderok/shadcn-to-solid add button
bunx @msviderok/shadcn-to-solid doctor
```

No local install is required. `npx`, `pnpm dlx`, `yarn dlx`, and `bunx` all work. The wrapper will invoke `shadcn@latest` with the package manager you are already using.

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

The config is intentionally import-free so repeated `dlx`/`bunx` runs keep working even when this package is not installed in the project.

Available overrides: `source`, `target`, `componentsDir`, `libDir`, `importMap`, `styleUnitMap`, `rules` (`signalCallSites`, `onChangeToOnInput`, `mapToFor`, `styleCamelToKebab`), and `customRules` (`ts-morph` project hook).

The package names drive import rewriting today. The scaffolded `version` fields are currently metadata.

## Limits

- Best for Base UI-flavored generated component code, not arbitrary React codebases.
- `doctor --write` re-runs the transformer over files with auto-fixable findings so previously generated code can be normalized after rules improve.
- When a pattern is ambiguous, the tool leaves a TODO instead of inventing a migration.
