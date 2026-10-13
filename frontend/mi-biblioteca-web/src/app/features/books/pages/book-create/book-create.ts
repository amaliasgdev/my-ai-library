import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { finalize, Subscription } from 'rxjs';
import { BookForm } from '../../components/book-form/book-form';
import { BookRequest } from '../../models/book.models';
import { BooksService } from '../../services/books.service';
import { IsbnScanDialog } from '../../components/isbn-scan-dialog/isbn-scan-dialog';
import { isValidBarcodeIsbn13 } from '../../models/isbn-barcode';

@Component({
  selector: 'app-book-create',
  imports: [BookForm],
  templateUrl: './book-create.html',
  styleUrl: './book-create.scss',
})
export class BookCreate {
  private readonly service = inject(BooksService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private scanRef: MatDialogRef<IsbnScanDialog, string> | null = null;
  readonly detectedIsbn = signal<string | null>(null);
  readonly editor = viewChild.required(BookForm);
  readonly submitting = signal(false);
  readonly generalError = signal<string | null>(null);
  readonly lookupState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly lookupError = signal<string | null>(null);
  private lookupSubscription: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.closeScanner();
      this.cancelLookup();
    });
  }

  isbnChanged(): void {
    this.detectedIsbn.set(null);
    this.cancelLookup();
  }

  openScanner(): void {
    if (this.submitting() || this.scanRef) return;
    this.cancelLookup();
    const ref = this.dialog.open<IsbnScanDialog, void, string>(IsbnScanDialog, {
      width: '36rem',
      maxWidth: '95vw',
      autoFocus: 'button',
      restoreFocus: true,
    });
    this.scanRef = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isbn) => {
        if (this.scanRef !== ref) return;
        this.scanRef = null;
        if (this.submitting() || !isbn || !isValidBarcodeIsbn13(isbn)) return;
        this.cancelLookup();
        const control = this.editor().form.controls.isbn;
        control.setValue(isbn);
        control.markAsDirty();
        this.detectedIsbn.set(isbn);
        this.lookup(isbn);
      });
  }

  private closeScanner(): void {
    const ref = this.scanRef;
    this.scanRef = null;
    ref?.close();
  }

  cancelLookup(): void {
    this.lookupSubscription?.unsubscribe();
    this.lookupSubscription = null;
    this.lookupState.set('idle');
    this.lookupError.set(null);
  }

  lookup(isbn: string): void {
    if (
      this.submitting() ||
      this.lookupState() === 'loading' ||
      !this.editor().canLookup() ||
      this.editor().form.controls.isbn.value !== isbn
    )
      return;
    this.lookupState.set('loading');
    this.lookupError.set(null);
    this.lookupSubscription = this.service
      .lookupByIsbn(isbn)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (proposal) => {
          if (this.submitting() || this.editor().form.controls.isbn.value !== isbn) {
            this.cancelLookup();
            return;
          }
          this.editor().applyLookup(proposal);
          this.lookupState.set('success');
        },
        error: (error: unknown) => {
          if (this.editor().form.controls.isbn.value !== isbn) {
            this.cancelLookup();
            return;
          }
          let message = 'No se pudo consultar el ISBN';
          if (error instanceof HttpErrorResponse) {
            switch (error.status) {
              case 0:
                message = 'No se puede conectar con el servidor';
                break;
              case 400:
                message = 'El ISBN no es válido';
                break;
              case 404:
                message = 'No se encontraron datos para este ISBN';
                break;
              case 502:
                message = 'No se pudieron interpretar los datos del proveedor';
                break;
              case 503:
                message = 'El servicio de consulta de libros no está disponible';
                break;
              case 504:
                message = 'La consulta ha tardado demasiado';
                break;
            }
          }
          this.lookupError.set(message);
          this.lookupState.set('error');
        },
      });
  }

  save(request: BookRequest): void {
    if (this.submitting()) return;
    this.closeScanner();
    this.cancelLookup();
    this.generalError.set(null);
    this.submitting.set(true);
    this.service
      .createBook(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/books']);
        },
        error: (error: unknown) => {
          let message = 'No se pudo guardar el libro';
          if (error instanceof HttpErrorResponse) {
            if (error.status === 0) message = 'No se puede conectar con el servidor';
            else if (error.status === 400) {
              message = 'Revisa los campos indicados';
              this.editor().applyFieldErrors(error.error);
            } else if (error.status === 409) {
              message = 'Ya existe un libro con ese ISBN';
              this.editor().markIsbnConflict();
            } else if (error.status >= 500 && error.status < 600)
              message = 'El servidor no pudo guardar el libro';
          }
          this.generalError.set(message);
        },
      });
  }

  cancel(): void {
    if (!this.submitting()) {
      this.closeScanner();
      this.cancelLookup();
      void this.router.navigate(['/books']);
    }
  }
}
