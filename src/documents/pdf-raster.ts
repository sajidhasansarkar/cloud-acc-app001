import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Renders PDF pages to PNG images so scanned/image-only pages can be OCR'd.
 * This was entirely missing before: extractPdf() would detect empty text and
 * set requiresOcr=true, but nothing ever actually rasterized the page and ran
 * OCR on it — normalization would then just silently see no text.
 *
 * Uses the `pdftoppm` CLI (poppler-utils), matching the existing project
 * convention (see TesseractCliOCRProvider) of spawning an optional external
 * binary rather than adding a new npm dependency that needs native bindings
 * (e.g. `canvas`). If the binary is not installed, rasterization is skipped
 * and the existing "PDF may be image-only and require OCR" warning is kept —
 * i.e. this degrades to the previous (safe, non-silent) behavior rather than
 * failing the whole extraction.
 */
export async function isPdfRasterizerAvailable() {
  return (process.env.DOCUMENT_PDF_RASTERIZER || "none").toLowerCase() === "poppler";
}

export async function rasterizePdfPage(buffer: Buffer, pageNumber: number): Promise<Buffer | null> {
  const command = process.env.DOCUMENT_PDFTOPPM_COMMAND || "pdftoppm";
  const dir = await mkdtemp(path.join(os.tmpdir(), "accounting-pdf-raster-"));
  try {
    const input = path.join(dir, "input.pdf");
    await writeFile(input, buffer, { flag: "wx" });
    const outputBase = path.join(dir, "page");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, ["-png", "-r", "200", "-f", String(pageNumber), "-l", String(pageNumber), input, outputBase], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr || `pdftoppm exited with code ${code}`))));
    });
    const files = await readdir(dir);
    const rendered = files.find((f) => f.startsWith("page") && f.endsWith(".png"));
    if (!rendered) return null;
    return await readFile(path.join(dir, rendered));
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
