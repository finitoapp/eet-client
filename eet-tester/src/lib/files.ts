/** Reads a browser `File` (from a file `<input>`) into a `Uint8Array`. */
export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Triggers a browser download of `data` under `filename`, without any server round-trip. */
export function downloadBytes(data: Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked on a delay, not synchronously after `click()` — some browsers start the download
  // asynchronously and an immediate revoke can race it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
