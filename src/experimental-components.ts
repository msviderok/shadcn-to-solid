import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "./config.js";

const BUTTON_PRIMITIVE_SOURCE = `import { splitProps, type JSX } from "solid-js";

function callEventHandler<T, E extends Event>(
  handler: JSX.EventHandlerUnion<T, E> | undefined,
  event: E & { currentTarget: T; target: Element },
) {
  if (!handler) return;
  if (typeof handler === "function") {
    handler(event);
  } else {
    handler[0](handler[1], event);
  }
}

function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === " " || event.key === "Enter";
}

export namespace Button {
  export type Props = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    focusableWhenDisabled?: boolean | undefined;
    nativeButton?: boolean | undefined;
  };
}

export function Button(props: Button.Props) {
  const [local, rest] = splitProps(props, [
    "disabled",
    "focusableWhenDisabled",
    "nativeButton",
    "type",
    "tabIndex",
    "onClick",
    "onMouseDown",
    "onPointerDown",
    "onKeyDown",
    "onKeyUp",
  ]);

  const isDisabled = () => Boolean(local.disabled);
  const isFocusableWhenDisabled = () => isDisabled() && Boolean(local.focusableWhenDisabled);
  const isNativeButton = () => local.nativeButton !== false;

  const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    if (isDisabled()) {
      event.preventDefault();
      return;
    }
    callEventHandler(local.onClick, event);
  };

  const handleMouseDown: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    if (!isDisabled()) {
      callEventHandler(local.onMouseDown, event);
    }
  };

  const handlePointerDown: JSX.EventHandler<HTMLButtonElement, PointerEvent> = (event) => {
    if (isDisabled()) {
      event.preventDefault();
      return;
    }
    callEventHandler(local.onPointerDown, event);
  };

  const handleKeyDown: JSX.EventHandler<HTMLButtonElement, KeyboardEvent> = (event) => {
    if (isDisabled()) {
      if (isFocusableWhenDisabled() || isActivationKey(event)) {
        event.preventDefault();
      }
      return;
    }
    callEventHandler(local.onKeyDown, event);
  };

  const handleKeyUp: JSX.EventHandler<HTMLButtonElement, KeyboardEvent> = (event) => {
    if (isDisabled()) {
      if (isFocusableWhenDisabled() || isActivationKey(event)) {
        event.preventDefault();
      }
      return;
    }
    callEventHandler(local.onKeyUp, event);
  };

  return (
    <button
      aria-disabled={isDisabled() || undefined}
      disabled={isDisabled() && !isFocusableWhenDisabled()}
      role={!isNativeButton() ? "button" : undefined}
      tabIndex={isFocusableWhenDisabled() ? (local.tabIndex ?? 0) : local.tabIndex}
      type={isNativeButton() ? (local.type ?? "button") : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onMouseDown={handleMouseDown}
      onPointerDown={handlePointerDown}
      {...rest}
    />
  );
}
`;

const EXPERIMENTAL_IMPORT_REWRITES = new Map([
  [
    "button",
    {
      primitiveFileName: "button-primitive.tsx",
      sources: ['"@base-ui/react/button"', '"@msviderok/base-ui-solid/button"'],
      replacement: '"./button-primitive"',
      source: BUTTON_PRIMITIVE_SOURCE,
    },
  ],
]);

export async function installExperimentalComponents(options: {
  cwd: string;
  config: ResolvedConfig;
  names: string[];
}): Promise<string[]> {
  const writtenFiles: string[] = [];

  for (const name of options.names) {
    const rewrite = EXPERIMENTAL_IMPORT_REWRITES.get(name);
    if (!rewrite) {
      continue;
    }

    const primitivePath = path.resolve(
      options.cwd,
      options.config.componentsDir,
      rewrite.primitiveFileName,
    );
    await fs.mkdir(path.dirname(primitivePath), { recursive: true });
    await fs.writeFile(primitivePath, rewrite.source, "utf8");
    writtenFiles.push(primitivePath);

    const componentPath = path.resolve(options.cwd, options.config.componentsDir, `${name}.tsx`);
    await rewriteImportSource(componentPath, rewrite.sources, rewrite.replacement);
    writtenFiles.push(componentPath);
  }

  return writtenFiles;
}

async function rewriteImportSource(
  filePath: string,
  sources: string[],
  replacement: string,
): Promise<void> {
  let source: string;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }

  let nextSource = source;
  for (const importSource of sources) {
    nextSource = nextSource.replaceAll(importSource, replacement);
  }

  if (nextSource !== source) {
    await fs.writeFile(filePath, nextSource, "utf8");
  }
}

