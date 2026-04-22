import type { ImportDeclaration } from "ts-morph";
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

    const mapped = mapImportSource(specifier, context.config);
    if (mapped && mapped !== specifier) {
      importDeclaration.setModuleSpecifier(mapped);
      context.addRule("imports");
    }
  }

  syncSolidImports(context);
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
