import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import {
  EMPTY,
  distinctUntilChanged,
  Subject,
  catchError,
  finalize,
  map,
  Observable,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { BookCard } from '../../components/book-card/book-card';
import { LocationEditor } from '../../../locations/services/location-editor';
import { IsbnScanDialog } from '../../components/isbn-scan-dialog/isbn-scan-dialog';
import { BookIsbnImportDialog } from '../../components/book-isbn-import-dialog/book-isbn-import-dialog';
import { BookFilters, FILTER_STATES, sameBookFilters } from '../../models/book-filters';
import { bookFiltersFormValue, createBookFiltersForm, filtersFromForm } from './book-filters.form';
import { isValidBarcodeIsbn13 } from '../../models/isbn-barcode';
import {
  BookDeleteDialog,
  BookDeleteDialogData,
} from '../../components/book-delete-dialog/book-delete-dialog';
import {
  BookCatalogSort,
  BookPageResponse,
  BookResponse,
  BookSearchRequest,
  BooksPageRequest,
  BookUpdateAction,
  ReadingStatus,
} from '../../models/book.models';
import { BooksService } from '../../services/books.service';
import { BookReadingDatesDialog } from '../../components/book-reading-dates-dialog/book-reading-dates-dialog';
import { localDateString } from '../../models/reading-date';
import {
  bookDeleteDialogConfig,
  bookDeleteError,
} from '../../components/book-delete-dialog/book-delete.helpers';
import { searchCriteriaValidator, searchIsbnValidator } from './books-catalog.search-validators';
import {
  BookCatalogQuery,
  parseBookCatalogQuery,
  serializeBookCatalogQuery,
  isCanonicalBookCatalogQuery,
  sameBookCatalogQuery,
  sameBookSearch,
} from '../../models/book-catalog-query';

type CatalogReload = { afterDelete: boolean };

type CatalogState =
  | { status: 'loading' }
  | { status: 'success'; response: BookPageResponse }
  | { status: 'error'; message: string };

function spanishPaginator(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Libros por página';
  intl.nextPageLabel = 'Página siguiente';
  intl.previousPageLabel = 'Página anterior';
  intl.firstPageLabel = 'Primera página';
  intl.lastPageLabel = 'Última página';
  intl.getRangeLabel = (page, size, length) => {
    if (length === 0 || size === 0) return `0 de ${length}`;
    const start = page * size;
    if (start >= length) return `0 de ${length}`;
    return `${start + 1}–${Math.min(start + size, length)} de ${length}`;
  };
  return intl;
}

function catalogError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status === 400) return 'No se pudo cargar el catálogo con estos parámetros';
    if (error.status >= 500 && error.status < 600) return 'El servidor no pudo cargar el catálogo';
  }
  return 'No se pudo cargar el catálogo';
}

function searchError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status === 400) return 'No se pudo realizar la búsqueda con estos criterios';
    if (error.status >= 500 && error.status < 600)
      return 'El servidor no pudo realizar la búsqueda';
  }
  return 'No se pudo realizar la búsqueda';
}

