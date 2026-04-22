import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_CONFIG_BASENAME, resolveConfig } from "../../src/config.js";
import { runInitCommand } from "../../src/commands/init.js";
import { stringifyLogMessage } from "../helpers.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
  );
});

async function createProject(): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "shadcn-solid-init-"));
  tempDirs.push(cwd);
  return cwd;
}

describe("init command", () => {
  it("offers a config-only path for existing shadcn projects", async () => {
    const cwd = await createProject();
    const runShadcnCommand = vi.fn(async () => {});

    await fs.writeFile(
      path.join(cwd, "components.json"),
      `${JSON.stringify({ aliases: {} }, null, 2)}\n`,
      "utf8",
    );

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(stringifyLogMessage(message));
    });

    await runInitCommand({
      cwd,
      forwardedArgs: [],
      confirmConfigOnly: async () => true,
      runShadcnCommand,
    });

    const configSource = await fs.readFile(path.join(cwd, DEFAULT_CONFIG_BASENAME), "utf8");

    expect(runShadcnCommand).not.toHaveBeenCalled();
    expect(configSource).toContain(`"lucide-react": "lucide-solid"`);
    expect(logs).toContain(`init: created ${DEFAULT_CONFIG_BASENAME}`);
  });

  it("falls back to regular shadcn init when config-only is declined", async () => {
    const cwd = await createProject();
    const runShadcnCommand = vi.fn(async () => {});
    const transformProjectFiles = vi.fn(async () => ({ files: [] }));

    await fs.writeFile(path.join(cwd, "components.json"), "{}\n", "utf8");

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(stringifyLogMessage(message));
    });

    await runInitCommand({
      cwd,
      forwardedArgs: ["--base-color", "neutral"],
      confirmConfigOnly: async () => false,
      loadProjectConfig: async () => resolveConfig(undefined),
      runShadcnCommand,
      transformProjectFiles,
    });

    const componentsJson = JSON.parse(
      await fs.readFile(path.join(cwd, "components.json"), "utf8"),
    ) as {
      tsx?: boolean;
      aliases?: Record<string, string>;
    };

    expect(runShadcnCommand).toHaveBeenCalledWith(cwd, ["init", "--base-color", "neutral"]);
    expect(transformProjectFiles).toHaveBeenCalledOnce();
    expect(componentsJson.tsx).toBe(true);
    expect(componentsJson.aliases).toMatchObject({
      components: "@/components",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    });
    expect(logs).toContain("shadcn-solid: no files transformed");
  });
});
