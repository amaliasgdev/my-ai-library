import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import {
  ISBN_SCAN_DIAGNOSTICS_ENABLED,
  IsbnBarcodeReader,
  IsbnScanEvents,
} from './isbn-barcode-reader';
import { IsbnScanDialog } from './isbn-scan-dialog';
import { firstValueFrom } from 'rxjs';

@Component({ template: '<button id="trigger" (click)="open()">Escanear ISBN</button>' })
class Host {
  private readonly dialog = TestBed.inject(MatDialog);
  open() {
    this.dialog.open(IsbnScanDialog, { autoFocus: 'button', restoreFocus: true });
  }
}

describe('IsbnScanDialog accessible lifecycle', () => {
  let fixture: ComponentFixture<Host>;
  let scanner: {
    startCamera: ReturnType<typeof vi.fn>;
    processImage: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
  };
  let events: IsbnScanEvents;
  let diagnosticsEnabled: boolean;
  beforeEach(() => {
    diagnosticsEnabled = true;
    scanner = {
      startCamera: vi
        .fn()
        .mockImplementation((_video: HTMLVideoElement, callbacks: IsbnScanEvents) => {
          events = callbacks;
          callbacks.state('scanning');
          return Promise.resolve();
        }),
      processImage: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [Host, IsbnScanDialog],
      providers: [
        { provide: ISBN_SCAN_DIAGNOSTICS_ENABLED, useFactory: () => diagnosticsEnabled },
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: {
            ...new MatDialogConfig(),
            enterAnimationDuration: 0,
            exitAnimationDuration: 0,
          },
        },
      ],
    });
    TestBed.overrideComponent(IsbnScanDialog, {
      set: { providers: [{ provide: IsbnBarcodeReader, useValue: scanner }] },
    });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    fixture.destroy();
    vi.restoreAllMocks();
  });
  async function open() {
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '#trigger',
    )!;
    button.focus();
    button.click();
    await fixture.whenStable();
    return TestBed.inject(MatDialog).openDialogs[0];
  }
  function button(text: string) {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
      (item) => item.textContent?.trim() === text,
    )!;
  }

  it('does not start camera until dialog opens and exposes instructions, privacy and video attributes', async () => {
    expect(scanner.startCamera).not.toHaveBeenCalled();
    await open();
    expect(scanner.startCamera).toHaveBeenCalledOnce();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Escanear ISBN');
    expect(dialog.textContent).toContain('El código de barras se procesa en tu dispositivo.');
    expect(dialog.querySelector('video')!.hasAttribute('playsinline')).toBe(true);
    expect(dialog.querySelector('video')!.hasAttribute('muted')).toBe(true);
    expect(dialog.querySelector('video')!.hasAttribute('autoplay')).toBe(false);
    expect(dialog.querySelector('[role="status"]')).not.toBeNull();
  });
  it('shows an accessible guide without cropping or enabling autoplay', async () => {
    await open();
    const video = document.querySelector('[role="dialog"] video')!;
    expect(video.getAttribute('aria-describedby')).toBe('scan-guide scan-help');
    expect(document.querySelector('.barcode-guide')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('#scan-guide')?.textContent).toBe(
      'Coloca el código completo dentro del recuadro',
    );
    expect(document.querySelector('#scan-help')?.textContent).toContain(
      'Aléjate un poco si no enfoca.',
    );
    expect(video.hasAttribute('autoplay')).toBe(false);
  });
  it('development diagnostic panel requires explicit activation and shows only selected safe fields', async () => {
    await open();
    expect(document.querySelector('#scan-diagnostics')).toBeNull();
    events.diagnostics?.({
      videoWidth: 1280,
      videoHeight: 720,
      width: 1280,
      height: 720,
      frameRate: 30,
      facingMode: 'environment',
      focusModes: ['continuous'],
      continuousRequested: true,
      focusRequestFailed: false,
      confirmedFocusMode: null,
      zoom: { min: 1, max: 3 },
      torchAvailable: false,
      lastEan13: '4006381333931',
    });
    button('Mostrar diagnóstico de desarrollo').click();
    await fixture.whenStable();
    const panel = document.querySelector('#scan-diagnostics')!;
    expect(panel.textContent).toContain('1280 × 720');
    expect(panel.textContent).toContain('No verificable');
    expect(panel.textContent).toContain('4006381333931');
    button('Ocultar diagnóstico').click();
    await fixture.whenStable();
    expect(document.querySelector('#scan-diagnostics')).toBeNull();
  });
  it('does not expose diagnostic controls or data in production mode', async () => {
    diagnosticsEnabled = false;
    const ref = await open();
    (ref.componentInstance as IsbnScanDialog).showDiagnostics.set(true);
    await fixture.whenStable();
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('diagnóstico');
    expect(document.querySelector('#scan-diagnostics')).toBeNull();
  });
  it('closes with one ISBN and cleans up', async () => {
    const ref = await open();
    const closed = vi.fn();
    ref.afterClosed().subscribe(closed);
    const done = firstValueFrom(ref.afterClosed());
    events.detected('9780306406157');
    events.detected('9780132350884');
    await done;
    await fixture.whenStable();
    expect(closed).toHaveBeenCalledExactlyOnceWith('9780306406157');
    expect(scanner.cleanup).toHaveBeenCalled();
  });
  it('Cancel returns no ISBN and restores focus', async () => {
    const ref = await open();
    const closed = vi.fn();
    ref.afterClosed().subscribe(closed);
    const done = firstValueFrom(ref.afterClosed());
    button('Cancelar').click();
    await done;
    await fixture.whenStable();
    expect(closed).toHaveBeenCalledWith(undefined);
    expect(scanner.cleanup).toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('trigger');
  });
  it('Escape cleans resources and cancels', async () => {
    const ref = await open();
    const done = firstValueFrom(ref.afterClosed());
    document
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await done;
    await fixture.whenStable();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
    expect(scanner.cleanup).toHaveBeenCalled();
  });
  it('backdrop cancels and cleans resources', async () => {
    const ref = await open();
    const done = firstValueFrom(ref.afterClosed());
    (document.querySelector('.cdk-overlay-backdrop') as HTMLElement).click();
    await done;
    await fixture.whenStable();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
    expect(scanner.cleanup).toHaveBeenCalled();
  });
  it('stops when hidden and only restarts by explicit action', async () => {
    const ref = await open();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await fixture.whenStable();
    expect(scanner.cleanup).toHaveBeenCalled();
    expect((ref.componentInstance as IsbnScanDialog).state()).toBe('idle');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(scanner.startCamera).toHaveBeenCalledOnce();
    button('Reintentar cámara').click();
    expect(scanner.startCamera).toHaveBeenCalledTimes(2);
  });
  it('shows safe error alert and allows camera retry or image', async () => {
    await open();
    events.state('error');
    events.error('No se ha encontrado una cámara disponible');
    await fixture.whenStable();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain(
      'No se ha encontrado una cámara disponible',
    );
    expect(button('Seleccionar imagen').disabled).toBe(false);
    button('Reintentar cámara').click();
    expect(scanner.startCamera).toHaveBeenCalledTimes(2);
  });
  it('announces invalid barcode without closing', async () => {
    await open();
    events.warning('Código detectado, pero no es un ISBN válido');
    await fixture.whenStable();
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
      'Código detectado, pero no es un ISBN válido',
    );
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
  });
  it('passes one local image and clears file input, while cancel stays available', async () => {
    const ref = await open();
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="file"]')!;
    const file = new File(['data'], 'barcode.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: { item: () => file } });
    input.dispatchEvent(new Event('change'));
    expect(scanner.processImage).toHaveBeenCalledWith(file, events);
    expect(input.value).toBe('');
    (ref.componentInstance as IsbnScanDialog).state.set('processingImage');
    await fixture.whenStable();
    expect(button('Seleccionar imagen').disabled).toBe(true);
    expect(button('Cancelar').disabled).toBe(false);
  });
  it('dismissing image picker does not process or change camera state', async () => {
    await open();
    document
      .querySelector<HTMLInputElement>('[role="dialog"] input')!
      .dispatchEvent(new Event('change'));
    expect(scanner.processImage).not.toHaveBeenCalled();
  });
  it('removes visibility listener on destruction', async () => {
    const ref = await open();
    ref.close();
    await fixture.whenStable();
    scanner.cleanup.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(scanner.cleanup).not.toHaveBeenCalled();
  });
});
