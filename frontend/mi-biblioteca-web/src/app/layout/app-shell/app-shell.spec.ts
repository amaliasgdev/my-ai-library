import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FocusMonitor } from '@angular/cdk/a11y';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTooltipHarness } from '@angular/material/tooltip/testing';
import { provideRouter } from '@angular/router';
import {
  APP_DARK_CLASS,
  nextThemePreference,
  themeOptionLabel,
} from '../../core/preferences/theme';
import { UI_PREFERENCES_STORAGE_KEY } from '../../core/preferences/ui-preferences.service';
import { AppShell } from './app-shell';

describe('AppShell theme preference', () => {
  let fixture: ComponentFixture<AppShell>;
  let element: HTMLElement;
  type SystemListener = (event: { matches: boolean }) => void;
  // Modern API listeners (our code) and legacy listeners (CDK BreakpointObserver) are tracked
  // separately: the theme assertions must not depend on Material internals.
  const systemListeners: SystemListener[] = [];
  const legacySystemListeners: SystemListener[] = [];
  const systemDark = {
    matches: false,
    addEventListener: (_: string, listener: SystemListener) => {
      systemListeners.push(listener);
    },
    removeEventListener: (_: string, listener: SystemListener) => {
      const index = systemListeners.indexOf(listener);
      if (index >= 0) systemListeners.splice(index, 1);
    },
    addListener: (listener: SystemListener) => {
      legacySystemListeners.push(listener);
    },
    removeListener: (listener: SystemListener) => {
      const index = legacySystemListeners.indexOf(listener);
      if (index >= 0) legacySystemListeners.splice(index, 1);
    },
  };
  let originalMatchMedia: ((query: string) => MediaQueryList) | undefined;

  beforeEach(() => {
    systemListeners.length = 0;
    legacySystemListeners.length = 0;
    systemDark.matches = false;
    localStorage.removeItem(UI_PREFERENCES_STORAGE_KEY);
    document.documentElement.classList.remove(APP_DARK_CLASS);
    const win = window as Window & { matchMedia?: (query: string) => MediaQueryList };
    originalMatchMedia = win.matchMedia;
    win.matchMedia = () => systemDark as unknown as MediaQueryList;
    TestBed.configureTestingModule({ imports: [AppShell], providers: [provideRouter([])] });
  });

  afterEach(() => {
    const win = window as Window & { matchMedia?: (query: string) => MediaQueryList };
    if (originalMatchMedia) win.matchMedia = originalMatchMedia;
    else Reflect.deleteProperty(win, 'matchMedia');
    originalMatchMedia = undefined;
    document.documentElement.classList.remove(APP_DARK_CLASS);
    localStorage.removeItem(UI_PREFERENCES_STORAGE_KEY);
  });

  const boot = (): void => {
    fixture = TestBed.createComponent(AppShell);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };
  const themeButton = (): HTMLButtonElement =>
    element.querySelector('button[aria-label^="Cambiar tema"]')!;
  const loader = () => TestbedHarnessEnvironment.loader(fixture);
  const themeTooltip = () =>
    loader().getHarness(MatTooltipHarness.with({ selector: 'button[aria-label^="Cambiar tema"]' }));
  const stored = () => localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
  const isDark = () => document.documentElement.classList.contains(APP_DARK_CLASS);
  const clickTheme = (): void => {
    themeButton().click();
    fixture.detectChanges();
  };

  it('provides a skip link to the main content and a labelled main navigation', () => {
    boot();
    const skip = element.querySelector<HTMLAnchorElement>('a.skip-link')!;
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(element.querySelector('main#main-content')?.getAttribute('tabindex')).toBe('-1');
    expect(element.querySelector('nav')?.getAttribute('aria-label')).toBe('Navegación principal');
  });

  it('orders Biblioteca, Sagas and Lista de lectura in the main navigation', () => {
    boot();
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('nav a'));
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Biblioteca',
      'Sagas',
      'Lista de lectura',
    ]);
    expect(links[0].getAttribute('href')).toBe('/books');
    expect(links[1].getAttribute('href')).toBe('/sagas');
    expect(links[2].getAttribute('href')).toBe('/reading-list');
  });

  it('renders an accessible theme cycle button showing the current preference', () => {
    boot();
    expect(themeButton().getAttribute('aria-label')).toBe('Cambiar tema (actual: Automático)');
    expect(themeButton().querySelector('mat-icon svg path')).not.toBeNull();
    // The cycle is total: every preference points to the next one and the last wraps around.
    expect(nextThemePreference(nextThemePreference(nextThemePreference('auto')))).toBe('auto');
    expect(themeOptionLabel('light')).toBe('Claro');
    expect(themeOptionLabel('dark')).toBe('Oscuro');
    expect(themeOptionLabel('auto')).toBe('Automático');
  });

  it('explains the selected theme through a tooltip that follows the cycle', async () => {
    boot();
    const tip = await themeTooltip();
    await tip.show();
    expect(await tip.getTooltipText()).toBe('Tema automático (según el sistema)');
    await tip.hide();
    clickTheme();
    await tip.show();
    expect(await tip.getTooltipText()).toBe('Tema claro');
    await tip.hide();
    clickTheme();
    await tip.show();
    expect(await tip.getTooltipText()).toBe('Tema oscuro');
    await tip.hide();
    clickTheme();
    await tip.show();
    expect(await tip.getTooltipText()).toBe('Tema automático (según el sistema)');
    await tip.hide();
    expect(await tip.isOpen()).toBe(false);
  });

  it('shows the tooltip on keyboard focus and hides it on blur', async () => {
    boot();
    const tip = await themeTooltip();
    expect(await tip.isOpen()).toBe(false);
    // Keyboard origin matters: FocusMonitor shows the tooltip only for 'keyboard' focus (Tab).
    TestBed.inject(FocusMonitor).focusVia(themeButton(), 'keyboard');
    await vi.waitFor(async () => expect(await tip.isOpen()).toBe(true));
    expect(await tip.getTooltipText()).toBe('Tema automático (según el sistema)');
    themeButton().blur();
    await vi.waitFor(async () => expect(await tip.isOpen()).toBe(false));
  });

  it('defaults to Automático and follows the light system theme', () => {
    boot();
    expect(isDark()).toBe(false);
    expect(systemListeners).toHaveLength(1);
    expect(stored()).toBeNull();
  });

  it('cycles to Claro, then Oscuro, applying and persisting each choice', () => {
    boot();
    clickTheme();
    expect(themeButton().getAttribute('aria-label')).toBe('Cambiar tema (actual: Claro)');
    expect(isDark()).toBe(false);
    expect(JSON.parse(stored()!)).toEqual({ version: 1, theme: 'light', cardsPerRow: 'auto' });
    clickTheme();
    expect(themeButton().getAttribute('aria-label')).toBe('Cambiar tema (actual: Oscuro)');
    expect(isDark()).toBe(true);
    expect(JSON.parse(stored()!)).toEqual({ version: 1, theme: 'dark', cardsPerRow: 'auto' });
    expect(systemListeners).toHaveLength(0);
  });

  it('Automático reacts live to operating system changes', () => {
    boot();
    clickTheme();
    clickTheme();
    clickTheme();
    expect(themeButton().getAttribute('aria-label')).toBe('Cambiar tema (actual: Automático)');
    expect(JSON.parse(stored()!)).toEqual({ version: 1, theme: 'auto', cardsPerRow: 'auto' });
    systemDark.matches = true;
    for (const listener of [...systemListeners]) listener({ matches: true });
    expect(isDark()).toBe(true);
    systemDark.matches = false;
    for (const listener of [...systemListeners]) listener({ matches: false });
    expect(isDark()).toBe(false);
  });

  it('restores a persisted dark theme at startup', () => {
    localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, theme: 'dark', cardsPerRow: 6 }),
    );
    boot();
    expect(isDark()).toBe(true);
    expect(themeButton().getAttribute('aria-label')).toBe('Cambiar tema (actual: Oscuro)');
    expect(systemListeners).toHaveLength(0);
  });
});
