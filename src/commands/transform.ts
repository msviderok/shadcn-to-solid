import { createInterface } from "node:readline/promises";
import { loadConfig } from "../config.js";
import { transformFiles } from "../transform/index.js";
import { renderReport } from "../transform/report.js";
import { findUnportedFindings, listUnportedFiles } from "../unported.js";

export interface TransformCommandOptions {
  cwd: string;
  patterns: string[];
  configPath?: string;
  yes: boolean;
  confirm?: (files: string[]) => Promise<boolean>;
}

export async function runTransformCommand(options: TransformCommandOptions): Promise<void> {
  const config = await loadConfig(options.cwd, options.configPath);
  const patterns =
    options.patterns.length > 0 ? options.patterns : [`${config.componentsDir}/**/*.{ts,tsx}`];

  const findings = await findUnportedFindings({
    cwd: options.cwd,
    patterns,
  });
  const files = listUnportedFiles(findings);

  if (files.length === 0) {
    console.log("transform: no unported files found");
    return;
  }

  console.log(`transform: found ${files.length} unported file(s)`);
  for (const file of files) {
    console.log(`- ${file.filePath}`);
  }

  if (
    !(await shouldProceed(
      options,
      files.map((file) => file.filePath),
    ))
  ) {
    console.log("transform: cancelled");
    return;
  }

  const report = await transformFiles({
    cwd: options.cwd,
    config,
    filePaths: files.map((file) => file.absolutePath),
  });

  console.log(renderReport(report));
}

async function shouldProceed(options: TransformCommandOptions, files: string[]): Promise<boolean> {
  if (options.yes) {
    return true;
  }

  if (options.confirm) {
    return options.confirm(files);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'transform: unported files found; rerun with "-y" to confirm non-interactively',
    );
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await readline.question("Transform these files? [y/N] ");
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}
