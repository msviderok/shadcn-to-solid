import {
  Node,
  SyntaxKind,
  type ArrowFunction,
  type BindingElement,
  type FunctionDeclaration,
  type FunctionExpression,
} from "ts-morph";
import {
  addSolidValueImport,
  isNodeWithinScope,
  normalizePropName,
  referencesSameSymbol,
  type FileTransformContext,
} from "./_shared.js";

interface BindingInfo {
  aliasName: string;
  declarationNode: Node & import("ts-morph").ReferenceFindableNode;
  propName: string;
  defaultValue?: string;
  symbol: import("ts-morph").Symbol | undefined;
}

interface RestBindingInfo {
  aliasName: string;
  symbol: import("ts-morph").Symbol | undefined;
}

export function rewriteProps(context: FileTransformContext): void {
  const functions: Array<FunctionDeclaration | FunctionExpression | ArrowFunction> = [
    ...context.sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
    ...context.sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...context.sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction),
  ];

  for (const fn of functions) {
    const body = fn.getBody();
    const parameter = fn.getParameters()[0];
    if (!body || !parameter) {
      continue;
    }

    const nameNode = parameter.getNameNode();
    if (!Node.isObjectBindingPattern(nameNode)) {
      continue;
    }

    const bindings = nameNode.getElements();
    const restBinding = bindings.find((binding) => binding.getDotDotDotToken() != null);
    const propBindings = bindings.filter((binding) => binding.getDotDotDotToken() == null);
    const typeText = parameter.getTypeNode()?.getText();

    if (propBindings.length === 0) {
      if (!restBinding) {
        continue;
      }

      const originalRestName = restBinding.getName();
      if (originalRestName !== "props") {
        replaceRestReferences(
          context,
          body,
          {
            aliasName: originalRestName,
            symbol: restBinding.getNameNode().getSymbol(),
          },
          "props",
        );
      }

      parameter.replaceWithText(`props${typeText ? `: ${typeText}` : ""}`);
      context.addRule("props");
      continue;
    }

    const originalRestName = restBinding?.getName();
    const restName = originalRestName && originalRestName !== "props" ? originalRestName : "rest";
    const bindingInfo = propBindings.map(toBindingInfo);
    replaceBindingReferences(context, body, bindingInfo);
    if (restBinding && originalRestName && restName !== originalRestName) {
      replaceRestReferences(
        context,
        body,
        {
          aliasName: originalRestName,
          symbol: restBinding.getNameNode().getSymbol(),
        },
        restName,
      );
    }

    parameter.replaceWithText(`props${typeText ? `: ${typeText}` : ""}`);

    const defaults = bindingInfo
      .filter((binding) => binding.defaultValue)
      .map((binding) => `${JSON.stringify(binding.propName)}: ${binding.defaultValue}`);

    const sourceObject = defaults.length > 0 ? "mergedProps" : "props";
    const statements: string[] = [];

    if (defaults.length > 0) {
      statements.push(`const mergedProps = mergeProps({ ${defaults.join(", ")} }, props);`);
      addSolidValueImport(context, "mergeProps");
    }

    const keys = bindingInfo.map((binding) => JSON.stringify(binding.propName)).join(", ");
    statements.push(`const [local, ${restName}] = splitProps(${sourceObject}, [${keys}]);`);

    prependStatements(body, statements);
    addSolidValueImport(context, "splitProps");
    context.addRule("props");
  }
}

function toBindingInfo(binding: BindingElement): BindingInfo {
  const aliasName = binding.getNameNode().getText();
  const propertyName = binding.getPropertyNameNode()?.getText() ?? aliasName;

  return {
    aliasName,
    declarationNode: binding.getNameNode() as Node & import("ts-morph").ReferenceFindableNode,
    propName: normalizePropName(propertyName),
    defaultValue: binding.getInitializer()?.getText(),
    symbol: binding.getNameNode().getSymbol(),
  };
}

function replaceBindingReferences(
  context: FileTransformContext,
  body: Node,
  bindings: BindingInfo[],
): void {
  for (const binding of bindings) {
    const matches = binding.declarationNode
      .findReferencesAsNodes()
      .filter(
        (identifier: Node) =>
          identifier.getText() === binding.aliasName &&
          isNodeWithinScope(body, identifier) &&
          !isDeclarationIdentifier(identifier),
      )
      .sort((left: Node, right: Node) => right.getStart() - left.getStart());

    for (const identifier of matches) {
      const shorthandParent = identifier.getParentIfKind(SyntaxKind.ShorthandPropertyAssignment);
      if (!referencesSameSymbol(identifier, binding.symbol) && !shorthandParent) {
        continue;
      }

      if (shorthandParent) {
        shorthandParent.replaceWithText(`${binding.aliasName}: local.${binding.propName}`);
        context.addRule("props");
        continue;
      }

      identifier.replaceWithText(`local.${binding.propName}`);
      context.addRule("props");
    }
  }
}

function isDeclarationIdentifier(identifier: Node): boolean {
  const parent = identifier.getParent();
  return Boolean(
    parent &&
    (parent.isKind(SyntaxKind.BindingElement) ||
      parent.isKind(SyntaxKind.JsxAttribute) ||
      parent.isKind(SyntaxKind.PropertyAssignment)),
  );
}

function replaceRestReferences(
  context: FileTransformContext,
  body: Node,
  restBinding: RestBindingInfo,
  nextName: string,
): void {
  const matches = body
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(
      (identifier) =>
        identifier.getText() === restBinding.aliasName &&
        referencesRestBinding(identifier, restBinding) &&
        !isDeclarationIdentifier(identifier),
    )
    .sort((left, right) => right.getStart() - left.getStart());

  for (const identifier of matches) {
    identifier.replaceWithText(nextName);
    context.addRule("props");
  }
}

function referencesRestBinding(identifier: Node, binding: RestBindingInfo): boolean {
  if (!binding.symbol) {
    return false;
  }

  const symbol = identifier.getSymbol();
  if (!symbol) {
    return false;
  }

  return symbol.getFullyQualifiedName() === binding.symbol.getFullyQualifiedName();
}

function prependStatements(body: Node, statements: string[]): void {
  if (Node.isBlock(body)) {
    body.insertStatements(0, statements);
    return;
  }

  const expressionText = body.getText();
  body.replaceWithText(`{\n${[...statements, `return ${expressionText};`].join("\n")}\n}`);
}
