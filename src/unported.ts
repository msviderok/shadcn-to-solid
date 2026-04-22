import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";

export interface UnportedFinding {
  absolutePath: string;
  filePath: string;
  message: string;
}

export interface UnportedFile {
  absolutePath: string;
  filePath: string;
}

const PATTERNS: Array<[RegExp, string]> = [
  [/from\s+["']react["']/, "React import still present"],
  [/from\s+["']@base-ui\/react/, "React Base UI import still present"],
  [/\buseState\s*\(/, "useState call still present"],
  [/\buseEffect\s*\(/, "useEffect call still present"],
  [/\bforwardRef\s*\(/, "forwardRef wrapper still present"],
  [/\bclassName=/, "className JSX prop still present"],
  [/\bReact\./, "React namespace usage still present"],
];

export async function findUnportedFindings(options: {
  cwd: string;
  patterns: string[];
}): Promise<UnportedFinding[]> {
  const files = await fg(options.patterns, {
    cwd: options.cwd,
    onlyFiles: true,
    absolute: true,
  });

  const findings: UnportedFinding[] = [];

  for (const absolutePath of files.sort()) {
    const source = await fs.readFile(absolutePath, "utf8");
    for (const [pattern, message] of PATTERNS) {
      if (pattern.test(source)) {
        findings.push({
          absolutePath,
          filePath: path.relative(options.cwd, absolutePath),
          message,
        });
      }
    }
  }

  return findings;
}

export function listUnportedFiles(findings: UnportedFinding[]): UnportedFile[] {
  const files = new Map<string, UnportedFile>();

  for (const finding of findings) {
    files.set(finding.absolutePath, {
      absolutePath: finding.absolutePath,
      filePath: finding.filePath,
    });
  }

  return [...files.values()].sort((left, right) => left.filePath.localeCompare(right.filePath));
}
