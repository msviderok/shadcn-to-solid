import { execa } from "execa";

type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export async function runShadcn(cwd: string, args: string[]): Promise<void> {
  const packageManager = detectPackageManager(process.env.npm_config_user_agent);
  const [command, commandArgs] = getShadcnCommand(packageManager, args);

  await execa(command, commandArgs, {
    cwd,
    stdio: "inherit",
  });
}

export function detectPackageManager(userAgent: string | undefined): PackageManager {
  if (!userAgent) {
    return "pnpm";
  }

  if (userAgent.startsWith("npm/")) {
    return "npm";
  }
  if (userAgent.startsWith("yarn/")) {
    return "yarn";
  }
  if (userAgent.startsWith("bun/")) {
    return "bun";
  }
  return "pnpm";
}

export function getShadcnCommand(
  packageManager: PackageManager,
  args: string[],
): [string, string[]] {
  switch (packageManager) {
    case "npm":
      return ["npx", ["shadcn@latest", ...args]];
    case "yarn":
      return ["yarn", ["dlx", "shadcn@latest", ...args]];
    case "bun":
      return ["bunx", ["shadcn@latest", ...args]];
    case "pnpm":
    default:
      return ["pnpm", ["dlx", "shadcn@latest", ...args]];
  }
}
