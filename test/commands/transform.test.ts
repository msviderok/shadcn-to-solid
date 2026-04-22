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
): Promise<{
  cwd: string;
  filePath: string;
}> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "shadcn-solid-transform-"));
  tempDirs.push(cwd);

  const filePath = path.join(cwd, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, source, "utf8");

  return { cwd, filePath };
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
});
