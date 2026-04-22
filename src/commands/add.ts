import path from "node:path";
import { loadConfig } from "../config.js";
import { diffSnapshots, takeSnapshot } from "../snapshot.js";
import { runShadcn } from "../runner.js";
import { renderReport } from "../transform/report.js";
import { transformFiles } from "../transform/index.js";

export interface AddCommandOptions {
  cwd: string;
  names: string[];
  forwardedArgs: string[];
}

export async function runAddCommand(options: AddCommandOptions): Promise<void> {
  const config = await loadConfig(options.cwd);
  const roots = [config.componentsDir, config.libDir];
  const before = await takeSnapshot(options.cwd, roots);

  await runShadcn(options.cwd, ["add", ...options.names, ...options.forwardedArgs]);

  const after = await takeSnapshot(options.cwd, roots);
  const changed = diffSnapshots(before, after);

  const report = await transformFiles({
    cwd: options.cwd,
    config,
    filePaths: changed.map((filePath) => path.resolve(options.cwd, filePath)),
  });

  console.log(renderReport(report));
}
