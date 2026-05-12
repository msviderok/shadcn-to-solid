export const BASE_UI_SOLID_COMPONENTS = new Set([
  "accordion",
  "alert-dialog",
  "avatar",
  "checkbox",
  "checkbox-group",
  "collapsible",
  "composite",
  "context-menu",
  "dialog",
  "direction-provider",
  "field",
  "fieldset",
  "form",
  "input",
  "menu",
  "menubar",
  "meter",
  "navigation-menu",
  "number-field",
  "popover",
  "preview-card",
  "progress",
  "radio",
  "radio-group",
  "scroll-area",
  "select",
  "separator",
  "slider",
  "switch",
  "tabs",
  "toast",
  "toggle",
  "toggle-group",
  "toolbar",
  "tooltip",
]);

export const EXPERIMENTAL_COMPONENTS = new Set(["button"]);

export const EXPERIMENTAL_PRIMITIVE_FILES = new Map([["button", "button-primitive"]]);

export interface ComponentAvailability {
  supported: string[];
  unsupported: string[];
  experimental: string[];
}

/** Classifies names by Base UI Solid port membership only (not shadcn registry). Prefer {@link resolveAddComponents} for `add` behavior. */
export function classifyComponents(names: string[]): ComponentAvailability {
  const uniqueNames = [...new Set(names)];
  const supported: string[] = [];
  const unsupported: string[] = [];
  const experimental: string[] = [];

  for (const name of uniqueNames) {
    if (BASE_UI_SOLID_COMPONENTS.has(name)) {
      supported.push(name);
    } else {
      unsupported.push(name);
      if (EXPERIMENTAL_COMPONENTS.has(name)) {
        experimental.push(name);
      }
    }
  }

  return {
    supported,
    unsupported,
    experimental,
  };
}

export function hasBaseUiSolidPrimitive(name: string): boolean {
  return BASE_UI_SOLID_COMPONENTS.has(name);
}

export function getExperimentalPrimitiveFile(name: string): string | undefined {
  return EXPERIMENTAL_PRIMITIVE_FILES.get(name);
}
