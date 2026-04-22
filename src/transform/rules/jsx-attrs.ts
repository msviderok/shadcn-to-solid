import {
  Node,
  SyntaxKind,
  type JsxAttribute,
  type JsxAttributeLike,
  type JsxElement,
  type JsxExpression,
  type JsxSelfClosingElement,
  type ObjectLiteralExpression,
} from "ts-morph";
import {
  addSolidValueImport,
  ensureNamedImport,
  normalizePropName,
  type FileTransformContext,
} from "./_shared.js";

const LENGTH_PROPERTIES = new Set([
  "width",
  "height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "top",
  "right",
  "bottom",
  "left",
  "font-size",
  "line-height",
  "border-radius",
  "gap",
]);

const UNITLESS_PROPERTIES = new Set([
  "opacity",
  "z-index",
  "flex",
  "font-weight",
  "order",
  "line-height",
]);

export function rewriteJsxAttributes(context: FileTransformContext): void {
  renameSimpleAttributes(context);
  rewriteStyleObjects(context);
  rewriteRenderProps(context);
  rewriteMapToFor(context);
}

function renameSimpleAttributes(context: FileTransformContext): void {
  const attributes = context.sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attribute of attributes) {
    const nameNode = attribute.getNameNode();
    const name = nameNode.getText();
    const normalized = normalizePropName(name);
    if (normalized !== name) {
      nameNode.replaceWithText(normalized);
      context.addRule("jsx-attrs");
    }

    if (name === "onChange" && context.config.rules.onChangeToOnInput && isFormTag(attribute)) {
      nameNode.replaceWithText("onInput");
      context.addRule("jsx-attrs");
      if (getTagName(attribute) === "select") {
        context.addTodo("jsx-attrs", "review select onChange -> onInput semantics", attribute);
      }
    }
  }
}

function rewriteStyleObjects(context: FileTransformContext): void {
  if (!context.config.rules.styleCamelToKebab) {
    return;
  }

  const attributes = context.sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attribute of attributes) {
    if (attribute.getNameNode().getText() !== "style") {
      continue;
    }

    const initializer = attribute.getInitializer();
    const expression =
      initializer && Node.isJsxExpression(initializer) ? initializer.getExpression() : undefined;
    if (!expression || !Node.isObjectLiteralExpression(expression)) {
      continue;
    }

    rewriteStyleObject(context, expression);
  }
}

function rewriteStyleObject(
  context: FileTransformContext,
  objectLiteral: ObjectLiteralExpression,
): void {
  for (const property of objectLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      context.addTodo("jsx-attrs", "unsupported style object property", property);
      continue;
    }

    const nameNode = property.getNameNode();
    const rawName = nameNode.getText().replaceAll(/['"]/g, "");
    const propertyName = camelToKebab(rawName);
    const unitOverride = context.config.styleUnitMap[propertyName];
    const kind =
      unitOverride ??
      (UNITLESS_PROPERTIES.has(propertyName)
        ? "unitless"
        : LENGTH_PROPERTIES.has(propertyName)
          ? "length"
          : undefined);

    const initializer = property.getInitializer();
    if (!initializer) {
      continue;
    }

    let nextValue = initializer.getText();
    if (Node.isNumericLiteral(initializer)) {
      nextValue =
        kind === "length" && shouldAppendPx(propertyName, initializer.getLiteralText())
          ? JSON.stringify(`${initializer.getLiteralText()}px`)
          : JSON.stringify(initializer.getLiteralText());
    } else if (Node.isStringLiteral(initializer)) {
      nextValue = initializer.getText();
    } else if (kind === "length") {
      context.addTodo(
        "jsx-attrs",
        `review style value for "${propertyName}" before runtime`,
        property,
      );
    }

    property.replaceWithText(`${JSON.stringify(propertyName)}: ${nextValue}`);
    context.addRule("jsx-attrs");
  }
}

function rewriteMapToFor(context: FileTransformContext): void {
  if (!context.config.rules.mapToFor) {
    return;
  }

  const expressions = context.sourceFile.getDescendantsOfKind(SyntaxKind.JsxExpression);

  for (const jsxExpression of expressions) {
    const expression = jsxExpression.getExpression();
    if (!expression || !Node.isCallExpression(expression)) {
      continue;
    }

    const callee = expression.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "map") {
      continue;
    }

    const callback = expression.getArguments()[0];
    if (!callback || (!Node.isArrowFunction(callback) && !Node.isFunctionExpression(callback))) {
      continue;
    }

    let eachText = callee.getExpression().getText();
    if (Node.isIdentifier(callee.getExpression()) && context.signalGetters.has(eachText)) {
      eachText = `${eachText}()`;
    }

    jsxExpression.replaceWithText(`<For each={${eachText}}>${callback.getText()}</For>`);
    addSolidValueImport(context, "For");
    context.addRule("jsx-attrs");
  }
}

