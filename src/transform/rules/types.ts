import { addSolidTypeImport, type FileTransformContext } from "./_shared.js";

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bReact\.ComponentProps\b/g, "ComponentProps"],
  [/\bReact\.HTMLAttributes\b/g, "JSX.HTMLAttributes"],
  [/\bReact\.CSSProperties\b/g, "JSX.CSSProperties"],
  [/\bReact\.ReactNode\b/g, "JSX.Element"],
  [/\bReactNode\b/g, "JSX.Element"],
];

export function rewriteTypes(context: FileTransformContext): void {
  let text = context.sourceFile.getFullText();
  const nextText = REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );

  if (nextText !== text) {
    context.sourceFile.replaceWithText(nextText);
    text = nextText;
    context.addRule("types");
  }

  if (text.includes("ComponentProps")) {
    addSolidTypeImport(context, "ComponentProps");
  }
  if (text.includes("JSX.")) {
    addSolidTypeImport(context, "JSX");
  }
}
