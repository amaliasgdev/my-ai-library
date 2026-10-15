import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription } from 'rxjs';
import { InventorySessionResponse } from '../models/inventory-session.models';

/** Page-scoped write state. A read must synchronize the screen after every attempted write. */
@Injectable()
export class InventoryWrite {
  private readonly destroyRef = inject(DestroyRef);
  private request: Subscription | null = null;
  readonly pending = signal(false);
  readonly needsRead = signal(false);
  readonly message = signal<string | null>(null);
  run(
    request: Observable<InventorySessionResponse>,
    success: (value: InventorySessionResponse) => void,
    read: () => void,
  ) {
    if (this.pending() || this.needsRead()) return;
    this.pending.set(true);
    this.message.set(null);
    this.request = request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        this.pending.set(false);
        this.needsRead.set(true);
        this.message.set('Cambio confirmado.');
        success(value);
      },
      error: (error: unknown) => {
        this.pending.set(false);
        this.needsRead.set(true);
        const http = error instanceof HttpErrorResponse ? error : null;
        this.message.set(
          http?.status === 409
            ? 'La sesión cambió o ya existe una activa. Se consultará el estado actual; no se repetirá la escritura.'
            : http?.status === 400
              ? 'Datos inválidos. Revisa las notas (máximo 2000 caracteres).'
              : http?.status === 404
                ? 'La balda o sesión ya no existe.'
                : 'Resultado incierto. Se consultará el estado actual. No repitas la escritura sin revisar; cancelar la petición no revierte cambios del servidor.',
        );
        read();
      },
    });
  }
  synchronized() {
    this.needsRead.set(false);
  }
  reset() {
    this.request?.unsubscribe();
    this.pending.set(false);
    this.needsRead.set(false);
    this.message.set(null);
  }
}
