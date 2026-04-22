import {
  SyntaxKind,
  type ImportSpecifierStructure,
  type Node,
  type OptionalKind,
  type SourceFile,
} from "ts-morph";
import type { ResolvedConfig } from "../../config.js";
import type { FileTransformReport } from "../report.js";

export interface ImportRegistry {
  values: Set<string>;
  types: Set<string>;
}

export interface FileTransformContext {
  sourceFile: SourceFile;
  config: ResolvedConfig;
  report: FileTransformReport;
  imports: ImportRegistry;
  reactNamespaces: Set<string>;
  signalGetters: Set<string>;
  refs: Set<string>;
  appliedRules: Set<string>;
  addRule(ruleId: string): void;
  addTodo(ruleId: string, message: string, node?: Node): void;
}

export function createImportRegistry(): ImportRegistry {
  return {
    values: new Set(),
    types: new Set(),
  };
}

const ATTRIBUTE_RENAMES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeWidth: "stroke-width",
};

export function normalizePropName(name: string): string {
  return ATTRIBUTE_RENAMES[name] ?? name;
}

export function mapImportSource(specifier: string, config: ResolvedConfig): string | undefined {
  const overrideEntry = Object.entries(config.importMap).find(
    ([source]) => specifier === source || specifier.startsWith(`${source}/`),
  );
  if (overrideEntry) {
    const [source, target] = overrideEntry;
    return specifier === source ? target : `${target}${specifier.slice(source.length)}`;
  }

  if (specifier === config.source.package || specifier.startsWith(`${config.source.package}/`)) {
    return specifier === config.source.package
      ? config.target.package
      : `${config.target.package}${specifier.slice(config.source.package.length)}`;
  }

  return undefined;
}

export function addSolidValueImport(context: FileTransformContext, name: string): void {
  context.imports.values.add(name);
}

export function addSolidTypeImport(context: FileTransformContext, name: string): void {
  context.imports.types.add(name);
}

export function syncSolidImports(context: FileTransformContext): void {
  const sourceFile = context.sourceFile;
  const solidImport = sourceFile
    .getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === "solid-js");

  const namedImports = mergeSolidNamedImports(
    solidImport ? getNamedImportsFromDeclaration(solidImport) : [],
    [...context.imports.values].sort().map((name) => ({ name })),
    [...context.imports.types].sort().map((name) => ({ name, isTypeOnly: true })),
  );

  if (namedImports.length === 0) {
    solidImport?.remove();
    return;
  }

  if (solidImport) {
    solidImport.removeNamedImports();
    solidImport.addNamedImports(namedImports);
    return;
  }

  sourceFile.insertImportDeclaration(0, {
    moduleSpecifier: "solid-js",
    namedImports,
  });
}

function getNamedImportsFromDeclaration(
  declaration: import("ts-morph").ImportDeclaration,
): Array<OptionalKind<ImportSpecifierStructure>> {
  return declaration.getNamedImports().map((namedImport) => ({
    name: namedImport.getName(),
    alias: namedImport.getAliasNode()?.getText(),
    isTypeOnly: namedImport.isTypeOnly(),
  }));
}

function mergeSolidNamedImports(
  ...groups: Array<Array<OptionalKind<ImportSpecifierStructure>>>
): Array<OptionalKind<ImportSpecifierStructure>> {
  const merged = new Map<string, OptionalKind<ImportSpecifierStructure>>();

  for (const group of groups) {
    for (const entry of group) {
      const key = `${entry.isTypeOnly ? "type" : "value"}:${entry.name}`;
      if (!merged.has(key)) {
        merged.set(key, entry);
      }
    }
  }

  return [...merged.values()].sort((left, right) => {
    const leftType = left.isTypeOnly ? 1 : 0;
    const rightType = right.isTypeOnly ? 1 : 0;
    return leftType - rightType || left.name.localeCompare(right.name);
  });
}

export function ensureNamedImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  name: string,
): void {
  const existing = sourceFile
    .getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier);

  if (existing) {
    const hasNamedImport = existing
      .getNamedImports()
      .some((namedImport) => namedImport.getName() === name);
    if (!hasNamedImport) {
      existing.addNamedImport(name);
    }
    return;
  }

  sourceFile.insertImportDeclaration(0, {
    moduleSpecifier,
    namedImports: [name],
  });
}

export function isAssignmentTarget(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) {
    return false;
  }

  if (
    parent.isKind(SyntaxKind.BinaryExpression) &&
    parent.getLeft() === node &&
    parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken
  ) {
    return true;
  }

  if (parent.isKind(SyntaxKind.PrefixUnaryExpression)) {
    const operator = parent.getOperatorToken();
    return operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken;
  }

  if (parent.isKind(SyntaxKind.PostfixUnaryExpression)) {
    const operator = parent.getOperatorToken();
    return operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken;
  }

  return false;
}

export function addTodoComment(
  context: FileTransformContext,
  ruleId: string,
  message: string,
  node?: Node,
): void {
  context.report.todos.push(`${ruleId}: ${message}`);
  if (!node) {
    return;
  }

  const statement =
    node.getFirstAncestorByKind(SyntaxKind.VariableStatement) ??
    node.getFirstAncestorByKind(SyntaxKind.ExpressionStatement) ??
    node.getFirstAncestorByKind(SyntaxKind.ReturnStatement) ??
    node.getFirstAncestorByKind(SyntaxKind.IfStatement);

  if (!statement) {
    return;
  }

  const text = statement.getText();
  if (text.includes(`TODO(shadcn-solid): ${ruleId}`)) {
    return;
  }

  statement.replaceWithText(`// TODO(shadcn-solid): ${ruleId} - ${message}\n${text}`);
}
