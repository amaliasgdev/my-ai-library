import { HttpErrorResponse } from '@angular/common/http';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import {
  catchError,
  finalize,
  forkJoin,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';
import { FeedbackService } from '../../../../core/ui/feedback/feedback.service';
import { EmptyState } from '../../../../core/ui/feedback/empty-state';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { LoadingState } from '../../../../core/ui/feedback/loading-state';
import { BookResponse } from '../../../books/models/book.models';
import {
  SagaBookPickerDialog,
  SagaBookPickerDialogData,
} from '../../components/saga-book-picker-dialog/saga-book-picker-dialog';
import { sagaBookPickerDialogConfig } from '../../components/saga-book-picker-dialog/saga-book-picker-dialog.helpers';
import {
  SagaDeleteDialog,
  SagaDeleteDialogData,
} from '../../components/saga-delete-dialog/saga-delete-dialog';
import { sagaDeleteDialogConfig } from '../../components/saga-delete-dialog/saga-delete-dialog.helpers';
import { SagaVolumeCard } from '../../components/saga-volume-card/saga-volume-card';
import {
  SagaVolumeConfirmDialog,
  SagaVolumeConfirmDialogData,
} from '../../components/saga-volume-confirm-dialog/saga-volume-confirm-dialog';
import { sagaVolumeConfirmDialogConfig } from '../../components/saga-volume-confirm-dialog/saga-volume-confirm-dialog.helpers';
import {
  SagaVolumeFormDialog,
  SagaVolumeFormDialogData,
  SagaVolumeFormDialogResult,
} from '../../components/saga-volume-form-dialog/saga-volume-form-dialog';
import { sagaVolumeFormDialogConfig } from '../../components/saga-volume-form-dialog/saga-volume-form-dialog.helpers';
import {
  problemCode,
  sagaDeleteError,
  sagaLoadError,
  sagaVolumeErrorMessage,
  sagaVolumeRefreshRequired,
} from '../../models/saga-error';
import { parseSagaId } from '../../models/saga-id';
import { parseSagaListQuery, serializeSagaListQuery } from '../../models/saga-list-query';
import { collectionPercent, readingPercent } from '../../models/saga-progress';
import { SagaResponse, SagaVolume, SagaVolumesResponse } from '../../models/saga.models';
import { SagasService } from '../../services/sagas.service';

type DetailState =
  | { status: 'loading' }
  | { status: 'loaded'; saga: SagaResponse; volumes: SagaVolumesResponse }
  | { status: 'error'; message: string };

type LoadedState = Extract<DetailState, { status: 'loaded' }>;

@Component({
  selector: 'app-saga-detail',
  imports: [
    DragDropModule,
    MatButtonModule,
    MatProgressBarModule,
    RouterLink,
    EmptyState,
    InlineFeedback,
    LoadingState,
    SagaVolumeCard,
  ],
  templateUrl: './saga-detail.html',
  styleUrl: './saga-detail.scss',
})
export class SagaDetail {
  private readonly service = inject(SagasService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly feedback = inject(FeedbackService);
  private readonly loadId = new Subject<number>();
  private confirmation: MatDialogRef<SagaDeleteDialog, boolean> | null = null;
  private volumeFormRef: MatDialogRef<SagaVolumeFormDialog, SagaVolumeFormDialogResult> | null =
    null;
  private bookPickerRef: MatDialogRef<SagaBookPickerDialog, BookResponse> | null = null;
  private volumeConfirmRef: MatDialogRef<SagaVolumeConfirmDialog, boolean> | null = null;
  readonly currentId = signal<number | null>(null);
  readonly listParams = signal<Params>({});
  readonly state = signal<DetailState>({ status: 'loading' });
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);
  readonly imageFailed = signal(false);
  readonly volumeBusy = signal(false);
  readonly volumeError = signal<string | null>(null);
  readonly refreshError = signal<string | null>(null);
  readonly announcement = signal('');
  readonly busy = computed(
    () => this.deleting() || this.volumeBusy() || this.state().status === 'loading',
  );
  protected readonly collectionPercent = collectionPercent;
  protected readonly readingPercent = readingPercent;

  constructor() {
    this.loadId
      .pipe(
        switchMap((id) => {
          if (!id) {
            return of<DetailState>({
              status: 'error',
              message: 'El identificador de la saga no es válido',
            });
          }
          return forkJoin({
            saga: this.service.getSaga(id),
            volumes: this.service.getVolumes(id),
          }).pipe(
            map(({ saga, volumes }): DetailState => ({ status: 'loaded', saga, volumes })),
            catchError((error: unknown) =>
              of<DetailState>({ status: 'error', message: sagaLoadError(error) }),
            ),
            startWith<DetailState>({ status: 'loading' }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.state.set(state));

    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rawId) => {
        const id = parseSagaId(rawId);
        this.currentId.set(id);
        this.deleteError.set(null);
        this.volumeError.set(null);
        this.refreshError.set(null);
        this.imageFailed.set(false);
        this.loadId.next(id ?? 0);
      });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.listParams.set(serializeSagaListQuery(parseSagaListQuery(params)));
    });

    this.destroyRef.onDestroy(() => {
      this.confirmation?.close(false);
      this.volumeFormRef?.close();
      this.bookPickerRef?.close();
      this.volumeConfirmRef?.close(false);
    });
  }

  retry(): void {
    const id = this.currentId();
    if (!id) return;
    this.deleteError.set(null);
    this.volumeError.set(null);
    this.refreshError.set(null);
    this.loadId.next(id);
  }

  retryRefresh(): void {
    this.reloadVolumes();
  }

  openAddBook(): void {
    const current = this.loaded();
    if (!current || this.busy() || this.bookPickerRef) return;
    const data: SagaBookPickerDialogData = {
      title: 'Añadir libro de la biblioteca',
      actionLabel: 'Añadir a la saga',
      excludedBookIds: this.linkedBookIds(current),
    };
    const ref = this.dialog.open<SagaBookPickerDialog, SagaBookPickerDialogData, BookResponse>(
      SagaBookPickerDialog,
      sagaBookPickerDialogConfig(data),
    );
    this.bookPickerRef = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((book) => {
        if (this.bookPickerRef !== ref) return;
        this.bookPickerRef = null;
        if (!book) return;
        this.runWrite(
          this.service.addVolume(current.saga.id, {
            bookId: book.id,
            pendingTitle: null,
            volumeLabel: null,
            expectedRevision: current.volumes.revision,
          }),
          'Libro añadido a la saga.',
        );
      });
  }

  openAddPending(): void {
    const current = this.loaded();
    if (!current || this.busy() || this.volumeFormRef) return;
    const ref = this.dialog.open<
      SagaVolumeFormDialog,
      SagaVolumeFormDialogData,
      SagaVolumeFormDialogResult
    >(SagaVolumeFormDialog, sagaVolumeFormDialogConfig('add-pending'));
    this.volumeFormRef = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (this.volumeFormRef !== ref) return;
        this.volumeFormRef = null;
        if (!result) return;
        this.runWrite(
          this.service.addVolume(current.saga.id, {
            bookId: null,
            pendingTitle: result.pendingTitle,
            volumeLabel: result.volumeLabel,
            expectedRevision: current.volumes.revision,
          }),
          'Volumen pendiente añadido.',
        );
      });
  }

  editVolume(volume: SagaVolume): void {
    const current = this.loaded();
    if (!current || this.busy() || this.volumeFormRef) return;
    const ref = this.dialog.open<
      SagaVolumeFormDialog,
      SagaVolumeFormDialogData,
      SagaVolumeFormDialogResult
    >(SagaVolumeFormDialog, sagaVolumeFormDialogConfig('edit', volume));
    this.volumeFormRef = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (this.volumeFormRef !== ref) return;
        this.volumeFormRef = null;
        if (!result) return;
        this.runWrite(
          this.service.updateVolume(current.saga.id, volume.id, {
            pendingTitle: result.pendingTitle,
            volumeLabel: result.volumeLabel,
            expectedRevision: current.volumes.revision,
          }),
          'Volumen actualizado.',
        );
      });
  }

  linkVolume(volume: SagaVolume): void {
    const current = this.loaded();
    if (!current || this.busy() || this.bookPickerRef) return;
    const data: SagaBookPickerDialogData = {
      title: 'Vincular a un libro',
      actionLabel: 'Vincular',
      excludedBookIds: this.linkedBookIds(current),
    };
    const ref = this.dialog.open<SagaBookPickerDialog, SagaBookPickerDialogData, BookResponse>(
      SagaBookPickerDialog,
      sagaBookPickerDialogConfig(data),
    );
    this.bookPickerRef = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((book) => {
        if (this.bookPickerRef !== ref) return;
        this.bookPickerRef = null;
        if (!book) return;
        this.runWrite(
          this.service.linkVolume(current.saga.id, volume.id, {
            bookId: book.id,
            expectedRevision: current.volumes.revision,
          }),
          'Volumen vinculado al libro.',
        );
      });
  }

  unlinkVolume(volume: SagaVolume): void {
    const current = this.loaded();
    if (!current || this.busy() || this.volumeConfirmRef) return;
    this.openVolumeConfirm('unlink', volume, (confirmed) => {
      if (!confirmed) return;
      this.runWrite(
        this.service.unlinkVolume(current.saga.id, volume.id, {
          pendingTitle: null,
          expectedRevision: current.volumes.revision,
        }),
        'Libro desvinculado; el volumen sigue en la saga.',
      );
    });
  }

  removeVolume(volume: SagaVolume): void {
    const current = this.loaded();
    if (!current || this.busy() || this.volumeConfirmRef) return;
    this.openVolumeConfirm('remove', volume, (confirmed) => {
      if (!confirmed) return;
      this.runWrite(
        this.service.deleteVolume(current.saga.id, volume.id, current.volumes.revision),
        'Volumen quitado de la saga.',
      );
    });
  }

  moveUp(volume: SagaVolume): void {
    this.moveTo(volume, volume.position - 1);
  }

  moveDown(volume: SagaVolume): void {
    this.moveTo(volume, volume.position + 1);
  }

  drop(event: CdkDragDrop<SagaVolume[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const volume = event.item.data as SagaVolume;
    this.moveTo(volume, event.currentIndex + 1);
  }

  openDeleteDialog(): void {
    const current = this.state();
    if (current.status !== 'loaded' || this.deleting() || this.confirmation) return;
    const saga = current.saga;
    const ref = this.dialog.open<SagaDeleteDialog, SagaDeleteDialogData, boolean>(
      SagaDeleteDialog,
      sagaDeleteDialogConfig(saga.name),
    );
    this.confirmation = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (this.confirmation !== ref) return;
        this.confirmation = null;
        if (confirmed && !this.deleting()) this.deleteSaga(saga);
      });
  }

  private openVolumeConfirm(
    mode: 'remove' | 'unlink',
    volume: SagaVolume,
    action: (confirmed: boolean) => void,
  ): void {
    const ref = this.dialog.open<SagaVolumeConfirmDialog, SagaVolumeConfirmDialogData, boolean>(
      SagaVolumeConfirmDialog,
      sagaVolumeConfirmDialogConfig(mode, this.volumeTitle(volume)),
    );
    this.volumeConfirmRef = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (this.volumeConfirmRef !== ref) return;
        this.volumeConfirmRef = null;
        action(!!confirmed);
      });
  }

  private moveTo(volume: SagaVolume, position: number): void {
    const current = this.loaded();
    if (!current || this.busy()) return;
    if (position < 1 || position > current.volumes.volumes.length) return;
    if (position === volume.position) return;
    this.runWrite(
      this.service.moveVolume(current.saga.id, volume.id, {
        toPosition: position,
        expectedRevision: current.volumes.revision,
      }),
      `Volumen movido a la posición ${position}.`,
    );
  }

  private runWrite(operation: Observable<unknown>, successMessage: string): void {
    const current = this.loaded();
    if (!current || this.volumeBusy()) return;
    this.volumeError.set(null);
    this.refreshError.set(null);
    this.volumeBusy.set(true);
    operation
      .pipe(
        switchMap(() =>
          this.service.getVolumes(current.saga.id).pipe(
            map((volumes) => ({ kind: 'success' as const, volumes })),
            catchError(() => of({ kind: 'refresh-error' as const })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.volumeBusy.set(false);
          this.feedback.success(successMessage);
          this.announcement.set(successMessage);
          if (result.kind === 'success') {
            this.applyVolumes(current.saga, result.volumes);
          } else {
            this.refreshError.set(
              'La operación se completó, pero no se pudo actualizar la lista de volúmenes.',
            );
          }
        },
        error: (error: unknown) => {
          this.volumeBusy.set(false);
          this.volumeError.set(sagaVolumeErrorMessage(error));
          if (sagaVolumeRefreshRequired(error)) this.reloadVolumes();
        },
      });
  }

  private reloadVolumes(): void {
    const current = this.loaded();
    if (!current || this.volumeBusy()) return;
    this.volumeBusy.set(true);
    this.refreshError.set(null);
    this.service
      .getVolumes(current.saga.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.volumeBusy.set(false)),
      )
      .subscribe({
        next: (volumes) => this.applyVolumes(current.saga, volumes),
        error: () => {
          this.refreshError.set(
            'No se pudo actualizar la lista de volúmenes. Puedes reintentar la actualización.',
          );
        },
      });
  }

  private applyVolumes(saga: SagaResponse, volumes: SagaVolumesResponse): void {
    this.state.set({
      status: 'loaded',
      saga: {
        ...saga,
        revision: volumes.revision,
        progress: volumes.progress,
      },
      volumes,
    });
  }

  private deleteSaga(saga: SagaResponse): void {
    if (this.deleting()) return;
    this.deleteError.set(null);
    this.deleting.set(true);
    this.service
      .deleteSaga(saga.id, saga.revision)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deleting.set(false)),
      )
      .subscribe({
        next: () => {
          this.feedback.success('Saga eliminada.');
          const params = this.listParams();
          if (Object.keys(params).length)
            void this.router.navigate(['/sagas'], { queryParams: params });
          else void this.router.navigate(['/sagas']);
        },
        error: (error: unknown) => {
          this.deleteError.set(sagaDeleteError(error));
          if (
            error instanceof HttpErrorResponse &&
            problemCode(error.error) === 'SAGA_REVISION_CONFLICT'
          ) {
            this.reloadSagaAndVolumes();
          }
        },
      });
  }

  private reloadSagaAndVolumes(): void {
    const id = this.currentId();
    if (id) this.loadId.next(id);
  }

  private loaded(): LoadedState | null {
    const state = this.state();
    return state.status === 'loaded' ? state : null;
  }

  private linkedBookIds(current: LoadedState): number[] {
    return current.volumes.volumes
      .map((volume) => volume.bookId)
      .filter((id): id is number => id !== null);
  }

  private volumeTitle(volume: SagaVolume): string {
    return volume.book?.title ?? volume.pendingTitle ?? 'este volumen';
  }
}
