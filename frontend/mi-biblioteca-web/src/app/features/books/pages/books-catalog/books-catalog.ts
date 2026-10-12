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
  BookPageResponse,
  BookResponse,
  BookSearchRequest,
  BooksPageRequest,
} from '../../models/book.models';
import { BooksService } from '../../services/books.service';
import { searchCriteriaValidator, searchIsbnValidator } from './books-catalog.search-validators';

type CatalogQuery = BooksPageRequest & {
  search: BookSearchRequest | null;
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
  private restoreFocusAfterReload = false;
  private readonly query = new BehaviorSubject<CatalogQuery>({
    page: 0,
    size: 20,
    search: null,
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

  openDeleteDialog(book: BookResponse): void {
    if (this.confirmation || this.deletingId() !== null || this.state().status !== 'success')
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
        if (confirmed === true && this.deletingId() === null) this.deleteBook(book.id);
      });
  }

  private deleteBook(id: number): void {
    if (this.deletingId() !== null) return;
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

  private fetchPage(query: CatalogQuery): Observable<BookPageResponse> {
    this.lastRequestedQuery = { ...query };
    const options: BooksPageRequest = {
      page: query.page,
      size: query.size,
      sortBy: 'title',
      direction: 'ASC',
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
    this.query.next({ page, size, afterDelete, search: this.currentSearch() });
  }
}
