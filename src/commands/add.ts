import path from "node:path";
import { classifyComponents, EXPERIMENTAL_COMPONENTS } from "../component-registry.js";
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
}

export async function runAddCommand(options: AddCommandOptions): Promise<void> {
  const config = await (options.loadProjectConfig ?? loadConfig)(options.cwd);
  const availability = classifyComponents(options.names);
  const experimentalNames = options.experimental ? availability.experimental : [];
  const blockedNames = availability.unsupported.filter((name) => !experimentalNames.includes(name));

  if (blockedNames.length > 0) {
    console.log(
      `add: cannot install ${formatList(blockedNames)} because ${pluralize(blockedNames.length, "component is", "components are")} not present in the Base UI Solid port yet.`,
    );
  }

  if (availability.experimental.length > 0 && !options.experimental) {
    console.log(
      `add: experimental ${pluralize(availability.experimental.length, "component", "components")} available from this request: ${formatList(availability.experimental)}. Use --experimental to install ${pluralize(availability.experimental.length, "it", "them")}.`,
    );
  }
  if (experimentalNames.length > 0) {
    console.log(`add: installing experimental ${formatList(experimentalNames)}.`);
  }

  const shadcnNames = [...availability.supported, ...experimentalNames];
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
