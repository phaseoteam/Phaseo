export function headersToRecord(headers: Headers | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  if (!headers) {
    return record;
  }
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}
