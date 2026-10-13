import { TestBed } from '@angular/core/testing';
import { BookForm } from './book-form';
import { bookFormValue, buildBookRequest } from './book-form.helpers';
import { testBook, testBookLookup } from '../../models/book.testing';

describe('BookForm physical location', () => {
  function create() {
    TestBed.configureTestingModule({ imports: [BookForm] });
    const fixture = TestBed.createComponent(BookForm);
    fixture.detectChanges();
    return { fixture, form: fixture.componentInstance };
  }
  it('shows three optional typed text fields, initially empty, mapping to null', () => {
    const { fixture, form } = create();
    expect(fixture.nativeElement.textContent).toContain('Ubicación');
    for (const field of ['room', 'bookcase', 'shelf'] as const) {
      expect(form.form.controls[field].value).toBe('');
      expect(form.form.controls[field].valid).toBe(true);
      const input = fixture.nativeElement.querySelector(
        `[formControlName="${field}"]`,
      ) as HTMLInputElement;
      expect(input.required).toBe(false);
      expect(input.type).toBe('text');
      expect(buildBookRequest(form.form.getRawValue())[field]).toBeNull();
    }
  });
  it('preloads real response or draft with location and retains pristine/untouched state', () => {
    const { fixture, form } = create();
    fixture.componentRef.setInput(
      'initialBook',
      testBook({ room: 'Salón', bookcase: 'Billy', shelf: 'Superior' }),
    );
    fixture.detectChanges();
    expect(form.form.getRawValue()).toMatchObject({
      room: 'Salón',
      bookcase: 'Billy',
      shelf: 'Superior',
    });
    expect(form.form.pristine).toBe(true);
    expect(form.form.untouched).toBe(true);
    fixture.componentRef.setInput('initialDraft', bookFormValue(testBook({ shelf: 'Abajo' })));
    fixture.detectChanges();
    expect(form.form.getRawValue()).toMatchObject({ room: '', bookcase: '', shelf: 'Abajo' });
  });
  it('builder trims exterior Unicode spaces but preserves case, accents, punctuation and inner spaces', () => {
    const draft = bookFormValue(testBook());
    Object.assign(draft, {
      room: ' \u00a0Salón\u00a0 ',
      bookcase: ' Billy  izquierda / nº 2 ',
      shelf: ' Superior (A) ',
    });
    expect(buildBookRequest(draft)).toMatchObject({
      room: 'Salón',
      bookcase: 'Billy  izquierda / nº 2',
      shelf: 'Superior (A)',
    });
    Object.assign(draft, { room: '   ', bookcase: '\u00a0', shelf: '' });
    expect(buildBookRequest(draft)).toMatchObject({ room: null, bookcase: null, shelf: null });
  });
  it.each(['room', 'bookcase', 'shelf'] as const)(
    'accepts max but rejects raw excess for %s without truncating',
    (field) => {
      const { form } = create();
      const max = field === 'shelf' ? 50 : 100;
      const control = form.form.controls[field];
      control.setValue('á'.repeat(max));
      expect(control.valid).toBe(true);
      control.setValue(' ' + 'á'.repeat(max));
      expect(control.hasError('maxlength')).toBe(true);
      expect(control.value).toHaveLength(max + 1);
      const save = vi.fn();
      form.save.subscribe(save);
      form.form.patchValue({ title: 'Book', author: 'Author' });
      form.submit();
      expect(save).not.toHaveBeenCalled();
    },
  );
  it.each(['\0', '\t', '\r', '\n', '\u007f', '\u0085', '\u2028', '\u2029'])(
    'rejects controls %j in all fields even at their edges',
    (control) => {
      const { form } = create();
      for (const field of ['room', 'bookcase', 'shelf'] as const) {
        form.form.controls[field].setValue(control + 'Salón');
        expect(form.form.controls[field].hasError('locationLabel')).toBe(true);
        expect(form.fieldError(form.form.controls[field])).toContain('sin caracteres de control');
      }
    },
  );
  it('maps known server errors and clears them independently on editing', () => {
    const { form } = create();
    form.applyFieldErrors({ errors: { room: 'invalid', bookcase: 'invalid', shelf: 'invalid' } });
    for (const field of ['room', 'bookcase', 'shelf'] as const) {
      expect(form.form.controls[field].hasError('server')).toBe(true);
      form.form.controls[field].setValue('Correct');
      expect(form.form.controls[field].hasError('server')).toBe(false);
    }
  });
  it('lookup never fills/erases or dirties physical location, even with an incompatible extra proposal field', () => {
    const { form } = create();
    form.form.patchValue({ room: 'Salón', bookcase: 'Billy', shelf: '3' });
    const proposal = {
      ...testBookLookup(),
      room: 'Provider room',
      bookcase: 'Provider shelf',
      shelf: 'X',
    };
    form.applyLookup(proposal);
    expect(form.form.getRawValue()).toMatchObject({ room: 'Salón', bookcase: 'Billy', shelf: '3' });
    expect(form.form.controls.room.pristine).toBe(true);
    form.form.patchValue({ room: '', bookcase: '', shelf: '' });
    form.applyLookup(proposal);
    expect(form.form.getRawValue()).toMatchObject({ room: '', bookcase: '', shelf: '' });
  });
});
