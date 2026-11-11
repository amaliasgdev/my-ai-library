import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subscription, concatMap, forkJoin, from, take, map } from 'rxjs';
import { ReadingListService } from '../../../reading-list/reading-list.service';
import {
  ReadingListMembershipResponse,
  ReadingListResponse,
} from '../../../reading-list/reading-list.models';
import {
  PhotoImportConfirmDialog,
  PhotoImportConfirmation,
} from '../../components/photo-import-confirm-dialog/photo-import-confirm-dialog';
import type { PhotoImportCandidate } from './photo-import-workflow';

export type PhotoReadingState =
  'available' | 'included' | 'checking' | 'unknown' | 'adding' | 'added' | 'error' | 'uncertain';
export interface PhotoReadingEntry {
  bookId: number;
  title: string;
  confirmed: boolean;
  state: PhotoReadingState;
  selected: boolean;
  absentConfirmed: boolean;
  message: string | null;
}
const revisionValid = (value: unknown): value is string =>
  typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);

/** Separate post-import action; never creates Books or changes reading status/dates. */
@Injectable()
export class PhotoReadingListWorkflow {
  private readonly api = inject(ReadingListService);
  private readonly dialogs = inject(MatDialog);
  private readonly destroy = inject(DestroyRef);
  private query?: Subscription;
  private write?: Subscription;
  private dialog?: MatDialogRef<PhotoImportConfirmDialog, boolean>;
  private candidates: readonly PhotoImportCandidate[] = [];
  private identities = new Set<string>();
  private order: number[] = [];
  private generation = 0;
  private readonly uncertain = new Set<number>();
  private readonly addedIds = new Set<number>();
  private readonly includedIds = new Set<number>();
  private blocked = () => false;
  setBlocker(blocked: () => boolean) {
    this.blocked = blocked;
  }
  private unavailable() {
    return this.locked() || this.blocked();
  }
  readonly entries = signal<PhotoReadingEntry[]>([]);
  readonly busy = signal(false);
  readonly confirming = signal(false);
  readonly checking = signal(false);
  readonly stopped = signal(false);
  readonly message = signal('');
  readonly locked = computed(() => this.busy() || this.confirming());
  readonly selectedCount = computed(
    () => this.entries().filter((e) => e.selected && e.state === 'available' && e.confirmed).length,
  );
  readonly pending = computed(
    () =>
      this.selectedCount() > 0 ||
      this.entries().some(
        (e) => this.uncertain.has(e.bookId) && !['included', 'added'].includes(e.state),
      ),
  );
  readonly summary = computed(() => ({
    added: this.entries().filter((e) => e.state === 'added').length,
    included: this.entries().filter((e) => e.state === 'included').length,
    errors: this.entries().filter((e) => e.state === 'error').length,
    uncertain: this.entries().filter((e) => e.state === 'uncertain').length,
    pending: this.entries().filter((e) => !['added', 'included'].includes(e.state)).length,
  }));

