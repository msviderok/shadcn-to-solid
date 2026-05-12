import { describe, expect, it } from "vite-plus/test";
import {
  collectBaseUiImportSubpaths,
  getRegistryIndexUrl,
  resolveAddComponents,
} from "../src/add-resolution.js";
import { resolveConfig } from "../src/config.js";

describe("add-resolution", () => {
  it("collects first path segment of configured Base UI package imports", () => {
    const src = `
import { Accordion } from "@base-ui/react/accordion";
import { Button as B } from '@base-ui/react/button';
`;
    expect(collectBaseUiImportSubpaths(src, "@base-ui/react").sort()).toEqual(
      ["accordion", "button"].sort(),
    );
  });

  it("returns empty when no Base UI subpath imports", () => {
    expect(
      collectBaseUiImportSubpaths(
        `import { cn } from "@/lib/utils"\nfunction Card() { return <div /> }`,
        "@base-ui/react",
      ),
    ).toEqual([]);
  });

  it("getRegistryIndexUrl falls back when components.json is missing", async () => {
    const url = await getRegistryIndexUrl("/nonexistent-path-0000");
    expect(url).toBe("https://ui.shadcn.com/r/styles/new-york-v4/registry.json");
  });

  it("resolveAddComponents allows plain registry items without Base UI imports", async () => {
    const index = JSON.stringify({
      items: [{ name: "card", type: "registry:ui" }],
    });
    const item = JSON.stringify({
      name: "card",
      files: [
        {
          path: "registry/new-york-v4/ui/card.tsx",
          content: `import * as React from "react"\nimport { cn } from "@/lib/utils"\nexport function Card() { return <div /> }`,
        },
      ],
    });
    const fetchText = async (url: string) => {
      if (url.endsWith("registry.json")) return index;
      if (url.endsWith("/card.json")) return item;
      return undefined;
    };
    const resolution = await resolveAddComponents({
      cwd: "/tmp",
      config: resolveConfig(undefined),
      names: ["card"],
      experimental: false,
      fetchText,
    });
    expect(resolution.shadcnNames).toEqual(["card"]);
    expect(resolution.experimentalPrimitiveNames).toEqual([]);
    expect(resolution.blocked).toEqual([]);
  });

  it("resolveAddComponents blocks experimental primitives without flag", async () => {
    const index = JSON.stringify({
      items: [{ name: "button", type: "registry:ui" }],
    });
    const item = JSON.stringify({
      name: "button",
      files: [
        {
          path: "ui/button.tsx",
          content: `import { Button as ButtonPrimitive } from "@base-ui/react/button";`,
        },
      ],
    });
    const fetchText = async (url: string) => {
      if (url.endsWith("registry.json")) return index;
      if (url.endsWith("/button.json")) return item;
      return undefined;
    };
    const resolution = await resolveAddComponents({
      cwd: "/tmp",
      config: resolveConfig(undefined),
      names: ["button"],
      experimental: false,
      fetchText,
    });
    expect(resolution.shadcnNames).toEqual([]);
    expect(resolution.experimentalAvailable).toEqual(["button"]);
    expect(resolution.blocked[0]?.name).toBe("button");
    expect(resolution.blocked[0]?.reason).toContain("experimental");
  });

  it("resolveAddComponents allows experimental primitives with flag", async () => {
    const index = JSON.stringify({
      items: [{ name: "button", type: "registry:ui" }],
    });
    const item = JSON.stringify({
      name: "button",
      files: [
        {
          path: "ui/button.tsx",
          content: `import { Button as ButtonPrimitive } from "@base-ui/react/button";`,
        },
      ],
    });
    const fetchText = async (url: string) => {
      if (url.endsWith("registry.json")) return index;
      if (url.endsWith("/button.json")) return item;
      return undefined;
    };
    const resolution = await resolveAddComponents({
      cwd: "/tmp",
      config: resolveConfig(undefined),
      names: ["button"],
      experimental: true,
      fetchText,
    });
    expect(resolution.shadcnNames).toEqual(["button"]);
    expect(resolution.experimentalPrimitiveNames).toEqual(["button"]);
    expect(resolution.blocked).toEqual([]);
  });

  it("resolveAddComponents blocks names missing from registry index", async () => {
    const index = JSON.stringify({ items: [{ name: "card", type: "registry:ui" }] });
    const fetchText = async (url: string) => (url.endsWith("registry.json") ? index : undefined);
    const resolution = await resolveAddComponents({
      cwd: "/tmp",
      config: resolveConfig(undefined),
      names: ["not-in-registry-xyz"],
      experimental: false,
      fetchText,
    });
    expect(resolution.shadcnNames).toEqual([]);
    expect(resolution.blocked[0]?.reason).toContain("not listed");
  });
});
