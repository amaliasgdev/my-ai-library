import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouterLink } from '@angular/router';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { PhotoImportWorkflow } from './photo-import-workflow';
import { PhotoReadingListWorkflow } from './photo-reading-list-workflow';

@Component({
  selector: 'app-photo-reading-list-panel',
  imports: [MatButtonModule, MatCheckboxModule, RouterLink, InlineFeedback],
  template: `
    <section aria-labelledby="photo-reading-list-heading">
      <h2 id="photo-reading-list-heading">Añadir a mi lista de lectura</h2>
      <p>
        Acción opcional y posterior al catálogo. No modifica estados ni fechas. El reconocimiento
        {{
          flow.simulated()
            ? 'sigue siendo simulado.'
            : 'se ha realizado mediante OpenAI y requiere revisión.'
        }}
      </p>
      <p>
        Los libros existentes requieren confirmar su identidad. Consulta la pertenencia por lote
        antes de seleccionar.
      </p>
      <button
        mat-stroked-button
        type="button"
        [disabled]="flow.locked() || reading.checking()"
        (click)="reading.refresh()"
      >
        Consultar pertenencia por lote
      </button>
      @for (entry of reading.entries(); track entry.bookId) {
        <article>
          <h3>{{ entry.title }} (libro {{ entry.bookId }})</h3>
          @if (!entry.confirmed) {
            <p>Identidad del libro existente pendiente de confirmación.</p>
            <button
              mat-button
              type="button"
              [disabled]="flow.locked()"
              (click)="reading.confirmIdentity(entry.bookId)"
            >
              Confirmar identidad del libro {{ entry.bookId }}
            </button>
          }
          <p aria-live="polite">{{ reading.label(entry.state) }}. {{ entry.message }}</p>
          <mat-checkbox
            [checked]="entry.selected"
            [disabled]="
              flow.locked() || reading.checking() || !entry.confirmed || entry.state !== 'available'
            "
            (change)="reading.select(entry.bookId, $event.checked)"
            >Seleccionar para lectura: {{ entry.title }}</mat-checkbox
          >
          @if (
            entry.state === 'error' || entry.state === 'uncertain' || entry.state === 'unknown'
          ) {
            <button
              mat-button
              type="button"
              [disabled]="flow.locked() || reading.checking() || !entry.confirmed"
              (click)="reading.reconcile(entry.bookId)"
            >
              Consultar estado actual del libro {{ entry.bookId }}
            </button>
          }
          @if (entry.state === 'error' || entry.state === 'uncertain') {
            <button
              mat-button
              type="button"
              [disabled]="flow.locked() || reading.checking() || !entry.absentConfirmed"
              (click)="reading.prepareRetry(entry.bookId)"
            >
              Preparar reintento explícito
            </button>
          }
        </article>
      }
      <p>
        Seleccionados para lectura: {{ reading.selectedCount() }}. Orden: orden de selección;
        seleccionar todos añade los restantes en el orden mostrado.
      </p>
      <button
        mat-button
        type="button"
        [disabled]="flow.locked() || reading.checking()"
        (click)="reading.selectAll(true)"
      >
        Seleccionar todos los disponibles para lectura
      </button>
      <button
        mat-button
        type="button"
        [disabled]="flow.locked() || reading.checking()"
        (click)="reading.selectAll(false)"
      >
        Deseleccionar todos para lectura
      </button>
      <button
        mat-flat-button
        type="button"
        [disabled]="flow.locked() || reading.checking() || !reading.selectedCount()"
        (click)="reading.addSelected()"
      >
        Añadir seleccionados a mi lista de lectura
      </button>
      @if (reading.busy()) {
        <button
          mat-stroked-button
          type="button"
          [disabled]="reading.stopped()"
          (click)="reading.stop()"
        >
          Detener cola de lectura (esperar petición activa)
        </button>
      }
      @if (reading.message()) {
        <app-inline-feedback variant="info">{{ reading.message() }}</app-inline-feedback>
      }
      <p>
        Añadidos: {{ reading.summary().added }} · Ya pertenecían: {{ reading.summary().included }} ·
        Errores: {{ reading.summary().errors }} · Inciertos: {{ reading.summary().uncertain }} ·
        Pendientes: {{ reading.summary().pending }}
      </p>
      <a mat-button routerLink="/reading-list">Ir a mi lista de lectura</a>
    </section>
  `,
})
export class PhotoReadingListPanel {
  readonly flow = inject(PhotoImportWorkflow);
  readonly reading = inject(PhotoReadingListWorkflow);
}