  constructor() {
    this.destroy.onDestroy(() => {
      this.generation++;
      this.query?.unsubscribe();
      this.write?.unsubscribe();
      this.dialog?.close();
    });
  }
  private identity(row: PhotoImportCandidate) {
    return `${row.id}:${row.revision}:${row.bookId}`;
  }
  setCandidates(rows: readonly PhotoImportCandidate[]): void {
    this.candidates = rows;
    const eligible = rows.filter(
      (r) =>
        ['imported', 'existing'].includes(r.state) &&
        Number.isSafeInteger(r.bookId) &&
        r.bookId! > 0,
    );
    const grouped = new Map<number, { title: string; confirmed: boolean }>();
    for (const row of eligible) {
      const confirmed = row.state === 'imported' || this.identities.has(this.identity(row));
      const previous = grouped.get(row.bookId!);
      grouped.set(row.bookId!, {
        title: previous?.title ?? (row.draft.title || `Libro ${row.bookId}`),
        confirmed: confirmed || !!previous?.confirmed,
      });
    }
    const next: PhotoReadingEntry[] = [];
    for (const [bookId, { title, confirmed }] of grouped) {
      const previous = this.entry(bookId);
      next.push(
        previous && previous.confirmed === confirmed
          ? { ...previous }
          : {
              bookId,
              title,
              confirmed,
              state: this.addedIds.has(bookId)
                ? 'added'
                : this.includedIds.has(bookId)
                  ? 'included'
                  : 'unknown',
              selected: false,
              absentConfirmed: false,
              message: null,
            },
      );
    }
    if (JSON.stringify(next) === JSON.stringify(this.entries())) return;
    this.entries.set(next);
    this.order = this.order.filter((id) => next.some((e) => e.bookId === id && e.selected));
  }
  private entry(id: number) {
    return this.entries().find((e) => e.bookId === id);
  }
  private update(id: number, patch: Partial<PhotoReadingEntry>) {
    this.entries.update((entries) =>
      entries.map((e) => (e.bookId === id ? { ...e, ...patch } : e)),
    );
  }
  confirmIdentity(id: number): void {
    if (this.unavailable()) return;
    const rows = this.candidates.filter((r) => r.state === 'existing' && r.bookId === id);
    if (!rows.length || this.entry(id)?.confirmed) return;
    this.confirm(
      {
        heading: 'Confirmar identidad del libro existente',
        message: `He comprobado el detalle del libro ${id} y confirmo que corresponde al libro que quiero añadir. Una similitud bibliográfica por sí sola no confirma identidad.`,
        titles: rows.map(
          (r) => `${r.draft.title} — ${r.draft.author} — ${r.draft.isbn || 'Sin ISBN'}`,
        ),
      },
      () => {
        rows.forEach((r) => this.identities.add(this.identity(r)));
        this.setCandidates(this.candidates);
      },
    );
  }
  refresh(): void {
    if (this.unavailable() || this.destroy.destroyed) return;
    this.query?.unsubscribe();
    const generation = ++this.generation;
    const ids = this.entries()
      .filter((e) => e.confirmed && !['added', 'included'].includes(e.state))
      .map((e) => e.bookId);
    const failed = new Set(
      this.entries()
        .filter((e) => e.state === 'error')
        .map((e) => e.bookId),
    );
    this.order = [];
    this.entries.update((entries) => entries.map((e) => ({ ...e, selected: false })));
    ids.forEach((id) => this.update(id, { state: 'checking', absentConfirmed: false }));
    if (!ids.length) return;
    this.checking.set(true);
    const batches: number[][] = [];
    for (let index = 0; index < ids.length; index += 100)
      batches.push(ids.slice(index, index + 100));
    this.query = from(batches)
      .pipe(
        concatMap((batch) => this.api.membership(batch).pipe(map((result) => ({ result, batch })))),
      )
      .subscribe({
        next: ({ result, batch }) => {
          if (generation !== this.generation) return;
          if (!this.validMembership(result, batch)) {
            batch.forEach((id) =>
              this.update(id, {
                state: this.uncertain.has(id) ? 'uncertain' : 'unknown',
                message: 'Respuesta de pertenencia incompleta o inválida; no se permite otra alta.',
              }),
            );
            return;
          }
          for (const item of result.items) {
            if (item.included) this.includedIds.add(item.bookId);
            const entry = this.entry(item.bookId);
            if (!entry) continue;
            const unresolved = this.uncertain.has(item.bookId);
            this.update(item.bookId, {
              state: item.included
                ? 'included'
                : unresolved
                  ? 'uncertain'
                  : failed.has(item.bookId)
                    ? 'error'
                    : 'available',
              absentConfirmed: !item.included,
              message: item.included
                ? 'Ya pertenece a la lista; no se enviará otra alta.'
                : unresolved
                  ? 'Resultado incierto: ahora no aparece, pero una petición anterior podría terminar.'
                  : null,
            });
          }
        },
        error: () => {
          if (generation !== this.generation) return;
          this.checking.set(false);
          this.entries.update((entries) =>
            entries.map((e) =>
              e.state === 'checking'
                ? {
                    ...e,
                    state: this.uncertain.has(e.bookId) ? 'uncertain' : 'unknown',
                    message: 'Pertenencia desconocida; un error no significa ausencia.',
                  }
                : e,
            ),
          );
        },
        complete: () => {
          if (generation === this.generation) this.checking.set(false);
        },
      });
  }
  select(id: number, selected: boolean): void {
    if (
      this.unavailable() ||
      this.checking() ||
      !this.entry(id)?.confirmed ||
      this.entry(id)?.state !== 'available'
    )
      return;
    this.order = this.order.filter((value) => value !== id);
    if (selected) this.order.push(id);
    this.update(id, { selected });
  }
  selectAll(selected: boolean): void {
    this.entries().forEach((e) => {
      if (selected && e.selected) return;
      this.select(e.bookId, selected);
    });
  }
  addSelected(): void {
    if (this.unavailable() || this.checking()) return;
    const queue = [...new Set(this.order)].filter(
      (id) =>
        this.entry(id)?.selected &&
        this.entry(id)?.confirmed &&
        this.entry(id)?.state === 'available',
    );
    if (!queue.length) return;
    this.confirm(
      {
        heading: 'Añadir seleccionados a mi lista de lectura',
        message:
          'Se añadirán al final, en el orden indicado. Es independiente de la creación del Book y no cambia estados ni fechas de lectura.',
        titles: queue.map((id) => `${this.entry(id)!.title} (libro ${id})`),
      },
      () => {
        this.busy.set(true);
        this.stopped.set(false);
        this.message.set('Consultando la revisión actual de la lista…');
        const generation = ++this.generation;
        this.query = this.api.getList().subscribe({
          next: (list) => {
            if (generation !== this.generation) return;
            if (!this.validList(list)) {
              this.finish('Revisión o lista inválida. No se ha enviado ningún POST.');
              return;
            }
            const present = new Set(list.items.map((item) => item.book.id));
            for (const id of queue)
              if (present.has(id)) {
                this.includedIds.add(id);
                this.update(id, { state: 'included', selected: false, absentConfirmed: false });
              }
            this.next(
              queue.filter((id) => !present.has(id)),
              list.revision,
              generation,
            );
          },
          error: () => {
            if (generation === this.generation)
              this.finish('No se pudo obtener la revisión actual. No se ha enviado ningún POST.');
          },
        });
      },
    );
  }
  private next(queue: number[], revision: string, generation: number): void {
    if (generation !== this.generation || this.destroy.destroyed) return;
    const id = this.stopped() ? undefined : queue.shift();
    if (id === undefined) {
      this.finish(
        this.stopped()
          ? 'Cola detenida. La petición activa ha terminado.'
          : 'Secuencia finalizada.',
      );
      return;
    }
    if (!this.entry(id)?.confirmed || this.entry(id)?.state !== 'available') {
      this.next(queue, revision, generation);
      return;
    }
    this.update(id, { state: 'adding', selected: false, absentConfirmed: false, message: null });
    this.write = this.api.add(id, revision).subscribe({
      next: (response) => {
        if (generation !== this.generation) return;
        if (
          !response ||
          !revisionValid(response.revision) ||
          BigInt(response.revision) !== BigInt(revision) + 1n ||
          response.item?.book?.id !== id ||
          !Number.isSafeInteger(response.item.entryId) ||
          response.item.entryId <= 0
        ) {
          this.uncertain.add(id);
          this.update(id, {
            state: 'uncertain',
            message: 'Resultado incierto: confirmación de alta inválida.',
          });
          this.reconcile(id, true);
          return;
        }
        this.addedIds.add(id);
        this.update(id, {
          state: 'added',
          message: 'Añadido y confirmado en la lista de lectura.',
        });
        this.next(queue, response.revision, generation);
      },
      error: (error: unknown) => {
        if (generation !== this.generation) return;
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status === 0 || status >= 500) this.uncertain.add(id);
        this.update(id, {
          state: status === 0 || status >= 500 ? 'uncertain' : 'error',
          message:
            status === 409
              ? 'Conflicto: se consulta pertenencia y revisión sin repetir POST.'
              : status === 0 || status >= 500
                ? 'Resultado incierto: el alta podría haberse guardado.'
                : 'No se pudo añadir; el Book del catálogo se conserva.',
        });
        this.reconcile(id, true);
      },
    });
  }
  reconcile(id: number, internal = false): void {
    if (
      (!internal && (this.unavailable() || this.checking())) ||
      !['error', 'uncertain', 'unknown'].includes(this.entry(id)?.state ?? '') ||
      !this.entry(id)?.confirmed
    )
      return;
    if (!internal) this.busy.set(true);
    const generation = this.generation;
    const wasUncertain = this.uncertain.has(id);
    this.update(id, { absentConfirmed: false });
    this.query = forkJoin({
      membership: this.api.membership([id]),
      list: this.api.getList(),
    }).subscribe({
      next: ({ membership, list }) => {
        if (generation !== this.generation) return;
        if (!this.validMembership(membership, [id]) || !this.validList(list)) {
          this.finish('Consulta inválida; no se repetirá el POST.');
          return;
        }
        if (membership.items[0].included || list.items.some((item) => item.book.id === id)) {
          this.includedIds.add(id);
          this.update(id, {
            state: 'included',
            selected: false,
            message:
              'El libro pertenece a la lista. No se atribuye el alta a la petición anterior ni se repetirá.',
          });
        } else
          this.update(id, {
            state: wasUncertain ? 'uncertain' : 'error',
            absentConfirmed: membership.revision === list.revision,
            message: wasUncertain
              ? 'Resultado incierto: no aparece en la consulta; una petición anterior podría terminar. No se repetirá automáticamente.'
              : 'Ausencia consultada. La lista pudo cambiar; se requiere decisión explícita para reintentar.',
          });
        this.finish('Secuencia pausada. Revisa el resultado y confirma de nuevo los pendientes.');
      },
      error: () => {
        if (generation !== this.generation) return;
        this.update(id, {
          message: wasUncertain
            ? 'Resultado incierto: también falló la consulta de pertenencia.'
            : 'Error: pertenencia desconocida; no se permite reintentar el alta.',
        });
        this.finish('Consulta fallida; no se repite ninguna escritura.');
      },
    });
  }
  prepareRetry(id: number): void {
    const entry = this.entry(id);
    if (
      this.unavailable() ||
      this.checking() ||
      !entry?.absentConfirmed ||
      !['error', 'uncertain'].includes(entry.state)
    )
      return;
    this.confirm(
      {
        heading: 'Preparar nuevo intento explícito',
        message:
          entry.state === 'uncertain'
            ? 'La consulta no demuestra que la petición anterior haya fallado. Podría terminar todavía. Acepto el riesgo y volveré a seleccionar y confirmar el alta.'
            : 'He comprobado que no está incluido y quiero preparar otro intento. No se enviará nada hasta seleccionar y confirmar de nuevo.',
        titles: [entry.title],
      },
      () => {
        this.uncertain.delete(id);
        this.update(id, { state: 'available', selected: false, message: null });
      },
    );
  }
  stop(): void {
    if (this.busy()) this.stopped.set(true);
  }
  private finish(message: string) {
    this.busy.set(false);
    this.message.set(message);
  }
  private validMembership(result: ReadingListMembershipResponse, ids: number[]): boolean {
    return (
      !!result &&
      revisionValid(result.revision) &&
      Array.isArray(result.items) &&
      result.items.length === ids.length &&
      new Set(result.items.map((item) => item?.bookId)).size === ids.length &&
      result.items.every(
        (item) =>
          !!item &&
          ids.includes(item.bookId) &&
          typeof item.included === 'boolean' &&
          (item.included
            ? Number.isSafeInteger(item.entryId) && item.entryId! > 0
            : item.entryId === null),
      )
    );
  }
  private validList(list: ReadingListResponse): boolean {
    return (
      !!list &&
      revisionValid(list.revision) &&
      Array.isArray(list.items) &&
      Number.isSafeInteger(list.totalItems) &&
      list.totalItems === list.items.length &&
      list.items.every((item) => Number.isSafeInteger(item?.book?.id) && item.book.id > 0) &&
      new Set(list.items.map((item) => item.book.id)).size === list.items.length
    );
  }
  private confirm(data: PhotoImportConfirmation, action: () => void) {
    this.confirming.set(true);
    const ref = this.dialogs.open<PhotoImportConfirmDialog, PhotoImportConfirmation, boolean>(
      PhotoImportConfirmDialog,
      { data, width: '38rem', maxWidth: '95vw' },
    );
    this.dialog = ref;
    ref
      .afterClosed()
      .pipe(take(1))
      .subscribe((accepted) => {
        if (this.destroy.destroyed || this.dialog !== ref) return;
        this.dialog = undefined;
        this.confirming.set(false);
        if (accepted === true) action();
      });
  }
  label(state: PhotoReadingState) {
    return {
      available: 'Disponible',
      included: 'Ya está en mi lista',
      checking: 'Consultando',
      unknown: 'Desconocido',
      adding: 'Añadiendo',
      added: 'Añadido',
      error: 'Error',
      uncertain: 'Resultado incierto',
    }[state];
  }
}
