import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { normalizeCode, transformSource } from "../helpers.js";

describe("accordion fixture", () => {
  it("rewrites a representative base-ui component", async () => {
    const fixtureDir = path.join(process.cwd(), "test/fixtures/accordion");
    const [input, expected] = await Promise.all([
      fs.readFile(path.join(fixtureDir, "input.txt"), "utf8"),
      fs.readFile(path.join(fixtureDir, "expected.txt"), "utf8"),
    ]);

    const output = await transformSource(input, "src/components/ui/accordion.tsx");
    expect(normalizeCode(output)).toBe(normalizeCode(expected));
  });
});
