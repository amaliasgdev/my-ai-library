import { TestBed } from '@angular/core/testing';
import { DEFAULT_CARDS_PER_ROW } from './cards-per-row';
import { DEFAULT_THEME_PREFERENCE } from './theme';
import {
  parseStoredUiPreferences,
  serializeUiPreferences,
  UI_PREFERENCES_STORAGE_KEY,
  UiPreferencesService,
} from './ui-preferences.service';

describe('parseStoredUiPreferences', () => {
  it('returns defaults for absent, corrupt, non-object or unknown-version payloads', () => {
    for (const raw of [null, '', 'not json', '{', 'null', '[]', '"dark"', '{"version":2}']) {
      expect(parseStoredUiPreferences(raw)).toEqual({
        theme: DEFAULT_THEME_PREFERENCE,
        cardsPerRow: DEFAULT_CARDS_PER_ROW,
      });
    }
  });

  it('restores valid values and ignores unknown extras', () => {
    expect(
      parseStoredUiPreferences(
        JSON.stringify({ version: 1, theme: 'dark', cardsPerRow: 6, extra: 'ignored' }),
      ),
    ).toEqual({ theme: 'dark', cardsPerRow: 6 });
  });

  it('validates each field independently', () => {
    expect(
      parseStoredUiPreferences(JSON.stringify({ version: 1, theme: 'pink', cardsPerRow: 8 })),
    ).toEqual({ theme: DEFAULT_THEME_PREFERENCE, cardsPerRow: 8 });
    expect(
      parseStoredUiPreferences(JSON.stringify({ version: 1, theme: 'light', cardsPerRow: '4' })),
    ).toEqual({ theme: 'light', cardsPerRow: DEFAULT_CARDS_PER_ROW });
    expect(
      parseStoredUiPreferences(JSON.stringify({ version: 1, theme: 'auto', cardsPerRow: 99 })),
    ).toEqual({ theme: 'auto', cardsPerRow: DEFAULT_CARDS_PER_ROW });
  });
});

describe('serializeUiPreferences', () => {
  it('writes exactly the version and the two visual preferences', () => {
    const raw = serializeUiPreferences({ theme: 'dark', cardsPerRow: 10 });
    expect(JSON.parse(raw)).toEqual({ version: 1, theme: 'dark', cardsPerRow: 10 });
    expect(parseStoredUiPreferences(raw)).toEqual({ theme: 'dark', cardsPerRow: 10 });
  });
});

describe('UiPreferencesService', () => {
  beforeEach(() => {
    localStorage.removeItem(UI_PREFERENCES_STORAGE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(UI_PREFERENCES_STORAGE_KEY);
  });

  const service = () => TestBed.inject(UiPreferencesService);

  it('starts with Automático theme and the original responsive grid', () => {
    expect(service().theme()).toBe('auto');
    expect(service().cardsPerRow()).toBe('auto');
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it('restores persisted values at construction', () => {
    localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, theme: 'dark', cardsPerRow: 8 }),
    );
    expect(service().theme()).toBe('dark');
    expect(service().cardsPerRow()).toBe(8);
  });

  it('persists theme changes under the single versioned key', () => {
    service().setTheme('dark');
    const stored = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    expect(JSON.parse(stored!)).toEqual({ version: 1, theme: 'dark', cardsPerRow: 'auto' });
  });

  it('persists density changes keeping the current theme', () => {
    service().setTheme('light');
    service().setCardsPerRow(6);
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)!)).toEqual({
      version: 1,
      theme: 'light',
      cardsPerRow: 6,
    });
    expect(service().cardsPerRow()).toBe(6);
  });

  it('does not rewrite storage for unchanged values', () => {
    service().setTheme('dark');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    service().setTheme('dark');
    service().setCardsPerRow('auto');
    expect(setItem).not.toHaveBeenCalled();
    expect(service().theme()).toBe('dark');
  });

  it('ignores invalid values without writing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const instance = service();
    instance.setTheme('neon' as never);
    instance.setCardsPerRow(99 as never);
    expect(instance.theme()).toBe('auto');
    expect(instance.cardsPerRow()).toBe('auto');
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it('keeps working when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const instance = service();
    expect(instance.theme()).toBe('auto');
    expect(instance.cardsPerRow()).toBe('auto');
    expect(() => instance.setTheme('dark')).not.toThrow();
    expect(instance.theme()).toBe('dark');
  });
});
