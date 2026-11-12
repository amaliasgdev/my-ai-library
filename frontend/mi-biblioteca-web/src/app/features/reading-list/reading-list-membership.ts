import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { FeedbackService } from '../../core/ui/feedback/feedback.service';
import { InlineFeedbackVariant } from '../../core/ui/feedback/inline-feedback';
import { ReadingListService } from './reading-list.service';

export type MembershipState = 'loading' | 'included' | 'absent' | 'error';

/** Page-scoped: one batch for the visible IDs, independent of catalog loading. */
@Injectable()
export class ReadingListMembership {
  private readonly api = inject(ReadingListService);
  private readonly feedback = inject(FeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  private query?: Subscription;
  private ids: number[] = [];
  private generation = 0;
  private revision: string | null = null;
  readonly states = signal<ReadonlyMap<number, MembershipState>>(new Map());
  readonly busy = signal(false);
  readonly message = signal('');
  readonly messageVariant = signal<InlineFeedbackVariant>('info');

  setBooks(ids: readonly number[]): void {
    const next = [...new Set(ids)];
    if (next.length === this.ids.length && next.every((id, index) => id === this.ids[index]))
      return;
    this.ids = next;
    this.query?.unsubscribe();
    this.generation++;
    this.revision = null;
    this.states.set(new Map(next.map((id) => [id, 'loading'])));
    if (!this.busy()) this.refresh();
  }

  state(id: number): MembershipState {
    return this.states().get(id) ?? 'loading';
  }

  refresh(): void {
    if (this.busy()) return;
    this.query?.unsubscribe();
    const generation = ++this.generation;
    const ids = [...this.ids];
    this.revision = null;
    this.states.set(new Map(ids.map((id) => [id, 'loading'])));
    if (!ids.length) return;
    this.query = this.api
      .membership(ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (generation !== this.generation) return;
          this.revision = response.revision;
          const states = new Map<number, MembershipState>(ids.map((id) => [id, 'error']));
          for (const item of response.items) {
            if (states.has(item.bookId))
              states.set(item.bookId, item.included ? 'included' : 'absent');
          }
          this.states.set(states);
        },
        error: () => {
          if (generation === this.generation)
            this.states.set(new Map(ids.map((id) => [id, 'error'])));
        },
      });
  }

  add(bookId: number): void {
    if (this.busy() || this.revision === null || this.state(bookId) !== 'absent') return;
    const revision = this.revision;
    this.busy.set(true);
    this.query?.unsubscribe();
    this.generation++;
    this.messageVariant.set('info');
    this.message.set('Añadiendo a la lista de lectura…');
    this.api
      .add(bookId, revision)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.message.set('');
          this.feedback.success('Libro añadido a la lista de lectura.');
          this.refresh();
        },
        error: (error: unknown) => {
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          this.busy.set(false);
          this.messageVariant.set(
            status === 409 || status === 0 || status >= 500 ? 'warning' : 'error',
          );
          this.message.set(
            status === 409
              ? 'La lista ha cambiado o el libro ya está incluido. Se consulta la pertenencia actual.'
              : status === 0 || status >= 500
                ? 'Resultado incierto: podría haberse añadido. Se consulta la pertenencia sin repetir el alta.'
                : 'No se pudo añadir el libro. Se consulta la pertenencia actual.',
          );
          this.refresh();
        },
      });
  }
}
