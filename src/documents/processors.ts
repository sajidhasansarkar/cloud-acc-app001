import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";
import type { DocumentFileType } from "@/documents/config";
import type { ExtractedCell, ExtractedTable, NormalizedDocumentContent } from "@/documents/processing-types";
import { getOCRProvider } from "@/documents/ocr";

const MAX_CELLS = 250_000;
const MAX_PREVIEW_ROWS = 10_000;

function clean(value: unknown) { return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim(); }
function amountLike(value: string) { return /^[-+]?\(?\s*[$€£¥₹৳]?\s*\d[\d,]*(?:\.\d+)?\s*\)?$/.test(value); }
function dateLike(value: string) { return /^(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})$/.test(value); }

function parseDelimited(input: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 12).filter(Boolean);
  const candidates = [",", "\t", ";", "|"];
  return candidates.map((delimiter) => ({ delimiter, score: sample.reduce((sum, line) => sum + line.split(delimiter).length - 1, 0) })).sort((a, b) => b.score - a.score)[0]?.delimiter ?? ",";
}

function tableFromRows(rows: string[][], source: ExtractedTable["source"], id: string): ExtractedTable | null {
  if (rows.length < 2) return null;
  const width = Math.max(...rows.map((r) => r.length));
  if (width < 2) return null;
  return { id, headers: rows[0].map(clean), rows: rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => clean(r[i]))), source };
}

function lineCandidates(lines: string[]) {
  const dates: string[] = []; const amounts: string[] = [];
  for (const line of lines) {
    for (const token of line.split(/\s+/)) {
      const value = token.replace(/[,:;]+$/, "");
      if (dateLike(value)) dates.push(value);
      if (amountLike(value)) amounts.push(value);
    }
  }
  return { dates: [...new Set(dates)].slice(0, 500), amounts: [...new Set(amounts)].slice(0, 500) };
}

function base(documentId: string): NormalizedDocumentContent {
  return { version: "5A3", documentId, pages: [], sheets: [], tables: [], rows: [], columns: [], textBlocks: [], metadata: {}, warnings: [] };
}

export async function extractPdf(documentId: string, buffer: Buffer) {
  const parsed = await pdfParse(buffer);
  const content = base(documentId);
  const rawPages = (parsed.text ?? "").split(/\f/);
  const pages = Array.from({ length: parsed.numpages }, (_, i) => {
    const text = (rawPages[i] ?? "").trim();
    const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
    const tableRows = lines.map((line) => line.split(/\t| {2,}/).map(clean)).filter((r) => r.length >= 2);
    const table = tableFromRows(tableRows, { pageNumber: i + 1 }, `pdf-page-${i + 1}-table`);
    const candidates = lineCandidates(lines);
    const page = { pageNumber: i + 1, text, textBlocks: lines.map((t, index) => ({ text: t, lineOrder: index + 1 })), tables: table ? [table] : [], dateCandidates: candidates.dates, amountCandidates: candidates.amounts };
    if (table) content.tables.push(table);
    return page;
  });
  content.pages = pages;
  content.textBlocks = pages.flatMap((p) => p.textBlocks.map((b) => ({ source: `page:${p.pageNumber}`, ...b })));
  content.metadata = { pageCount: parsed.numpages, pdfInfo: parsed.info ?? null };
  const emptyPages = pages.filter((page) => !page.text).length;
  if (!content.textBlocks.length) content.warnings.push("No text could be extracted from this PDF. It may be image-only and require OCR.");
  else if (emptyPages > 0) content.warnings.push(`${emptyPages} PDF page${emptyPages === 1 ? "" : "s"} contained no extractable text.`);
  return { content, pageCount: parsed.numpages, tableCount: content.tables.length, rowCount: content.tables.reduce((n, t) => n + t.rows.length, 0), columnCount: content.tables.reduce((n, t) => Math.max(n, t.headers.length), 0), textBlockCount: content.textBlocks.length, requiresOcr: !content.textBlocks.length, partial: emptyPages > 0 };
}

export async function extractCsv(documentId: string, buffer: Buffer) {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer).replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const matrix = parseDelimited(text, delimiter);
  const content = base(documentId);
  const headers = matrix[0] ?? [];
  const rows = matrix.slice(1);
  const table = tableFromRows(matrix, { rowStart: 1, rowEnd: matrix.length }, "csv-table");
  if (table) content.tables.push(table);
  content.rows = rows.slice(0, MAX_PREVIEW_ROWS).map((cells, i) => ({ source: "csv", rowNumber: i + 2, cells }));
  content.columns = headers.map((name, index) => ({ source: "csv", index, name: clean(name) }));
  content.textBlocks = rows.slice(0, 1000).map((r, i) => ({ source: `row:${i + 2}`, text: r.map(clean).join(" | "), lineOrder: i + 2 }));
  content.metadata = { delimiter, encoding: "utf-8", headerDetected: headers.length > 0 };
  if (rows.length > MAX_PREVIEW_ROWS) content.warnings.push(`CSV contains ${rows.length.toLocaleString()} rows; preview is limited to ${MAX_PREVIEW_ROWS.toLocaleString()} rows.`);
  const numericValues = rows.flat().map(clean).filter(amountLike).slice(0, 500);
  content.metadata.numericCandidates = numericValues;
  content.metadata.dateCandidates = rows.flat().map(clean).filter(dateLike).slice(0, 500);
  return { content, rowCount: rows.length, columnCount: headers.length, tableCount: table ? 1 : 0, textBlockCount: content.textBlocks.length, requiresOcr: false };
}

