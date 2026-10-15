import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { LocationSelector } from '../../components/location-selector';
import { LocationCreation, LocationSelection } from '../../models/location.models';
import {
  ReconciliationDestination,
  ReconciliationDetail,
  ReconciliationGroup,
  ReconciliationPage,
  ReconciliationType,
} from '../../models/reconciliation.models';
import { LocationEditor } from '../../services/location-editor';
import { ReconciliationService } from '../../services/reconciliation.service';
import { ReconciliationBooksDialog } from '../../components/reconciliation-books-dialog';
import {
  ReconciliationConfirmDialog,
  ReconciliationConfirmation,
} from '../../components/reconciliation-confirm-dialog';

@Component({
  selector: 'app-location-reconciliation',
  providers: [LocationEditor],
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    RouterLink,
    LocationSelector,
  ],
  templateUrl: './location-reconciliation.html',
  styleUrl: './location-reconciliation.scss',
})
export class LocationReconciliation {
  private readonly service = inject(ReconciliationService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  readonly editor = inject(LocationEditor);
  readonly filters = new FormGroup({
    type: new FormControl<ReconciliationType>('ALL', { nonNullable: true }),
    text: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
  });
  readonly data = signal<ReconciliationPage | null>(null);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  readonly writeMessage = signal<string | null>(null);
  readonly sessionGroups = signal(0);
  readonly sessionBooks = signal(0);
  readonly active = signal<ReconciliationGroup | null>(null);
  readonly review = signal<ReconciliationDetail | null>(null);
  readonly shelfId = signal<number | null>(null);
  readonly incomplete = signal(false);
  readonly destination = computed<ReconciliationDestination | null>(() => {
    for (const room of this.editor.rooms() ?? [])
      for (const bookcase of room.bookcases) {
        const shelf = bookcase.shelves.find((s) => s.id === this.shelfId());
        if (shelf)
          return {
            roomId: room.id,
            roomName: room.name,
            bookcaseId: bookcase.id,
            bookcaseName: bookcase.name,
            shelfId: shelf.id,
            shelfName: shelf.name,
          };
      }
    return null;
  });
  readonly columns = [
    'room',
    'bookcase',
    'shelf',
    'counts',
    'state',
    'suggestion',
    'destination',
    'actions',
  ];
  private page = 0;
  private size = 20;
  private applied = { type: 'ALL' as ReconciliationType, text: '' };
  private get: Subscription | null = null;
  private ref: MatDialogRef<
    ReconciliationBooksDialog | ReconciliationConfirmDialog,
    unknown
  > | null = null;
  constructor() {
    this.load();
    this.destroyRef.onDestroy(() => this.ref?.close());
  }
  load() {
    if (this.pending() || this.ref) return;
    this.get?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.data.set(null);
    this.resetReview();
    this.get = this.service
      .groups(this.page, this.size, this.applied.type, this.applied.text)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(
            'No se pudieron actualizar los grupos y estadísticas. Reintentar repite solo la lectura.',
          );
        },
      });
  }
  apply() {
    if (this.pending() || this.ref || this.filters.invalid) return;
    this.applied = this.filters.getRawValue();
    this.page = 0;
    this.load();
  }
  clear() {
    if (this.pending() || this.ref) return;
    this.filters.reset({ type: 'ALL', text: '' });
    this.apply();
  }
  paginate(event: PageEvent) {
    if (this.pending() || this.ref) return;
    this.page = event.pageSize !== this.size ? 0 : event.pageIndex;
    this.size = event.pageSize;
    this.load();
  }
  private resetReview() {
    this.active.set(null);
    this.review.set(null);
    this.shelfId.set(null);
    this.incomplete.set(false);
  }
  choose(group: ReconciliationGroup) {
    if (this.pending() || this.loading() || this.ref) return;
    if (this.active()?.groupKey !== group.groupKey) {
      this.resetReview();
      this.active.set(group);
    }
  }
  select(selection: LocationSelection) {
    if (this.pending() || this.ref) return;
    this.shelfId.set(selection.shelfId);
    this.incomplete.set(selection.incomplete);
  }
  loadLocations() {
    if (!this.pending() && !this.ref) this.editor.load();
  }
  createLocation(request: LocationCreation) {
    if (!this.pending() && !this.ref) this.editor.create(request);
  }
  useSuggestion(group: ReconciliationGroup) {
    if (this.pending() || this.ref || !group.destinationSuggestion) return;
    this.choose(group);
    this.shelfId.set(group.destinationSuggestion.shelfId);
    this.incomplete.set(false);
    this.editor.load();
  }
  books(group: ReconciliationGroup) {
    if (this.pending() || this.ref || this.loading()) return;
    this.choose(group);
    const ref = this.dialog.open<ReconciliationBooksDialog, string, ReconciliationDetail>(
      ReconciliationBooksDialog,
      { data: group.groupKey, width: '52rem', maxWidth: '96vw' },
    );
    this.ref = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((detail) => {
        if (this.ref !== ref) return;
        this.ref = null;
        if (detail) {
          this.review.set(detail);
          this.active.set(detail.group);
        }
      });
  }
  reconcile(group: ReconciliationGroup) {
    const detail = this.review();
    const destination = this.destination();
    if (
      this.pending() ||
      this.ref ||
      this.loading() ||
      this.active()?.groupKey !== group.groupKey ||
      !detail ||
      !destination ||
      this.incomplete()
    )
      return;
    if (Date.parse(detail.expiresAt) <= Date.now()) {
      this.writeMessage.set('La revisión ha caducado. Abre Ver libros y revisa de nuevo.');
      this.review.set(null);
      return;
    }
    const ref = this.dialog.open<ReconciliationConfirmDialog, ReconciliationConfirmation, boolean>(
      ReconciliationConfirmDialog,
      { data: { detail, destination }, autoFocus: 'button', width: '38rem', maxWidth: '96vw' },
    );
    this.ref = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (this.ref !== ref) return;
        this.ref = null;
        if (confirmed !== true || this.pending()) return;
        this.pending.set(true);
        this.writeMessage.set(null);
        this.service
          .assign({
            reviewToken: detail.reviewToken,
            shelfId: destination.shelfId,
            expectedDestination: {
              room: destination.roomName,
              bookcase: destination.bookcaseName,
              shelf: destination.shelfName,
            },
          })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (response) => {
              this.pending.set(false);
              this.sessionGroups.update((n) => n + 1);
              this.sessionBooks.update((n) => n + response.affectedCount);
              this.writeMessage.set(`Conciliación confirmada: ${response.affectedCount} libros.`);
              this.load();
            },
            error: (error: unknown) => {
              this.pending.set(false);
              this.review.set(null);
              const http = error instanceof HttpErrorResponse ? error : null;
              const code = http?.error?.code;
              this.writeMessage.set(
                code === 'RECONCILIATION_EXPIRED'
                  ? 'La revisión ha caducado. Revisa de nuevo el grupo.'
                  : code === 'RECONCILIATION_DESTINATION_CHANGED'
                    ? 'El destino cambió de nombre. Actualiza las ubicaciones y vuelve a confirmar.'
                    : http?.status === 409
                      ? 'El grupo cambió o hubo un conflicto. Actualiza y revisa de nuevo; no se repite la escritura.'
                      : http?.status === 404
                        ? 'El grupo o la balda ya no existe. Actualiza y revisa de nuevo.'
                        : !http || http.status === 0 || http.status >= 500
                          ? 'Resultado incierto. No repitas la conciliación: actualiza y vuelve a abrir el grupo. Si desapareció, puede haber sido convertido. No se contabiliza como éxito.'
                          : 'No se pudo conciliar. Actualiza y revisa los datos.',
              );
            },
          });
      });
  }
}
