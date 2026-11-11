import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { CardsPerRow, DEFAULT_CARDS_PER_ROW, isCardsPerRow } from './cards-per-row';
import { DEFAULT_THEME_PREFERENCE, isThemePreference, ThemePreference } from './theme';

/**
 * Single versioned localStorage key for visual preferences only. This is the only authorized
 * storage use in the app: it never stores books, filters, searches, photos or secrets.
 */
export const UI_PREFERENCES_STORAGE_KEY = 'mb.ui-preferences.v1';

const UI_PREFERENCES_VERSION = 1;

export interface UiPreferencesSnapshot {
  theme: ThemePreference;
  cardsPerRow: CardsPerRow;
}

/** Pure parser: corrupt, unknown-version or invalid payloads degrade to defaults, never throw. */
export function parseStoredUiPreferences(raw: string | null): UiPreferencesSnapshot {
  const fallback: UiPreferencesSnapshot = {
    theme: DEFAULT_THEME_PREFERENCE,
    cardsPerRow: DEFAULT_CARDS_PER_ROW,
  };
  if (raw === null) return fallback;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return fallback;
  const record = data as Record<string, unknown>;
  // Unknown or missing version discards everything: the shape may change between versions.
  if (record['version'] !== UI_PREFERENCES_VERSION) return fallback;
  return {
    theme: isThemePreference(record['theme']) ? record['theme'] : fallback.theme,
    cardsPerRow: isCardsPerRow(record['cardsPerRow'])
      ? record['cardsPerRow']
      : fallback.cardsPerRow,
  };
}

export function serializeUiPreferences(snapshot: UiPreferencesSnapshot): string {
  return JSON.stringify({
    version: UI_PREFERENCES_VERSION,
    theme: snapshot.theme,
    cardsPerRow: snapshot.cardsPerRow,
  });
}

/**
 * Read-only signals for the global visual preferences plus explicit setters that persist them.
 * Storage failures are ignored: preferences stay in memory and the app keeps working.
 */
@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  private readonly document = inject(DOCUMENT);
  private readonly themeSignal = signal<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  private readonly cardsPerRowSignal = signal<CardsPerRow>(DEFAULT_CARDS_PER_ROW);

  /** Applied color theme preference; `auto` follows the operating system. */
  readonly theme = this.themeSignal.asReadonly();
  /** Catalog card density; never part of the URL, the query or any request. */
  readonly cardsPerRow = this.cardsPerRowSignal.asReadonly();

  constructor() {
    this.readStored();
  }

  setTheme(value: ThemePreference): void {
    if (!isThemePreference(value) || this.theme() === value) return;
    this.themeSignal.set(value);
    this.writeStored();
  }

  setCardsPerRow(value: CardsPerRow): void {
    if (!isCardsPerRow(value) || this.cardsPerRow() === value) return;
    this.cardsPerRowSignal.set(value);
    this.writeStored();
  }

  private readStored(): void {
    let raw: string | null;
    try {
      raw = this.storage?.getItem(UI_PREFERENCES_STORAGE_KEY) ?? null;
    } catch {
      return; // Storage unavailable: in-memory defaults only.
    }
    const stored = parseStoredUiPreferences(raw);
    this.themeSignal.set(stored.theme);
    this.cardsPerRowSignal.set(stored.cardsPerRow);
  }

  private writeStored(): void {
    try {
      this.storage?.setItem(
        UI_PREFERENCES_STORAGE_KEY,
        serializeUiPreferences({ theme: this.theme(), cardsPerRow: this.cardsPerRow() }),
      );
    } catch {
      // Ignore: preferences stay in memory; never break the app for storage failures.
    }
  }

  private get storage(): Storage | null {
    return this.document.defaultView?.localStorage ?? null;
  }
}
