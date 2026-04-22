import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { takeSnapshot } from "../src/snapshot.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
  );
});

describe("takeSnapshot", () => {
  it("ignores node_modules and declaration files", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "shadcn-solid-snapshot-"));
    tempDirs.push(cwd);

    await fs.mkdir(path.join(cwd, "src"), { recursive: true });
    await fs.mkdir(path.join(cwd, "node_modules", "pkg"), { recursive: true });

    await fs.writeFile(
      path.join(cwd, "src", "button.tsx"),
      "export const Button = () => null;\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(cwd, "src", "types.d.ts"),
      "export interface ButtonProps { className?: string; }\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(cwd, "node_modules", "pkg", "index.ts"),
      "export const external = true;\n",
      "utf8",
    );

    const snapshot = await takeSnapshot(cwd, ["."]);

    expect([...snapshot.keys()]).toEqual(["src/button.tsx"]);
  });
});
