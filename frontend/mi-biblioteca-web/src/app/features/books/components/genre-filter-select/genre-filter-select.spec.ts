import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { GenreFilterValue } from '../../models/book-filters';
import { GenreFilterSelect } from './genre-filter-select';

@Component({
  imports: [GenreFilterSelect, ReactiveFormsModule],
  template: `<app-genre-filter-select
    [formControl]="filter"
    [options]="options()"
    [optionsLoading]="loading()"
    [optionsError]="error()"
    (interaction)="interactions = interactions + 1"
    (retryOptions)="retries = retries + 1"
  />`,
})
class TestHost {
  readonly filter = new FormControl<GenreFilterValue>(
    { genres: [], genreUnassigned: false },
    { nonNullable: true },
  );
  readonly options = signal<readonly string[]>(['Aventura', 'Fantasía', 'Terror']);
  readonly loading = signal(false);
  readonly error = signal(false);
  interactions = 0;
  retries = 0;
}

describe('GenreFilterSelect catalog multi-select', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function searchInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#genre-filter-search') as HTMLInputElement;
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

  function type(text: string): void {
    const input = searchInput();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function options(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>('.cdk-overlay-container mat-option.genre-option'),
    );
  }

  function findOption(text: string): HTMLElement {
    const option = options().find((element) => element.textContent!.includes(text));
    if (!option) throw new Error(`Missing option ${text}`);
    return option;
  }

  function toggleOption(text: string): void {
    findOption(text).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  }

  it('starts in Todos los géneros and requests options on first interaction', async () => {
    expect(searchInput().placeholder).toBe('Todos los géneros');
    expect(host.filter.value).toEqual({ genres: [], genreUnassigned: false });
    expect(fixture.nativeElement.textContent).toContain('Todos los géneros');
    expect(host.interactions).toBe(0);
    await openPanel();
    expect(host.interactions).toBe(1);
  });

  it('searches, selects several genres with checkboxes and keeps the panel open', async () => {
    await openPanel('fan');
    expect(options()).toHaveLength(1);
    expect(options()[0].textContent).toContain('Fantasía');
    toggleOption('Fantasía');
    await stabilize();
    expect(host.filter.value.genres).toEqual(['Fantasía']);
    expect(searchInput().value).toBe('');
    expect(document.querySelector('.cdk-overlay-container mat-option')).not.toBeNull();
    toggleOption('Terror');
    await stabilize();
    expect(host.filter.value.genres).toEqual(['Fantasía', 'Terror']);
    expect(host.filter.dirty).toBe(true);
  });

  it('toggles a selected suggestion off and removes it from its chip', async () => {
    host.filter.setValue({ genres: ['Terror'], genreUnassigned: false });
    await stabilize();
    await openPanel('terror');
    expect(findOption('Terror').querySelector<HTMLInputElement>('input')?.checked).toBe(true);
    toggleOption('Terror');
    await stabilize();
    expect(host.filter.value.genres).toEqual([]);

    host.filter.setValue({ genres: ['Fantasía'], genreUnassigned: false });
    await stabilize();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Eliminar género Fantasía"]')!
      .click();
    await stabilize();
    expect(host.filter.value.genres).toEqual([]);
  });

  it('combines Sin género with selected genres and clears only the genre filter', async () => {
    host.filter.setValue({ genres: ['Terror'], genreUnassigned: true });
    await stabilize();
    expect(host.filter.value).toEqual({ genres: ['Terror'], genreUnassigned: true });
    expect(fixture.nativeElement.textContent).toContain('Sin género');

    const unassigned = fixture.nativeElement.querySelector(
      '.genre-unassigned input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(unassigned.checked).toBe(true);
    unassigned.click();
    await stabilize();
    expect(host.filter.value.genreUnassigned).toBe(false);

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Limpiar géneros')!
      .click();
    await stabilize();
    expect(host.filter.value).toEqual({ genres: [], genreUnassigned: false });
  });

  it('never creates a custom genre from typed text and caps the selection at 50', async () => {
    await openPanel('Inventado');
    expect(options()).toHaveLength(0);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    searchInput().dispatchEvent(enter);
    await stabilize();
    expect(enter.defaultPrevented).toBe(true);
    expect(host.filter.value.genres).toEqual([]);

    host.filter.setValue({
      genres: Array.from({ length: 50 }, (_, index) => `Género ${index}`),
      genreUnassigned: false,
    });
    host.options.set(['Género extra']);
    type('');
    await stabilize();
    await openPanel();
    toggleOption('Género extra');
    await stabilize();
    expect(host.filter.value.genres).toHaveLength(50);
    expect(fixture.nativeElement.textContent).toContain(
      'Puedes seleccionar un máximo de 50 géneros',
    );
  });

  it('shows loading and load errors with an explicit retry action', async () => {
    host.loading.set(true);
    await stabilize();
    expect(fixture.nativeElement.textContent).toContain('Cargando géneros');
    host.loading.set(false);
    host.error.set(true);
    await stabilize();
    expect(
      fixture.nativeElement.querySelector('.genre-error [role="alert"]')?.textContent,
    ).toContain('No se pudieron cargar los géneros');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.genre-error button')!
      .click();
    expect(host.retries).toBe(1);
  });

  it('exposes accessible labels for the field, options and chips', async () => {
    host.filter.setValue({ genres: ['Fantasía'], genreUnassigned: true });
    await stabilize();
    expect(fixture.nativeElement.querySelector('mat-label')?.textContent).toContain('Géneros');
    expect(
      fixture.nativeElement.querySelector(
        '[aria-label="Géneros seleccionados: Fantasía; y libros sin género"]',
      ),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('button[aria-label="Quitar el filtro Sin género"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Géneros seleccionados: 1 de 50');
    await openPanel();
    expect(findOption('Aventura').getAttribute('aria-label')).toContain('no seleccionado');
  });
});
