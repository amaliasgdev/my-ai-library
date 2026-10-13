import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BookForm } from './book-form';
import { bookFormValue, buildBookRequest } from './book-form.helpers';
import { testBook, testBookLookup } from '../../models/book.testing';
import { LocationSelector } from '../../../locations/components/location-selector';
import { testLocations } from '../../../locations/models/location.testing';

describe('BookForm structured shelves and legacy compatibility', () => {
  function create(book = testBook()) {
    TestBed.configureTestingModule({ imports: [BookForm] });
    const fixture = TestBed.createComponent(BookForm);
    fixture.componentRef.setInput('initialBook', book);
    fixture.componentRef.setInput('locations', testLocations());
    fixture.detectChanges();
    return {
      fixture,
      form: fixture.componentInstance,
      selector: fixture.debugElement.query(By.directive(LocationSelector))
        .componentInstance as LocationSelector,
    };
  }
  it('preloads stable Shelf ID and builder sends only explicit location, not effective response names', () => {
    const { form } = create(
      testBook({
        shelfId: 3,
        roomId: 1,
        bookcaseId: 2,
        room: 'Salón',
        bookcase: 'Billy',
        shelf: 'Superior',
        locationPending: false,
      }),
    );
    expect(form.form.controls.shelfId.value).toBe(3);
    const request = buildBookRequest(form.form.getRawValue());
    expect(request.location).toEqual({ kind: 'SHELF', shelfId: 3 });
    expect(Object.hasOwn(request, 'room')).toBe(false);
    expect(Object.hasOwn(request, 'bookcase')).toBe(false);
    expect(Object.hasOwn(request, 'shelf')).toBe(false);
    expect(form.form.pristine).toBe(true);
    expect(form.form.untouched).toBe(true);
  });
  it('preserves partial legacy until explicit replacement, with no automatic name matching', () => {
    const { form, selector } = create(testBook({ room: 'Salón', locationPending: true }));
    const save = vi.fn();
    form.save.subscribe(save);
    selector.open();
    form.submit();
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ room: 'Salón', bookcase: null, shelf: null }),
    );
    selector.roomChanged(1);
    form.submit();
    expect(save).toHaveBeenCalledTimes(1);
    selector.bookcaseChanged(2);
    selector.shelfChanged(3);
    form.submit();
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ location: { kind: 'SHELF', shelfId: 3 } }),
    );
    expect(form.form.controls.room.value).toBe('');
  });
  it('clear drops structured ID and all textual fields; no partial structured save', () => {
    const { form, selector } = create(testBook({ shelfId: 3, room: 'Salón', shelf: 'Superior' }));
    selector.clear();
    expect(buildBookRequest(form.form.getRawValue())).toMatchObject({
      room: null,
      bookcase: null,
      shelf: null,
    });
    expect(form.form.controls.shelfId.value).toBeNull();
    selector.roomChanged(1);
    const save = vi.fn();
    form.save.subscribe(save);
    form.submit();
    expect(save).not.toHaveBeenCalled();
    selector.clear();
    form.submit();
    expect(save).toHaveBeenCalledOnce();
  });
  it('lookup never changes a selected Shelf or pending text, while server shelf errors clear on reselection', () => {
    const { form } = create(testBook({ shelfId: 3, room: 'Salón', shelf: 'Superior' }));
    form.applyLookup(testBookLookup());
    expect(form.form.controls.shelfId.value).toBe(3);
    form.applyFieldErrors({ errors: { 'location.shelfId': 'Missing' } });
    expect(form.form.controls.shelfId.hasError('server')).toBe(true);
    form.selectLocation({ shelfId: 4, incomplete: false, clearLegacy: true });
    expect(form.form.controls.shelfId.hasError('server')).toBe(false);
  });
  it('confirmed import draft retains Shelf independent of displayed labels', () => {
    const value = bookFormValue(testBook({ shelfId: 3 }));
    expect(buildBookRequest(value).location).toEqual({ kind: 'SHELF', shelfId: 3 });
  });
});
