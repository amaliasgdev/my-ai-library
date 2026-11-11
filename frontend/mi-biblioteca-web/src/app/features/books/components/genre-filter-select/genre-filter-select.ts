import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  forwardRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  EMPTY_GENRE_FILTER,
  GenreFilterValue,
  MAX_FILTER_GENRES,
  normalizeGenreFilter,
  normalizeGenres,
} from '../../models/book-filters';

/**
 * Catalog-only genre filter.
 *
 * It is deliberately separate from the UX 04 `app-genre-select` editing field:
 * options come from the current catalog, custom genres are never created, the
 * selection limit is 50 and there is an explicit "Sin género" OR option.
 */
@Component({
  selector: 'app-genre-filter-select',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './genre-filter-select.html',
  styleUrl: './genre-filter-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => GenreFilterSelect), multi: true },
  ],
  host: { '(focusout)': 'onTouched?.()' },
})
export class GenreFilterSelect implements ControlValueAccessor {
  /** Distinct labels from GET /api/books/genres. */
  readonly options = input<readonly string[]>([]);
  readonly optionsLoading = input(false);
  readonly optionsError = input(false);
  readonly selectionDisabled = input(false);
  /** The parent loads the options lazily on first focus/open. */
  readonly interaction = output<void>();
  readonly retryOptions = output<void>();

  readonly search = new FormControl('', { nonNullable: true });
  protected readonly selected = signal<string[]>([]);
  protected readonly genreUnassigned = signal(false);
  protected readonly notice = signal('');
  private readonly cvaDisabled = signal(false);
  protected readonly disabled = computed(() => this.selectionDisabled() || this.cvaDisabled());
  private readonly searchText = toSignal(this.search.valueChanges, { initialValue: '' });

  protected readonly matches = computed(() => {
    const query = searchKey(this.searchText());
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of this.options()) {
      const option = raw.trim();
      const key = option.toLowerCase();
      if (!option || seen.has(key) || (query && !searchKey(option).includes(query))) continue;
      seen.add(key);
      result.push(option);
    }
    return result;
  });

  protected readonly emptyMessage = computed(() =>
    this.searchText().trim()
      ? 'Sin coincidencias entre los géneros existentes'
      : 'No hay géneros disponibles',
  );

  protected readonly hint = computed(() =>
    this.selected().length || this.genreUnassigned()
      ? 'Añade o quita géneros; los cambios se aplican con Aplicar filtros'
      : 'Todos los géneros. Busca para seleccionar uno o varios',
  );

  protected readonly count = computed(
    () => `Géneros seleccionados: ${this.selected().length} de ${MAX_FILTER_GENRES}`,
  );

  protected readonly chipsLabel = computed(() => {
    const genres = this.selected();
    if (!genres.length && !this.genreUnassigned()) return 'Ningún género seleccionado';
    return `Géneros seleccionados: ${genres.join(', ') || 'ninguno'}${
      this.genreUnassigned() ? '; y libros sin género' : ''
    }`;
  });

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private onChange?: (value: GenreFilterValue) => void;
  protected onTouched?: () => void;

  constructor() {
    effect(() => {
      if (this.disabled()) this.search.disable({ emitEvent: false });
      else if (this.search.disabled) this.search.enable({ emitEvent: false });
    });
  }

  writeValue(value: GenreFilterValue | null | undefined): void {
    const normalized = normalizeGenreFilter(value ?? EMPTY_GENRE_FILTER);
    this.selected.set(normalized.genres);
    this.genreUnassigned.set(normalized.genreUnassigned);
    this.notice.set('');
  }

  registerOnChange(fn: (value: GenreFilterValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  protected requestOptions(): void {
    if (!this.disabled()) this.interaction.emit();
  }

  protected isSelected(genre: string): boolean {
    const key = genre.toLowerCase();
    return this.selected().some((value) => value.toLowerCase() === key);
  }

  protected setCheckbox(genre: string, checked: boolean): void {
    if (checked) this.add(genre);
    else this.remove(genre);
  }

  protected add(genre: string): void {
    if (this.disabled()) return;
    if (this.selected().length >= MAX_FILTER_GENRES) {
      this.notice.set(`Puedes seleccionar un máximo de ${MAX_FILTER_GENRES} géneros`);
      return;
    }
    const normalized = normalizeGenres([...this.selected(), genre]);
    if (normalized.length === this.selected().length) return;
    this.selected.set(normalized);
    this.notice.set('');
    this.clearSearch();
    this.emit();
  }

  protected remove(genre: string): void {
    if (this.disabled()) return;
    const key = genre.toLowerCase();
    this.selected.update((genres) => genres.filter((value) => value.toLowerCase() !== key));
    this.notice.set('');
    this.emit();
  }

  protected setUnassigned(checked: boolean): void {
    if (this.disabled()) return;
    this.genreUnassigned.set(checked);
    this.notice.set('');
    this.emit();
  }

  protected removeUnassigned(): void {
    if (!this.genreUnassigned()) return;
    this.setUnassigned(false);
  }

  protected selectOption(event: MatAutocompleteSelectedEvent): void {
    const genre = String(event.option.value);
    if (this.isSelected(genre)) this.remove(genre);
    else this.add(genre);
  }

  protected enter(event: Event): void {
    // Never submit the surrounding filter form from the search input. Only an
    // active option may select a genre; typed text never creates a new one.
    event.preventDefault();
  }

  protected clear(): void {
    if (this.disabled() || (!this.selected().length && !this.genreUnassigned())) return;
    this.selected.set([]);
    this.genreUnassigned.set(false);
    this.notice.set('');
    this.clearSearch();
    this.emit();
  }

  private clearSearch(): void {
    this.search.reset('');
    const input = this.searchInput()?.nativeElement;
    if (input) input.value = '';
  }

  private emit(): void {
    this.onChange?.({ genres: [...this.selected()], genreUnassigned: this.genreUnassigned() });
  }
}

/** Search is accent-insensitive, while selection deduplication stays accent-sensitive. */
function searchKey(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}
