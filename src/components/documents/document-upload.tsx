"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { FileUp, UploadCloud, X, XCircle } from "lucide-react";
import { DOCUMENT_ACCEPT, DOCUMENT_FILE_TYPE_LABELS, MAX_DOCUMENT_SIZE, formatDocumentSize, getDocumentFileType } from "@/documents/config";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function DocumentUpload({ companyId, storageProvider }: { companyId: string; storageProvider: "local" | "vercel-blob" }) {
  const input = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function validateClient(file: File) {
    const type = getDocumentFileType(file.name);
    if (!type) return "Unsupported file type.";
    if (file.size <= 0) return "File is empty or invalid.";
    if (file.size > MAX_DOCUMENT_SIZE) return `File is too large. Maximum size is ${formatDocumentSize(MAX_DOCUMENT_SIZE)}.`;
    return null;
  }

  function addFiles(files: FileList | File[]) {
    setError(null);
    const incoming = Array.from(files);
    const invalid = incoming.find(validateClient);
    if (invalid) { setError(`${invalid.name}: ${validateClient(invalid)}`); return; }
    setSelected((current) => {
      const merged = [...current, ...incoming];
      const seen = new Set<string>();
      return merged.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }

  async function uploadToVercelBlob(file: File) {
    const extension = file.name.toLowerCase().split(".").pop();
    if (!extension) throw new Error("File extension is required.");
    const pathname = `documents/${companyId}/${crypto.randomUUID()}.${extension}`;
    abortRef.current = new AbortController();
    const blob = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: `/api/companies/${encodeURIComponent(companyId)}/documents/blob-upload`,
      clientPayload: JSON.stringify({ companyId, originalFileName: file.name, mimeType: file.type || "application/octet-stream" }),
      multipart: true,
      abortSignal: abortRef.current.signal,
      onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
    });
    const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/documents/finalize`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageKey: blob.pathname, originalFileName: file.name, mimeType: file.type || "application/octet-stream" }),
    });
    const data = await response.json() as { ok?: boolean; error?: string; duplicate?: boolean };
    if (!response.ok || !data.ok) { const e = new Error(data.error || "Upload finalization failed."); (e as Error & { duplicate?: boolean }).duplicate = data.duplicate; throw e; }
  }

  function uploadLocally(file: File) {
    return new Promise<void>((resolve, reject) => {
      const form = new FormData(); form.append("file", file);
      const xhr = new XMLHttpRequest(); xhrRef.current = xhr;
      xhr.open("POST", `/api/companies/${encodeURIComponent(companyId)}/documents`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        xhrRef.current = null;
        let data: { ok?: boolean; error?: string; duplicate?: boolean } = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) resolve();
        else { const e = new Error(data.error || "Upload failed. Please try again."); (e as Error & { duplicate?: boolean }).duplicate = data.duplicate; reject(e); }
      };
      xhr.onerror = () => { xhrRef.current = null; reject(new Error("Upload failed. Please check your connection and try again.")); };
      xhr.onabort = () => { xhrRef.current = null; reject(new Error("Upload cancelled.")); };
      xhr.send(form);
    });
  }

  async function uploadAll() {
    if (!selected.length || uploading) return;
    setUploading(true); setError(null); setProgress(0);
    let completed = 0;
    try {
      for (const file of selected) {
        setProgress(0);
        try {
          if (storageProvider === "vercel-blob") await uploadToVercelBlob(file);
          else await uploadLocally(file);
          completed += 1;
        } catch (e) {
          const err = e as Error & { duplicate?: boolean };
          if (err.message === "Upload cancelled.") throw err;
          setError(`${file.name}: ${err.message}${err.duplicate ? " Duplicate files are not registered again." : ""}`);
        }
      }
      if (completed) toast(`${completed} document${completed === 1 ? "" : "s"} uploaded.`, "success");
      if (completed === selected.length) { setSelected([]); if (input.current) input.current.value = ""; window.setTimeout(() => window.location.reload(), 400); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload cancelled.");
    } finally { setUploading(false); }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
    abortRef.current?.abort();
    setUploading(false); setProgress(0);
  }

  return <div className="rounded-lg border border-ink-100 bg-white p-5 shadow-card">
    <div className="flex items-center gap-2"><UploadCloud className="h-5 w-5 text-ledger-600" /><h2 className="font-display text-sm font-semibold text-ink-900">Document Upload Center</h2></div>
    <p className="mt-1 text-sm text-ink-500">Upload accounting documents. Document type will be detected automatically.</p>
    <div
      className={`mt-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-ledger-500 bg-ledger-500/5" : "border-ink-200 bg-surface-subtle"}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
    >
      <UploadCloud className="mx-auto h-8 w-8 text-ink-400" />
      <p className="mt-2 text-sm font-medium text-ink-800">Drag & drop files here</p>
      <p className="mt-1 text-xs text-ink-500">or choose multiple files from your computer</p>
      <div className="mt-3 flex justify-center"><Button type="button" onClick={() => input.current?.click()} disabled={uploading}><FileUp className="h-4 w-4" />Browse Files</Button></div>
      <p className="mt-3 text-xs text-ink-500">PDF, XLS, XLSX, CSV, DOC, DOCX, JPG, JPEG, PNG, WEBP, TIFF · Max {formatDocumentSize(MAX_DOCUMENT_SIZE)} per file</p>
      <input ref={input} type="file" multiple accept={DOCUMENT_ACCEPT} className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); }} disabled={uploading} />
    </div>
    {selected.length ? <div className="mt-4 space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Selected files ({selected.length})</p><Button variant="ghost" size="sm" type="button" onClick={() => setSelected([])} disabled={uploading}>Clear</Button></div>{selected.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-ink-100 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-ink-800">{file.name}</p><p className="text-xs text-ink-500">{DOCUMENT_FILE_TYPE_LABELS[getDocumentFileType(file.name)!]} · {formatDocumentSize(file.size)}</p></div><Button variant="ghost" size="icon" type="button" onClick={() => setSelected((files) => files.filter((_, i) => i !== index))} disabled={uploading} aria-label={`Remove ${file.name}`}><X className="h-4 w-4" /></Button></div>)}</div> : null}
    {uploading ? <div className="mt-4"><div className="flex items-center justify-between text-xs text-ink-500"><span>Uploading…</span><span>{progress}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full bg-ledger-500 transition-[width]" style={{ width: `${progress}%` }} /></div><div className="mt-2"><Button variant="outline" size="sm" type="button" onClick={cancelUpload}>Cancel upload</Button></div></div> : null}
    {!uploading && selected.length ? <div className="mt-4 flex justify-end"><Button variant="primary" type="button" onClick={() => void uploadAll()}><UploadCloud className="h-4 w-4" />Upload {selected.length} file{selected.length === 1 ? "" : "s"}</Button></div> : null}
    {error ? <div className="mt-3 flex items-start gap-2 rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-ink-700" role="alert"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" /><span>{error}</span></div> : null}
  </div>;
}
