import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  map,
  of,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';
import { EmptyState } from '../../../../core/ui/feedback/empty-state';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { LoadingState } from '../../../../core/ui/feedback/loading-state';
import { readingPercent } from '../../models/saga-progress';
import {
  isCanonicalSagaListQuery,
  parseSagaListQuery,
  SAGA_PAGE_SIZES,
  SagaListQuery,
  sameSagaListQuery,
  serializeSagaListQuery,
} from '../../models/saga-list-query';
import { spanishSagaPaginator } from '../../models/saga-paginator';
import { SagaPageResponse } from '../../models/saga.models';
import { SagasService } from '../../services/sagas.service';

type ListState =
  | { status: 'loading' }
  | { status: 'success'; response: SagaPageResponse }
  | { status: 'error'; message: string };

function listError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status === 400) return 'No se pudo cargar la lista con estos parámetros';
    if (error.status >= 500 && error.status < 600) return 'El servidor no pudo cargar las sagas';
  }
  return 'No se pudieron cargar las sagas';
}

@Component({
  selector: 'app-sagas-list',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    ReactiveFormsModule,
    RouterLink,
    EmptyState,
    InlineFeedback,
    LoadingState,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: spanishSagaPaginator }],
  templateUrl: './sagas-list.html',
  styleUrl: './sagas-list.scss',
})
export class SagasList {
  private readonly service = inject(SagasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly reload = new Subject<void>();
  private lastSyncedName = '';
  readonly query = signal<SagaListQuery>({ page: 0, size: 20, name: '' });
  readonly pageIndex = computed(() => this.query().page);
  readonly pageSize = computed(() => this.query().size);
  readonly appliedName = computed(() => this.query().name);
  readonly state = signal<ListState>({ status: 'loading' });
  readonly totalElements = signal(0);
  readonly failedImages = signal<ReadonlySet<number>>(new Set());
  readonly pageSizeOptions = [...SAGA_PAGE_SIZES];
  readonly listQueryParams = computed(() => serializeSagaListQuery(this.query()));
  readonly hasSearch = computed(() => this.appliedName().length > 0);
  readonly isEmpty = computed(() => {
    const state = this.state();
    return state.status === 'success' && state.response.totalElements === 0 && !this.hasSearch();
  });
  readonly noResults = computed(() => {
    const state = this.state();
    return state.status === 'success' && state.response.totalElements === 0 && this.hasSearch();
  });
  readonly announcement = computed(() => {
    const state = this.state();
    if (state.status !== 'success' || state.response.totalElements === 0) return '';
    return `Mostrando ${state.response.content.length} de ${state.response.totalElements} sagas`;
  });
  readonly searchForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
  });
  protected readonly readingPercent = readingPercent;

  constructor() {
    this.route.queryParamMap
      .pipe(
        map((params) => {
          const query = parseSagaListQuery(params);
          if (!isCanonicalSagaListQuery(params, query)) {
            void this.router.navigate(['/sagas'], {
              queryParams: serializeSagaListQuery(query),
              replaceUrl: true,
            });
            return null;
          }
          return query;
        }),
        distinctUntilChanged(
          (first, second) =>
            first === second ||
            (first !== null && second !== null && sameSagaListQuery(first, second)),
        ),
        switchMap((query) => {
          if (!query) return EMPTY;
          this.query.set(query);
          if (query.name !== this.lastSyncedName) {
            this.searchForm.controls.name.setValue(query.name);
            this.lastSyncedName = query.name;
          }
          return this.reload.pipe(
            startWith(undefined),
            switchMap(() =>
              this.service
                .getSagas({
                  page: query.page,
                  size: query.size,
                  sortBy: 'name',
                  direction: 'ASC',
                  name: query.name,
                })
                .pipe(
                  map((response): ListState => ({ status: 'success', response })),
                  catchError((error: unknown) =>
                    of<ListState>({ status: 'error', message: listError(error) }),
                  ),
                  startWith<ListState>({ status: 'loading' }),
                ),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => {
        if (state.status === 'success') this.totalElements.set(state.response.totalElements);
        this.state.set(state);
      });
  }

  submitSearch(): void {
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      this.element.nativeElement
        .querySelector<HTMLInputElement>('[formControlName="name"]')
        ?.focus();
      return;
    }
    this.navigate({
      ...this.query(),
      page: 0,
      name: this.searchForm.controls.name.value.trim(),
    });
  }

  clearSearch(): void {
    this.searchForm.reset();
    this.lastSyncedName = '';
    this.navigate({ ...this.query(), page: 0, name: '' });
  }

  onPageChange(event: PageEvent): void {
    const page = event.pageSize === this.query().size ? event.pageIndex : 0;
    this.navigate({
      ...this.query(),
      page,
      size: event.pageSize,
    });
  }

  retry(): void {
    this.reload.next();
  }

  imageFailed(id: number): boolean {
    return this.failedImages().has(id);
  }

  markImageFailed(id: number): void {
    this.failedImages.update((failed) => new Set(failed).add(id));
  }

  private navigate(query: SagaListQuery): void {
    if (sameSagaListQuery(query, this.query())) return;
    void this.router.navigate(['/sagas'], {
      queryParams: serializeSagaListQuery(query),
    });
  }
}
