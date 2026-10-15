import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { catchError, distinctUntilChanged, map, of, startWith, Subject, switchMap } from 'rxjs';
import {
  inventoryId,
  inventoryPaging,
  INVENTORY_STATUS_LABELS,
  InventorySessionResponse,
} from '../../models/inventory-session.models';
import { InventorySessionsService } from '../../services/inventory-sessions.service';
import { InventoryWrite } from '../../services/inventory-write';
import { InventorySessionConfirmDialog } from '../../components/inventory-session-confirm-dialog';

@Component({
  selector: 'app-inventory-session-detail',
  providers: [InventoryWrite],
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './inventory-session-detail.html',
  styleUrl: './inventory-session-detail.scss',
})
export class InventorySessionDetail {
  private readonly service = inject(InventorySessionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  readonly write = inject(InventoryWrite);
  readonly session = signal<InventorySessionResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly labels = INVENTORY_STATUS_LABELS;
  readonly notes = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(2000)],
  });
  private readonly reload = new Subject<void>();
  private id: number | null = null;
  private ref: MatDialogRef<InventorySessionConfirmDialog, boolean> | null = null;
  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => inventoryId(params.get('id'))),
        distinctUntilChanged(),
        switchMap((id) => {
          this.ref?.close();
          this.ref = null;
          this.write.reset();
          this.id = id;
          this.notes.reset('');
          return this.reload.pipe(
            startWith(undefined),
            switchMap(() => {
              this.session.set(null);
              this.error.set(null);
              this.loading.set(id !== null);
              if (id === null) {
                this.error.set('Identificador de sesión inválido.');
                return of(null);
              }
              return this.service.get(id).pipe(
                catchError(() => {
                  this.error.set('No se pudo cargar la sesión. Reintentar repite solo GET.');
                  return of(null);
                }),
              );
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((session) => {
        this.session.set(session);
        this.loading.set(false);
        if (session) {
          this.write.synchronized();
          if (!this.notes.dirty || session.status !== 'IN_PROGRESS')
            this.notes.reset(session.notes ?? '');
        }
      });
    this.destroyRef.onDestroy(() => {
      this.ref?.close();
      this.ref = null;
    });
  }
  paging() {
    return inventoryPaging(this.route.snapshot.queryParamMap);
  }
  retry() {
    if (!this.write.pending() && !this.ref && this.id !== null) this.reload.next();
  }
  save() {
    const session = this.session();
    this.notes.markAsTouched();
    if (
      !session ||
      session.status !== 'IN_PROGRESS' ||
      this.notes.invalid ||
      this.write.pending() ||
      this.write.needsRead() ||
      this.ref
    )
      return;
    this.write.run(
      this.service.notes(session.id, this.notes.value || null),
      () => {
        this.notes.markAsPristine();
        this.retry();
      },
      () => this.retry(),
    );
  }
  closeSession(action: 'complete' | 'cancel') {
    const session = this.session();
    if (
      !session ||
      session.status !== 'IN_PROGRESS' ||
      this.write.pending() ||
      this.write.needsRead() ||
      this.ref
    )
      return;
    const dirtyNotes = this.notes.dirty && this.notes.value !== (session.notes ?? '');
    const ref = this.dialog.open<InventorySessionConfirmDialog, unknown, boolean>(
      InventorySessionConfirmDialog,
      {
        data: { action, shelf: session.shelf, dirtyNotes },
        autoFocus: 'button',
        width: '34rem',
        maxWidth: '96vw',
      },
    );
    this.ref = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (this.ref !== ref) return;
        this.ref = null;
        if (confirmed !== true) return;
        if (dirtyNotes) {
          this.notes.reset(session.notes ?? '');
          this.closeSession(action);
          return;
        }
        this.write.run(
          action === 'complete'
            ? this.service.complete(session.id)
            : this.service.cancel(session.id),
          () => this.retry(),
          () => this.retry(),
        );
      });
  }
}