export async function wrapClientOnlyComponentExports(
  cwd: string,
  config: ResolvedConfig,
  componentPath: string,
): Promise<string[]> {
  const writtenFiles: string[] = [];
  const helperPath = await ensureClientOnlyHelper(cwd, config);
  if (helperPath) {
    writtenFiles.push(helperPath);
  }

  let source: string;
  try {
    source = await fs.readFile(componentPath, "utf8");
  } catch {
    return writtenFiles;
  }

  const exportedNames = getClientComponentExportNames(source);
  if (exportedNames.length === 0) {
    return writtenFiles;
  }

  let nextSource = ensureClientOnlyImport(source);
  const declarations = exportedNames
    .filter((name) => !nextSource.includes(`function ClientOnly${name}(`))
    .map(
      (name) => `function ClientOnly${name}(props: Parameters<typeof ${name}>[0]) {
  return (
    <ClientOnly>
      <${name} {...props} />
    </ClientOnly>
  );
}`,
    )
    .join("\n");

  if (declarations) {
    nextSource = nextSource.replace(/(\nexport\s+\{)/, `\n${declarations}\n$1`);
  }

  for (const name of exportedNames) {
    nextSource = nextSource.replace(
      new RegExp(`(export\\s+\\{[^}]*?)\\b${name}\\b(?!\\s+as\\s+${name})([^}]*\\})`, "s"),
      `$1ClientOnly${name} as ${name}$2`,
    );
  }

  if (nextSource !== source) {
    await fs.writeFile(componentPath, nextSource, "utf8");
    writtenFiles.push(componentPath);
  }

  return writtenFiles;
}

async function ensureClientOnlyHelper(
  cwd: string,
  config: ResolvedConfig,
): Promise<string | undefined> {
  const helperPath = path.resolve(cwd, config.libDir, "client-only.tsx");
  let source: string;
  try {
    source = await fs.readFile(helperPath, "utf8");
  } catch {
    source = "";
  }

  const helperSource = `import { Show, createSignal, onMount, type JSX } from "solid-js";

// Based on TanStack Router's Solid ClientOnly:
// https://github.com/TanStack/router/blob/4eed408f127b3fcc92e1cf39889edd8bce8486c8/packages/solid-router/src/ClientOnly.tsx
export interface ClientOnlyProps {
  children: JSX.Element;
  fallback?: JSX.Element;
}

export function ClientOnly(props: ClientOnlyProps) {
  const hydrated = useHydrated();
  return (
    <Show when={hydrated()} fallback={props.fallback ?? null}>
      {props.children}
    </Show>
  );
}

export function useHydrated(): () => boolean {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  return () => hydrated();
}
`;

  if (source.includes(helperSource)) {
    return undefined;
  }

  const nextSource = source.includes("export function ClientOnly")
    ? source.replace(/import\s+\{[^}]*\}\s+from\s+["']solid-js["'];?\n+[\s\S]*$/, helperSource)
    : helperSource;

  await fs.writeFile(helperPath, nextSource, "utf8");
  return helperPath;
}

function ensureClientOnlyImport(source: string): string {
  const clientOnlyImportPattern = /import\s+\{([^}]*)\}\s+from\s+(["'][^"']*\/client-only["']);?/;
  const clientOnlyMatch = source.match(clientOnlyImportPattern);
  const clientOnlyImportList = clientOnlyMatch?.[1];
  const clientOnlyImportSource = clientOnlyMatch?.[2];

  if (clientOnlyMatch && clientOnlyImportList && clientOnlyImportSource) {
    const imports = new Set(
      clientOnlyImportList
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
    imports.add("ClientOnly");
    return source.replace(
      clientOnlyImportPattern,
      `import { ${[...imports].sort().join(", ")} } from ${clientOnlyImportSource};`,
    );
  }

  let nextSource = source;
  const utilsImportPattern = /import\s+\{([^}]*)\}\s+from\s+(["'][^"']*\/utils["']);?/;
  const match = source.match(utilsImportPattern);
  const importList = match?.[1];
  const importSource = match?.[2];

  if (match && importList && importSource) {
    const imports = new Set(
      importList
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
    imports.delete("clientOnly");
    imports.delete("ClientOnly");
    nextSource = source.replace(
      utilsImportPattern,
      `import { ${[...imports].sort().join(", ")} } from ${importSource};`,
    );
  }

  return `import { ClientOnly } from "@/lib/client-only";\n${nextSource}`;
}

function getClientComponentExportNames(source: string): string[] {
  const exportMatch = source.match(/export\s+\{([^}]*)\}/);
  const exportList = exportMatch?.[1];
  if (!exportList) {
    return [];
  }

  return exportList
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      const [name, alias] = part.split(/\s+as\s+/);
      return alias ?? name;
    })
    .filter((name): name is string => Boolean(name))
    .filter((name) => /^[A-Z]/.test(name));
}
