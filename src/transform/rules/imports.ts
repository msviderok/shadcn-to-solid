import path from "node:path";
import type { ImportDeclaration } from "ts-morph";
import { getExperimentalPrimitiveFile, hasBaseUiSolidPrimitive } from "../../component-registry.js";
import {
  addSolidTypeImport,
  addSolidValueImport,
  mapImportSource,
  syncSolidImports,
  type FileTransformContext,
} from "./_shared.js";

const REACT_TO_SOLID_VALUES = new Map<string, string>([
  ["createContext", "createContext"],
  ["useContext", "useContext"],
]);

const REACT_TO_SOLID_TYPES = new Map<string, string>([
  ["ReactNode", "JSX"],
  ["ComponentProps", "ComponentProps"],
]);

export function rewriteImports(context: FileTransformContext): void {
  const { sourceFile } = context;

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const specifier = importDeclaration.getModuleSpecifierValue();

    if (specifier === "react") {
      rewriteReactImport(context, importDeclaration);
      continue;
    }

    const mapped = isBaseUiSourceImport(context, specifier)
      ? mapBaseUiImportSource(context, specifier)
      : mapImportSource(specifier, context.config);
    if (mapped && mapped !== specifier) {
      importDeclaration.setModuleSpecifier(mapped);
      context.addRule("imports");
    }
  }

  syncSolidImports(context);
}

function isBaseUiSourceImport(context: FileTransformContext, specifier: string): boolean {
  return (
    specifier === context.config.source.package ||
    specifier.startsWith(`${context.config.source.package}/`)
  );
}

function mapBaseUiImportSource(
  context: FileTransformContext,
  specifier: string,
): string | undefined {
  const sourcePackage = context.config.source.package;
  if (specifier === sourcePackage) {
    return context.config.target.package;
  }
  if (!specifier.startsWith(`${sourcePackage}/`)) {
    return undefined;
  }

  const subpath = specifier.slice(sourcePackage.length + 1);
  const primitiveName = subpath.split("/")[0];
  if (!primitiveName) {
    return undefined;
  }

  if (hasBaseUiSolidPrimitive(primitiveName)) {
    return `${context.config.target.package}/${subpath}`;
  }

  const experimentalPrimitiveFile = getExperimentalPrimitiveFile(primitiveName);
  if (!experimentalPrimitiveFile || !isInComponentsDir(context)) {
    return undefined;
  }

  return getRelativeImportSource(
    context.sourceFile.getDirectoryPath(),
    path.resolve(context.sourceFile.getDirectoryPath(), experimentalPrimitiveFile),
  );
}

function isInComponentsDir(context: FileTransformContext): boolean {
  const componentsDir = context.config.componentsDir.replaceAll("\\", "/").replace(/\/$/, "");
  const filePath = context.sourceFile.getFilePath().replaceAll("\\", "/");
  return filePath.includes(`/${componentsDir}/`) || filePath.startsWith(`${componentsDir}/`);
}

function getRelativeImportSource(fromDir: string, toPathWithoutExtension: string): string {
  const relativePath = path.relative(fromDir, toPathWithoutExtension).replaceAll("\\", "/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function rewriteReactImport(context: FileTransformContext, declaration: ImportDeclaration): void {
  const defaultImport = declaration.getDefaultImport();
  if (defaultImport) {
    context.reactNamespaces.add(defaultImport.getText());
  }

  const namespaceImport = declaration.getNamespaceImport();
  if (namespaceImport) {
    context.reactNamespaces.add(namespaceImport.getText());
  }

  for (const namedImport of declaration.getNamedImports()) {
    const importedName = namedImport.getName();
    const alias = namedImport.getAliasNode()?.getText() ?? importedName;

    const solidValue = REACT_TO_SOLID_VALUES.get(importedName);
    if (solidValue) {
      addSolidValueImport(context, solidValue);
      if (alias !== importedName) {
        context.addTodo(
          "imports",
          `aliased React import "${importedName} as ${alias}" requires review`,
          namedImport,
        );
      }
      context.addRule("imports");
      continue;
    }

    const solidType = REACT_TO_SOLID_TYPES.get(importedName);
    if (solidType === "JSX") {
      addSolidTypeImport(context, "JSX");
      context.addRule("imports");
      continue;
    }
    if (solidType) {
      addSolidTypeImport(context, solidType);
      context.addRule("imports");
    }
  }

  declaration.remove();
}