export async function extractExcel(documentId: string, buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: true, cellNF: true, cellStyles: false });
  const content = base(documentId);
  let cellCount = 0; let rowCount = 0; let columnCount = 0;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : { s: { r: 0, c: 0 }, e: { r: -1, c: -1 } };
    const rows: Array<{ rowNumber: number; cells: ExtractedCell[] }> = [];
    const matrix: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const cells: ExtractedCell[] = []; const rowValues: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        cellCount += 1;
        if (cellCount > MAX_CELLS) { content.warnings.push(`Workbook exceeds the ${MAX_CELLS.toLocaleString()} extracted-cell safety limit.`); break; }
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[address] as { v?: unknown; f?: string; t?: string } | undefined;
        const raw = cell?.v;
        const value = raw instanceof Date ? raw.toISOString() : typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : raw == null ? null : String(raw);
        cells.push({ address, rowIndex: r + 1, columnIndex: c + 1, value, formula: cell?.f, type: cell?.t });
        rowValues.push(clean(value));
      }
      rows.push({ rowNumber: r + 1, cells });
      matrix.push(rowValues);
      rowCount += 1;
      if (cellCount > MAX_CELLS) break;
    }
    const headers = matrix[0] ?? [];
    const table = tableFromRows(matrix, { sheetName: name, rowStart: 1, rowEnd: rows.length }, `sheet-${name}-table`);
    if (table) content.tables.push(table);
    const sheetData = { name, rows, columns: headers, tables: table ? [table] : [] };
    content.sheets.push(sheetData);
    headers.forEach((header, index) => content.columns.push({ source: `sheet:${name}`, index, name: clean(header) }));
    rows.slice(1, MAX_PREVIEW_ROWS).forEach((row) => content.rows.push({ source: `sheet:${name}`, rowNumber: row.rowNumber, cells: row.cells.map((c) => clean(c.value)) }));
    rows.slice(0, 1000).forEach((row) => content.textBlocks.push({ source: `sheet:${name}:row:${row.rowNumber}`, text: row.cells.map((c) => clean(c.value)).join(" | "), lineOrder: row.rowNumber }));
    columnCount = Math.max(columnCount, range.e.c - range.s.c + 1);
    if (cellCount > MAX_CELLS) break;
  }
  content.metadata = { workbook: workbook.SheetNames, sheetCount: workbook.SheetNames.length, extractedCellCount: cellCount, formulasPreserved: true };
  return { content, sheetCount: content.sheets.length, rowCount, columnCount, tableCount: content.tables.length, textBlockCount: content.textBlocks.length, requiresOcr: false };
}

export async function extractImage(documentId: string, buffer: Buffer, mimeType: string) {
  const content = base(documentId);
  const provider = getOCRProvider();
  try {
    const result = await provider.extract(buffer, mimeType);
    content.textBlocks = result.lines.map((line, i) => ({ source: "image", text: line.text, lineOrder: i + 1 }));
    content.metadata = { ocrProvider: provider.name, lineCount: result.lines.length };
    content.warnings.push(...result.warnings);
    if (!result.text.trim()) content.warnings.push("OCR completed but no readable text was detected.");
    return { content, textBlockCount: content.textBlocks.length, tableCount: 0, rowCount: 0, columnCount: 0, requiresOcr: false, partial: content.warnings.length > 0 };
  } catch {
    content.metadata = { ocrProvider: provider.name };
    content.warnings.push("OCR could not be completed. Configure an OCR provider before processing this image.");
    return { content, textBlockCount: 0, tableCount: 0, rowCount: 0, columnCount: 0, requiresOcr: true, partial: true };
  }
}

export const EXTRACTORS: Partial<Record<DocumentFileType, (documentId: string, buffer: Buffer, mimeType: string) => Promise<any>>> = {
  PDF: (id, b) => extractPdf(id, b), XLSX: (id, b) => extractExcel(id, b), XLS: (id, b) => extractExcel(id, b), CSV: (id, b) => extractCsv(id, b),
  JPG: (id, b, m) => extractImage(id, b, m), JPEG: (id, b, m) => extractImage(id, b, m), PNG: (id, b, m) => extractImage(id, b, m), WEBP: (id, b, m) => extractImage(id, b, m), TIFF: (id, b, m) => extractImage(id, b, m),
};
