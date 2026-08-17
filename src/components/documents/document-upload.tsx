"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { FileUp, UploadCloud, XCircle } from "lucide-react";
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_SIZE, formatDocumentSize } from "@/documents/config";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function DocumentUpload({
  companyId,
  storageProvider,
}: {
  companyId: string;
  storageProvider: "local" | "vercel-blob";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function uploadToVercelBlob(file: File) {
    const extension = file.name.toLowerCase().split(".").pop();
    if (!extension) throw new Error("File extension is required.");

    const pathname = `documents/${companyId}/${crypto.randomUUID()}.${extension}`;
    const blob = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: `/api/companies/${encodeURIComponent(companyId)}/documents/blob-upload`,
      clientPayload: JSON.stringify({
        companyId,
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
      }),
      multipart: true,
      onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
    });

    const response = await fetch(
      `/api/companies/${encodeURIComponent(companyId)}/documents/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey: blob.pathname,
          originalFileName: file.name,
          mimeType: file.type || "application/octet-stream",
        }),
      }
    );

    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      processingStatus?: string;
    };

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Upload finalization failed. Please try again.");
    }

    return data;
  }

  function uploadLocally(file: File) {
    return new Promise<{ processingStatus?: string }>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/companies/${encodeURIComponent(companyId)}/documents`);
      setUploading(true);
      setProgress(0);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data: { ok?: boolean; error?: string; processingStatus?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // Keep the generic error below.
        }
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) resolve(data);
        else reject(new Error(data.error || "Upload failed. Please try again."));
      };
      xhr.onerror = () => reject(new Error("Upload failed. Please check your connection and try again."));
      xhr.send(form);
    });
  }

  async function uploadFile(file: File) {
    setError(null);
    if (file.size <= 0) return setError("File is empty or invalid.");
    if (file.size > MAX_DOCUMENT_SIZE) {
      return setError(`File is too large. Maximum size is ${formatDocumentSize(MAX_DOCUMENT_SIZE)}.`);
    }

    setUploading(true);
    setProgress(0);

    try {
      const data =
        storageProvider === "vercel-blob"
          ? await uploadToVercelBlob(file)
          : await uploadLocally(file);

      setProgress(100);
      if (input.current) input.current.value = "";

      if (data.processingStatus === "FAILED") {
        const msg = "Document uploaded, but processing failed. You can retry processing from the document list.";
        setError(msg);
        toast(msg, "error");
        window.setTimeout(() => window.location.reload(), 500);
      } else {
        toast("Document uploaded and processed successfully.", "success");
        window.location.reload();
      }
    } catch (uploadError) {
      const msg = uploadError instanceof Error ? uploadError.message : "Upload failed. Please try again.";
      setError(msg);
      toast(msg, "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-ledger-600" />
            <h2 className="font-display text-sm font-semibold text-ink-900">Upload Document</h2>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            PDF, Excel, CSV, JPG, JPEG, PNG, or WEBP · Max {formatDocumentSize(MAX_DOCUMENT_SIZE)}
          </p>
        </div>
        <Button type="button" onClick={() => input.current?.click()} disabled={uploading}>
          <FileUp className="h-4 w-4" />
          {uploading ? `Uploading ${progress}%` : "Choose file"}
        </Button>
        <input
          ref={input}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
          }}
          disabled={uploading}
        />
      </div>
      {uploading ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-ledger-500 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-500">Uploading…</p>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-ink-700" role="alert">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
