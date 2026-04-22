import { describe, expect, it } from "vite-plus/test";
import { normalizeCode, transformSource } from "../helpers.js";

describe("signal rewriting", () => {
  it("rewrites useState and signal reads", async () => {
    const output = await transformSource(`
import { useState } from "react";

export function Example() {
  const [open, setOpen] = useState(false);

  return (
    <button className={open ? "open" : "closed"} onClick={() => setOpen(!open)}>
      {open ? "Open" : "Closed"}
    </button>
  );
}
`);

    expect(normalizeCode(output)).toContain(
      normalizeCode(`import { createSignal } from "solid-js";`),
    );
    expect(output).toContain(`const [open, setOpen] = createSignal(false);`);
    expect(output).toContain(`class={open() ? "open" : "closed"}`);
    expect(output).toContain(`onClick={() => setOpen(!open())}`);
    expect(output).toContain(`{open() ? "Open" : "Closed"}`);
  });

  it("rewrites signal reads used in shorthand object literals", async () => {
    const output = await transformSource(`
import { useState } from "react";

export function Example() {
  const [open, setOpen] = useState(false);
  const state = { open };

  return <pre onClick={() => setOpen(!open)}>{JSON.stringify(state)}</pre>;
}
`);

    expect(output).toContain(`const [open, setOpen] = createSignal(false);`);
    expect(output).toContain(`const state = { open: open() };`);
  });
});
