import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

export type InlineFeedbackVariant = 'info' | 'success' | 'warning' | 'error' | 'neutral';

/**
 * Persistent inline feedback. Field-sized validation still belongs to mat-error;
 * transient confirmations belong to FeedbackService snackbars.
 */
@Component({
  selector: 'app-inline-feedback',
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.feedback--info]': 'variant() === "info"',
    '[class.feedback--success]': 'variant() === "success"',
    '[class.feedback--warning]': 'variant() === "warning"',
    '[class.feedback--error]': 'variant() === "error"',
    '[class.feedback--neutral]': 'variant() === "neutral"',
  },
  template: `
    <svg class="feedback-icon" viewBox="0 0 24 24" aria-hidden="true">
      @switch (variant()) {
        @case ('success') {
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
          />
        }
        @case ('warning') {
          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
        }
        @case ('error') {
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
          />
        }
        @case ('neutral') {
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
          />
        }
        @default {
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
          />
        }
      }
    </svg>
    <div
      class="feedback-copy"
      [attr.role]="role()"
      [attr.aria-live]="role() === 'status' ? 'polite' : null"
      [attr.aria-atomic]="role() ? 'true' : null"
    >
      @if (title()) {
        <p class="feedback-title">{{ title() }}</p>
      }
      <div class="feedback-message"><ng-content /></div>
    </div>
    @if (actionLabel()) {
      <button mat-button type="button" class="feedback-action" (click)="action.emit()">
        {{ actionLabel() }}
      </button>
    }
    @if (dismissible()) {
      <button
        mat-icon-button
        type="button"
        class="feedback-dismiss"
        aria-label="Cerrar aviso"
        (click)="dismissed.emit()"
      >
        <span aria-hidden="true">×</span>
      </button>
    }
  `,
  styles: `
    :host {
      --feedback-bg: var(--mat-sys-surface-container-high);
      --feedback-fg: var(--mat-sys-on-surface);
      --feedback-accent: var(--mat-sys-primary);
      --feedback-border: var(--mat-sys-outline-variant);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      align-items: start;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      border: 1px solid var(--feedback-border);
      border-inline-start: 4px solid var(--feedback-accent);
      border-radius: var(--app-panel-radius, 0.75rem);
      background: var(--feedback-bg);
      color: var(--feedback-fg);
    }

    :host(.feedback--info) {
      --feedback-bg: var(--mat-sys-surface-container-high);
      --feedback-accent: var(--mat-sys-primary);
    }

    :host(.feedback--success) {
      --feedback-bg: var(--mat-sys-primary-container);
      --feedback-fg: var(--mat-sys-on-primary-container);
      --feedback-accent: var(--mat-sys-primary);
      --feedback-border: var(--mat-sys-primary);
    }

    :host(.feedback--warning) {
      --feedback-bg: var(--mat-sys-tertiary-container);
      --feedback-fg: var(--mat-sys-on-tertiary-container);
      --feedback-accent: var(--mat-sys-tertiary);
      --feedback-border: var(--mat-sys-tertiary);
    }

    :host(.feedback--error) {
      --feedback-bg: var(--mat-sys-error-container);
      --feedback-fg: var(--mat-sys-on-error-container);
      --feedback-accent: var(--mat-sys-error);
      --feedback-border: var(--mat-sys-error);
    }

    :host(.feedback--neutral) {
      --feedback-bg: var(--mat-sys-surface-container-low);
      --feedback-accent: var(--mat-sys-outline);
    }

    .feedback-icon {
      width: 1.25rem;
      height: 1.25rem;
      margin-block-start: 0.125rem;
      fill: var(--feedback-accent);
      flex: none;
    }

    .feedback-copy {
      min-width: 0;
    }

    .feedback-title {
      margin: 0 0 0.25rem;
      font: var(--mat-sys-title-small);
      font-weight: 600;
    }

    .feedback-message {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .feedback-message :where(p, ul, ol) {
      margin-block: 0;
    }

    .feedback-message :where(ul, ol) {
      padding-inline-start: 1.25rem;
    }

    .feedback-action,
    .feedback-dismiss {
      align-self: center;
    }

    .feedback-dismiss span {
      display: block;
      font-size: 1.25rem;
      line-height: 1;
    }

    @media (max-width: 30rem) {
      :host {
        grid-template-columns: auto minmax(0, 1fr) auto;
      }

      .feedback-action {
        grid-column: 2 / -1;
        justify-self: start;
      }
    }
  `,
})
export class InlineFeedback {
  readonly variant = input<InlineFeedbackVariant>('neutral');
  readonly title = input('');
  readonly actionLabel = input('');
  readonly dismissible = input(false);
  /** Set false for static policy/help text that should not be announced on load. */
  readonly announce = input(true);

  readonly action = output<void>();
  readonly dismissed = output<void>();

  protected readonly role = computed(() => {
    if (!this.announce()) return null;
    return this.variant() === 'error' ? 'alert' : 'status';
  });
}
