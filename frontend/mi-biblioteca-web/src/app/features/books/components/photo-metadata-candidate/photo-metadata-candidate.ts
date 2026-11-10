import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, OnInit, signal, output } from '@angular/core';
import { BookFormValue } from '../book-form/book-form.helpers';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';
import { PhotoObservation } from '../../models/book-photo-import.models';
import {
  EditionMetadata,
  MetadataWork,
  MetadataWorks,
  MetadataEdition,
  MetadataEditions,
  MetadataDuplicates,
  normalizedMetadataIsbn,
} from '../../models/book-metadata.models';
import { BooksService } from '../../services/books.service';

@Component({
  selector: 'app-photo-metadata-candidate',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './photo-metadata-candidate.html',
  styleUrl: './photo-metadata-candidate.scss',
})
export class PhotoMetadataCandidate implements OnInit {
  readonly observation = input.required<PhotoObservation>();
  readonly simulated = input(true);
  readonly locked = input(false);
  readonly reviewRequested = output<BookFormValue>();
  readonly identificationChanged = output<BookFormValue>();

  draft(): BookFormValue {
    const metadata = this.selected();
    const value = this.form.getRawValue();
    return {
      title: metadata?.title ?? value.title,
      author: metadata?.author ?? value.author,
      isbn: metadata ? (metadata.isbn ?? '') : value.isbn,
      description: '',
      coverUrl: metadata?.coverUrl ?? '',
      publisher: metadata?.publisher ?? '',
      publicationYear: metadata?.publicationYear ?? null,
      pageCount: metadata?.pageCount ?? null,
      language: metadata?.language ?? '',
      genres: [...(metadata?.genres ?? [])],
    };
  }
  requestReview(): void {
    if (!this.locked()) this.reviewRequested.emit(this.draft());
  }
  private readonly books = inject(BooksService);
  private readonly destroyRef = inject(DestroyRef);
  private request: Subscription | null = null;
  private duplicateRequest: Subscription | null = null;
  private generation = 0;
  private duplicateCriteria: { isbn: string; title: string; author: string } | null = null;
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255), Validators.pattern(/^[^\p{Cc}\p{Zl}\p{Zp}]*$/u)],
    }),
    author: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255), Validators.pattern(/^[^\p{Cc}\p{Zl}\p{Zp}]*$/u)],
    }),
    isbn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(50), Validators.pattern(/^[^\p{Cc}]*$/u)],
    }),
  });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly works = signal<MetadataWorks | null>(null);
  readonly work = signal<MetadataWork | null>(null);
  readonly editions = signal<MetadataEditions | null>(null);
  readonly selected = signal<EditionMetadata | null>(null);
  readonly selectedEdition = signal<MetadataEdition | null>(null);
  readonly duplicates = signal<MetadataDuplicates | null>(null);
  readonly duplicateState = signal<'idle' | 'loading' | 'known' | 'unknown'>('idle');
  readonly manual = signal(false);
  readonly failedCovers = signal<ReadonlySet<string>>(new Set());

  ngOnInit(): void {
    const observation = this.observation();
    this.form.setValue(
      {
        title: observation.title ?? '',
        author: observation.author ?? '',
        isbn: observation.rawIsbn ?? '',
      },
      { emitEvent: false },
    );
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.invalidate());
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.request?.unsubscribe();
      this.duplicateRequest?.unsubscribe();
    });
  }

  private invalidate(): void {
    this.duplicateCriteria = null;
    this.generation++;
    this.request?.unsubscribe();
    this.duplicateRequest?.unsubscribe();
    this.loading.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.works.set(null);
    this.work.set(null);
    this.editions.set(null);
    this.selected.set(null);
    this.selectedEdition.set(null);
    this.duplicates.set(null);
    this.duplicateState.set('idle');
    this.manual.set(false);
    this.identificationChanged.emit(this.draft());
  }

  search(): void {
    if (this.locked() || this.loading() || this.destroyRef.destroyed) return;
    this.invalidate();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa las longitudes y utiliza texto de una sola línea.');
      return;
    }
    const { title, author, isbn } = this.form.getRawValue();
    const normalized = normalizedMetadataIsbn(isbn);
    if (!normalized && !title.trim() && !author.trim()) {
      this.error.set(
        isbn.trim()
          ? 'ISBN inválido. Corrígelo o indica título o autor.'
          : 'Indica un ISBN válido, título o autor.',
      );
      return;
    }
    if (isbn.trim() && !normalized)
      this.notice.set('ISBN inválido: no se corrigen dígitos. Se buscará por título y autor.');
    if (normalized) {
      this.checkDuplicates(isbn, title, author);
      this.loading.set(true);
      const generation = this.generation;
      this.request = this.books
        .lookupByIsbn(normalized)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (metadata) => {
            if (generation !== this.generation) return;
            this.loading.set(false);
            this.selected.set(metadata);
            this.identificationChanged.emit(this.draft());
            this.checkDuplicates(isbn, metadata.title ?? title, metadata.author ?? author);
          },
          error: (error: unknown) => {
            if (generation !== this.generation) return;
            this.loading.set(false);
            this.error.set(this.message(error) + ' Puedes buscar por título y autor.');
          },
        });
    } else this.searchText();
  }

  searchText(): void {
    if (this.locked() || this.loading() || this.destroyRef.destroyed) return;
    const { title, author } = this.form.getRawValue();
    if (this.form.invalid || (!title.trim() && !author.trim())) {
      this.error.set('Indica título o autor válidos.');
      return;
    }
    this.request?.unsubscribe();
    const rawIsbn = this.form.controls.isbn.value;
    this.notice.set(
      rawIsbn.trim() && !normalizedMetadataIsbn(rawIsbn)
        ? 'ISBN inválido: no se corrigen dígitos. Se buscará por título y autor.'
        : null,
    );
    const generation = ++this.generation;
    this.selected.set(null);
    this.selectedEdition.set(null);
    this.work.set(null);
    this.editions.set(null);
    this.works.set(null);
    this.error.set(null);
    this.loading.set(true);
    this.manual.set(false);
    this.identificationChanged.emit(this.draft());
    this.request = this.books
      .searchMetadata(title, author)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (works) => {
          if (generation !== this.generation) return;
          this.works.set(works);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (generation !== this.generation) return;
          this.loading.set(false);
          this.error.set(this.message(error));
        },
      });
    this.checkDuplicates(this.form.controls.isbn.value, title, author);
  }

  chooseWork(work: MetadataWork): void {
    if (this.locked() || this.loading()) return;
    this.selected.set(null);
    this.selectedEdition.set(null);
    this.work.set(work);
    this.manual.set(false);
    this.loadEditions(0);
    this.checkDuplicates('', work.title, work.authors.join('; '));
  }

  loadEditions(page: number): void {
    const work = this.work();
    if (this.locked() || !work || this.loading() || page < 0 || page > 9) return;
    this.request?.unsubscribe();
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    this.editions.set(null);
    this.selected.set(null);
    this.selectedEdition.set(null);
    this.identificationChanged.emit(this.draft());
    this.duplicateRequest?.unsubscribe();
    this.duplicates.set(null);
    this.duplicateState.set('idle');
    this.request = this.books
      .metadataEditions(work.workKey, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (editions) => {
          if (generation !== this.generation) return;
          this.editions.set(editions);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (generation !== this.generation) return;
          this.loading.set(false);
          this.error.set(this.message(error));
        },
      });
  }

  chooseEdition(edition: MetadataEdition): void {
    if (this.locked() || this.loading()) return;
    this.selectedEdition.set(edition);
    this.selected.set(edition.metadata);
    this.identificationChanged.emit(this.draft());
    this.manual.set(false);
    this.checkDuplicates(
      '',
      edition.metadata.title ?? this.form.controls.title.value,
      edition.metadata.author ?? this.form.controls.author.value,
    );
  }

  selectIsbn(isbn: string): void {
    if (this.locked()) return;
    const edition = this.selectedEdition();
    if (!edition || (isbn !== '' && !edition.isbns.includes(isbn))) return;
    const selected = { ...edition.metadata, isbn: isbn || null };
    this.selected.set(selected);
    this.identificationChanged.emit(this.draft());
    this.checkDuplicates(
      isbn,
      selected.title ?? this.form.controls.title.value,
      selected.author ?? this.form.controls.author.value,
    );
  }

  useManual(): void {
    if (this.locked()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.invalidate();
    this.manual.set(true);
    const { title, author, isbn } = this.form.getRawValue();
    this.checkDuplicates(isbn, title, author);
  }

  cancel(): void {
    this.invalidate();
    this.notice.set('Búsqueda cancelada. No se reanuda automáticamente.');
  }

  private checkDuplicates(isbn: string, title: string, author: string): void {
    this.duplicateCriteria = { isbn, title, author };
    this.duplicateRequest?.unsubscribe();
    const generation = this.generation;
    this.duplicates.set(null);
    this.duplicateState.set('loading');
    this.duplicateRequest = this.books
      .metadataDuplicates(isbn, title, author)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (duplicates) => {
          if (generation !== this.generation) return;
          this.duplicates.set(duplicates);
          this.duplicateState.set('known');
        },
        error: () => {
          if (generation !== this.generation) return;
          this.duplicateState.set('unknown');
        },
      });
  }

  retryDuplicates(): void {
    const criteria = this.duplicateCriteria;
    if (criteria && this.duplicateState() === 'unknown') {
      this.checkDuplicates(criteria.isbn, criteria.title, criteria.author);
    }
  }

  coverFailed(url: string): void {
    this.failedCovers.update((values) => new Set([...values, url]));
  }

  private message(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 404) return 'No se encontró una edición para este ISBN.';
    if (status === 400) return 'Los datos de búsqueda no son válidos.';
    if (status === 504) return 'La búsqueda agotó su tiempo. Reintenta explícitamente.';
    if (status === 503) {
      const retryAfter =
        error instanceof HttpErrorResponse ? error.headers.get('Retry-After') : null;
      return (
        'Open Library no está disponible o limita las consultas.' +
        (retryAfter && /^[0-9]{1,8}$/.test(retryAfter)
          ? ` Espera al menos ${retryAfter} segundos.`
          : ' Espera antes de reintentar.')
      );
    }
    return 'No se pudo consultar Open Library. No se han repetido las peticiones.';
  }
}