@Component({
  selector: 'app-books-catalog',
  imports: [
    BookCard,
    MatButtonModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    RouterLink,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  providers: [LocationEditor, { provide: MatPaginatorIntl, useFactory: spanishPaginator }],
  templateUrl: './books-catalog.html',
  styleUrl: './books-catalog.scss',
})
export class BooksCatalog {
  readonly locationEditor = inject(LocationEditor);
  hasKnownLocation(level: 'room' | 'bookcase' | 'shelf', id: number | null): boolean {
    for (const room of this.locationEditor.rooms() ?? []) {
      if (level === 'room' && room.id === id) return true;
      for (const bookcase of room.bookcases) {
        if (level === 'bookcase' && bookcase.id === id) return true;
        if (level === 'shelf' && bookcase.shelves.some((shelf) => shelf.id === id)) return true;
      }
    }
    return false;
  }
  filterRoomChanged(): void {
    if (this.deletingId()) return;
    this.filtersForm.controls.bookcaseId.setValue(null);
    this.filtersForm.controls.shelfId.setValue(null);
  }
  filterBookcaseChanged(): void {
    if (this.deletingId()) return;
    this.filtersForm.controls.shelfId.setValue(null);
  }
  private readonly booksService = inject(BooksService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private confirmation: MatDialogRef<BookDeleteDialog, boolean> | null = null;
  private datesDialog: MatDialogRef<BookReadingDatesDialog> | null = null;
  private scanDialog: MatDialogRef<IsbnScanDialog, string> | null = null;
  private isbnImportDialog: MatDialogRef<BookIsbnImportDialog, string> | null = null;
  private restoreFocusAfterReload = false;
  readonly currentSort = signal<BookCatalogSort>({ sortBy: 'title', direction: 'ASC' });
  protected readonly sortOptions: { value: BookCatalogSort['sortBy']; label: string }[] = [
    { value: 'title', label: 'Título' },
    { value: 'author', label: 'Autor' },
    { value: 'createdAt', label: 'Fecha de creación' },
    { value: 'readingStatus', label: 'Estado de lectura' },
    { value: 'rating', label: 'Valoración' },
  ];
  private readonly reloadRequested = new Subject<CatalogReload>();
  private appliedQuery: BookCatalogQuery | null = null;
  private requestGeneration = 0;
  readonly catalogParams = computed(() =>
    serializeBookCatalogQuery({
      page: this.pageIndex(),
      size: this.pageSize(),
      ...this.currentSort(),
      search: this.currentSearch(),
      filters: this.currentFilters(),
    }),
  );
  readonly currentSearch = signal<BookSearchRequest | null>(null);
  readonly currentFilters = signal<BookFilters>({});
  readonly filtersForm = createBookFiltersForm();
  protected readonly filterStates = FILTER_STATES;
  protected readonly filterStateLabels = {
    TO_READ: 'Por leer',
    READING: 'Leyendo',
    READ: 'Leído',
    ABANDONED: 'Abandonado',
  };
  readonly searchForm = new FormGroup(
    {
      title: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
      author: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
      isbn: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(20), searchIsbnValidator],
      }),
    },
    { validators: searchCriteriaValidator },
  );
  readonly deletingId = signal<number | null>(null);
  readonly deleteError = signal<string | null>(null);
  readonly pendingUpdates = signal<ReadonlyMap<number, BookUpdateAction>>(new Map());
  readonly updateErrors = signal<ReadonlyMap<number, string>>(new Map());
  protected readonly state = signal<CatalogState>({ status: 'loading' });
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly totalElements = signal(0);
  protected readonly pageSizeOptions = [10, 20, 50, 100];
  protected readonly announcement = computed(() => {
    const state = this.state();
    if (state.status === 'loading') return 'Cargando libros…';
    if (state.status === 'error') return '';
    if (state.response.totalElements === 0)
      return this.currentSearch() || Object.keys(this.currentFilters()).length > 0
        ? 'No se encontraron libros'
        : 'Tu biblioteca todavía no tiene libros';
    if (state.response.content.length === 0) return 'No hay libros en esta página';
    return `Mostrando ${state.response.content.length} de ${state.response.totalElements} libros`;
  });

  constructor() {
    this.route.queryParamMap
      .pipe(
        map((params) => {
          const query = parseBookCatalogQuery(params);
          if (!isCanonicalBookCatalogQuery(params, query)) {
            this.state.set({ status: 'loading' });
            void this.router.navigate(['/books'], {
              queryParams: serializeBookCatalogQuery(query),
              replaceUrl: true,
            });
            return null;
          }
          return query;
        }),
        distinctUntilChanged(
          (a, b) => a === b || (a !== null && b !== null && sameBookCatalogQuery(a, b)),
        ),
        switchMap((query) => {
          if (!query) return EMPTY;
          if (!this.appliedQuery || !sameBookSearch(this.appliedQuery.search, query.search)) {
            this.searchForm.reset({
              title: query.search?.title ?? '',
              author: query.search?.author ?? '',
              isbn: query.search?.isbn ?? '',
            });
          }
          if (!this.appliedQuery || !sameBookFilters(this.appliedQuery.filters, query.filters)) {
            this.filtersForm.reset(bookFiltersFormValue(query.filters));
          }
          this.appliedQuery = query;
          this.currentFilters.set(query.filters ?? {});
          this.currentSearch.set(query.search);
          this.currentSort.set({ sortBy: query.sortBy, direction: query.direction });
          this.pageIndex.set(query.page);
          this.pageSize.set(query.size);
          this.deleteError.set(null);
          return this.reloadRequested.pipe(
            startWith<CatalogReload>({ afterDelete: false }),
            switchMap((reload) => {
              this.requestGeneration++;
              return this.fetchPage(query).pipe(
                switchMap((response) => {
                  if (reload.afterDelete && response.content.length === 0 && query.page > 0) {
                    this.navigateQuery({ ...query, page: query.page - 1 }, true);
                    return EMPTY;
                  }
                  return of(response);
                }),
                map((response): CatalogState => ({ status: 'success', response })),
                catchError((error: unknown) =>
                  of<CatalogState>({
                    status: 'error',
                    message: query.search ? searchError(error) : catalogError(error),
                  }),
                ),
                startWith<CatalogState>({ status: 'loading' }),
              );
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        if (state.status === 'success') {
          this.totalElements.set(state.response.totalElements);
        }
        this.state.set(state);
        if (state.status !== 'loading' && this.restoreFocusAfterReload) {
          this.restoreFocusAfterReload = false;
          afterNextRender(
            () => {
              const document = this.element.nativeElement.ownerDocument;
              if (!document.activeElement || document.activeElement === document.body) {
                this.element.nativeElement.querySelector<HTMLElement>('h1')?.focus();
              }
            },
            { injector: this.injector },
          );
        }
      });
    this.destroyRef.onDestroy(() => this.confirmation?.close(false));
    this.destroyRef.onDestroy(() => this.datesDialog?.close());
    this.destroyRef.onDestroy(() => {
      const ref = this.scanDialog;
      const manualRef = this.isbnImportDialog;
      this.scanDialog = null;
      this.isbnImportDialog = null;
      ref?.close();
      manualRef?.close();
    });
  }

  openScanner(): void {
    if (this.destroyRef.destroyed || this.scanDialog || this.isbnImportDialog) return;
    const ref = this.dialog.open<IsbnScanDialog, void, string>(IsbnScanDialog, {
      width: '36rem',
      maxWidth: '95vw',
      autoFocus: 'button',
      restoreFocus: true,
    });
    this.scanDialog = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isbn) => {
        if (this.scanDialog !== ref || this.destroyRef.destroyed) return;
        this.scanDialog = null;
        if (isbn) this.navigateToIsbnCreation(isbn);
      });
  }

  openIsbnImport(): void {
    if (this.destroyRef.destroyed || this.scanDialog || this.isbnImportDialog) return;
    const ref = this.dialog.open<BookIsbnImportDialog, void, string>(BookIsbnImportDialog, {
      width: '28rem',
      maxWidth: '95vw',
      autoFocus: 'input',
      restoreFocus: true,
    });
    this.isbnImportDialog = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isbn) => {
        if (this.isbnImportDialog !== ref || this.destroyRef.destroyed) return;
        this.isbnImportDialog = null;
        if (isbn) this.navigateToIsbnCreation(isbn);
      });
  }

  private navigateToIsbnCreation(isbn: string): void {
    if (this.destroyRef.destroyed || !isValidBarcodeIsbn13(isbn)) return;
    void this.router.navigate(['/books/new'], { queryParams: { isbn } });
  }

  onPageChange(event: PageEvent): void {
    if (this.deletingId() !== null) return;
    const page = event.pageSize === this.pageSize() ? event.pageIndex : 0;
    if (this.appliedQuery) this.navigateQuery({ ...this.appliedQuery, page, size: event.pageSize });
  }

  protected retry(): void {
    if (this.deletingId() !== null) return;
    this.reloadCurrentQuery();
  }

  protected firstPage(): void {
    if (this.appliedQuery) this.navigateQuery({ ...this.appliedQuery, page: 0 });
  }

  submitSearch(): void {
    if (this.deletingId() !== null) return;
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      const fields = ['title', 'author', 'isbn'] as const;
      const firstInvalid =
        fields.find((field) => this.searchForm.controls[field].invalid) ??
        (this.searchForm.hasError('exclusiveIsbn') ? 'isbn' : 'title');
      this.element.nativeElement
        .querySelector<HTMLInputElement>(`[formControlName="${firstInvalid}"]`)
        ?.focus();
      return;
    }
    const value = this.searchForm.getRawValue();
    const criteria: BookSearchRequest = {};
    if (value.title.trim()) criteria.title = value.title.trim();
    if (value.author.trim()) criteria.author = value.author.trim();
    if (value.isbn.trim()) criteria.isbn = value.isbn.trim();
    if (this.appliedQuery) this.navigateQuery({ ...this.appliedQuery, search: criteria, page: 0 });
  }

  clearSearch(): void {
    if (this.deletingId() !== null) return;
    this.searchForm.reset();
    if (this.appliedQuery) this.navigateQuery({ ...this.appliedQuery, search: null, page: 0 });
  }

  applyFilters(): void {
    if (this.deletingId() !== null) return;
    if (this.filtersForm.invalid) {
      this.filtersForm.markAllAsTouched();
      this.element.nativeElement
        .querySelector<HTMLElement>('.filters-form .ng-invalid[formControlName]')
        ?.focus();
      return;
    }
    if (this.appliedQuery)
      this.navigateQuery({
        ...this.appliedQuery,
        filters: filtersFromForm(this.filtersForm),
        page: 0,
      });
  }

  clearFilters(): void {
    if (this.deletingId() !== null) return;
    this.filtersForm.reset(bookFiltersFormValue());
    if (this.appliedQuery) this.navigateQuery({ ...this.appliedQuery, filters: {}, page: 0 });
  }

  onSortByChange(sortBy: BookCatalogSort['sortBy']): void {
    if (!this.sortOptions.some((option) => option.value === sortBy)) return;
    this.applySort({ ...this.currentSort(), sortBy });
  }

  onSortDirectionChange(direction: BookCatalogSort['direction']): void {
    if (direction !== 'ASC' && direction !== 'DESC') return;
    this.applySort({ ...this.currentSort(), direction });
  }

  private applySort(sort: BookCatalogSort): void {
    if (this.deletingId() !== null) return;
    const current = this.currentSort();
    if (sort.sortBy === current.sortBy && sort.direction === current.direction) return;
    if (this.appliedQuery) this.navigateQuery({ ...this.appliedQuery, ...sort, page: 0 });
  }

  openDeleteDialog(book: BookResponse): void {
    if (
      this.confirmation ||
      this.deletingId() !== null ||
      this.pendingUpdates().size > 0 ||
      this.state().status !== 'success'
    )
      return;
    const ref = this.dialog.open<BookDeleteDialog, BookDeleteDialogData, boolean>(
      BookDeleteDialog,
      bookDeleteDialogConfig(book.title),
    );
    this.confirmation = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        this.confirmation = null;
        if (confirmed === true && this.deletingId() === null && this.pendingUpdates().size === 0)
          this.deleteBook(book.id);
      });
  }

  private deleteBook(id: number): void {
    if (this.deletingId() !== null || this.pendingUpdates().size > 0) return;
    this.deletingId.set(id);
    this.deleteError.set(null);
    this.booksService
      .deleteBook(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deletingId.set(null)),
      )
      .subscribe({
        next: () => {
          this.restoreFocusAfterReload = true;
          this.reloadCurrentQuery(true);
        },
        error: (error: unknown) => {
          this.deleteError.set(bookDeleteError(error));
        },
      });
  }

  updateReadingStatus(event: { id: number; status: ReadingStatus }): void {
    const book = this.visibleBook(event.id);
    if (
      !book ||
      !['TO_READ', 'READING', 'READ', 'ABANDONED'].includes(event.status) ||
      book.readingStatus === event.status
    )
      return;
    this.runUpdate(event.id, 'readingStatus', () =>
      this.booksService.updateReadingStatus(event.id, event.status),
    );
  }

  startReading(id: number): void {
    if (this.visibleBook(id)?.readingStatus !== 'TO_READ') return;
    this.runUpdate(id, 'startReading', () =>
      this.booksService.startReading(id, { date: localDateString(new Date()) }),
    );
  }

  finishReading(id: number): void {
    const status = this.visibleBook(id)?.readingStatus;
    if (status !== 'TO_READ' && status !== 'READING') return;
    this.runUpdate(id, 'finishReading', () =>
      this.booksService.finishReading(id, { date: localDateString(new Date()) }),
    );
  }

  openReadingDatesDialog(id: number): void {
    const book = this.visibleBook(id);
    if (
      !book ||
      this.datesDialog ||
      this.confirmation ||
      this.deletingId() !== null ||
      this.pendingUpdates().has(id)
    )
      return;
    const ref = this.dialog.open(BookReadingDatesDialog, {
      data: book,
      autoFocus: '.cancel-dates',
      restoreFocus: true,
      ariaDescribedBy: 'reading-dates-description',
      width: '32rem',
      maxWidth: 'calc(100vw - 2rem)',
    });
    this.datesDialog = ref;
    ref.componentInstance.saveRequested.subscribe((request) => {
      this.runUpdate(
        id,
        'updateReadingDates',
        () => this.booksService.updateReadingDates(id, request),
        ref,
      );
    });
    ref.componentInstance.deleteRequested.subscribe(() => {
      const current = this.visibleBook(id);
      if (!current || (!current.startedOn && !current.finishedOn)) return;
      this.runUpdate(id, 'deleteReadingDates', () => this.booksService.deleteReadingDates(id), ref);
    });
    ref.componentInstance.cancelRequested.subscribe(() => {
      if (!ref.componentInstance.pending()) ref.close();
    });
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.datesDialog === ref) this.datesDialog = null;
      });
  }

  updateRating(event: { id: number; rating: number | null }): void {
    const book = this.visibleBook(event.id);
    if (
      !book ||
      book.rating === event.rating ||
      (event.rating !== null &&
        (!Number.isInteger(event.rating) || event.rating < 1 || event.rating > 5))
    )
      return;
    const rating = event.rating;
    if (rating === null)
      this.runUpdate(event.id, 'deleteRating', () => this.booksService.deleteRating(event.id));
    else this.runUpdate(event.id, 'rating', () => this.booksService.updateRating(event.id, rating));
  }

  private visibleBook(id: number): BookResponse | undefined {
    const state = this.state();
    return state.status === 'success'
      ? state.response.content.find((book) => book.id === id)
      : undefined;
  }

  private runUpdate(
    id: number,
    action: BookUpdateAction,
    request: () => Observable<BookResponse | void>,
    dialog?: MatDialogRef<BookReadingDatesDialog>,
  ): void {
    if (this.deletingId() !== null || this.pendingUpdates().has(id) || !this.visibleBook(id))
      return;
    const startedGeneration = this.requestGeneration;
    this.pendingUpdates.update((updates) => new Map(updates).set(id, action));
    if (dialog) {
      dialog.disableClose = true;
      dialog.componentInstance.error.set(null);
      dialog.componentInstance.setPending(true, action);
    }
    this.updateErrors.update((errors) => {
      const next = new Map(errors);
      next.delete(id);
      return next;
    });
    request()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.pendingUpdates.update((updates) => {
            const next = new Map(updates);
            next.delete(id);
            return next;
          });
          if (dialog) {
            dialog.componentInstance.setPending(false);
            dialog.disableClose = false;
          }
        }),
      )
      .subscribe({
        next: (book) => {
          dialog?.close();
          const state = this.state();
          const affectsOrder =
            ((action === 'readingStatus' ||
              action === 'startReading' ||
              action === 'finishReading') &&
              (this.currentSort().sortBy === 'readingStatus' ||
                !!this.currentFilters().readingStatus?.length)) ||
            (action === 'rating' &&
              (this.currentSort().sortBy === 'rating' ||
                this.currentFilters().ratingMin !== undefined));
          if (
            !book ||
            affectsOrder ||
            state.status !== 'success' ||
            this.requestGeneration !== startedGeneration ||
            !state.response.content.some((item) => item.id === id)
          ) {
            this.restoreFocusAfterReload = true;
            this.reloadCurrentQuery();
            return;
          }
          this.state.set({
            status: 'success',
            response: {
              ...state.response,
              content: state.response.content.map((item) => (item.id === id ? book : item)),
            },
          });
        },
        error: (error: unknown) => {
          const datesAction = [
            'startReading',
            'finishReading',
            'updateReadingDates',
            'deleteReadingDates',
          ].includes(action);
          let message = datesAction
            ? 'No se pudieron actualizar las fechas de lectura'
            : 'No se pudo actualizar el libro';
          if (error instanceof HttpErrorResponse) {
            if (error.status === 0) message = 'No se puede conectar con el servidor';
            else if (error.status === 404) message = 'El libro ya no existe';
            else if (
              error.status === 409 &&
              (action === 'startReading' || action === 'finishReading')
            )
              message = 'El estado actual del libro no permite esta acción';
            else if (error.status >= 500 && error.status < 600)
              message = datesAction
                ? 'El servidor no pudo actualizar las fechas de lectura'
                : 'El servidor no pudo actualizar el libro';
          }
          this.updateErrors.update((errors) => new Map(errors).set(id, message));
          dialog?.componentInstance.error.set(message);
        },
      });
  }

  private fetchPage(query: BookCatalogQuery): Observable<BookPageResponse> {
    const options: BooksPageRequest = {
      page: query.page,
      size: query.size,
      sortBy: query.sortBy,
      direction: query.direction,
    };
    const request = query.search
      ? this.booksService.searchBooks(query.search, options, query.filters)
      : this.booksService.getBooks(options, query.filters);
    return request.pipe(
      map((response) => {
        // HTTP generic types do not validate the actual JSON response.
        if (!response || !Array.isArray(response.content))
          throw new Error('Invalid book page response');
        return response;
      }),
    );
  }

  private reloadCurrentQuery(afterDelete = false): void {
    if (
      this.appliedQuery &&
      isCanonicalBookCatalogQuery(this.route.snapshot.queryParamMap, this.appliedQuery)
    )
      this.reloadRequested.next({ afterDelete });
  }

  private navigateQuery(query: BookCatalogQuery, replaceUrl = false): void {
    if (this.appliedQuery && sameBookCatalogQuery(this.appliedQuery, query)) return;
    void this.router.navigate(['/books'], {
      queryParams: serializeBookCatalogQuery(query),
      replaceUrl,
    });
  }
}
