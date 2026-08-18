"use client";

import { useState, useTransition } from "react";
import { FileSearch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { extractDocumentContentAction } from "@/actions/documents";

const STATUS_LABELS: Record<string, string> = { PENDING: "Pending", PROCESSING: "Processing", COMPLETED: "Completed", PARTIAL: "Partial", FAILED: "Failed" };

export function DocumentExtractionPanel({ companyId, documentId, processingResult, canManage, preview }: { companyId: string; documentId: string; processingResult: { extractionStatus: string; pageCount: number | null; sheetCount: number | null; tableCount: number | null; rowCount: number | null; columnCount: number | null; textBlockCount: number | null; requiresOcr: boolean; processingError: string | null; warnings: unknown; processedAt: Date | null } | null; canManage: boolean; preview: { pages: Array<{ pageNumber: number; text: string; tables: unknown[] }>; sheets: Array<{ name: string; columns: string[]; rows: unknown[] }>; tables: unknown[]; rows: unknown[]; columns: unknown[]; textBlocks: unknown[] } | null }) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const warnings = processingResult?.warnings && Array.isArray(processingResult.warnings) ? processingResult.warnings.map(String) : [];
  function extract(force: boolean) {
    startTransition(async () => {
      const result = await extractDocumentContentAction(companyId, documentId, force);
      if (!result.ok) toast(result.error, "error");
      else toast(result.status === "PARTIAL" ? "Extraction completed with warnings." : "Document extraction completed.", result.status === "PARTIAL" ? "error" : "success");
    });
  }
  return <div className="rounded-lg border border-ink-100 bg-white p-5 shadow-card">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="font-display text-sm font-semibold text-ink-900">Content extraction</h2><p className="mt-1 text-xs text-ink-500">Read-only structured extraction. No accounting entries or account mapping are created.</p></div>
      {canManage && <Button variant="outline" size="sm" onClick={() => extract(Boolean(processingResult))} disabled={pending}><RefreshCw className="h-3.5 w-3.5" />{pending ? "Extracting…" : processingResult ? "Reprocess" : "Extract content"}</Button>}
    </div>
    {!processingResult ? <div className="mt-4 rounded-md border border-ink-100 bg-surface-subtle p-4"><p className="text-sm font-medium text-ink-800">Content extraction pending.</p>{canManage && <Button className="mt-3" size="sm" onClick={() => extract(false)} disabled={pending}><FileSearch className="h-3.5 w-3.5" />Start extraction</Button>}</div> : <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-ink-500">Extraction status</p><p className="mt-1 text-sm font-medium text-ink-800">{STATUS_LABELS[processingResult.extractionStatus] ?? processingResult.extractionStatus}</p></div>
        <div><p className="text-xs text-ink-500">Pages</p><p className="mt-1 text-sm text-ink-800">{processingResult.pageCount ?? 0}</p></div>
        <div><p className="text-xs text-ink-500">Sheets</p><p className="mt-1 text-sm text-ink-800">{processingResult.sheetCount ?? 0}</p></div>
        <div><p className="text-xs text-ink-500">Tables</p><p className="mt-1 text-sm text-ink-800">{processingResult.tableCount ?? 0}</p></div>
        <div><p className="text-xs text-ink-500">Rows</p><p className="mt-1 text-sm text-ink-800">{processingResult.rowCount ?? 0}</p></div>
        <div><p className="text-xs text-ink-500">Columns</p><p className="mt-1 text-sm text-ink-800">{processingResult.columnCount ?? 0}</p></div>
        <div><p className="text-xs text-ink-500">Text blocks</p><p className="mt-1 text-sm text-ink-800">{processingResult.textBlockCount ?? 0}</p></div>
        <div><p className="text-xs text-ink-500">OCR</p><p className="mt-1 text-sm text-ink-800">{processingResult.requiresOcr ? "Required / unavailable" : "Not required"}</p></div>
      </div>
      {processingResult.processingError && <p className="mt-4 rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-ink-700">{processingResult.processingError}</p>}
      {warnings.length > 0 && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-medium text-ink-700">Extraction warnings</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
      {preview && processingResult.extractionStatus !== "FAILED" && <ExtractionPreview preview={preview} />}
    </>}
  </div>;
}

function ExtractionPreview({ preview }: { preview: { pages: Array<{ pageNumber: number; text: string; tables: unknown[] }>; sheets: Array<{ name: string; columns: string[]; rows: unknown[] }>; tables: unknown[]; rows: unknown[]; columns: unknown[]; textBlocks: unknown[] } }) {
  return <div className="mt-5 space-y-4"><h3 className="font-display text-sm font-semibold text-ink-900">Extraction preview</h3>
    {preview.pages.map((page) => <div key={page.pageNumber} className="rounded-md border border-ink-100 p-3"><p className="text-xs font-medium text-ink-600">Page {page.pageNumber}</p><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-ink-700">{page.text || "No text extracted from this page."}</pre></div>)}
    {preview.sheets.map((sheet) => <div key={sheet.name} className="rounded-md border border-ink-100 p-3"><p className="text-xs font-medium text-ink-600">Sheet: {sheet.name}</p><div className="mt-2 overflow-auto"><table className="min-w-full text-left text-xs"><thead><tr>{sheet.columns.map((c, i) => <th key={`${c}-${i}`} className="border-b px-2 py-1 font-medium text-ink-600">{c || `Column ${i + 1}`}</th>)}</tr></thead><tbody>{sheet.rows.slice(0, 20).map((row: any, ri) => <tr key={ri}>{row.cells?.map((cell: any, ci: number) => <td key={ci} className="border-b px-2 py-1 text-ink-700">{String(cell.value ?? "")}{cell.formula ? ` [=${cell.formula}]` : ""}</td>)}</tr>)}</tbody></table></div></div>)}
    {preview.rows.length > 0 && !preview.sheets.length && <div className="rounded-md border border-ink-100 p-3"><p className="text-xs font-medium text-ink-600">Tabular preview</p><pre className="mt-2 max-h-72 overflow-auto text-xs text-ink-700">{JSON.stringify(preview.rows.slice(0, 30), null, 2)}</pre></div>}
    {preview.textBlocks.length > 0 && !preview.pages.length && !preview.sheets.length && <div className="rounded-md border border-ink-100 p-3"><p className="text-xs font-medium text-ink-600">OCR text preview</p><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-ink-700">{preview.textBlocks.map((block: any) => block.text).join("\n")}</pre></div>}
  </div>;
}
