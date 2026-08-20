import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";

export type OCRBoundingBox = { x: number; y: number; width: number; height: number };
export type OCRLine = { text: string; boundingBox?: OCRBoundingBox; confidence?: number };
export type OCRResult = { text: string; lines: OCRLine[]; warnings: string[] };

export interface OCRProvider {
  name: string;
  extract(buffer: Buffer, mimeType: string): Promise<OCRResult>;
}

/** Provider boundary for future managed OCR services. */
export class UnavailableOCRProvider implements OCRProvider {
  name = "unconfigured";
  async extract(): Promise<OCRResult> {
    throw new Error("OCR provider is not configured.");
  }
}

/** Optional local development provider. It is only used when explicitly enabled. */
export class TesseractCliOCRProvider implements OCRProvider {
  name = "tesseract-cli";
  constructor(private readonly command = process.env.DOCUMENT_OCR_TESSERACT_COMMAND || "tesseract") {}

  async extract(buffer: Buffer, mimeType: string): Promise<OCRResult> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "accounting-ocr-"));
    const input = path.join(dir, `input${extensionForMime(mimeType)}`);
    const outputBase = path.join(dir, "output");
    try {
      await writeFile(input, buffer, { flag: "wx" });
      await run(this.command, [input, outputBase, "--psm", "6"]);
      const fs = await import("node:fs/promises");
      const text = await fs.readFile(`${outputBase}.txt`, "utf8");
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({ text: line }));
      return { text, lines, warnings: [] };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/**
 * OpenAI-vision-backed OCR provider. Since this project's configured AI
 * provider is OpenAI (see src/ai/provider.ts, src/documents/ai-extraction.ts),
 * this is the recommended OCR path — it doesn't depend on a local `tesseract`
 * binary being installed on the server at all, unlike TesseractCliOCRProvider.
 * Enable with DOCUMENT_OCR_PROVIDER=openai (requires OPENAI_API_KEY).
 */
export class OpenAIVisionOCRProvider implements OCRProvider {
  name = "openai-vision";
  private readonly model = process.env.DOCUMENT_OCR_OPENAI_MODEL || "gpt-4o-mini";

  async extract(buffer: Buffer, mimeType: string): Promise<OCRResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    const client = new OpenAI({ apiKey });
    const base64 = buffer.toString("base64");
    const completion = await client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe ALL visible text from this image exactly as it appears, preserving line breaks and left-to-right reading order. Do not summarize, translate, or omit anything. If the image contains no readable text, respond with exactly: NO_TEXT_FOUND." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text || text === "NO_TEXT_FOUND") return { text: "", lines: [], warnings: [] };
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({ text: line }));
    return { text, lines, warnings: [] };
  }
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/tiff") return ".tiff";
  return ".jpg";
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `OCR process exited with code ${code}`)));
  });
}

export function getOCRProvider(): OCRProvider {
  const provider = (process.env.DOCUMENT_OCR_PROVIDER || "none").toLowerCase();
  if (provider === "tesseract-cli") return new TesseractCliOCRProvider();
  if (provider === "openai") return new OpenAIVisionOCRProvider();
  return new UnavailableOCRProvider();
}
