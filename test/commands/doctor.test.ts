import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { runDoctorCommand } from "../../src/commands/doctor.js";
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
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "shadcn-solid-doctor-"));
  tempDirs.push(cwd);

  const filePath = path.join(cwd, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, source, "utf8");

  return { cwd, filePath };
}

describe("doctor command", () => {
  it("reports invalid Solid render prop usage", async () => {
    const { cwd } = await createProjectFile(
      "src/components/ui/menu.tsx",
      `import { Menu } from "@msviderok/base-ui-solid/menu";

export function Example() {
  return <Menu.Trigger render={<button class="foo" />} />;
}
`,
    );

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(stringifyLogMessage(message));
    });

    await runDoctorCommand({
      cwd,
      patterns: [],
      write: false,
    });

    expect(logs.some((line) => line.includes("render prop still uses JSX element syntax"))).toBe(
      true,
    );
  });

  it("fixes invalid Solid render prop usage with --write", async () => {
    const { cwd, filePath } = await createProjectFile(
      "src/components/ui/menu.tsx",
      `import { Menu } from "@msviderok/base-ui-solid/menu";

export function Example() {
  return <Menu.Trigger render={<button class="foo" />} />;
}
`,
    );

    vi.spyOn(console, "log").mockImplementation(() => {});

    await runDoctorCommand({
      cwd,
      patterns: [],
      write: true,
    });

    const output = await fs.readFile(filePath, "utf8");

    expect(output).toContain(`render={{ component: "button", class: "foo" }}`);
  });

  it("preserves existing solid-js imports while fixing files", async () => {
    const { cwd, filePath } = await createProjectFile(
      "src/components/ui/menu.tsx",
      `import { Menu } from "@msviderok/base-ui-solid/menu";
import { mergeProps, splitProps } from "solid-js";

export function Example(props: { id?: string }) {
  const merged = mergeProps({ id: "fallback" }, props);
  const [local] = splitProps(merged, ["id"]);

  return <Menu.Trigger id={local.id} render={<button class="foo" />} />;
}
`,
    );

    vi.spyOn(console, "log").mockImplementation(() => {});

    await runDoctorCommand({
      cwd,
      patterns: [],
      write: true,
    });

    const output = await fs.readFile(filePath, "utf8");

    expect(output).toContain(`import { mergeProps, splitProps } from "solid-js";`);
    expect(output).toContain(`render={{ component: "button", class: "foo" }}`);
  });
});
