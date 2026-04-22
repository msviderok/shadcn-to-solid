import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_CONFIG_BASENAME, loadConfig } from "../src/config.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
  );
});

describe("config loading", () => {
  it("loads import-free config files for zero-install CLI usage", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "shadcn-solid-config-"));
    tempDirs.push(cwd);

    await fs.writeFile(
      path.join(cwd, DEFAULT_CONFIG_BASENAME),
      `export default {
  componentsDir: "app/components/ui",
  libDir: "app/lib",
  formatterCommand: ["vp", "fmt", "{files}"],
  importMap: {
    "@base-ui/react": "@acme/base-ui-solid"
  }
};
`,
      "utf8",
    );

    const config = await loadConfig(cwd);

    expect(config.componentsDir).toBe("app/components/ui");
    expect(config.libDir).toBe("app/lib");
    expect(config.formatterCommand).toEqual(["vp", "fmt", "{files}"]);
    expect(config.importMap["@base-ui/react"]).toBe("@acme/base-ui-solid");
  });
});
