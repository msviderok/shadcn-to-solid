import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { DEFAULT_CONFIG_BASENAME, loadConfig } from "../config.js";
import { diffSnapshots, takeSnapshot } from "../snapshot.js";
import { runShadcn } from "../runner.js";
import { renderReport } from "../transform/report.js";
import { transformFiles } from "../transform/index.js";

export interface InitCommandOptions {
  cwd: string;
  forwardedArgs: string[];
  confirmConfigOnly?: () => Promise<boolean>;
  loadProjectConfig?: typeof loadConfig;
  runShadcnCommand?: typeof runShadcn;
  transformProjectFiles?: typeof transformFiles;
}

const DEFAULT_CONFIG_FILE = `export default {
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
`;

export async function runInitCommand(options: InitCommandOptions): Promise<void> {
  if ((await hasExistingShadcnProject(options.cwd)) && (await shouldScaffoldConfigOnly(options))) {
    const result = await ensureDefaultConfig(options.cwd);
    console.log(
      result === "created"
        ? `init: created ${DEFAULT_CONFIG_BASENAME}`
        : `init: ${DEFAULT_CONFIG_BASENAME} already exists`,
    );
    return;
  }

  await (options.runShadcnCommand ?? runShadcn)(options.cwd, ["init", ...options.forwardedArgs]);

  await patchComponentsJson(options.cwd);
  await ensureDefaultConfig(options.cwd);

  const config = await (options.loadProjectConfig ?? loadConfig)(options.cwd);
  const roots = [config.componentsDir, config.libDir];
  const snapshot = await takeSnapshot(options.cwd, roots);
  const changed = diffSnapshots(new Map(), snapshot);

  const report = await (options.transformProjectFiles ?? transformFiles)({
    cwd: options.cwd,
    config,
    filePaths: changed.map((filePath) => path.resolve(options.cwd, filePath)),
  });

  console.log(renderReport(report));
}

async function hasExistingShadcnProject(cwd: string): Promise<boolean> {
  try {
    await fs.access(path.join(cwd, "components.json"));
    return true;
  } catch {
    return false;
  }
}

async function shouldScaffoldConfigOnly(options: InitCommandOptions): Promise<boolean> {
  if (options.confirmConfigOnly) {
    return options.confirmConfigOnly();
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await readline.question(
      `init: found existing components.json. Add ${DEFAULT_CONFIG_BASENAME} only and skip shadcn init? [y/N] `,
    );
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}

async function patchComponentsJson(cwd: string): Promise<void> {
  const filePath = path.join(cwd, "components.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    json.tsx = true;
    json.aliases = {
      ...(typeof json.aliases === "object" && json.aliases
        ? (json.aliases as Record<string, string>)
        : {}),
      components: "@/components",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    };
    await fs.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  } catch {
    return;
  }
}

async function ensureDefaultConfig(cwd: string): Promise<"created" | "existing"> {
  const filePath = path.join(cwd, DEFAULT_CONFIG_BASENAME);
  try {
    await fs.access(filePath);
    return "existing";
  } catch {
    await fs.writeFile(filePath, DEFAULT_CONFIG_FILE, "utf8");
    return "created";
  }
}
