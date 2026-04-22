import { loadConfig } from "../config.js";
import { findDoctorFindings, listDoctorFiles } from "../doctor-findings.js";
import { transformFiles } from "../transform/index.js";
import { renderReport } from "../transform/report.js";

export interface DoctorCommandOptions {
  cwd: string;
  patterns: string[];
  configPath?: string;
  write: boolean;
}

export async function runDoctorCommand(options: DoctorCommandOptions): Promise<void> {
  const config = await loadConfig(options.cwd, options.configPath);
  const patterns =
    options.patterns.length > 0
      ? options.patterns
      : [`${config.componentsDir}/**/*.{ts,tsx}`, `${config.libDir}/**/*.{ts,tsx}`];

  const findings = await findDoctorFindings({
    cwd: options.cwd,
    patterns,
    config,
  });

  if (findings.length === 0) {
    console.log("doctor: no issues found");
    return;
  }

  for (const finding of findings) {
    console.log(`${finding.filePath}: ${finding.message}`);
  }

  if (!options.write) {
    return;
  }

  const files = listDoctorFiles(findings);
  if (files.length === 0) {
    console.log("doctor: no auto-fixable files found");
    return;
  }

  const report = await transformFiles({
    cwd: options.cwd,
    config,
    filePaths: files.map((file) => file.absolutePath),
  });

  console.log(renderReport(report));
}
