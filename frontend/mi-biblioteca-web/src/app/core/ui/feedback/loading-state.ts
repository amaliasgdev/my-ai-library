import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/** One accessible loading region: spinner plus a single polite status message. */
@Component({
  selector: 'app-loading-state',
  imports: [MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    'aria-busy': 'true',
  },
  template: `
    <mat-spinner [diameter]="diameter()" aria-hidden="true" />
    <p>{{ message() }}</p>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      gap: 0.75rem;
      padding: 2rem 1rem;
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
    }

    p {
      margin: 0;
    }
  `,
})
export class LoadingState {
  readonly message = input('Cargando…');
  readonly diameter = input(40);
}
