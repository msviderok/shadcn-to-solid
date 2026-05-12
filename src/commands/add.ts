import path from "node:path";
import { resolveAddComponents } from "../add-resolution.js";
import { EXPERIMENTAL_COMPONENTS } from "../component-registry.js";
import { loadConfig } from "../config.js";
import {
  installExperimentalComponents,
  wrapClientOnlyComponentExports,
} from "../experimental-components.js";
import { diffSnapshots, takeSnapshot } from "../snapshot.js";
import { runShadcn } from "../runner.js";
import { renderReport } from "../transform/report.js";
import { transformFiles } from "../transform/index.js";

export interface AddCommandOptions {
  cwd: string;
  names: string[];
  forwardedArgs: string[];
  experimental?: boolean;
  loadProjectConfig?: typeof loadConfig;
  runShadcnCommand?: typeof runShadcn;
  transformProjectFiles?: typeof transformFiles;
  installExperimental?: typeof installExperimentalComponents;
  wrapClientOnlyExports?: typeof wrapClientOnlyComponentExports;
  resolveAddComponents?: typeof resolveAddComponents;
}

export async function runAddCommand(options: AddCommandOptions): Promise<void> {
  const config = await (options.loadProjectConfig ?? loadConfig)(options.cwd);
  const resolution = await (options.resolveAddComponents ?? resolveAddComponents)({
    cwd: options.cwd,
    config,
    names: options.names,
    experimental: Boolean(options.experimental),
  });

  for (const entry of resolution.blocked) {
    console.log(`add: cannot install ${entry.name} (${entry.reason}).`);
  }

  if (resolution.experimentalAvailable.length > 0 && !options.experimental) {
    console.log(
      `add: experimental ${pluralize(resolution.experimentalAvailable.length, "component", "components")} available from this request: ${formatList(resolution.experimentalAvailable)}. Use --experimental to install ${pluralize(resolution.experimentalAvailable.length, "it", "them")}.`,
    );
  }
  const experimentalNames = resolution.experimentalPrimitiveNames;
  if (experimentalNames.length > 0) {
    console.log(`add: installing experimental ${formatList(experimentalNames)}.`);
  }

  const shadcnNames = resolution.shadcnNames;
  if (shadcnNames.length === 0) {
    return;
  }

  const roots = [config.componentsDir, config.libDir];
  const before = await takeSnapshot(options.cwd, roots);

  if (shadcnNames.length > 0) {
    await (options.runShadcnCommand ?? runShadcn)(options.cwd, [
      "add",
      ...shadcnNames,
      ...options.forwardedArgs,
    ]);
  }

  const experimentalFiles =
    experimentalNames.length > 0
      ? await (options.installExperimental ?? installExperimentalComponents)({
          cwd: options.cwd,
          config,
          names: experimentalNames,
        })
      : [];

  const after = await takeSnapshot(options.cwd, roots);
  const changed = diffSnapshots(before, after);
  const clientOnlyFiles = (
    await Promise.all(
      changed
        .filter((filePath) => isComponentSourceFile(filePath, config.componentsDir))
        .map((filePath) =>
          (options.wrapClientOnlyExports ?? wrapClientOnlyComponentExports)(
            options.cwd,
            config,
            path.resolve(options.cwd, filePath),
          ),
        ),
    )
  ).flat();
  const filePaths = new Set([
    ...changed.map((filePath) => path.resolve(options.cwd, filePath)),
    ...experimentalFiles,
    ...clientOnlyFiles,
  ]);

  const report = await (options.transformProjectFiles ?? transformFiles)({
    cwd: options.cwd,
    config,
    filePaths: [...filePaths],
  });

  console.log(renderReport(report));
}

function formatList(values: string[]): string {
  return values.join(", ");
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function listExperimentalComponents(): string[] {
  return [...EXPERIMENTAL_COMPONENTS].sort();
}

function isComponentSourceFile(filePath: string, componentsDir: string): boolean {
  const normalizedFilePath = filePath.replaceAll("\\", "/");
  const normalizedComponentsDir = componentsDir.replaceAll("\\", "/").replace(/\/$/, "");
  return (
    normalizedFilePath.startsWith(`${normalizedComponentsDir}/`) &&
    /\.[jt]sx$/.test(normalizedFilePath) &&
    !normalizedFilePath.endsWith("-primitive.tsx")
  );
}
