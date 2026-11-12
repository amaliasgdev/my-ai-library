import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InlineFeedback, InlineFeedbackVariant } from './inline-feedback';

@Component({
  imports: [InlineFeedback],
  template: `<app-inline-feedback
    [variant]="variant()"
    [title]="title()"
    [actionLabel]="actionLabel()"
    [dismissible]="dismissible()"
    [announce]="announce()"
    (action)="actions = actions + 1"
    (dismissed)="dismissals = dismissals + 1"
    >Mensaje de prueba</app-inline-feedback
  >`,
})
class TestHost {
  readonly variant = signal<InlineFeedbackVariant>('info');
  readonly title = signal('');
  readonly actionLabel = signal('');
  readonly dismissible = signal(false);
  readonly announce = signal(true);
  actions = 0;
  dismissals = 0;
}

describe('InlineFeedback', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('uses polite status for informational variants and an icon', () => {
    expect(element().querySelector('[role="status"]')?.textContent).toContain('Mensaje de prueba');
    expect(element().querySelector('[role="alert"]')).toBeNull();
    expect(element().querySelector('svg.feedback-icon')).not.toBeNull();
    expect(element().querySelector('app-inline-feedback')?.classList).toContain('feedback--info');
  });

  it('uses alert only for error feedback', () => {
    host.variant.set('error');
    fixture.detectChanges();
    expect(element().querySelector('[role="alert"]')?.textContent).toContain('Mensaje de prueba');
    expect(element().querySelector('[role="status"]')).toBeNull();
    expect(element().querySelector('app-inline-feedback')?.classList).toContain('feedback--error');
  });

  it('supports optional title, action and dismissal without putting buttons inside the live region', () => {
    host.variant.set('warning');
    host.title.set('Atención');
    host.actionLabel.set('Reintentar');
    host.dismissible.set(true);
    fixture.detectChanges();
    expect(element().querySelector('.feedback-title')?.textContent).toBe('Atención');
    expect(element().querySelector('[role="status"]')?.textContent).toContain('Atención');
    expect(element().querySelector('[role="status"]')?.textContent).not.toContain('Reintentar');
    (element().querySelector('.feedback-action') as HTMLButtonElement).click();
    (element().querySelector('.feedback-dismiss') as HTMLButtonElement).click();
    expect(host.actions).toBe(1);
    expect(host.dismissals).toBe(1);
    expect(element().querySelector('[aria-label="Cerrar aviso"]')).not.toBeNull();
  });

  it('can stay static for policy text without a live role', () => {
    host.announce.set(false);
    fixture.detectChanges();
    expect(element().querySelector('[role="status"]')).toBeNull();
    expect(element().querySelector('[role="alert"]')).toBeNull();
  });
});