function rewriteRenderProps(context: FileTransformContext): void {
  const attributes = context.sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxAttribute)
    .filter((attribute) => attribute.getNameNode().getText() === "render")
    .sort((left, right) => right.getStart() - left.getStart());

  for (const attribute of attributes) {
    const initializer = attribute.getInitializer();
    const expression =
      initializer && Node.isJsxExpression(initializer)
        ? unwrapJsxExpression(initializer)
        : undefined;
    if (!expression) {
      continue;
    }

    if (Node.isJsxSelfClosingElement(expression)) {
      rewriteRenderElementAttribute(context, attribute, expression);
      continue;
    }

    if (Node.isJsxElement(expression)) {
      rewriteRenderElementAttribute(context, attribute, expression);
    }
  }
}

function rewriteRenderElementAttribute(
  context: FileTransformContext,
  attribute: JsxAttribute,
  element: JsxSelfClosingElement | JsxElement,
): void {
  if (canUseRenderObject(element)) {
    const renderObject = createRenderObjectText(element);
    if (renderObject) {
      attribute.replaceWithText(`render={${renderObject}}`);
      context.addRule("jsx-attrs");
      return;
    }
  }

  const callback = createRenderFunctionText(context, element);
  attribute.replaceWithText(`render={${callback}}`);
  context.addRule("jsx-attrs");
}

function unwrapJsxExpression(expression: JsxExpression): Node | undefined {
  let current = expression.getExpression();

  while (current && Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }

  return current;
}

function canUseRenderObject(element: JsxSelfClosingElement | JsxElement): boolean {
  if (Node.isJsxSelfClosingElement(element)) {
    return !hasComponentOverrideAttribute(element.getAttributes());
  }

  return (
    getMeaningfulJsxChildren(element).length === 0 &&
    !hasComponentOverrideAttribute(element.getOpeningElement().getAttributes())
  );
}

function hasComponentOverrideAttribute(attributes: JsxAttributeLike[]): boolean {
  return attributes.some((property: JsxAttributeLike) => {
    if (!Node.isJsxAttribute(property)) {
      return false;
    }
    return normalizePropName(property.getNameNode().getText()) === "component";
  });
}

function createRenderObjectText(element: JsxSelfClosingElement | JsxElement): string | undefined {
  const tagName = getRenderTargetText(element);
  if (!tagName) {
    return undefined;
  }

  const entries = serializeJsxAttributes(elementAttributes(element));
  return `{ component: ${tagName}${entries.length > 0 ? `, ${entries.join(", ")}` : ""} }`;
}

function createRenderFunctionText(
  context: FileTransformContext,
  element: JsxSelfClosingElement | JsxElement,
): string {
  const tagName = getElementTagName(element);
  const propsExpression = createMergedRenderPropsText(context, elementAttributes(element));

  if (Node.isJsxSelfClosingElement(element)) {
    return `(renderProps) => <${tagName} {...${propsExpression}} />`;
  }

  const childrenText = element
    .getChildren()
    .filter((child) => !Node.isJsxOpeningElement(child) && !Node.isJsxClosingElement(child))
    .map((child) => child.getText())
    .join("");

  return `(renderProps) => <${tagName} {...${propsExpression}}>${childrenText}</${tagName}>`;
}

