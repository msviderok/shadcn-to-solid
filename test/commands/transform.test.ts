import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { runTransformCommand } from "../../src/commands/transform.js";
import { stringifyLogMessage } from "../helpers.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
  );
});

async function createProjectFile(
  relativePath: string,
  source: string,
  baseDir = os.tmpdir(),
): Promise<{
  cwd: string;
  filePath: string;
}> {
  const cwd = await fs.mkdtemp(path.join(baseDir, "shadcn-solid-transform-"));
  tempDirs.push(cwd);

  const filePath = path.join(cwd, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, source, "utf8");

  return { cwd, filePath };
}

async function createExecutable(
  cwd: string,
  relativePath: string,
  source: string,
): Promise<string> {
  const filePath = path.join(cwd, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, source, "utf8");
  await fs.chmod(filePath, 0o755);
  return filePath;
}

describe("transform command", () => {
  it("lists unported files and cancels before rewriting when not confirmed", async () => {
    const { cwd, filePath } = await createProjectFile(
      "src/components/ui/button.tsx",
      `import { useState } from "react";

export function Button() {
  const [open, setOpen] = useState(false);
  return <button className={open ? "open" : "closed"} onClick={() => setOpen(!open)} />;
}
`,
    );

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(stringifyLogMessage(message));
    });

    let promptedFiles: string[] = [];

    await runTransformCommand({
      cwd,
      patterns: [],
      yes: false,
      confirm: async (files) => {
        promptedFiles = files;
        return false;
      },
    });

    const output = await fs.readFile(filePath, "utf8");

    expect(promptedFiles).toEqual(["src/components/ui/button.tsx"]);
    expect(output).toContain(`useState`);
    expect(logs).toContain("transform: cancelled");
  });

  it("auto-confirms with -y and rewrites unported files in componentsDir", async () => {
    const { cwd, filePath } = await createProjectFile(
      "src/components/ui/button.tsx",
      `import { useState } from "react";

export function Button() {
  const [open, setOpen] = useState(false);
  return <button className={open ? "open" : "closed"} onClick={() => setOpen(!open)} />;
}
`,
    );

    vi.spyOn(console, "log").mockImplementation(() => {});

    await runTransformCommand({
      cwd,
      patterns: [],
      yes: true,
    });

    const output = await fs.readFile(filePath, "utf8");

    expect(output).toContain(`import { createSignal } from "solid-js";`);
    expect(output).toContain(`const [open, setOpen] = createSignal(false);`);
    expect(output).toContain(`class={open() ? "open" : "closed"}`);
  });

  it("ignores declaration files even when explicitly passed to the transform pipeline", async () => {
    const { cwd, filePath } = await createProjectFile(
      "src/components/ui/tooltip-positioner.d.ts",
      `import type * as React from "react";

export interface TooltipPositionerProps {
  children?: React.ReactNode;
  side?: "top" | "bottom";
}
`,
    );

    vi.spyOn(console, "log").mockImplementation(() => {});

    await runTransformCommand({
      cwd,
      patterns: ["src/components/ui/**/*.d.ts"],
      yes: true,
    });

    const output = await fs.readFile(filePath, "utf8");

    expect(output).toBe(
      `import type * as React from "react";

export interface TooltipPositionerProps {
  children?: React.ReactNode;
  side?: "top" | "bottom";
}
`,
    );
  });

  it("does not rewrite external tooltip declarations while transforming props", async () => {
    const { cwd, filePath } = await createProjectFile(
      "src/components/ui/tooltip.tsx",
      `import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

export function TooltipContent({
  className,
  side = "top",
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Positioner> &
  React.ComponentProps<typeof TooltipPrimitive.Popup>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} {...props}>
        <TooltipPrimitive.Popup className={className}>
          {children}
          <TooltipPrimitive.Arrow />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
`,
      process.cwd(),
    );

    const dependencyTypePath = path.resolve(
      process.cwd(),
      "node_modules/@msviderok/base-ui-solid/esm/tooltip/positioner/TooltipPositioner.d.ts",
    );
    const originalDependencyTypes = await fs.readFile(dependencyTypePath, "utf8");

    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      runTransformCommand({
        cwd,
        patterns: [],
        yes: true,
      }),
    ).resolves.toBeUndefined();

    const output = await fs.readFile(filePath, "utf8");
    const nextDependencyTypes = await fs.readFile(dependencyTypePath, "utf8");

    expect(output).toContain(`const mergedProps = mergeProps({ side: "top" as const }, props);`);
    expect(output).toContain(`const [local, rest] = splitProps(mergedProps, [`);
    expect(output).toContain(`<TooltipPrimitive.Positioner side={local.side} {...rest}>`);
    expect(nextDependencyTypes).toBe(originalDependencyTypes);
  });

  it("runs the configured consumer formatter command after saving transformed files", async () => {
    const { cwd, filePath } = await createProjectFile(
      "src/components/ui/button.tsx",
      `import { useState } from "react";

export function Button() {
  const [open, setOpen] = useState(false);
  return <button className={open ? "open" : "closed"} onClick={() => setOpen(!open)} />;
}
`,
    );

    const formatterLogPath = path.join(cwd, "formatter-log.json");
    await fs.writeFile(
      path.join(cwd, "shadcn-solid.config.ts"),
      `export default {
  formatterCommand: [
    "node",
    "-e",
    "require('node:fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))",
    "${formatterLogPath.replaceAll("\\", "\\\\")}",
    "{files}"
  ]
};
`,
      "utf8",
    );

    vi.spyOn(console, "log").mockImplementation(() => {});

    await runTransformCommand({
      cwd,
      patterns: [],
      yes: true,
    });

    const loggedFiles = JSON.parse(await fs.readFile(formatterLogPath, "utf8")) as string[];

    expect(loggedFiles).toEqual([filePath]);
  });

  it("auto-detects a Vite+ formatter and only passes transformed files", async () => {
    const { cwd, filePath } = await createProjectFile(
      "src/components/ui/button.tsx",
      `import { useState } from "react";

export function Button() {
  const [open, setOpen] = useState(false);
  return <button className={open ? "open" : "closed"} onClick={() => setOpen(!open)} />;
}
`,
    );

    const formatterLogPath = path.join(cwd, "formatter-log.json");
    await fs.writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          version: "0.0.0",
          devDependencies: {
            "vite-plus": "1.0.0",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await createExecutable(
      cwd,
      "node_modules/.bin/vp",
      `#!/usr/bin/env node
require("node:fs").writeFileSync(${JSON.stringify(formatterLogPath)}, JSON.stringify(process.argv.slice(2)));
`,
    );

    vi.spyOn(console, "log").mockImplementation(() => {});

    await runTransformCommand({
      cwd,
      patterns: [],
      yes: true,
      configPath: undefined,
    });

    const loggedArgs = JSON.parse(await fs.readFile(formatterLogPath, "utf8")) as string[];
    expect(loggedArgs).toEqual(["fmt", filePath]);
  });

  it("prefers formatterCommand over auto-detected formatter", async () => {
    const { cwd, filePath } = await createProjectFile(
      "src/components/ui/button.tsx",
      `import { useState } from "react";

export function Button() {
  const [open, setOpen] = useState(false);
  return <button className={open ? "open" : "closed"} onClick={() => setOpen(!open)} />;
}
`,
    );

    const autoLogPath = path.join(cwd, "auto-log.json");
    const overrideLogPath = path.join(cwd, "override-log.json");
    await fs.writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          version: "0.0.0",
          devDependencies: {
            "vite-plus": "1.0.0",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await createExecutable(
      cwd,
      "node_modules/.bin/vp",
      `#!/usr/bin/env node
require("node:fs").writeFileSync(${JSON.stringify(autoLogPath)}, JSON.stringify(process.argv.slice(2)));
`,
    );
    await fs.writeFile(
      path.join(cwd, "shadcn-solid.config.ts"),
      `export default {
  formatterCommand: [
    "node",
    "-e",
    "require('node:fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))",
    "${overrideLogPath.replaceAll("\\", "\\\\")}",
    "{files}"
  ]
};
`,
      "utf8",
    );

    vi.spyOn(console, "log").mockImplementation(() => {});

    await runTransformCommand({
      cwd,
      patterns: [],
      yes: true,
    });

    await expect(fs.readFile(autoLogPath, "utf8")).rejects.toThrow();
    const loggedFiles = JSON.parse(await fs.readFile(overrideLogPath, "utf8")) as string[];
    expect(loggedFiles).toEqual([filePath]);
  });
});
