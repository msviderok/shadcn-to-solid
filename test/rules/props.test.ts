import { describe, expect, it } from "vite-plus/test";
import { transformSource } from "../helpers.js";

describe("props rewriting", () => {
  it("rewrites destructured props to splitProps and mergeProps", async () => {
    const output = await transformSource(`
type ButtonProps = {
  className?: string;
  size?: "sm" | "lg";
  id?: string;
};

export function Button({ className, size = "sm", id, ...props }: ButtonProps) {
  return <button className={className} data-size={size} id={id} {...props} />;
}
`);

    expect(output).toContain(`import { mergeProps, splitProps } from "solid-js";`);
    expect(output).toContain(`const mergedProps = mergeProps({ size: "sm" as const }, props);`);
    expect(output).toContain(
      `const [local, rest] = splitProps(mergedProps, ["class", "size", "id"]);`,
    );
    expect(output).toContain(`class={local.class}`);
    expect(output).toContain(`data-size={local.size}`);
    expect(output).toContain(`id={local.id}`);
    expect(output).toContain(`{...rest}`);
  });

  it("rewrites concise arrow components with destructured props", async () => {
    const output = await transformSource(`
type ButtonProps = {
  className?: string;
  id?: string;
};

export const Button = ({ className, id, ...props }: ButtonProps) =>
  <button className={className} id={id} {...props} />;
`);

    expect(output).toContain(`import { splitProps } from "solid-js";`);
    expect(output).toContain(`export const Button = (props: ButtonProps) => {`);
    expect(output).toContain(`const [local, rest] = splitProps(props, ["class", "id"]);`);
    expect(output).toContain(`return <button class={local.class} id={local.id} {...rest} />;`);
  });

  it("rewrites destructured props used in shorthand object literals", async () => {
    const output = await transformSource(`
type TabsListProps = {
  variant?: "default" | "line";
  className?: string;
};

export function TabsList({ variant = "default", className }: TabsListProps) {
  return <div className={tabsListVariants({ variant })}>{className}</div>;
}
`);

    expect(output).toContain(
      `const mergedProps = mergeProps({ variant: "default" as const }, props);`,
    );
    expect(output).toContain(
      `const [local, rest] = splitProps(mergedProps, ["variant", "class"]);`,
    );
    expect(output).toContain(`class={tabsListVariants({ variant: local.variant })}`);
    expect(output).toContain(`{local.class}`);
  });

  it("rewrites rest-only destructuring to a plain props parameter", async () => {
    const output = await transformSource(`
type ButtonProps = {
  className?: string;
};

export function Button({ ...rest }: ButtonProps) {
  return <button {...rest} />;
}
`);

    expect(output).toContain(`export function Button(props: ButtonProps) {`);
    expect(output).toContain(`return <button {...props} />;`);
    expect(output).not.toContain(`splitProps`);
    expect(output).not.toContain(`mergeProps`);
  });

  it("casts string literal defaults in merged props to const", async () => {
    const output = await transformSource(`
type TooltipProps = {
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
};

export function TooltipContent({ align = "center", side = "top" }: TooltipProps) {
  return <div data-align={align} data-side={side} />;
}
`);

    expect(output).toContain(`align: "center" as const`);
    expect(output).toContain(`side: "top" as const`);
  });
});
