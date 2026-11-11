import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  registerAppIcons,
  THEME_AUTO_ICON,
  THEME_DARK_ICON,
  THEME_LIGHT_ICON,
} from '../../core/icons/app-icons';
import {
  APP_DARK_CLASS,
  nextThemePreference,
  themeOptionLabel,
  ThemePreference,
} from '../../core/preferences/theme';
import { UiPreferencesService } from '../../core/preferences/ui-preferences.service';

@Component({
  selector: 'app-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly preferences = inject(UiPreferencesService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly themeIcons: Record<ThemePreference, string> = {
    light: THEME_LIGHT_ICON,
    dark: THEME_DARK_ICON,
    auto: THEME_AUTO_ICON,
  };
  /** Material tooltip explaining the selected theme; replaces the former native title. */
  protected readonly themeTooltips: Record<ThemePreference, string> = {
    light: 'Tema claro',
    dark: 'Tema oscuro',
    auto: 'Tema automático (según el sistema)',
  };
  protected readonly theme = this.preferences.theme;
  protected readonly themeLabel = computed(() => themeOptionLabel(this.theme()));

  private unlistenSystemTheme: (() => void) | null = null;
  private systemDark: MediaQueryList | null = null;

  constructor() {
    registerAppIcons();
    effect(() => this.applyTheme(this.preferences.theme()));
    this.destroyRef.onDestroy(() => this.unlistenSystemTheme?.());
  }

  /** Cycles the toolbar button through Claro → Oscuro → Automático and persists the choice. */
  protected onThemeChange(): void {
    this.preferences.setTheme(nextThemePreference(this.theme()));
  }

  private applyTheme(preference: ThemePreference): void {
    this.unlistenSystemTheme?.();
    this.unlistenSystemTheme = null;
    const media = this.systemDarkMediaQuery();
    const apply = (): void => {
      const dark = preference === 'dark' || (preference === 'auto' && !!media?.matches);
      this.document.documentElement.classList.toggle(APP_DARK_CLASS, dark);
    };
    apply();
    if (preference !== 'auto' || !media) return;
    media.addEventListener('change', apply);
    this.unlistenSystemTheme = () => media.removeEventListener('change', apply);
  }

  private systemDarkMediaQuery(): MediaQueryList | null {
    if (this.systemDark) return this.systemDark;
    const view = this.document.defaultView;
    if (!view || typeof view.matchMedia !== 'function') return null;
    this.systemDark = view.matchMedia('(prefers-color-scheme: dark)');
    return this.systemDark;
  }
}
