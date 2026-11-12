import { Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { PhotoImportCandidate } from './photo-import-workflow';

/** Advisory only: identical bibliographic text does not prove the same physical copy. */
export function batchDuplicateIds(rows: readonly PhotoImportCandidate[]): ReadonlySet<string> {
  const groups = new Map<string, string[]>();
  const normalize = (value: string) => value.trim().replace(/\s+/gu, ' ').toLowerCase();
  for (const row of rows) {
    if (row.state === 'discarded') continue;
    const title = normalize(row.draft.title);
    const author = normalize(row.draft.author);
    if (!title || !author) continue;
    const key = JSON.stringify([title, author]);
    groups.set(key, [...(groups.get(key) ?? []), row.id]);
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
}

@Component({
  selector: 'app-photo-candidate-card',
  imports: [MatButtonModule, MatCardModule, InlineFeedback],
  template: `
    <mat-card appearance="outlined" [attr.data-state]="row().state">
      <mat-card-content>
        <div class="compact-book">
          @if (coverUrl() && failedCover() !== coverUrl()) {
            <img
              [src]="coverUrl()"
              alt="Portada bibliográfica"
              loading="lazy"
              (error)="failedCover.set(coverUrl())"
            />
          } @else {
            <div class="cover-fallback">Sin portada</div>
          }
          <div>
            <h3>{{ row().draft.title || 'Título sin identificar' }}</h3>
            <p>{{ row().draft.author || 'Autor sin identificar' }}</p>
            @if (manual()) {
              <p class="state">Introducido manualmente · sin fotografía</p>
            } @else {
              <p>Legibilidad: {{ legibility() }}</p>
            }
            <p class="state" role="status">{{ status() }}</p>
            @if (row().state === 'pending') {
              <p role="status">{{ metadataStatus() }}</p>
            }
            @if (proposalLabel()) {
              <p>{{ proposalLabel() }}</p>
            }
            @if (proposedCover() && !row().draft.coverUrl) {
              <p>{{ coverKind() }}</p>
            }
          </div>
        </div>
        @if (batchDuplicate()) {
          <app-inline-feedback variant="warning">
            Posible duplicado en el lote. Podrían ser ejemplares distintos: revisa antes de
            descartar.
          </app-inline-feedback>
        }
        @if (row().state === 'possible') {
          <app-inline-feedback variant="warning">
            Posible duplicado en el catálogo.
          </app-inline-feedback>
        }
      </mat-card-content>
      <mat-card-actions>
        <button
          mat-button
          type="button"
          [disabled]="locked()"
          (click)="review.emit(row().id)"
          [attr.aria-label]="'Revisar ' + (row().draft.title || 'candidato')"
        >
          Revisar
        </button>
        <button
          mat-button
          type="button"
          [disabled]="locked() || !canDiscard()"
          (click)="discard.emit(row().id)"
          [attr.aria-label]="'Descartar ' + (row().draft.title || 'candidato')"
        >
          Descartar
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    :host,
    mat-card {
      display: block;
      height: 100%;
      min-width: 0;
    }
    mat-card {
      display: flex;
    }
    mat-card-content {
      flex: 1;
    }
    .compact-book {
      display: grid;
      grid-template-columns: 3.5rem minmax(0, 1fr);
      gap: 0.75rem;
    }
    img,
    .cover-fallback {
      width: 3.5rem;
      height: 5rem;
      object-fit: contain;
    }
    .cover-fallback {
      display: grid;
      place-items: center;
      background: var(--mat-sys-surface-container);
      font-size: 0.75rem;
    }
    h3 {
      margin: 0 0 0.25rem;
      font-size: 1rem;
    }
    p {
      margin-block: 0.25rem;
    }
    h3,
    p {
      overflow-wrap: anywhere;
    }
    .state {
      font-weight: 600;
    }
    [data-state='ready'] .state,
    [data-state='imported'] .state {
      color: var(--mat-sys-primary);
    }
    [data-state='existing'] .state {
      color: var(--mat-sys-tertiary);
    }
    [data-state='uncertain'] .state,
    [data-state='error'] .state {
      color: var(--mat-sys-error);
    }
    app-inline-feedback {
      margin-block: 0.5rem;
    }
    mat-card-actions {
      flex-wrap: wrap;
    }
  `,
})
export class PhotoCandidateCard {
  readonly row = input.required<PhotoImportCandidate>();
  readonly locked = input(false);
  readonly legibility = input('No indicada');
  readonly manual = input(false);
  readonly batchDuplicate = input(false);
  readonly metadataStatus = input('Pendiente de búsqueda');
  readonly proposedCover = input<string | null>(null);
  readonly coverKind = input('Obra propuesta · sin confirmar');
  readonly proposalLabel = input('');
  readonly coverUrl = computed(() => this.row().draft.coverUrl || this.proposedCover());
  readonly review = output<string>();
  readonly discard = output<string>();
  readonly failedCover = signal<string | null>(null);
  readonly canDiscard = computed(
    () => !['imported', 'uncertain', 'discarded', 'importing'].includes(this.row().state),
  );
  readonly status = computed(() => {
    const row = this.row();
    if (row.state === 'pending')
      return !row.draft.title.trim() && !row.draft.author.trim()
        ? 'Identificación pendiente'
        : 'Datos incompletos · pendientes de revisión';
    return {
      reviewed: 'Comprobando datos revisados',
      possible: 'Posible duplicado',
      existing: 'Libro existente',
      ready: 'Revisado y preparado',
      importing: 'Importando',
      imported: 'Importado',
      error: 'Error · requiere revisión',
      uncertain: 'Resultado incierto',
      discarded: 'Descartado',
    }[row.state];
  });
}
