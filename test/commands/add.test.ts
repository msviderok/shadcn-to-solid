import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { runAddCommand } from "../../src/commands/add.js";
import { resolveConfig } from "../../src/config.js";
import { stringifyLogMessage } from "../helpers.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
  );
});

async function createProject(): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "shadcn-solid-add-"));
  tempDirs.push(cwd);
  return cwd;
}

describe("add command", () => {
  it("blocks unsupported components and lists matching experimental components", async () => {
    const cwd = await createProject();
    const runShadcnCommand = vi.fn(async () => {});
    const transformProjectFiles = vi.fn(async () => ({ files: [] }));
    const logs: string[] = [];

    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(stringifyLogMessage(message));
    });

    await runAddCommand({
      cwd,
      names: ["button"],
      forwardedArgs: [],
      runShadcnCommand,
      transformProjectFiles,
    });

    expect(runShadcnCommand).not.toHaveBeenCalled();
    expect(transformProjectFiles).not.toHaveBeenCalled();
    expect(logs).toContain(
      "add: cannot install button because component is not present in the Base UI Solid port yet.",
    );
    expect(logs).toContain(
      "add: experimental component available from this request: button. Use --experimental to install it.",
    );
  });

  it("installs an experimental button when the flag is enabled", async () => {
    const cwd = await createProject();
    const componentPath = path.join(cwd, "src/components/ui/button.tsx");
    const utilsPath = path.join(cwd, "src/lib/utils.ts");
    const runShadcnCommand = vi.fn(async () => {
      await fs.mkdir(path.dirname(componentPath), { recursive: true });
      await fs.mkdir(path.dirname(utilsPath), { recursive: true });
      await fs.writeFile(
        componentPath,
        `import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "preset base classes",
  {
    variants: {
      variant: {
        preset: "preset variant classes",
      },
      size: {
        preset: "preset size classes",
      },
    },
    defaultVariants: {
      variant: "preset",
      size: "preset",
    },
  },
);

function Button({
  className,
  variant = "preset",
  size = "preset",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
`,
        "utf8",
      );
      await fs.writeFile(
        utilsPath,
        `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
        "utf8",
      );
    });
    const logs: string[] = [];

    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(stringifyLogMessage(message));
    });

    await runAddCommand({
      cwd,
      names: ["button"],
      forwardedArgs: ["--overwrite"],
      experimental: true,
      runShadcnCommand,
    });

    const output = await fs.readFile(componentPath, "utf8");
    const primitive = await fs.readFile(
      path.join(cwd, "src/components/ui/button-primitive.tsx"),
      "utf8",
    );
    const utils = await fs.readFile(utilsPath, "utf8");

    expect(runShadcnCommand).toHaveBeenCalledWith(cwd, ["add", "button", "--overwrite"]);
    expect(output).toContain(`import { Button as ButtonPrimitive } from "./button-primitive";`);
    expect(output).toContain(`import { clientOnly, cn } from "@/lib/utils";`);
    expect(output).toContain(`"preset base classes"`);
    expect(output).toContain(`preset: "preset variant classes"`);
    expect(output).toContain(`preset: "preset size classes"`);
    expect(output).toContain(`const ClientOnlyButton = clientOnly(Button);`);
    expect(output).toContain(`export { ClientOnlyButton as Button, buttonVariants };`);
    expect(primitive).toContain(`export namespace Button`);
    expect(primitive).toContain(`export function Button(props: Button.Props)`);
    expect(utils).toContain(`import { createComponent, memo } from "solid-js/web";`);
    expect(utils).toContain(`import { createSignal, onMount, Show, type JSX } from "solid-js";`);
    expect(utils).toContain(`export function clientOnly<TProps extends object>`);
    expect(utils).toContain(`export function useHydrated(): () => boolean`);
    expect(logs).toContain("add: installing experimental button.");
  });

  it("passes supported components through to shadcn and transforms changed files", async () => {
    const cwd = await createProject();
    const componentPath = path.join(cwd, "src/components/ui/accordion.tsx");
    const utilsPath = path.join(cwd, "src/lib/utils.ts");
    const runShadcnCommand = vi.fn(async () => {
      await fs.mkdir(path.dirname(componentPath), { recursive: true });
      await fs.mkdir(path.dirname(utilsPath), { recursive: true });
      await fs.writeFile(
        componentPath,
        `import { cn } from "@/lib/utils";

function Accordion() {
  return <div className={cn("preset accordion")} />;
}

export { Accordion };
`,
        "utf8",
      );
      await fs.writeFile(
        utilsPath,
        `export function cn(...inputs: string[]) {
  return inputs.join(" ");
}
`,
        "utf8",
      );
    });
    const transformProjectFiles = vi.fn(async () => ({ files: [] }));

    vi.spyOn(console, "log").mockImplementation(() => {});

    await runAddCommand({
      cwd,
      names: ["accordion"],
      forwardedArgs: ["--overwrite"],
      loadProjectConfig: async () => resolveConfig(undefined),
      runShadcnCommand,
      transformProjectFiles,
    });

    expect(runShadcnCommand).toHaveBeenCalledWith(cwd, ["add", "accordion", "--overwrite"]);
    expect(transformProjectFiles).toHaveBeenCalledWith({
      cwd,
      config: resolveConfig(undefined),
      filePaths: [componentPath, utilsPath],
    });
  });
});
