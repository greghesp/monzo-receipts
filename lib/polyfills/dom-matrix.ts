// pdfjs-dist references DOMMatrix at module evaluation time for canvas/SVG
// rendering. We only use it for text extraction so a stub is sufficient.
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).DOMMatrix = class DOMMatrix {}
}
