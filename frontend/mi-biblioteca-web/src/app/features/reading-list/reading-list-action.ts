import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { InlineFeedback } from '../../core/ui/feedback/inline-feedback';
import { ReadingListMembership } from './reading-list-membership';

@Component({
  selector: 'app-reading-list-action',
  imports: [MatButtonModule, InlineFeedback],
  template: `
    @switch (membership().state(bookId())) {
      @case ('included') {
        <span>En mi lista</span>
      }
      @case ('loading') {
        <span>Consultando lista de lectura…</span>
      }
      @case ('error') {
        <app-inline-feedback variant="warning">Pertenencia desconocida.</app-inline-feedback>
        <button
          mat-button
          type="button"
          [disabled]="disabled() || membership().busy()"
          (click)="membership().refresh()"
        >
          Reintentar pertenencia
        </button>
      }
      @case ('absent') {
        <button
          mat-button
          type="button"
          [attr.aria-label]="'Añadir a lista de lectura: ' + title()"
          [disabled]="disabled() || membership().busy()"
          (click)="add()"
        >
          Añadir a lista de lectura
        </button>
      }
    }
  `,
})
export class ReadingListAction {
  readonly membership = input.required<ReadingListMembership>();
  readonly bookId = input.required<number>();
  readonly title = input.required<string>();
  readonly disabled = input(false);
  add(): void {
    if (!this.disabled()) this.membership().add(this.bookId());
  }
}
