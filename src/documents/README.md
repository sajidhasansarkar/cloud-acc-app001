# Document Processing Pipeline

## Phase 5A-3

`extractDocumentContent(documentId)` is the authenticated, company-scoped extraction entry point.

The extraction layer is intentionally separate from classification and accounting normalization. It writes a machine-readable normalized document artifact to the existing private document storage abstraction and stores only extraction metadata in Prisma.

Supported extraction engines:

- PDF text/page extraction with heuristic table detection
- XLS/XLSX workbook/sheet/cell extraction with formula preservation
- CSV delimiter detection, headers, rows, dates and numeric candidates
- Image OCR through the provider-neutral `OCRProvider` abstraction

The default OCR provider is `none`. Local Tesseract can be enabled with `DOCUMENT_OCR_PROVIDER=tesseract-cli` when the Tesseract executable is available. Future managed OCR providers can implement the same interface without changing document-processing orchestration.

No account mapping, debit/credit assignment, journal-entry creation, posting, tax calculation, or AI accounting analysis is performed here.
