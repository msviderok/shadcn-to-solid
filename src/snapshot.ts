import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import fg from "fast-glob";

export interface SnapshotEntry {
  mtimeMs: number;
  hash: string;
}

export type Snapshot = Map<string, SnapshotEntry>;

export async function takeSnapshot(cwd: string, roots: string[]): Promise<Snapshot> {
  const files = await fg(
    roots.map((root) => `${root.replaceAll("\\", "/")}/**/*.{ts,tsx,js,jsx,json}`),
    {
      cwd,
      absolute: false,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/*.d.ts", "**/*.d.mts", "**/*.d.cts"],
    },
  );

  const entries = await Promise.all(
    files.map(async (filePath) => {
      const absolutePath = path.join(cwd, filePath);
      const [stat, buffer] = await Promise.all([fs.stat(absolutePath), fs.readFile(absolutePath)]);
      const hash = createHash("sha1").update(buffer).digest("hex");
      return [filePath, { mtimeMs: stat.mtimeMs, hash }] as const;
    }),
  );

  return new Map(entries);
}

export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const changed: string[] = [];

  for (const [filePath, afterEntry] of after) {
    const beforeEntry = before.get(filePath);
    if (
      !beforeEntry ||
      beforeEntry.hash !== afterEntry.hash ||
      beforeEntry.mtimeMs !== afterEntry.mtimeMs
    ) {
      changed.push(filePath);
    }
  }

  return changed.sort();
}
