import fs from "node:fs/promises";
import path from "node:path";
import prettier from "prettier";

export async function formatFile(filePath: string): Promise<void> {
  const source = await fs.readFile(filePath, "utf8");
  const options = (await prettier.resolveConfig(filePath)) ?? {};
  const parser = inferParser(filePath);

  const formatted = await prettier.format(source, {
    ...options,
    filepath: filePath,
    parser,
  });

  if (formatted !== source) {
    await fs.writeFile(filePath, formatted, "utf8");
  }
}

function inferParser(filePath: string): prettier.BuiltInParserName {
  const extension = path.extname(filePath);
  switch (extension) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "typescript";
    case ".js":
      return "babel";
    case ".jsx":
      return "babel";
    case ".json":
      return "json";
    default:
      return "typescript";
  }
}
