import fg from "fast-glob";
import path from "node:path";
import { Project, SyntaxKind, Node } from "ts-morph";
import type { ResolvedConfig } from "./config.js";
import { mapImportSource } from "./transform/rules/_shared.js";
import { findUnportedFindings, type UnportedFinding } from "./unported.js";

export interface DoctorFinding {
  absolutePath: string;
  filePath: string;
  message: string;
  fixable: boolean;
}

export async function findDoctorFindings(options: {
  cwd: string;
  patterns: string[];
  config: ResolvedConfig;
}): Promise<DoctorFinding[]> {
  const files = await fg(options.patterns, {
    cwd: options.cwd,
    onlyFiles: true,
    absolute: true,
  });

  const findings = new Map<string, DoctorFinding>();

  addUnportedFindings(
    findings,
    await findUnportedFindings({
      cwd: options.cwd,
      patterns: options.patterns,
    }),
  );

  if (files.length === 0) {
    return [];
  }

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      jsx: 1,
    },
  });

  for (const absolutePath of files.sort()) {
    project.addSourceFileAtPath(absolutePath);
  }

  for (const absolutePath of files.sort()) {
    const sourceFile = project.getSourceFile(absolutePath);
    if (!sourceFile) {
      continue;
    }

    const filePath = path.relative(options.cwd, absolutePath);

    for (const importDeclaration of sourceFile.getImportDeclarations()) {
      const specifier = importDeclaration.getModuleSpecifierValue();
      const mapped = mapImportSource(specifier, options.config);
      if (mapped && mapped !== specifier) {
        addFinding(findings, {
          absolutePath,
          filePath,
          message: `import "${specifier}" should be rewritten to "${mapped}"`,
          fixable: true,
        });
      }
    }

    const renderAttributes = sourceFile
      .getDescendantsOfKind(SyntaxKind.JsxAttribute)
      .filter((attribute) => attribute.getNameNode().getText() === "render");

    for (const attribute of renderAttributes) {
      const initializer = attribute.getInitializer();
      const expression =
        initializer && Node.isJsxExpression(initializer)
          ? unwrapJsxExpression(initializer)
          : undefined;

      if (
        expression &&
        (Node.isJsxSelfClosingElement(expression) || Node.isJsxElement(expression))
      ) {
        addFinding(findings, {
          absolutePath,
          filePath,
          message:
            "render prop still uses JSX element syntax; use a render function or Solid render object syntax",
          fixable: true,
        });
      }
    }
  }

  return [...findings.values()].sort((left, right) => {
    const pathCompare = left.filePath.localeCompare(right.filePath);
    return pathCompare !== 0 ? pathCompare : left.message.localeCompare(right.message);
  });
}

export function listDoctorFiles(findings: DoctorFinding[]): Array<{
  absolutePath: string;
  filePath: string;
}> {
  const files = new Map<string, { absolutePath: string; filePath: string }>();

  for (const finding of findings) {
    if (!finding.fixable) {
      continue;
    }

    files.set(finding.absolutePath, {
      absolutePath: finding.absolutePath,
      filePath: finding.filePath,
    });
  }

  return [...files.values()].sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function unwrapJsxExpression(
  expression: import("ts-morph").JsxExpression,
): import("ts-morph").Node | undefined {
  let current = expression.getExpression();

  while (current && Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }

  return current;
}

function addUnportedFindings(
  target: Map<string, DoctorFinding>,
  findings: UnportedFinding[],
): void {
  for (const finding of findings) {
    addFinding(target, {
      ...finding,
      fixable: true,
    });
  }
}

function addFinding(target: Map<string, DoctorFinding>, finding: DoctorFinding): void {
  const key = `${finding.absolutePath}::${finding.message}`;
  if (!target.has(key)) {
    target.set(key, finding);
  }
}
