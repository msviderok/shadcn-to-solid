import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vite-plus/test";
import { resolveConfig, type ShadcnSolidConfig } from "../src/config.js";
import { transformFiles } from "../src/transform/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
  );
});

export async function transformSource(
  source: string,
  fileName = "component.tsx",
  config?: ShadcnSolidConfig,
): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "shadcn-solid-"));
  tempDirs.push(cwd);

  const filePath = path.join(cwd, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, source, "utf8");

  await transformFiles({
    cwd,
    config: resolveConfig(config),
    filePaths: [filePath],
  });

  return fs.readFile(filePath, "utf8");
}

export function normalizeCode(source: string): string {
  return source.trim().replace(/\r\n/g, "\n");
}

export function stringifyLogMessage(message: unknown): string {
  if (message == null) {
    return "";
  }

  if (
    typeof message === "string" ||
    typeof message === "number" ||
    typeof message === "boolean" ||
    typeof message === "bigint"
  ) {
    return String(message);
  }

  if (typeof message === "symbol") {
    return message.description ?? "Symbol()";
  }

  if (message instanceof Error) {
    return message.message;
  }

  const serialized = JSON.stringify(message);
  return serialized ?? "[unserializable]";
}
