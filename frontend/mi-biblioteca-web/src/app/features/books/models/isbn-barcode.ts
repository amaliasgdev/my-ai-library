// Scanner-only validation. CRUD/search/manual lookup retain their existing contracts.
export function isValidBarcodeIsbn13(value: string): boolean {
  if (!/^97[89][0-9]{10}$/.test(value) || value.startsWith('9790')) return false;
  let sum = 0;
  for (let index = 0; index < 13; index++) {
    sum += Number(value[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}
