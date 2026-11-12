import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoadingState } from './loading-state';

@Component({
  imports: [LoadingState],
  template: `<app-loading-state message="Cargando libros…" />`,
})
class TestHost {}

describe('LoadingState', () => {
  let fixture: ComponentFixture<TestHost>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
  });

  it('exposes one accessible busy status with a spinner and message', () => {
    const element = fixture.nativeElement as HTMLElement;
    const loading = element.querySelector('app-loading-state');
    expect(loading?.getAttribute('role')).toBe('status');
    expect(loading?.getAttribute('aria-live')).toBe('polite');
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(loading?.textContent).toContain('Cargando libros…');
    expect(element.querySelector('mat-spinner')).not.toBeNull();
  });
});
