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

export interface ComponentAvailability {
  supported: string[];
  unsupported: string[];
  experimental: string[];
}

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
