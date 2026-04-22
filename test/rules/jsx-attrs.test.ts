import { describe, expect, it } from "vite-plus/test";
import { transformSource } from "../helpers.js";

describe("jsx attribute rewriting", () => {
  it("rewrites self-closing render elements to Solid render objects", async () => {
    const output = await transformSource(`
import { Menu } from "@base-ui/react/menu";

export function Example() {
  return (
    <Menu.Trigger
      render={<button className="foo" data-side="left" style={{ fontSize: 12 }} />}
    />
  );
}
`);

    expect(output).toContain(`import { Menu } from "@msviderok/base-ui-solid/menu";`);
    expect(output).toContain(`render={{`);
    expect(output).toContain(`component: "button"`);
    expect(output).toContain(`class: "foo"`);
    expect(output).toContain(`"data-side": "left"`);
    expect(output).toContain(`style: { "font-size": "12px" }`);
  });

  it("rewrites render elements with children to render callbacks", async () => {
    const output = await transformSource(`
import { Dialog } from "@base-ui/react/dialog";

export function Example() {
  return <Dialog.Trigger render={<button className="foo">Open</button>} />;
}
`);

    expect(output).toContain(`import { mergeProps } from "@msviderok/base-ui-solid/merge-props";`);
    expect(output).toContain(`render={(renderProps) =>`);
    expect(output).toContain(`{...mergeProps(renderProps, { class: "foo" })}`);
    expect(output).toContain(`>Open</button>`);
  });
});
