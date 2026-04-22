import { describe, expect, it } from "vite-plus/test";
import { normalizeCode, transformSource } from "../helpers.js";

describe("import rewriting", () => {
  it("rewrites lucide-react imports to lucide-solid by default", async () => {
    const output = await transformSource(`
import { ChevronDown, Search } from "lucide-react";

export function Example() {
  return (
    <div>
      <ChevronDown />
      <Search />
    </div>
  );
}
`);

    expect(normalizeCode(output)).toContain(
      normalizeCode(`import { ChevronDown, Search } from "lucide-solid";`),
    );
    expect(output).not.toContain(`lucide-react`);
  });
});
