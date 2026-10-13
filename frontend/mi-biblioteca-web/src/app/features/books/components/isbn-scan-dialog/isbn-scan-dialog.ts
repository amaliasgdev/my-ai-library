import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {
  ISBN_SCAN_DIAGNOSTICS_ENABLED,
  IsbnBarcodeReader,
  IsbnScanDiagnostics,
  IsbnScanEvents,
  IsbnScanState,
} from './isbn-barcode-reader';

@Component({
  selector: 'app-isbn-scan-dialog',
  imports: [MatDialogModule, MatButtonModule],
  providers: [IsbnBarcodeReader],
  templateUrl: './isbn-scan-dialog.html',
  styleUrl: './isbn-scan-dialog.scss',
})
export class IsbnScanDialog implements AfterViewInit {
  private readonly reader = inject(IsbnBarcodeReader);
  private readonly ref = inject(MatDialogRef<IsbnScanDialog, string>);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  readonly state = signal<IsbnScanState>('idle');
  readonly error = signal<string | null>(null);
  readonly warning = signal<string | null>(null);
  readonly diagnosticsEnabled = inject(ISBN_SCAN_DIAGNOSTICS_ENABLED);
  readonly showDiagnostics = signal(false);
  readonly diagnostics = signal<IsbnScanDiagnostics | null>(null);
  private closed = false;
  private readonly events: IsbnScanEvents = {
    state: (state) => this.state.set(state),
    error: (message) => this.error.set(message),
    warning: (message) => this.warning.set(message),
    diagnostics: (value) => {
      if (this.diagnosticsEnabled && !this.closed) this.diagnostics.set(value);
    },
    detected: (isbn) => {
      if (this.closed) return;
      this.closed = true;
      this.ref.close(isbn);
    },
  };

  constructor() {
    const visibility = () => {
      if (this.document.hidden && ['requestingCamera', 'scanning'].includes(this.state())) {
        this.reader.cleanup();
        this.state.set('idle');
        this.warning.set('La cámara se ha detenido. Pulsa Reintentar cámara para continuar.');
      }
    };
    this.document.addEventListener('visibilitychange', visibility);
    this.ref
      .beforeClosed()
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.closed = true;
        this.reader.cleanup();
      });
    this.destroyRef.onDestroy(() => {
      this.closed = true;
      this.reader.cleanup();
      this.document.removeEventListener('visibilitychange', visibility);
    });
  }

  ngAfterViewInit(): void {
    this.startCamera();
  }

  startCamera(): void {
    if (this.closed || this.state() === 'processingImage' || this.document.hidden) return;
    this.error.set(null);
    this.warning.set(null);
    this.diagnostics.set(null);
    void this.reader.startCamera(this.video().nativeElement, this.events);
  }

  selectImage(event: Event): void {
    if (this.closed || this.state() === 'processingImage') return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.item(0) ?? null;
    input.value = '';
    if (!file) return; // Dismissing the native picker is not a failed scan.
    this.error.set(null);
    this.warning.set(null);
    void this.reader.processImage(file, this.events);
  }

  cancel(): void {
    if (this.closed) return;
    this.closed = true;
    this.reader.cleanup();
    this.ref.close();
  }
}
