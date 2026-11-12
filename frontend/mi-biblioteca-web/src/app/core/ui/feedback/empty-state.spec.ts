import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `<app-empty-state
    title="No se encontraron libros"
    description="Prueba otros filtros."
    [live]="live()"
    ><button type="button">Limpiar filtros</button></app-empty-state
  >`,
})
class TestHost {
  readonly live = signal(false);
}

describe('EmptyState', () => {
  let fixture: ComponentFixture<TestHost>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders title, explanation and projected action without a live role by default', () => {
    expect(element().querySelector('.empty-title')?.textContent).toBe('No se encontraron libros');
    expect(element().textContent).toContain('Prueba otros filtros.');
    expect(element().querySelector('.empty-actions button')?.textContent).toBe('Limpiar filtros');
    expect(element().querySelector('.empty-state')?.getAttribute('role')).toBeNull();
  });

  it('can be a single polite status region when the parent has no other announcement', () => {
    fixture.componentInstance.live.set(true);
    fixture.detectChanges();
    const empty = element().querySelector('.empty-state');
    expect(empty?.getAttribute('role')).toBe('status');
    expect(empty?.getAttribute('aria-live')).toBe('polite');
  });
});
