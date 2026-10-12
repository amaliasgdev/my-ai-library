import { Component, inject, Injectable, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import {
  DateAdapter,
  MAT_DATE_LOCALE,
  NativeDateAdapter,
  provideNativeDateAdapter,
} from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  BookResponse,
  BookUpdateAction,
  UpdateReadingDatesRequest,
} from '../../models/book.models';
import { localDateString, parseLocalDate } from '../../models/reading-date';

@Injectable()
export class ReadingDatesAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (value === null || value === '') return null;
    if (typeof value !== 'string') return this.invalid();
    return parseLocalDate(value) ?? this.invalid();
  }

  override format(date: Date, displayFormat: object | string): string {
    return displayFormat === 'iso'
      ? localDateString(date)
      : super.format(date, displayFormat as object);
  }
}

const validDate: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const date: unknown = control.value;
  return date === null ||
    (date instanceof Date &&
      Number.isFinite(date.getTime()) &&
      parseLocalDate(localDateString(date)))
    ? null
    : { invalidDate: true };
};

const datePair: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const start = control.get('startedOn')?.value as Date | null;
  const end = control.get('finishedOn')?.value as Date | null;
  if (!start && !end) return { emptyDates: true };
  return start && end && localDateString(end) < localDateString(start) ? { dateOrder: true } : null;
};

@Component({
  selector: 'app-book-reading-dates-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
  ],
  providers: [
    provideNativeDateAdapter({
      parse: { dateInput: 'iso' },
      display: {
        dateInput: 'iso',
        monthYearLabel: { year: 'numeric', month: 'short' },
        dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
        monthYearA11yLabel: { year: 'numeric', month: 'long' },
      },
    }),
    { provide: DateAdapter, useClass: ReadingDatesAdapter },
    { provide: MAT_DATE_LOCALE, useValue: 'es-ES' },
  ],
  templateUrl: './book-reading-dates-dialog.html',
  styleUrl: './book-reading-dates-dialog.scss',
})
export class BookReadingDatesDialog {
  readonly book = inject<BookResponse>(MAT_DIALOG_DATA);
  readonly pending = signal(false);
  readonly pendingAction = signal<BookUpdateAction | null>(null);
  readonly error = signal<string | null>(null);
  readonly saveRequested = output<UpdateReadingDatesRequest>();
  readonly deleteRequested = output<void>();
  readonly cancelRequested = output<void>();
  readonly hasDates = this.book.startedOn !== null || this.book.finishedOn !== null;
  readonly form = new FormGroup(
    {
      startedOn: new FormControl<Date | null>(
        this.book.startedOn ? parseLocalDate(this.book.startedOn) : null,
        validDate,
      ),
      finishedOn: new FormControl<Date | null>(
        this.book.finishedOn ? parseLocalDate(this.book.finishedOn) : null,
        validDate,
      ),
    },
    { validators: datePair },
  );

  setPending(pending: boolean, action: BookUpdateAction = 'updateReadingDates'): void {
    this.pending.set(pending);
    this.pendingAction.set(pending ? action : null);
    if (pending) this.form.disable({ emitEvent: false });
    else this.form.enable({ emitEvent: false });
  }

  save(): void {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { startedOn, finishedOn } = this.form.getRawValue();
    this.saveRequested.emit({
      startedOn: startedOn ? localDateString(startedOn) : null,
      finishedOn: finishedOn ? localDateString(finishedOn) : null,
    });
  }

  remove(): void {
    if (!this.pending() && this.hasDates) this.deleteRequested.emit();
  }

  cancel(): void {
    if (!this.pending()) this.cancelRequested.emit();
  }
}
