import path from "node:path";

export interface FileTransformReport {
  filePath: string;
  appliedRules: string[];
  todos: string[];
}

export interface TransformReport {
  files: FileTransformReport[];
}

export function createTransformReport(): TransformReport {
  return { files: [] };
}

export function createFileReport(filePath: string): FileTransformReport {
  return {
    filePath,
    appliedRules: [],
    todos: [],
  };
}

export function renderReport(report: TransformReport): string {
  if (report.files.length === 0) {
    return "shadcn-solid: no files transformed";
  }

  const lines: string[] = [];
  lines.push(`shadcn-solid: transformed ${report.files.length} file(s)`);

  for (const file of report.files) {
    lines.push(`- ${file.filePath}`);
    lines.push(`  rules: ${file.appliedRules.length > 0 ? file.appliedRules.join(", ") : "none"}`);
    if (file.todos.length > 0) {
      lines.push(`  todos: ${file.todos.length}`);
      for (const todo of file.todos) {
        lines.push(`  - ${todo}`);
      }
    }
  }

  return lines.join("\n");
}

export function relativeReportPath(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath) || filePath;
}
