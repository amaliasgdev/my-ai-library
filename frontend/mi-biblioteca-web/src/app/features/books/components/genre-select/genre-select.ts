import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { MAX_BOOK_GENRES, normalizeGenreKey } from '../../models/genre-key';
import { GENRE_SUGGESTIONS } from './genre-suggestions';

/**
 * Reusable multi-select genre field: searchable suggestions with checkboxes,
 * removable chips, custom genres and a maximum of 10 selections.
 * Works as a ControlValueAccessor over the BookForm single FormControl<string[]>.
 */
@Component({
  selector: 'app-genre-select',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    InlineFeedback,
  ],
  templateUrl: './genre-select.html',
  styleUrl: './genre-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => GenreSelect), multi: true },
  ],
  host: { '(focusout)': 'handleFocusOut()' },
})
export class GenreSelect implements ControlValueAccessor {
  readonly label = input('Géneros');
  readonly hint = input('Hasta 10 géneros; 50 caracteres por género');
  readonly suggestions = input<readonly string[]>(GENRE_SUGGESTIONS);
  /** Disables the selector from the parent template. Named differently from `disabled` because
   * `[formControl]` on the host also matches FormControlDirective, whose `disabled` input warns. */
  readonly selectionDisabled = input(false);

  /** Search text. Its draft is never added automatically; only explicit actions persist genres. */
  readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly cvaDisabled = signal(false);
  protected readonly blocked = computed(() => this.selectionDisabled() || this.cvaDisabled());
  protected readonly selected = signal<string[]>([]);
  protected readonly notice = signal('');
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  /** Filtered suggestions: deduplicated and containing the query. */
  readonly options = computed(() => {
    const query = normalizeGenreKey(this.searchText());
    const result: string[] = [];
    const seen = new Set<string>();
    for (const suggestion of this.suggestions()) {
      const key = normalizeGenreKey(suggestion);
      if (!key || seen.has(key)) continue;
      if (query && !key.includes(query)) continue;
      seen.add(key);
      result.push(suggestion);
    }
    for (const selected of this.selected()) {
      const key = normalizeGenreKey(selected);
      if (!key || seen.has(key) || (query && !key.includes(query))) continue;
      seen.add(key);
      result.push(selected);
    }
    return result;
  });

  protected readonly emptyMessage = computed(() =>
    this.searchText().trim().length > 0
      ? 'Sin coincidencias. Escribe un género nuevo y pulsa Intro'
      : 'No quedan más sugerencias. Escribe un género nuevo y pulsa Intro',
  );

  protected readonly searchMessage = computed(() => {
    const length = this.searchText().trim().length;
    if (length === 0) return '';
    if (length > 50) return 'El género no puede superar los 50 caracteres';
    if (this.selected().length >= MAX_BOOK_GENRES)
      return `Ya has seleccionado el máximo de ${MAX_BOOK_GENRES} géneros`;
    return '';
  });

  protected readonly chipsLabel = computed(
    () => `Géneros seleccionados: ${this.selected().length} de ${MAX_BOOK_GENRES}`,
  );

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private onChange?: (value: string[]) => void;
  private onTouched?: () => void;

  constructor() {
    effect(() => {
      if (this.blocked()) this.searchControl.disable({ emitEvent: false });
      else if (this.searchControl.disabled) this.searchControl.enable({ emitEvent: false });
    });
    this.searchControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.notice.set(''));
  }

  writeValue(value: string[] | null): void {
    this.selected.set(Array.isArray(value) ? [...value] : []);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  protected handleFocusOut(): void {
    this.onTouched?.();
  }

  protected isSelected(genre: string): boolean {
    const key = normalizeGenreKey(genre);
    return this.selected().some((value) => normalizeGenreKey(value) === key);
  }

  protected setCheckbox(genre: string, checked: boolean): void {
    if (checked && !this.isSelected(genre)) this.toggle(genre);
    else if (!checked && this.isSelected(genre)) this.remove(genre);
  }

  /**
   * Adds a genre, validating trim, length, duplicates (ignoring case, spacing and accents)
   * and the maximum of 10. Returns whether it was added.
   */
  toggle(genre: string): boolean {
    if (this.blocked()) return false;
    const trimmed = genre.trim();
    if (!trimmed || trimmed.length > 50) {
      this.notice.set('Máximo 50 caracteres por género');
      return false;
    }
    const key = normalizeGenreKey(trimmed);
    const current = this.selected();
    const existing = current.findIndex((value) => normalizeGenreKey(value) === key);
    if (existing >= 0) {
      this.notice.set(`«${trimmed}» ya está seleccionado`);
      return false;
    }
    if (current.length >= MAX_BOOK_GENRES) {
      this.notice.set(`Puedes seleccionar un máximo de ${MAX_BOOK_GENRES} géneros`);
      return false;
    }
    this.commit([...current, trimmed]);
    return true;
  }

  /** Removes one selected genre individually. */
  remove(genre: string): void {
    if (this.blocked()) return;
    const key = normalizeGenreKey(genre);
    this.commit(this.selected().filter((value) => normalizeGenreKey(value) !== key));
  }

  /**
   * Enter on the search input. Material handles the active option first and preventDefaults
   * the event; the event is always prevented so it never submits the surrounding form,
   * and only otherwise is the typed text treated as a custom genre.
   */
  onSearchEnter(event: Event): void {
    const handledByAutocomplete = event.defaultPrevented;
    event.preventDefault();
    if (handledByAutocomplete) return;
    const trimmed = this.searchControl.value.trim();
    if (!trimmed) return;
    if (trimmed.length > 50) {
      this.notice.set('El género no puede superar los 50 caracteres');
      return;
    }
    if (this.toggle(trimmed)) this.clearSearch();
  }

  /** An active suggestion was confirmed (Enter or option click); the panel closes afterwards. */
  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const genre = String(event.option.value);
    if (this.isSelected(genre)) this.remove(genre);
    else if (!this.toggle(genre)) return;
    this.clearSearch();
  }

  /** Clears the search draft in the control and, defensively, in the native input. */
  private clearSearch(): void {
    this.searchControl.reset('');
    const input = this.searchInput()?.nativeElement;
    if (input) input.value = '';
  }

  private commit(value: string[]): void {
    this.selected.set(value);
    this.notice.set('');
    this.onChange?.([...value]);
  }
}
