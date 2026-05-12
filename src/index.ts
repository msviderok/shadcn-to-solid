export {
  DEFAULT_CONFIG_BASENAME,
  DEFAULT_CONFIG,
  defineConfig,
  loadConfig,
  resolveConfig,
  type ResolvedConfig,
  type ShadcnSolidConfig,
  type StyleUnitKind,
} from "./config.js";
export {
  resolveAddComponents,
  getRegistryIndexUrl,
  collectBaseUiImportSubpaths,
  type AddComponentResolution,
  type ResolveAddComponentsOptions,
} from "./add-resolution.js";
export {
  BASE_UI_SOLID_COMPONENTS,
  EXPERIMENTAL_COMPONENTS,
  EXPERIMENTAL_PRIMITIVE_FILES,
  classifyComponents,
  getExperimentalPrimitiveFile,
  hasBaseUiSolidPrimitive,
  type ComponentAvailability,
} from "./component-registry.js";
