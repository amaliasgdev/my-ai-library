import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Visual empty state. It is not live by default to avoid duplicating page announcements. */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="empty-state"
      [attr.role]="live() ? 'status' : null"
      [attr.aria-live]="live() ? 'polite' : null"
      [attr.aria-atomic]="live() ? 'true' : null"
    >
      <p class="empty-title">{{ title() }}</p>
      @if (description()) {
        <p class="empty-description">{{ description() }}</p>
      }
      <div class="empty-actions"><ng-content /></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .empty-state {
      display: grid;
      justify-items: center;
      gap: 0.75rem;
      padding: clamp(2rem, 6vw, 3.5rem) 1.5rem;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: var(--app-panel-radius, 0.75rem);
      background: var(--mat-sys-surface-container-low);
      text-align: center;
    }

    .empty-title {
      margin: 0;
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-title-medium);
      font-weight: 600;
    }

    .empty-description {
      max-width: 38rem;
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.5rem;
      margin-block-start: 0.25rem;
    }
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly live = input(false);
}
