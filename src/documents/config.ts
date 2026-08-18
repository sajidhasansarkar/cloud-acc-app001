export const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;
export const DOCUMENT_STORAGE_PROVIDERS = ["local", "vercel-blob"] as const;
export type DocumentStorageProvider = (typeof DOCUMENT_STORAGE_PROVIDERS)[number];
function resolveDocumentStorageProvider(): DocumentStorageProvider {
  const raw = process.env.DOCUMENT_STORAGE_PROVIDER;
  if (raw === "local" || raw === "vercel-blob") return raw;
  return process.env.VERCEL ? "vercel-blob" : "local";
}
export const DOCUMENT_STORAGE_PROVIDER: DocumentStorageProvider = resolveDocumentStorageProvider();
export const DOCUMENT_STORAGE_LOCAL_DIR = process.env.DOCUMENT_STORAGE_LOCAL_DIR ?? ".storage/documents";
export const DOCUMENT_FILE_TYPES = ["PDF","XLSX","XLS","CSV","DOC","DOCX","JPG","JPEG","PNG","WEBP","TIFF"] as const;
export type DocumentFileType = (typeof DOCUMENT_FILE_TYPES)[number];
export const DOCUMENT_FILE_TYPE_LABELS: Record<DocumentFileType,string> = {
  PDF:"PDF", XLSX:"Excel (.xlsx)", XLS:"Excel (.xls)", CSV:"CSV", DOC:"Word (.doc)", DOCX:"Word (.docx)",
  JPG:"JPG", JPEG:"JPEG", PNG:"PNG", WEBP:"WEBP", TIFF:"TIFF",
};
export const DOCUMENT_ACCEPT = ".pdf,.xlsx,.xls,.csv,.doc,.docx,.jpg,.jpeg,.png,.webp,.tif,.tiff";
export const DOCUMENT_MIME_TYPES: Record<DocumentFileType,readonly string[]> = {
  PDF:["application/pdf"],
  XLSX:["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  XLS:["application/vnd.ms-excel","application/octet-stream"],
  CSV:["text/csv","application/csv","text/plain","application/vnd.ms-excel"],
  DOC:["application/msword","application/octet-stream"],
  DOCX:["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  JPG:["image/jpeg"], JPEG:["image/jpeg"], PNG:["image/png"], WEBP:["image/webp"],
  TIFF:["image/tiff"],
};
const EXT: Record<string,DocumentFileType> = {
  pdf:"PDF",xlsx:"XLSX",xls:"XLS",csv:"CSV",doc:"DOC",docx:"DOCX",jpg:"JPG",jpeg:"JPEG",png:"PNG",webp:"WEBP",tif:"TIFF",tiff:"TIFF"
};
export function getDocumentFileType(name:string):DocumentFileType|null { return EXT[name.toLowerCase().split(".").pop() ?? ""] ?? null; }
export function formatDocumentSize(bytes:number|bigint){ const n=typeof bytes==="bigint"?Number(bytes):bytes; if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KB`; if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`; return `${(n/1073741824).toFixed(1)} GB`; }
