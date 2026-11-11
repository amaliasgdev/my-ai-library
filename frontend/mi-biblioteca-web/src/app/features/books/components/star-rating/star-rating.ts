import {
  Component,
  ElementRef,
  forwardRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  computed,
  viewChildren,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

export const MAX_STARS = 5;
const STAR_FILLED_ICON = 'mb-star';
const STAR_OUTLINE_ICON = 'mb-star-outline';
// Standard Material star glyphs registered as inline SVG: no icon font, CDN or new package.
const STAR_FILLED =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
const STAR_OUTLINE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>';

/** Integer 1..5 or null ("Sin valorar"); anything else is not a valid rating. */
export function normalizeStarValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_STARS
    ? value
    : null;
}

/**
 * Reusable five-star rating.
 *
 * - Controlled use: bind `value` and listen to `ratingChange`. The component never shows an
 *   unconfirmed value; the parent decides (and may restore the confirmed one on failure).
 * - Reactive Forms: works with formControl/ngModel and then keeps its own value.
 * - Hover (mouse only) previews a value and never emits. Enter/Space activate the focused
 *   star natively; arrow keys, Home and End only move focus, so holding a key cannot save
 *   several values in a row.
 */
@Component({
  selector: 'app-star-rating',
  imports: [MatIconModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StarRating), multi: true },
  ],
  templateUrl: './star-rating.html',
  styleUrl: './star-rating.scss',
})
export class StarRating implements ControlValueAccessor {
  readonly value = input<number | null>(null);
  /** Name of the rated item, used in accessible labels ("Valoración de …"). */
  readonly subject = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly clearable = input(true);
  readonly showSummary = input(true);
  readonly ratingChange = output<number | null>();

  protected readonly stars = Array.from({ length: MAX_STARS }, (_, index) => index + 1);
  protected readonly filledIcon = STAR_FILLED_ICON;
  protected readonly outlineIcon = STAR_OUTLINE_ICON;
  protected readonly selected = linkedSignal(() => normalizeStarValue(this.value()));
  protected readonly hovered = signal<number | null>(null);
  protected readonly focused = signal<number | null>(null);
  private readonly formDisabled = signal(false);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('starButton');
  private formBound = false;
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly displayed = computed(() => this.hovered() ?? this.selected() ?? 0);
  protected readonly groupLabel = computed(() =>
    this.subject() ? `Valoración de ${this.subject()}` : 'Valoración',
  );
  protected readonly clearLabel = computed(() =>
    this.subject() ? `Quitar valoración de ${this.subject()}` : 'Quitar valoración',
  );
  protected readonly summary = computed(() => {
    const value = this.selected();
    return value === null ? 'Sin valorar' : `${value} de ${MAX_STARS}`;
  });
  protected readonly canClear = computed(
    () => this.clearable() && !this.readonly() && !this.isDisabled() && this.selected() !== null,
  );

  constructor() {
    const registry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    registry.addSvgIconLiteral(STAR_FILLED_ICON, sanitizer.bypassSecurityTrustHtml(STAR_FILLED));
    registry.addSvgIconLiteral(STAR_OUTLINE_ICON, sanitizer.bypassSecurityTrustHtml(STAR_OUTLINE));
  }

  writeValue(value: unknown): void {
    this.selected.set(normalizeStarValue(value));
  }
  registerOnChange(fn: (value: number | null) => void): void {
    this.formBound = true;
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  protected starLabel(star: number): string {
    return star === 1 ? '1 estrella' : `${star} estrellas`;
  }

  protected tabIndexFor(star: number): number {
    const target = this.focused() ?? this.selected() ?? 1;
    return star === target ? 0 : -1;
  }

  protected preview(star: number, event: Event): void {
    // Touch/pen taps emulate hover and would leave a sticky preview.
    if ((event as PointerEvent).pointerType === 'touch') return;
    if (!this.isDisabled() && !this.readonly()) this.hovered.set(star);
  }

  protected endPreview(): void {
    this.hovered.set(null);
  }

  protected choose(star: number): void {
    this.hovered.set(null);
    if (this.isDisabled() || this.readonly() || star === this.selected()) return;
    this.commit(star);
  }

  protected clear(): void {
    this.hovered.set(null);
    if (!this.canClear()) return;
    this.commit(null);
  }

  protected onKeydown(event: KeyboardEvent, star: number): void {
    if (this.isDisabled() || this.readonly()) return;
    let target: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        target = Math.min(star + 1, MAX_STARS);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        target = Math.max(star - 1, 1);
        break;
      case 'Home':
        target = 1;
        break;
      case 'End':
        target = MAX_STARS;
        break;
    }
    if (target === null) return;
    event.preventDefault();
    this.focused.set(target);
    this.buttons()[target - 1]?.nativeElement.focus();
  }

  protected touched(): void {
    this.onTouched();
  }

  private commit(next: number | null): void {
    if (this.formBound) {
      this.selected.set(next);
      this.onChange(next);
    }
    this.ratingChange.emit(next);
  }
}
