import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { ModuleKind, Project, ScriptTarget, ts } from "ts-morph";
import type { ResolvedConfig } from "../config.js";
import { formatFile } from "./format.js";
import {
  createFileReport,
  createTransformReport,
  relativeReportPath,
  type TransformReport,
} from "./report.js";
import {
  addTodoComment,
  createImportRegistry,
  syncSolidImports,
  type FileTransformContext,
} from "./rules/_shared.js";
import { markEscapeHatches } from "./rules/escape-hatches.js";
import { rewriteHooks } from "./rules/hooks.js";
import { rewriteImports } from "./rules/imports.js";
import { rewriteJsxAttributes } from "./rules/jsx-attrs.js";
import { rewriteProps } from "./rules/props.js";
import { rewriteSignalCallSites } from "./rules/signals.js";
import { rewriteTypes } from "./rules/types.js";

export interface TransformFilesOptions {
  cwd: string;
  config: ResolvedConfig;
  filePaths: string[];
}

export async function transformFiles(options: TransformFilesOptions): Promise<TransformReport> {
  const report = createTransformReport();
  const filePaths = dedupeTransformFiles(options.filePaths);
  if (filePaths.length === 0) {
    return report;
  }

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      target: ScriptTarget.ES2022,
      module: ModuleKind.ESNext,
    },
  });

  for (const filePath of filePaths) {
    project.addSourceFileAtPath(filePath);
  }

  for (const filePath of filePaths) {
    const sourceFile = project.getSourceFile(filePath);
    if (!sourceFile) {
      continue;
    }

    const fileReport = createFileReport(relativeReportPath(options.cwd, filePath));
    const context = createContext(sourceFile, options.config, fileReport);

    rewriteImports(context);
    rewriteHooks(context);
    rewriteSignalCallSites(context);
    rewriteProps(context);
    rewriteJsxAttributes(context);
    rewriteTypes(context);
    markEscapeHatches(context);

    for (const customRule of options.config.customRules) {
      await customRule(project);
      context.addRule("custom");
    }

    syncSolidImports(context);
    sourceFile.organizeImports();
    await sourceFile.save();
    await formatFile(filePath);

    report.files.push(fileReport);
  }

  await runFormatterCommand(options, filePaths);

  return report;
}

function createContext(
  sourceFile: import("ts-morph").SourceFile,
  config: ResolvedConfig,
  report: import("./report.js").FileTransformReport,
): FileTransformContext {
  const appliedRules = new Set<string>();

  return {
    sourceFile,
    config,
    report,
    imports: createImportRegistry(),
    reactNamespaces: new Set(["React"]),
    signalGetters: new Set(),
    refs: new Set(),
    appliedRules,
    addRule(ruleId) {
      if (!appliedRules.has(ruleId)) {
        appliedRules.add(ruleId);
        report.appliedRules.push(ruleId);
      }
    },
    addTodo(ruleId, message, node) {
      addTodoComment(this, ruleId, message, node);
    },
  };
}

function dedupeTransformFiles(filePaths: string[]): string[] {
  return [...new Set(filePaths.map((filePath) => path.resolve(filePath)))]
    .filter(isTransformableSourceFile)
    .sort();
}

async function runFormatterCommand(
  options: TransformFilesOptions,
  filePaths: string[],
): Promise<void> {
  const commandParts = await resolveFormatterCommand(options);
  if (!commandParts || commandParts.length === 0) {
    return;
  }

  const [command, ...args] = commandParts.flatMap((part) =>
    part === "{files}" ? filePaths : [part],
  );
  if (!command) {
    return;
  }

  await execa(command, args, {
    cwd: options.cwd,
    preferLocal: true,
    stdio: "inherit",
  });
}

async function resolveFormatterCommand(
  options: TransformFilesOptions,
): Promise<string[] | undefined> {
  if (options.config.formatterCommand && options.config.formatterCommand.length > 0) {
    return options.config.formatterCommand;
  }

  const packageJson = await readPackageJson(options.cwd);

  if (usesVitePlus(packageJson) || (await hasLocalBinary(options.cwd, "vp"))) {
    return ["vp", "fmt", "{files}"];
  }

  if (
    usesBiome(packageJson) ||
    (await hasLocalBinary(options.cwd, "biome")) ||
    (await hasBiomeConfig(options.cwd))
  ) {
    return ["biome", "format", "--write", "{files}"];
  }

  if (
    usesPrettier(packageJson) ||
    (await hasLocalBinary(options.cwd, "prettier")) ||
    (await hasPrettierConfig(options.cwd))
  ) {
    return ["prettier", "--write", "{files}"];
  }

  return undefined;
}

async function readPackageJson(cwd: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await fs.readFile(path.join(cwd, "package.json"), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function usesVitePlus(packageJson: Record<string, unknown> | undefined): boolean {
  return hasPackage(packageJson, "vite-plus");
}

function usesBiome(packageJson: Record<string, unknown> | undefined): boolean {
  return hasPackage(packageJson, "@biomejs/biome") || hasPackage(packageJson, "biome");
}

function usesPrettier(packageJson: Record<string, unknown> | undefined): boolean {
  return hasPackage(packageJson, "prettier");
}

function hasPackage(
  packageJson: Record<string, unknown> | undefined,
  packageName: string,
): boolean {
  if (!packageJson) {
    return false;
  }

  const dependencyFields = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ];

  return dependencyFields.some(
    (field) => typeof field === "object" && field !== null && packageName in field,
  );
}

async function hasLocalBinary(cwd: string, name: string): Promise<boolean> {
  try {
    await fs.access(path.join(cwd, "node_modules", ".bin", name));
    return true;
  } catch {
    return false;
  }
}

async function hasBiomeConfig(cwd: string): Promise<boolean> {
  return hasAnyFile(cwd, ["biome.json", "biome.jsonc"]);
}

async function hasPrettierConfig(cwd: string): Promise<boolean> {
  return hasAnyFile(cwd, [
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.yml",
    ".prettierrc.yaml",
    ".prettierrc.json5",
    ".prettierrc.js",
    ".prettierrc.cjs",
    ".prettierrc.mjs",
    "prettier.config.js",
    "prettier.config.cjs",
    "prettier.config.mjs",
  ]);
}

async function hasAnyFile(cwd: string, fileNames: string[]): Promise<boolean> {
  for (const fileName of fileNames) {
    try {
      await fs.access(path.join(cwd, fileName));
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

function isTransformableSourceFile(filePath: string): boolean {
  const normalizedPath = filePath.replaceAll("\\", "/");

  if (normalizedPath.includes("/node_modules/")) {
    return false;
  }

  if (/\.d\.(?:cts|mts|ts)$/.test(normalizedPath)) {
    return false;
  }

  return /\.(?:[cm]?[jt]sx?)$/.test(normalizedPath);
}
