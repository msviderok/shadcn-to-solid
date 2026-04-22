import fs from "node:fs/promises";
import path from "node:path";
import jiti from "jiti";

export type StyleUnitKind = "length" | "unitless";

export interface ShadcnSolidConfig {
  source?: {
    package?: string;
    version?: string;
  };
  target?: {
    package?: string;
    version?: string;
  };
  importMap?: Record<string, string>;
  componentsDir?: string;
  libDir?: string;
  styleUnitMap?: Record<string, StyleUnitKind>;
  formatterCommand?: string[];
  rules?: {
    signalCallSites?: boolean;
    onChangeToOnInput?: boolean;
    mapToFor?: boolean;
    styleCamelToKebab?: boolean;
  };
  customRules?: Array<(project: import("ts-morph").Project) => void | Promise<void>>;
}

export interface ResolvedConfig {
  source: {
    package: string;
    version: string;
  };
  target: {
    package: string;
    version: string;
  };
  importMap: Record<string, string>;
  componentsDir: string;
  libDir: string;
  styleUnitMap: Record<string, StyleUnitKind>;
  formatterCommand?: string[];
  rules: {
    signalCallSites: boolean;
    onChangeToOnInput: boolean;
    mapToFor: boolean;
    styleCamelToKebab: boolean;
  };
  customRules: Array<(project: import("ts-morph").Project) => void | Promise<void>>;
  configPath?: string;
}

export const DEFAULT_CONFIG_BASENAME = "shadcn-solid.config.ts";

export const DEFAULT_CONFIG: ResolvedConfig = {
  source: {
    package: "@base-ui/react",
    version: "^1.0.0",
  },
  target: {
    package: "@msviderok/base-ui-solid",
    version: "1.0.0-beta.9",
  },
  importMap: {
    "lucide-react": "lucide-solid",
  },
  componentsDir: "src/components/ui",
  libDir: "src/lib",
  styleUnitMap: {},
  formatterCommand: undefined,
  rules: {
    signalCallSites: true,
    onChangeToOnInput: true,
    mapToFor: true,
    styleCamelToKebab: true,
  },
  customRules: [],
};

export function defineConfig(config: ShadcnSolidConfig): ShadcnSolidConfig {
  return config;
}

export function resolveConfig(
  config: ShadcnSolidConfig | undefined,
  configPath?: string,
): ResolvedConfig {
  return {
    source: {
      ...DEFAULT_CONFIG.source,
      ...config?.source,
    },
    target: {
      ...DEFAULT_CONFIG.target,
      ...config?.target,
    },
    importMap: {
      ...DEFAULT_CONFIG.importMap,
      ...config?.importMap,
    },
    componentsDir: config?.componentsDir ?? DEFAULT_CONFIG.componentsDir,
    libDir: config?.libDir ?? DEFAULT_CONFIG.libDir,
    styleUnitMap: {
      ...DEFAULT_CONFIG.styleUnitMap,
      ...config?.styleUnitMap,
    },
    formatterCommand: config?.formatterCommand ?? DEFAULT_CONFIG.formatterCommand,
    rules: {
      ...DEFAULT_CONFIG.rules,
      ...config?.rules,
    },
    customRules: config?.customRules ?? DEFAULT_CONFIG.customRules,
    configPath,
  };
}

export async function loadConfig(cwd: string, explicitPath?: string): Promise<ResolvedConfig> {
  const configPath = explicitPath
    ? path.resolve(cwd, explicitPath)
    : path.resolve(cwd, DEFAULT_CONFIG_BASENAME);

  try {
    await fs.access(configPath);
  } catch {
    return resolveConfig(undefined);
  }

  const loader = jiti(configPath, { interopDefault: true });
  const loaded = (await loader.import(configPath)) as
    | ShadcnSolidConfig
    | { default?: ShadcnSolidConfig };
  const config = ("default" in loaded ? loaded.default : loaded) as ShadcnSolidConfig;
  return resolveConfig(config, configPath);
}
