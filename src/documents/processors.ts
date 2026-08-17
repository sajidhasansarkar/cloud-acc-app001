import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";
import type { DocumentFileType } from "@/documents/config";
import type { ProcessingContent } from "@/documents/processing-types";

function parseCsv(input: string): { columns: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t" || ch === ";") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const columns = rows.shift() ?? [];
  return { columns, rows };
}

export async function processPdf(buffer: Buffer): Promise<{ content: ProcessingContent; pageCount: number; requiresOcr: boolean }> {
  const parsed = await pdfParse(buffer);
  const text = parsed.text ?? "";
  const rawPages = text.split(/\f/);
  const pages = Array.from({ length: parsed.numpages }, (_, index) => ({ pageNumber: index + 1, text: (rawPages[index] ?? "").trim() }));
  const usefulText = pages.some((page) => page.text.length > 0);
  return {
    content: { kind: "pdf", pageCount: parsed.numpages, pages },
    pageCount: parsed.numpages,
    requiresOcr: !usefulText,
  };
}

export async function processCsv(buffer: Buffer): Promise<{ content: ProcessingContent; rowCount: number; columnCount: number }> {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const parsed = parseCsv(text);
  const columnCount = parsed.columns.length;
  const rowCount = parsed.rows.length;
  return { content: { kind: "csv", ...parsed, rowCount, columnCount }, rowCount, columnCount };
}

export async function processExcel(buffer: Buffer): Promise<{ content: ProcessingContent; sheetCount: number; rowCount: number; columnCount: number }> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  let rowCount = 0;
  let columnCount = 0;
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    const columns = (matrix[0] ?? []).map((v) => String(v ?? ""));
    const rows = matrix.slice(1);
    const sheetColumnCount = Math.max(columns.length, ...rows.map((r) => r.length), 0);
    rowCount += rows.length;
    columnCount = Math.max(columnCount, sheetColumnCount);
    return { name, columns, rows, rowCount: rows.length, columnCount: sheetColumnCount };
  });
  return { content: { kind: "excel", workbook: workbook.SheetNames.join(", "), sheets }, sheetCount: sheets.length, rowCount, columnCount };
}

export function processImage(): { content: ProcessingContent } {
  return { content: { kind: "image", requiresOcr: true } };
}

export const PROCESSORS: Record<DocumentFileType, (buffer: Buffer) => Promise<{ content: ProcessingContent; pageCount?: number; sheetCount?: number; rowCount?: number; columnCount?: number; requiresOcr?: boolean }>> = {
  PDF: processPdf,
  XLSX: processExcel,
  XLS: processExcel,
  CSV: processCsv,
  JPG: async () => processImage(),
  JPEG: async () => processImage(),
  PNG: async () => processImage(),
  WEBP: async () => processImage(),
};
