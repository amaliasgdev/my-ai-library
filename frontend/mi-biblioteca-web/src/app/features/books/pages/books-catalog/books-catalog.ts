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
import { RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import {
  BehaviorSubject,
  catchError,
  finalize,
  map,
  Observable,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { BookCard } from '../../components/book-card/book-card';
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
import { searchCriteriaValidator, searchIsbnValidator } from './books-catalog.search-validators';

type CatalogQuery = BooksPageRequest & {
  search: BookSearchRequest | null;
  sort: BookCatalogSort;
  afterDelete?: boolean;
};

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
  providers: [{ provide: MatPaginatorIntl, useFactory: spanishPaginator }],
  templateUrl: './books-catalog.html',
  styleUrl: './books-catalog.scss',
})
export class BooksCatalog {
  private readonly booksService = inject(BooksService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private confirmation: MatDialogRef<BookDeleteDialog, boolean> | null = null;
  private datesDialog: MatDialogRef<BookReadingDatesDialog> | null = null;
  private restoreFocusAfterReload = false;
  readonly currentSort = signal<BookCatalogSort>({ sortBy: 'title', direction: 'ASC' });
  protected readonly sortOptions: { value: BookCatalogSort['sortBy']; label: string }[] = [
    { value: 'title', label: 'Título' },
    { value: 'author', label: 'Autor' },
    { value: 'createdAt', label: 'Fecha de creación' },
    { value: 'readingStatus', label: 'Estado de lectura' },
    { value: 'rating', label: 'Valoración' },
  ];
  private readonly query = new BehaviorSubject<CatalogQuery>({
    page: 0,
    size: 20,
    search: null,
    sort: { ...this.currentSort() },
  });
  private lastRequestedQuery: CatalogQuery = this.query.value;
  readonly currentSearch = signal<BookSearchRequest | null>(null);
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
      return this.currentSearch()
        ? 'No se encontraron libros'
        : 'Tu biblioteca todavía no tiene libros';
    if (state.response.content.length === 0) return 'No hay libros en esta página';
    return `Mostrando ${state.response.content.length} de ${state.response.totalElements} libros`;
  });

  constructor() {
    this.query
      .pipe(
        switchMap((query) =>
          this.fetchPage(query).pipe(
            switchMap((response) =>
              query.afterDelete && response.content.length === 0 && response.page > 0
                ? this.fetchPage({ ...query, page: response.page - 1, afterDelete: false })
                : of(response),
            ),
            map((response): CatalogState => ({ status: 'success', response })),
            catchError((error: unknown) =>
              of<CatalogState>({
                status: 'error',
                message: query.search ? searchError(error) : catalogError(error),
              }),
            ),
            startWith<CatalogState>({ status: 'loading' }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        if (state.status === 'success') {
          this.pageIndex.set(state.response.page);
          this.pageSize.set(state.response.size);
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
  }

  onPageChange(event: PageEvent): void {
    if (this.deletingId() !== null) return;
    const page = event.pageSize === this.pageSize() ? event.pageIndex : 0;
    this.loadPage(page, event.pageSize);
  }

  protected retry(): void {
    if (this.deletingId() !== null) return;
    this.pageIndex.set(this.lastRequestedQuery.page ?? 0);
    this.pageSize.set(this.lastRequestedQuery.size ?? 20);
    this.query.next({ ...this.lastRequestedQuery });
  }

  protected firstPage(): void {
    this.loadPage(0, this.pageSize());
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
    if (value.isbn.trim()) criteria.isbn = value.isbn;
    this.currentSearch.set(criteria);
    this.deleteError.set(null);
    this.loadPage(0, this.pageSize());
  }

  clearSearch(): void {
    if (this.deletingId() !== null) return;
    this.searchForm.reset();
    this.currentSearch.set(null);
    this.deleteError.set(null);
    this.loadPage(0, this.pageSize());
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
    this.currentSort.set(sort);
    this.loadPage(0, this.pageSize());
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
      {
        data: { title: book.title },
        autoFocus: '.cancel-delete',
        restoreFocus: true,
        ariaDescribedBy: 'book-delete-description',
        width: '28rem',
        maxWidth: 'calc(100vw - 2rem)',
      },
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
          this.loadPage(this.pageIndex(), this.pageSize(), true);
        },
        error: (error: unknown) => {
          let message = 'No se pudo eliminar el libro';
          if (error instanceof HttpErrorResponse) {
            if (error.status === 404) message = 'El libro ya no existe';
            else if (error.status === 0) message = 'No se puede conectar con el servidor';
            else if (error.status >= 500 && error.status < 600)
              message = 'El servidor no pudo eliminar el libro';
          }
          this.deleteError.set(message);
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
    const startedQuery = this.query.value;
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
              this.currentSort().sortBy === 'readingStatus') ||
            (action === 'rating' && this.currentSort().sortBy === 'rating');
          if (
            !book ||
            affectsOrder ||
            state.status !== 'success' ||
            this.query.value !== startedQuery ||
            !state.response.content.some((item) => item.id === id)
          ) {
            this.restoreFocusAfterReload = true;
            this.loadPage(this.pageIndex(), this.pageSize());
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

  private fetchPage(query: CatalogQuery): Observable<BookPageResponse> {
    this.lastRequestedQuery = { ...query };
    const options: BooksPageRequest = {
      page: query.page,
      size: query.size,
      sortBy: query.sort.sortBy,
      direction: query.sort.direction,
    };
    const request = query.search
      ? this.booksService.searchBooks(query.search, options)
      : this.booksService.getBooks(options);
    return request.pipe(
      map((response) => {
        // HTTP generic types do not validate the actual JSON response.
        if (!response || !Array.isArray(response.content))
          throw new Error('Invalid book page response');
        return response;
      }),
    );
  }

  private loadPage(page: number, size: number, afterDelete = false): void {
    this.pageIndex.set(page);
    this.pageSize.set(size);
    this.query.next({
      page,
      size,
      afterDelete,
      search: this.currentSearch(),
      sort: { ...this.currentSort() },
    });
  }
}
