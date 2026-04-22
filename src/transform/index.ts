import path from "node:path";
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
