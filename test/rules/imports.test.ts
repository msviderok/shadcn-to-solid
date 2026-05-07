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

  it("rewrites ported Base UI primitives to the Solid port package", async () => {
    const output = await transformSource(
      `
import { Accordion } from "@base-ui/react/accordion";

export function Example() {
  return <Accordion.Root />;
}
`,
      "src/components/ui/accordion.tsx",
    );

    expect(output).toContain(`from "@msviderok/base-ui-solid/accordion"`);
  });

  it("rewrites experimental Base UI primitives to the local experimental primitive", async () => {
    const output = await transformSource(
      `
import { Button as ButtonPrimitive } from "@base-ui/react/button";

export function Button() {
  return <ButtonPrimitive />;
}
`,
      "src/components/ui/button.tsx",
    );

    expect(output).toContain(`from "./button-primitive"`);
    expect(output).not.toContain(`@msviderok/base-ui-solid/button`);
  });
});