function createMergedRenderPropsText(
  context: FileTransformContext,
  attributes: JsxAttributeLike[],
): string {
  const sources = serializeJsxAttributeSources(attributes);
  if (sources.length === 0) {
    return "renderProps";
  }

  ensureNamedImport(
    context.sourceFile,
    `${context.config.target.package}/merge-props`,
    "mergeProps",
  );
  return `mergeProps(renderProps, ${sources.join(", ")})`;
}

function getRenderTargetText(element: JsxSelfClosingElement | JsxElement): string | undefined {
  const tagName = getElementTagName(element);
  if (/^[a-z][\w-]*$/.test(tagName)) {
    return JSON.stringify(tagName);
  }
  return tagName;
}

function elementAttributes(element: JsxSelfClosingElement | JsxElement): JsxAttributeLike[] {
  return Node.isJsxSelfClosingElement(element)
    ? element.getAttributes()
    : element.getOpeningElement().getAttributes();
}

function getElementTagName(element: JsxSelfClosingElement | JsxElement): string {
  return Node.isJsxSelfClosingElement(element)
    ? element.getTagNameNode().getText()
    : element.getOpeningElement().getTagNameNode().getText();
}

function serializeJsxAttributes(attributes: JsxAttributeLike[]): string[] {
  return attributes.flatMap((property: JsxAttributeLike) => {
    if (Node.isJsxSpreadAttribute(property)) {
      const expression = property.getExpression();
      return expression ? [`...${expression.getText()}`] : [];
    }

    return [serializeJsxAttribute(property)];
  });
}

function serializeJsxAttributeSources(attributes: JsxAttributeLike[]): string[] {
  return attributes.flatMap((property: JsxAttributeLike) => {
    if (Node.isJsxSpreadAttribute(property)) {
      const expression = property.getExpression();
      return expression ? [expression.getText()] : [];
    }

    return [`{ ${serializeJsxAttribute(property)} }`];
  });
}

function serializeJsxAttribute(attribute: JsxAttributeLike): string {
  if (!Node.isJsxAttribute(attribute)) {
    throw new Error("Expected JSX attribute");
  }

  const propertyName = normalizePropName(attribute.getNameNode().getText());
  const initializer = attribute.getInitializer();
  const value = serializeJsxAttributeValue(propertyName, initializer);
  return `${formatObjectKey(propertyName)}: ${value}`;
}

function serializeJsxAttributeValue(
  propertyName: string,
  initializer: ReturnType<JsxAttribute["getInitializer"]>,
): string {
  if (!initializer) {
    return "true";
  }

  if (Node.isStringLiteral(initializer)) {
    return initializer.getText();
  }

  if (!Node.isJsxExpression(initializer)) {
    return initializer.getText();
  }

  const expression = unwrapJsxExpression(initializer);
  if (!expression) {
    return "true";
  }

  if (propertyName === "style" && Node.isObjectLiteralExpression(expression)) {
    return expression.getText();
  }

  return expression.getText();
}

function formatObjectKey(propertyName: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(propertyName)
    ? propertyName
    : JSON.stringify(propertyName);
}

function getMeaningfulJsxChildren(element: JsxElement): Node[] {
  return element.getChildren().filter((child) => {
    if (Node.isJsxOpeningElement(child) || Node.isJsxClosingElement(child)) {
      return false;
    }

    return !Node.isJsxText(child) || child.getText().trim().length > 0;
  });
}

function isFormTag(attribute: JsxAttribute): boolean {
  const tag = getTagName(attribute);
  return tag === "input" || tag === "textarea" || tag === "select";
}

function getTagName(attribute: JsxAttribute): string | undefined {
  const openingElement =
    attribute.getFirstAncestorByKind(SyntaxKind.JsxOpeningElement) ??
    attribute.getFirstAncestorByKind(SyntaxKind.JsxSelfClosingElement);
  return openingElement?.getTagNameNode().getText();
}

function camelToKebab(value: string): string {
  return value
    .replace(/^Webkit/, "-webkit")
    .replace(/^Moz/, "-moz")
    .replace(/^ms/, "-ms")
    .replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function shouldAppendPx(propertyName: string, value: string): boolean {
  if (propertyName === "line-height") {
    return Number(value) > 1;
  }
  return true;
}
