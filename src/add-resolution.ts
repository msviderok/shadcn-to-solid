import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "./config.js";
import { EXPERIMENTAL_COMPONENTS, hasBaseUiSolidPrimitive } from "./component-registry.js";

export interface AddComponentResolution {
  registryIndexUrl: string;
  shadcnNames: string[];
  experimentalPrimitiveNames: string[];
  blocked: Array<{ name: string; reason: string }>;
  experimentalAvailable: string[];
}

export interface ResolveAddComponentsOptions {
  cwd: string;
  config: ResolvedConfig;
  names: string[];
  experimental: boolean;
  fetchText?: (url: string) => Promise<string | undefined>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getRegistryIndexUrl(cwd: string): Promise<string> {
  const componentsPath = path.join(cwd, "components.json");
  let raw: string;
  try {
    raw = await fs.readFile(componentsPath, "utf8");
  } catch {
    return "https://ui.shadcn.com/r/styles/new-york-v4/registry.json";
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return "https://ui.shadcn.com/r/styles/new-york-v4/registry.json";
  }
  const registry = json.registry;
  if (typeof registry === "string" && registry.includes("{name}")) {
    const index = registry
      .replace(/\{name\}\.json$/i, "registry.json")
      .replace(/\{name\}$/i, "registry.json");
    if (index.includes("registry.json")) {
      return index;
    }
  }
  const style = typeof json.style === "string" ? json.style : "new-york";
  const styleSegment = style.endsWith("-v4") ? style : `${style}-v4`;
  return `https://ui.shadcn.com/r/styles/${styleSegment}/registry.json`;
}

export function collectBaseUiImportSubpaths(source: string, sourcePackage: string): string[] {
  const pkg = escapeRegExp(sourcePackage);
  const re = new RegExp(`${pkg}/([^"'\\s]+)`, "g");
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const full = m[1];
    if (!full) continue;
    const segment = full.split("/")[0];
    if (segment) {
      out.add(segment);
    }
  }
  return [...out];
}

function itemJsonUrl(registryIndexUrl: string, name: string): string {
  if (!registryIndexUrl.endsWith("registry.json")) {
    return `${registryIndexUrl.replace(/\/?$/, "/")}${name}.json`;
  }
  return registryIndexUrl.replace(/registry\.json$/i, `${name}.json`);
}

function registryNamesFromIndexJson(text: string): Set<string> | undefined {
  let json: { items?: Array<{ name?: string }> };
  try {
    json = JSON.parse(text) as { items?: Array<{ name?: string }> };
  } catch {
    return undefined;
  }
  const items = json.items;
  if (!Array.isArray(items)) {
    return undefined;
  }
  const names = new Set<string>();
  for (const item of items) {
    if (typeof item.name === "string") {
      names.add(item.name);
    }
  }
  return names;
}

function concatRegistryItemSources(text: string): string {
  let json: { files?: Array<{ content?: string }> };
  try {
    json = JSON.parse(text) as { files?: Array<{ content?: string }> };
  } catch {
    return "";
  }
  const files = json.files;
  if (!Array.isArray(files)) {
    return "";
  }
  return files.map((f) => (typeof f.content === "string" ? f.content : "")).join("\n");
}

function defaultFetchText(url: string): Promise<string | undefined> {
  return fetch(url, { redirect: "follow" }).then((r) => (r.ok ? r.text() : undefined));
}

type PrimitivePortCheck =
  | { status: "ok" }
  | { status: "unported"; primitives: string[] }
  | { status: "needsExperimental"; primitives: string[] };

function checkPrimitiveSubpaths(subpaths: string[], experimental: boolean): PrimitivePortCheck {
  const missing: string[] = [];
  const needExperimental: string[] = [];
  for (const p of subpaths) {
    if (hasBaseUiSolidPrimitive(p)) {
      continue;
    }
    if (EXPERIMENTAL_COMPONENTS.has(p)) {
      if (!experimental) {
        needExperimental.push(p);
      }
      continue;
    }
    missing.push(p);
  }
  if (missing.length > 0) {
    return { status: "unported", primitives: missing };
  }
  if (needExperimental.length > 0) {
    return { status: "needsExperimental", primitives: needExperimental };
  }
  return { status: "ok" };
}

function formatList(values: string[]): string {
  if (values.length === 1) {
    return `"${values[0]}"`;
  }
  return values.map((v) => `"${v}"`).join(", ");
}

export async function resolveAddComponents(
  options: ResolveAddComponentsOptions,
): Promise<AddComponentResolution> {
  const fetchText = options.fetchText ?? defaultFetchText;
  const registryIndexUrl = await getRegistryIndexUrl(options.cwd);
  const indexText = await fetchText(registryIndexUrl);
  const registryNames = indexText ? registryNamesFromIndexJson(indexText) : undefined;
  const uniqueNames = [...new Set(options.names)];
  const blocked: Array<{ name: string; reason: string }> = [];
  const shadcnNames: string[] = [];
  const experimentalPrimitiveNames: string[] = [];
  const experimentalAvailable: string[] = [];

  if (!registryNames || registryNames.size === 0) {
    for (const name of uniqueNames) {
      blocked.push({
        name,
        reason: `could not load shadcn registry index (${registryIndexUrl})`,
      });
    }
    return {
      registryIndexUrl,
      shadcnNames: [],
      experimentalPrimitiveNames: [],
      blocked,
      experimentalAvailable,
    };
  }

  for (const name of uniqueNames) {
    if (!registryNames.has(name)) {
      blocked.push({
        name,
        reason: `not listed in the shadcn registry (${registryIndexUrl})`,
      });
      continue;
    }
    const itemUrl = itemJsonUrl(registryIndexUrl, name);
    const itemText = await fetchText(itemUrl);
    if (!itemText) {
      blocked.push({
        name,
        reason: `could not load registry item (${itemUrl})`,
      });
      continue;
    }
    const sources = concatRegistryItemSources(itemText);
    const subpaths = collectBaseUiImportSubpaths(sources, options.config.source.package);
    if (subpaths.length === 0) {
      shadcnNames.push(name);
      continue;
    }
    const check = checkPrimitiveSubpaths(subpaths, options.experimental);
    if (check.status === "unported") {
      blocked.push({
        name,
        reason: `depends on Base UI primitive ${formatList(check.primitives)} not available in the Solid port yet`,
      });
      continue;
    }
    if (check.status === "needsExperimental") {
      experimentalAvailable.push(name);
      blocked.push({
        name,
        reason: `depends on experimental Base UI primitive ${formatList(check.primitives)}; use --experimental to install`,
      });
      continue;
    }
    shadcnNames.push(name);
    if (
      subpaths.some((p) => EXPERIMENTAL_COMPONENTS.has(p)) &&
      !experimentalPrimitiveNames.includes(name)
    ) {
      experimentalPrimitiveNames.push(name);
    }
  }

  return {
    registryIndexUrl,
    shadcnNames,
    experimentalPrimitiveNames,
    blocked,
    experimentalAvailable: [...new Set(experimentalAvailable)].sort(),
  };
}
