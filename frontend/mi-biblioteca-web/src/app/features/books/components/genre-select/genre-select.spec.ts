import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { GenreSelect } from './genre-select';

@Component({
  imports: [GenreSelect, ReactiveFormsModule],
  template: `<app-genre-select [formControl]="genres" />`,
})
class TestHost {
  readonly genres = new FormControl<string[]>([], { nonNullable: true });
}

describe('GenreSelect multi selection', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;
  let component: GenreSelect;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
    component = fixture.debugElement.query(By.directive(GenreSelect))
      .componentInstance as GenreSelect;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function searchInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#genre-search') as HTMLInputElement;
  }
  function type(text: string): void {
    const input = searchInput();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  async function stabilize(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  async function openPanel(query = ''): Promise<void> {
    searchInput().focus();
    if (query) type(query);
    await stabilize();
  }
  function panelOpen(): boolean {
    return document.querySelector('.cdk-overlay-container .mat-mdc-autocomplete-panel') !== null;
  }
  function optionTexts(): string[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>('.cdk-overlay-container mat-option.genre-option'),
    ).map((option) => option.textContent!.trim());
  }
  function findOption(text: string): HTMLElement {
    const option = Array.from(
      document.querySelectorAll<HTMLElement>('.cdk-overlay-container mat-option.genre-option'),
    ).find((element) => element.textContent!.includes(text));
    if (!option) throw new Error(`Missing option ${text}`);
    return option;
  }
  function notice(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.genre-notice');
  }

  it('starts empty without placeholder genres and exposes the search field', async () => {
    expect(host.genres.value).toEqual([]);
    expect(host.genres.valid).toBe(true);
    expect(searchInput()).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Hasta 10 géneros');
    expect(fixture.nativeElement.textContent).not.toContain('Sin género');
    expect(panelOpen()).toBe(false);
  });

  it('selects one and several genres with checkboxes, keeping the panel open', async () => {
    await openPanel();
    findOption('Aventura').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await stabilize();
    expect(host.genres.value).toEqual(['Aventura']);
    expect(panelOpen()).toBe(true);
    findOption('Fantasía').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await stabilize();
    expect(host.genres.value).toEqual(['Aventura', 'Fantasía']);
    expect(host.genres.dirty).toBe(true);
  });

  it('filters suggestions while typing and keeps matching selected values toggleable', async () => {
    await openPanel('novela');
    expect(optionTexts()).toEqual(['Novela gráfica', 'Novela histórica', 'Novela negra']);
    host.genres.setValue(['Novela negra']);
    await stabilize();
    expect(optionTexts()).toEqual(['Novela gráfica', 'Novela histórica', 'Novela negra']);
    expect(
      findOption('Novela negra').querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(true);
    host.genres.setValue(['Novela gráfica', 'Novela histórica', 'Novela negra']);
    await stabilize();
    expect(optionTexts()).toEqual(['Novela gráfica', 'Novela histórica', 'Novela negra']);
  });

  it('shows the no-matches message for unknown searches without inventing a genre', async () => {
    await openPanel('zzz sin coincidencias');
    expect(optionTexts()).toEqual([]);
    expect(
      document.querySelector('.cdk-overlay-container mat-option.genre-empty')?.textContent,
    ).toContain('Sin coincidencias. Escribe un género nuevo y pulsa Intro');
    expect(host.genres.value).toEqual([]);
  });

  it('adds a custom genre with Enter when there is no active option', async () => {
    await openPanel(' Novela negra clásica ');
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    } as KeyboardEventInit);
    searchInput().dispatchEvent(enter);
    await stabilize();
    expect(enter.defaultPrevented).toBe(true);
    expect(host.genres.value).toEqual(['Novela negra clásica']);
    expect(searchInput().value).toBe('');
    expect(component.searchControl.value).toBe('');
    expect(
      fixture.nativeElement.querySelector(
        'button[aria-label="Eliminar género Novela negra clásica"]',
      ),
    ).not.toBeNull();
  });

  it('confirms the active option with Enter and clears the search draft', async () => {
    await openPanel('fanta');
    expect(component.options()).toEqual(['Fantasía']);
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    } as KeyboardEventInit);
    searchInput().dispatchEvent(enter);
    await stabilize();
    expect(enter.defaultPrevented).toBe(true);
    expect(host.genres.value).toEqual(['Fantasía']);
    expect(component.searchControl.value).toBe('');
    expect(searchInput().value).toBe('');
  });

  it('supports keyboard-only navigation to a suggestion and confirmation', async () => {
    await openPanel('fanta');
    const input = searchInput();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
    );
    await stabilize();
    expect(host.genres.value).toEqual(['Fantasía']);
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('supports keyboard deselection of a selected suggestion', async () => {
    host.genres.setValue(['Fantasía']);
    await stabilize();
    await openPanel('fanta');
    const input = searchInput();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
    );
    await stabilize();
    expect(host.genres.value).toEqual([]);
  });

  it('rejects a custom genre longer than the API limit and keeps the draft visible', async () => {
    const custom = 'x'.repeat(51);
    await openPanel(custom);
    searchInput().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
    );
    await stabilize();
    expect(host.genres.value).toEqual([]);
    expect(component.searchControl.value).toBe(custom);
    expect(fixture.nativeElement.textContent).toContain(
      'El género no puede superar los 50 caracteres',
    );
  });

  it('rejects adding duplicates ignoring case, spaces and accents with a visible notice', async () => {
    host.genres.setValue(['Fantasía']);
    await stabilize();
    expect(component.toggle(' fantasía ')).toBe(false);
    expect(host.genres.value).toEqual(['Fantasía']);
    expect(component.toggle('FANTASÍA')).toBe(false);
    expect(host.genres.value).toEqual(['Fantasía']);
    fixture.detectChanges();
    expect(notice()?.textContent).toContain('«FANTASÍA» ya está seleccionado');
    expect(notice()?.getAttribute('role')).toBe('alert');
  });

  it('rejects a duplicate custom genre ignoring accents and shows a notice', async () => {
    host.genres.setValue(['Fantasía']);
    await stabilize();
    await openPanel('Fantasia');
    component.onSearchEnter(new KeyboardEvent('keydown', { cancelable: true }));
    fixture.detectChanges();
    expect(host.genres.value).toEqual(['Fantasía']);
    expect(notice()?.textContent).toContain('«Fantasia» ya está seleccionado');
  });

  it('rejects more than ten genres with a visible notice and keeps ten selected', () => {
    for (let i = 0; i < 10; i++) {
      expect(component.toggle(`Género ${i}`)).toBe(true);
    }
    expect(host.genres.value).toHaveLength(10);
    expect(component.toggle('Otro')).toBe(false);
    expect(host.genres.value).toHaveLength(10);
    fixture.detectChanges();
    expect(notice()?.textContent).toContain('Puedes seleccionar un máximo de 10 géneros');
  });

  it('removes genres individually through their chips', async () => {
    host.genres.setValue(['Aventura', 'Fantasía']);
    await stabilize();
    const chips = fixture.nativeElement.querySelectorAll('mat-chip');
    expect(chips).toHaveLength(2);
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Eliminar género Aventura"]',
      ) as HTMLButtonElement
    ).click();
    await stabilize();
    expect(host.genres.value).toEqual(['Fantasía']);
    expect(
      fixture.nativeElement.querySelector('button[aria-label="Eliminar género Aventura"]'),
    ).toBeNull();
  });

  it('announces the selection count in the accessible chip label', async () => {
    host.genres.setValue(['Aventura', 'Fantasía']);
    await stabilize();
    const chipSet = fixture.nativeElement.querySelector('mat-chip-set');
    expect(chipSet.getAttribute('aria-label')).toBe('Géneros seleccionados: 2 de 10');
  });

  it('marks the parent control touched on focus changes', async () => {
    expect(host.genres.touched).toBe(false);
    searchInput().focus();
    searchInput().blur();
    await stabilize();
    expect(host.genres.touched).toBe(true);
  });

  it('disables the search and chip removal while blocked, without losing data', async () => {
    host.genres.setValue(['Aventura']);
    host.genres.disable();
    await stabilize();
    expect(searchInput().disabled).toBe(true);
    expect(
      fixture.nativeElement.querySelector('button[aria-label="Eliminar género Aventura"]'),
    ).toHaveProperty('disabled', true);
    expect(component.toggle('Fantasía')).toBe(false);
    expect(host.genres.value).toEqual(['Aventura']);
    host.genres.enable();
    await stabilize();
    expect(searchInput().disabled).toBe(false);
  });

  it('never adds the search draft automatically when the host form is submitted', async () => {
    await openPanel('ciencia');
    expect(component.options()).toEqual(['Ciencia ficción']);
    // The draft remains a draft: only explicit actions persist genres.
    expect(host.genres.value).toEqual([]);
    expect(component.searchControl.value).toBe('ciencia');
  });
});
