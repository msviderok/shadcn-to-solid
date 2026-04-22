import { Node, SyntaxKind } from "ts-morph";
import { isAssignmentTarget, type FileTransformContext } from "./_shared.js";

export function rewriteSignalCallSites(context: FileTransformContext): void {
  if (!context.config.rules.signalCallSites) {
    return;
  }

  const functions = [
    ...context.sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
    ...context.sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...context.sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction),
  ];

  for (const fn of functions) {
    const declarations = fn.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

    for (const declaration of declarations) {
      const initializer = declaration.getInitializerIfKind(SyntaxKind.CallExpression);
      if (!initializer) {
        continue;
      }

      const expressionText = initializer.getExpression().getText();
      const getterInfo = getAccessorInfo(declaration, expressionText);
      if (!getterInfo) {
        continue;
      }

      const references = getterInfo.declarationNode
        .findReferencesAsNodes()
        .filter(
          (identifier: Node) =>
            identifier.getText() === getterInfo.name &&
            identifier.getStart() >= fn.getStart() &&
            identifier.getEnd() <= fn.getEnd(),
        );

      for (const identifier of references) {
        if (!referencesSameSymbol(identifier, getterInfo.symbol)) {
          const shorthandParent = identifier.getParentIfKind(
            SyntaxKind.ShorthandPropertyAssignment,
          );
          if (!shorthandParent) {
            continue;
          }
        }
        const shorthandParent = identifier.getParentIfKind(SyntaxKind.ShorthandPropertyAssignment);
        if (shorthandParent) {
          shorthandParent.replaceWithText(`${getterInfo.name}: ${getterInfo.name}()`);
          context.addRule("signals");
          continue;
        }
        if (shouldSkipSignalRewrite(identifier)) {
          continue;
        }

        identifier.replaceWithText(`${getterInfo.name}()`);
        context.addRule("signals");
      }
    }
  }
}

function getAccessorInfo(
  declaration: import("ts-morph").VariableDeclaration,
  expressionText: string,
):
  | {
      declarationNode: Node & import("ts-morph").ReferenceFindableNode;
      name: string;
      symbol: import("ts-morph").Symbol;
    }
  | undefined {
  const nameNode = declaration.getNameNode();

  if (expressionText === "createSignal" && Node.isArrayBindingPattern(nameNode)) {
    const getterNode = nameNode.getElements()[0];
    const getterName = getterNode?.getText();
    const getterSymbol = Node.isBindingElement(getterNode) ? getterNode.getSymbol() : undefined;
    if (getterName && getterSymbol && Node.isBindingElement(getterNode)) {
      return {
        declarationNode: getterNode as Node & import("ts-morph").ReferenceFindableNode,
        name: getterName,
        symbol: getterSymbol,
      };
    }
  }

  if (expressionText === "createMemo" && Node.isIdentifier(nameNode)) {
    const getterName = nameNode.getText();
    const getterSymbol = nameNode.getSymbol();
    if (getterName && getterSymbol) {
      return {
        declarationNode: nameNode as Node & import("ts-morph").ReferenceFindableNode,
        name: getterName,
        symbol: getterSymbol,
      };
    }
  }

  return undefined;
}

function shouldSkipSignalRewrite(identifier: Node): boolean {
  const parent = identifier.getParent();
  if (!parent) {
    return true;
  }

  if (
    parent.isKind(SyntaxKind.BindingElement) ||
    parent.isKind(SyntaxKind.VariableDeclaration) ||
    parent.isKind(SyntaxKind.ImportSpecifier) ||
    parent.isKind(SyntaxKind.Parameter)
  ) {
    return true;
  }

  if (parent.isKind(SyntaxKind.CallExpression) && parent.getExpression() === identifier) {
    return true;
  }

  if (parent.isKind(SyntaxKind.PropertyAccessExpression) && parent.getNameNode() === identifier) {
    return true;
  }

  if (parent.isKind(SyntaxKind.PropertyAssignment) && parent.getNameNode() === identifier) {
    return true;
  }

  if (
    parent.isKind(SyntaxKind.ShorthandPropertyAssignment) ||
    parent.isKind(SyntaxKind.JsxAttribute)
  ) {
    return true;
  }

  if (isAssignmentTarget(identifier)) {
    return true;
  }

  return false;
}

function referencesSameSymbol(identifier: Node, symbol: import("ts-morph").Symbol): boolean {
  const identifierSymbol = identifier.getSymbol();
  if (!identifierSymbol) {
    return false;
  }

  return identifierSymbol.getFullyQualifiedName() === symbol.getFullyQualifiedName();
}
