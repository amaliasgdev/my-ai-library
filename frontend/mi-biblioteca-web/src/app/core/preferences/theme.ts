/**
 * Global color theme preference. `light` and `dark` apply their Material theme directly;
 * `auto` follows the operating system (`prefers-color-scheme`) and reacts live to changes.
 */
export type ThemePreference = 'light' | 'dark' | 'auto';

/** Starting preference: respect the operating system until the user chooses explicitly. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'auto';

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'auto', label: 'Automático' },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_OPTIONS.some((option) => option.value === value);
}

const THEME_CYCLE: readonly ThemePreference[] = ['light', 'dark', 'auto'];

/** Next preference when the toolbar button cycles through Claro → Oscuro → Automático. */
export function nextThemePreference(value: ThemePreference): ThemePreference {
  return THEME_CYCLE[(THEME_CYCLE.indexOf(value) + 1) % THEME_CYCLE.length];
}

export function themeOptionLabel(value: ThemePreference): string {
  return THEME_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** Class applied to <html> to switch Material (and app) tokens to the dark palette. */
export const APP_DARK_CLASS = 'app-dark';
