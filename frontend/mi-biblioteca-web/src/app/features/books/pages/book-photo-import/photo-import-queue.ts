import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouterLink, Params } from '@angular/router';
import { PhotoImportWorkflow } from './photo-import-workflow';
import { PhotoReadingListPanel } from './photo-reading-list-panel';

@Component({
  selector: 'app-photo-import-queue',
  imports: [MatButtonModule, MatCheckboxModule, RouterLink, PhotoReadingListPanel],
  template: `
    <section aria-labelledby="final-review-heading">
      <h2 id="final-review-heading">Revisión e incorporación</h2>
      <p>
        {{
          flow.simulated()
            ? 'Reconocimiento simulado.'
            : 'Reconocimiento mediante OpenAI; puede contener errores.'
        }}
        Confirma los datos reales en cada revisión; los candidatos nunca se importan
        automáticamente. Las fotografías originales no se utilizan como portadas.
      </p>
      <button
        mat-stroked-button
        type="button"
        [disabled]="flow.locked()"
        (click)="flow.addManual()"
      >
        Añadir manualmente un libro omitido
      </button>
      <p>Seleccionados: {{ flow.selectedCount() }}</p>
      <button mat-button type="button" [disabled]="flow.locked()" (click)="flow.selectAll(true)">
        Seleccionar todos los elegibles
      </button>
      <button mat-button type="button" [disabled]="flow.locked()" (click)="flow.selectAll(false)">
        Deseleccionar todos
      </button>
      @for (row of flow.rows(); track row.id) {
        <article>
          <h3>{{ row.draft.title || 'Libro sin título' }}</h3>
          <p>Origen: {{ row.source }}</p>
          <p aria-live="polite">{{ flow.label(row.state) }}. {{ row.message }}</p>
          <mat-checkbox
            [checked]="row.selected"
            [disabled]="flow.locked() || row.state !== 'ready'"
            (change)="flow.select(row.id, $event.checked)"
            >Seleccionar {{ row.draft.title || 'candidato' }}</mat-checkbox
          >
          @if (row.state !== 'imported' && row.state !== 'uncertain' && row.state !== 'discarded') {
            <button
              mat-button
              type="button"
              [disabled]="flow.locked()"
              (click)="flow.review(row.id)"
            >
              Revisar datos: {{ row.draft.title || 'candidato' }}
            </button>
          }
          @if (row.state === 'possible') {
            @for (match of row.duplicates?.matches ?? []; track match.id) {
              <p>
                Posible duplicado: {{ match.title }} · {{ match.author }} ·
                {{ match.isbn ?? 'Sin ISBN' }}
              </p>
            }
            <button
              mat-button
              type="button"
              [disabled]="flow.locked()"
              (click)="flow.approvePossible(row.id)"
            >
              He revisado las coincidencias; es otro libro o edición
            </button>
          }
          @if (row.state === 'uncertain') {
            <button
              mat-button
              type="button"
              [disabled]="flow.locked()"
              (click)="flow.reconcile(row.id)"
            >
              Consultar resultado en catálogo
            </button>
            <button
              mat-button
              type="button"
              [disabled]="flow.locked() || !row.duplicates"
              (click)="flow.authorizeRetry(row.id)"
            >
              Autorizar nuevo intento con advertencia
            </button>
          }
          @if (row.state !== 'imported' && row.state !== 'uncertain' && row.state !== 'discarded') {
            <button
              mat-button
              type="button"
              [disabled]="flow.locked()"
              (click)="flow.discard(row.id)"
            >
              Descartar {{ row.draft.title || 'candidato' }}
            </button>
          }
          @if (row.bookId) {
            <a mat-button [routerLink]="['/books', row.bookId]" [queryParams]="catalogParams()"
              >Abrir detalle del libro {{ row.bookId }}</a
            >
          }
        </article>
      }
      <button
        mat-flat-button
        type="button"
        [disabled]="flow.locked() || !flow.selectedCount()"
        (click)="flow.importSelected()"
      >
        Importar libros seleccionados
      </button>
      @if (flow.creating()) {
        <button mat-stroked-button type="button" [disabled]="flow.stopped()" (click)="flow.stop()">
          Detener cola (esperar petición activa)
        </button>
      }
      @if (flow.total()) {
        <p role="status">{{ flow.completed() }} de {{ flow.total() }} candidatos procesados.</p>
      }
      <p aria-live="polite">
        Importados: {{ flow.summary().imported }} · Ya existentes: {{ flow.summary().existing }} ·
        Descartados: {{ flow.summary().discarded }} · Errores: {{ flow.summary().errors }} ·
        Resultados inciertos: {{ flow.summary().uncertain }}
      </p>
      <p>
        Puedes revisar los pendientes o seleccionar más fotografías arriba. Los borradores no se
        guardan al salir.
      </p>
    </section>
    <app-photo-reading-list-panel />
  `,
  styles: `
    article {
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      padding-block: 1rem;
      overflow-wrap: anywhere;
    }
  `,
})
export class PhotoImportQueue {
  readonly flow = inject(PhotoImportWorkflow);
  readonly catalogParams = input<Params>({});
}
