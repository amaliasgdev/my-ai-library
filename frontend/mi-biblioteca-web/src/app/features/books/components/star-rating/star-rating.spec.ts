import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { normalizeStarValue, StarRating } from './star-rating';

describe('StarRating', () => {
  let fixture: ComponentFixture<StarRating>;
  let element: HTMLElement;
  let changes: (number | null)[];

  // No HttpClient provider on purpose: hovering or choosing can never reach the network.
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StarRating] });
    fixture = TestBed.createComponent(StarRating);
    element = fixture.nativeElement as HTMLElement;
    changes = [];
    fixture.componentInstance.ratingChange.subscribe((value) => changes.push(value));
    fixture.componentRef.setInput('subject', 'Dune');
    fixture.detectChanges();
  });

  const stars = () =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button[role="radio"]'));
  const filled = () => stars().filter((star) => star.classList.contains('filled')).length;
  const checked = () =>
    stars().findIndex((star) => star.getAttribute('aria-checked') === 'true') + 1;
  const clearButton = () => element.querySelector<HTMLButtonElement>('button.clear');
  const set = (name: string, value: unknown) => {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };
  const pointer = (target: Element, type: 'pointerenter' | 'pointerleave', pointerType?: string) =>
    target.dispatchEvent(Object.assign(new MouseEvent(type), pointerType ? { pointerType } : {}));
  const key = (target: Element, name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  it('renders five accessible Spanish radios inside a labelled group, unrated by default', () => {
    expect(stars()).toHaveLength(5);
    expect(stars().map((star) => star.getAttribute('aria-label'))).toEqual([
      '1 estrella',
      '2 estrellas',
      '3 estrellas',
      '4 estrellas',
      '5 estrellas',
    ]);
    const group = element.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe('Valoración de Dune');
    expect(filled()).toBe(0);
    expect(checked()).toBe(0);
    expect(element.querySelector('.summary')?.textContent).toBe('Sin valorar');
    expect(clearButton()).toBeNull();
    expect(element.querySelectorAll('mat-icon svg')).toHaveLength(5);
  });

  it.each([1, 2, 3, 4, 5])('preloads a saved rating of %s as that many gold stars', (value) => {
    set('value', value);
    expect(filled()).toBe(value);
    expect(checked()).toBe(value);
    expect(element.querySelector('.summary')?.textContent).toBe(`${value} de 5`);
    expect(changes).toEqual([]);
  });

  it.each([null, 0, 6, 2.5, NaN])('treats %s as unrated instead of inventing a value', (value) => {
    set('value', value);
    expect(filled()).toBe(0);
    expect(element.querySelector('.summary')?.textContent).toBe('Sin valorar');
  });

  it.each([1, 2, 3, 4, 5])('emits %s once when that star is chosen', (star) => {
    stars()[star - 1].click();
    expect(changes).toEqual([star]);
  });

  it('follows the confirmed input only: an unconfirmed choice is never displayed', () => {
    set('value', 2);
    stars()[4].click();
    fixture.detectChanges();
    expect(changes).toEqual([5]);
    expect(checked()).toBe(2);
    expect(filled()).toBe(2);
    set('value', 5);
    expect(checked()).toBe(5);
  });

  it('does not emit again for the star that is already selected', () => {
    set('value', 3);
    stars()[2].click();
    expect(changes).toEqual([]);
  });

  it('previews on mouse hover without emitting or changing the stored value, then reverts', () => {
    set('value', 2);
    pointer(stars()[3], 'pointerenter');
    fixture.detectChanges();
    expect(filled()).toBe(4);
    expect(stars()[3].classList.contains('preview')).toBe(true);
    expect(stars()[1].classList.contains('preview')).toBe(false);
    expect(checked()).toBe(2);
    expect(changes).toEqual([]);
    pointer(element.querySelector('[role="radiogroup"]')!, 'pointerleave');
    fixture.detectChanges();
    expect(filled()).toBe(2);
    expect(changes).toEqual([]);
  });

  it('ignores the hover emulated by touch taps and clears any preview when choosing', () => {
    pointer(stars()[2], 'pointerenter', 'touch');
    fixture.detectChanges();
    expect(filled()).toBe(0);
    pointer(stars()[2], 'pointerenter', 'mouse');
    fixture.detectChanges();
    expect(filled()).toBe(3);
    stars()[2].click();
    fixture.detectChanges();
    expect(changes).toEqual([3]);
    expect(filled()).toBe(0);
  });

  it('offers Quitar valoración only for a rated, editable control and emits null', () => {
    expect(clearButton()).toBeNull();
    set('value', 4);
    const button = clearButton()!;
    expect(button.textContent?.trim()).toBe('Quitar valoración');
    expect(button.getAttribute('aria-label')).toBe('Quitar valoración de Dune');
    button.click();
    expect(changes).toEqual([null]);
    set('clearable', false);
    expect(clearButton()).toBeNull();
  });

  it('supports keyboard navigation with a roving tabindex and no accidental selection', () => {
    set('value', 3);
    expect(stars().map((star) => star.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
    stars()[2].focus();
    expect(key(stars()[2], 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stars()[3]);
    expect(stars().map((star) => star.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    key(stars()[3], 'ArrowUp');
    expect(document.activeElement).toBe(stars()[4]);
    key(stars()[4], 'ArrowRight');
    expect(document.activeElement).toBe(stars()[4]);
    key(stars()[4], 'Home');
    expect(document.activeElement).toBe(stars()[0]);
    key(stars()[0], 'ArrowLeft');
    expect(document.activeElement).toBe(stars()[0]);
    key(stars()[0], 'ArrowDown');
    expect(document.activeElement).toBe(stars()[0]);
    key(stars()[0], 'End');
    expect(document.activeElement).toBe(stars()[4]);
    expect(key(stars()[4], 'a').defaultPrevented).toBe(false);
    expect(changes).toEqual([]);
    expect(checked()).toBe(3);
  });

  it('activates the focused star with Enter or Space, which a native button turns into click', () => {
    stars()[1].focus();
    key(stars()[1], 'ArrowRight');
    (document.activeElement as HTMLButtonElement).click();
    expect(changes).toEqual([3]);
  });

  it('is tabbable on the first star when unrated', () => {
    expect(stars().map((star) => star.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it('blocks choices, hover, keys and clearing while disabled', () => {
    set('value', 3);
    set('disabled', true);
    expect(stars().every((star) => star.disabled)).toBe(true);
    expect(element.querySelector('[role="radiogroup"]')?.getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(clearButton()).toBeNull();
    stars()[4].click();
    pointer(stars()[4], 'pointerenter');
    fixture.detectChanges();
    expect(filled()).toBe(3);
    key(stars()[2], 'ArrowRight');
    expect(changes).toEqual([]);
  });

  it('renders read-only as a labelled image with no controls or events', () => {
    set('value', 4);
    set('readonly', true);
    expect(stars()).toHaveLength(0);
    expect(element.querySelector('button')).toBeNull();
    const image = element.querySelector('[role="img"]');
    expect(image?.getAttribute('aria-label')).toBe('Valoración de Dune: 4 de 5');
    expect(element.querySelectorAll('mat-icon.filled')).toHaveLength(4);
    expect(element.querySelector('.summary')?.textContent).toBe('4 de 5');
    set('showSummary', false);
    expect(element.querySelector('.summary')).toBeNull();
    expect(changes).toEqual([]);
  });

  it('normalizes only integers from 1 to 5', () => {
    expect([1, 5, 0, 6, 3.5, null, undefined, '3'].map(normalizeStarValue)).toEqual([
      1,
      5,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

@Component({
  imports: [ReactiveFormsModule, StarRating],
  template: `<app-star-rating [formControl]="control" subject="Dune" />`,
})
class FormHost {
  readonly control = new FormControl<number | null>(null);
}

describe('StarRating with Reactive Forms', () => {
  let fixture: ComponentFixture<FormHost>;
  let element: HTMLElement;
  const stars = () =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button[role="radio"]'));
  const checked = () =>
    stars().findIndex((star) => star.getAttribute('aria-checked') === 'true') + 1;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FormHost] });
    fixture = TestBed.createComponent(FormHost);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('writes the control value, keeps its own choice and reports it to the form', () => {
    const control = fixture.componentInstance.control;
    control.setValue(3);
    fixture.detectChanges();
    expect(checked()).toBe(3);
    stars()[4].click();
    fixture.detectChanges();
    expect(control.value).toBe(5);
    expect(checked()).toBe(5);
    expect(element.querySelector('.summary')?.textContent).toBe('5 de 5');
    element.querySelector<HTMLButtonElement>('button.clear')!.click();
    fixture.detectChanges();
    expect(control.value).toBeNull();
    expect(checked()).toBe(0);
  });

  it('never changes the control on hover and only marks it touched after blur', () => {
    const control = fixture.componentInstance.control;
    stars()[3].dispatchEvent(new MouseEvent('pointerenter'));
    fixture.detectChanges();
    expect(control.value).toBeNull();
    expect(control.dirty).toBe(false);
    stars()[0].focus();
    stars()[0].blur();
    expect(control.touched).toBe(true);
  });

  it('follows disable()/enable() and ignores invalid written values', () => {
    const control = fixture.componentInstance.control;
    control.disable();
    fixture.detectChanges();
    expect(stars().every((star) => star.disabled)).toBe(true);
    control.enable();
    control.setValue(7);
    fixture.detectChanges();
    expect(checked()).toBe(0);
    expect(stars().every((star) => !star.disabled)).toBe(true);
  });
});
