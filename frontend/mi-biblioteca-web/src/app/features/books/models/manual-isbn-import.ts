import { isValidBarcodeIsbn13 } from './isbn-barcode';

// Only for the catalog's manual import dialog; never normalizes scanner/CRUD inputs.
export function normalizeManualIsbnImport(value: string): string | null {
  if (value.length === 0 || /[^0-9 -]/.test(value)) return null;
  const isbn = value.replace(/[ -]/g, '');
  return isValidBarcodeIsbn13(isbn) ? isbn : null;
}
