import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Transient confirmations only. Persistent errors, validation and connection
 * problems must stay inline so they remain visible and actionable.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.open(message, 4500);
  }

  info(message: string): void {
    this.open(message, 4500);
  }

  private open(message: string, duration: number): void {
    const text = message.trim();
    if (!text) return;
    this.snackBar.open(text, 'Cerrar', {
      duration,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      politeness: 'polite',
    });
  }
}
