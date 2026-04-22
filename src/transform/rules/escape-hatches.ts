import { Node, SyntaxKind } from "ts-morph";
import { type FileTransformContext } from "./_shared.js";

const REACT_ESCAPE_HATCHES = ["Children", "cloneElement", "isValidElement", "memo", "lazy"];

export function markEscapeHatches(context: FileTransformContext): void {
  const accesses = context.sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);

  for (const access of accesses) {
    if (
      Node.isIdentifier(access.getExpression()) &&
      context.reactNamespaces.has(access.getExpression().getText()) &&
      REACT_ESCAPE_HATCHES.includes(access.getName())
    ) {
      context.addTodo(
        "escape-hatches",
        `manual Solid rewrite required for React.${access.getName()}`,
        access,
      );
    }
  }
}
