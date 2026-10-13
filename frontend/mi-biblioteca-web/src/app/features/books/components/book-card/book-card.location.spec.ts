import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BookCard } from './book-card';
import { testBook } from '../../models/book.testing';

describe('BookCard compact optional location', () => {
  it.each([
    [
      { room: 'Salón', bookcase: 'Billy izquierda', shelf: '3' },
      'Ubicación: Salón · Billy izquierda · Balda 3',
    ],
    [{ room: 'Dormitorio' }, 'Ubicación: Dormitorio'],
    [{ bookcase: 'Negra' }, 'Ubicación: Negra'],
    [{ shelf: 'Superior' }, 'Ubicación: Balda Superior'],
    [{ room: 'Salón', shelf: 'Abajo' }, 'Ubicación: Salón · Balda Abajo'],
  ])('shows only present components without tooltip %j', (location, text) => {
    TestBed.configureTestingModule({ imports: [BookCard], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookCard);
    fixture.componentRef.setInput('book', testBook(location));
    fixture.detectChanges();
    const label = fixture.nativeElement.querySelector('.location') as HTMLElement;
    expect(label.textContent?.trim()).toBe(text);
    expect(label.getAttribute('title')).toBeNull();
  });
  it('has no placeholder when absent and responds to confirmed input changes', () => {
    TestBed.configureTestingModule({ imports: [BookCard], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookCard);
    fixture.componentRef.setInput('book', testBook());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.location')).toBeNull();
    fixture.componentRef.setInput('book', testBook({ shelf: '3' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Balda 3');
    fixture.componentRef.setInput('book', testBook());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Sin ubicación');
  });
});
