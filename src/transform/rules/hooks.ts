import {
  Node,
  SyntaxKind,
  type ArrowFunction,
  type CallExpression,
  type FunctionExpression,
} from "ts-morph";
import { addSolidValueImport, type FileTransformContext } from "./_shared.js";

export function rewriteHooks(context: FileTransformContext): void {
  rewriteUseState(context);
  rewriteEffects(context);
  rewriteMemoAndCallback(context);
  rewriteRefs(context);
  rewriteForwardRef(context);
}

function rewriteUseState(context: FileTransformContext): void {
  const declarations = context.sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

  for (const declaration of declarations) {
    const initializer = declaration.getInitializerIfKind(SyntaxKind.CallExpression);
    if (!initializer || !isCalleeNamed(context, initializer, ["useState"])) {
      continue;
    }

    const nameNode = declaration.getNameNode();
    if (!Node.isArrayBindingPattern(nameNode) || nameNode.getElements().length < 2) {
      context.addTodo("hooks", "unsupported useState destructuring", declaration);
      continue;
    }

    const getter = nameNode.getElements()[0]?.getText();
    const setter = nameNode.getElements()[1]?.getText();
    if (!getter || !setter) {
      continue;
    }

    declaration.setInitializer(buildReplacedCallee(initializer, "createSignal"));
    addSolidValueImport(context, "createSignal");
    context.signalGetters.add(getter);
    context.addRule("hooks");
  }
}

function rewriteEffects(context: FileTransformContext): void {
  const calls = context.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    if (isCalleeNamed(context, call, ["useEffect"])) {
      const replacement = buildEffectReplacement(call, "createEffect");
      call.replaceWithText(replacement);
      addSolidValueImport(context, "createEffect");
      if (replacement.includes("on(")) {
        addSolidValueImport(context, "on");
      }
      context.addRule("hooks");
      continue;
    }

    if (isCalleeNamed(context, call, ["useLayoutEffect"])) {
      const replacement = buildEffectReplacement(call, "createRenderEffect");
      call.replaceWithText(replacement);
      addSolidValueImport(context, "createRenderEffect");
      if (replacement.includes("on(")) {
        addSolidValueImport(context, "on");
      }
      context.addRule("hooks");
    }
  }
}

function rewriteMemoAndCallback(context: FileTransformContext): void {
  const calls = context.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    if (isCalleeNamed(context, call, ["useMemo"])) {
      const memoFactory = call.getArguments()[0]?.getText() ?? "() => undefined";
      call.replaceWithText(`createMemo(${memoFactory})`);
      addSolidValueImport(context, "createMemo");
      const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      if (declaration) {
        context.signalGetters.add(declaration.getName());
      }
      context.addRule("hooks");
      continue;
    }

    if (isCalleeNamed(context, call, ["useCallback"])) {
      const fn = call.getArguments()[0];
      if (!fn) {
        continue;
      }
      call.replaceWithText(fn.getText());
      context.addRule("hooks");
    }
  }
}

function rewriteRefs(context: FileTransformContext): void {
  const declarations = context.sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

  for (const declaration of declarations) {
    const initializer = declaration.getInitializerIfKind(SyntaxKind.CallExpression);
    if (!initializer || !isCalleeNamed(context, initializer, ["useRef"])) {
      continue;
    }

    const variableStatement = declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement);
    if (!variableStatement) {
      continue;
    }

    const name = declaration.getName();
    const typeArgument = initializer.getTypeArguments()[0]?.getText();
    const initialValue = initializer.getArguments()[0]?.getText() ?? "undefined";

    if (variableStatement.getDeclarations().length !== 1) {
      context.addTodo(
        "hooks",
        `useRef declaration for "${name}" is part of a multi-declaration statement`,
        variableStatement,
      );
      continue;
    }

    variableStatement.replaceWithText(
      `let ${name}${typeArgument ? `: ${typeArgument}` : ""} = ${initialValue};`,
    );
    context.refs.add(name);
    context.addRule("hooks");
  }

  for (const access of context.sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression,
  )) {
    if (access.getName() !== "current") {
      continue;
    }

    const expression = access.getExpression();
    if (!Node.isIdentifier(expression)) {
      continue;
    }

    if (!context.refs.has(expression.getText())) {
      continue;
    }

    access.replaceWithText(expression.getText());
    context.addRule("hooks");
  }
}

function rewriteForwardRef(context: FileTransformContext): void {
  const calls = context.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    if (!isCalleeNamed(context, call, ["forwardRef"])) {
      continue;
    }

    const fn = call.getArguments()[0];
    if (!fn || (!Node.isArrowFunction(fn) && !Node.isFunctionExpression(fn))) {
      context.addTodo("hooks", "unsupported forwardRef signature", call);
      continue;
    }

    const params = fn.getParameters();
    if (params.length < 2) {
      context.addTodo("hooks", "forwardRef callback missing ref parameter", call);
      continue;
    }

    const propsName = params[0]?.getName() ?? "props";
    const refName = params[1]?.getName();
    if (!refName) {
      continue;
    }

    const rewritten = rewriteForwardRefFunction(fn, propsName, refName);
    call.replaceWithText(rewritten);
    context.addRule("hooks");
  }
}

function rewriteForwardRefFunction(
  fn: ArrowFunction | FunctionExpression,
  propsName: string,
  refName: string,
): string {
  const params = fn
    .getParameters()
    .map((parameter, index) => (index === 0 ? propsName : null))
    .filter(Boolean)
    .join(", ");

  const body = fn
    .getBody()
    .getText()
    .replace(new RegExp(`\\b${escapeRegex(refName)}\\b`, "g"), `${propsName}.ref`);

  if (Node.isArrowFunction(fn)) {
    return `(${params}) => ${body}`;
  }

  return `function (${params}) ${body}`;
}

function buildEffectReplacement(
  call: CallExpression,
  target: "createEffect" | "createRenderEffect",
): string {
  const effect = call.getArguments()[0]?.getText() ?? "() => {}";
  const deps = call.getArguments()[1];
  if (!deps || deps.getText() === "[]" || deps.getText() === "undefined") {
    return `${target}(${effect})`;
  }

  return `${target}(on(() => ${deps.getText()}, () => (${effect})()))`;
}

function buildReplacedCallee(call: CallExpression, nextName: string): string {
  const callee = call.getExpression().getText();
  return call.getText().replace(new RegExp(`\\b${escapeRegex(callee)}\\b`), nextName);
}

function isCalleeNamed(
  context: FileTransformContext,
  call: CallExpression,
  names: string[],
): boolean {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    return names.includes(expression.getText());
  }

  if (!Node.isPropertyAccessExpression(expression)) {
    return false;
  }

  return (
    names.includes(expression.getName()) &&
    Node.isIdentifier(expression.getExpression()) &&
    context.reactNamespaces.has(expression.getExpression().getText())
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
