import "server-only"

import mammoth from "mammoth"
import { PDFParse } from "pdf-parse"

import {
  TranscriptionError,
  transcriptionOutputSchema,
  type TranscriptionOutput,
} from "./contracts"

const TEXT = "text/plain"
const HTML = "text/html"
const PDF = "application/pdf"
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export const TEXT_SOURCE_CONTENT_TYPES = new Set([TEXT, HTML, PDF, DOCX])

function normalizeText(value: string): string {
  return value.replaceAll("\u0000", "").replace(/\r\n?/g, "\n").trim()
}

function splitText(value: string): string[] {
  const paragraphs = normalizeText(value)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  return paragraphs.flatMap((paragraph) => {
    if (paragraph.length <= 20_000) return [paragraph]
    const chunks: string[] = []
    for (let offset = 0; offset < paragraph.length; offset += 20_000) {
      const chunk = paragraph.slice(offset, offset + 20_000).trim()
      if (chunk) chunks.push(chunk)
    }
    return chunks
  })
}

export function userSuppliedTranscript(text: string): TranscriptionOutput {
  const segments = splitText(text).map((segment, index) => ({
    index,
    startMs: 0,
    endMs: 0,
    text: segment,
    speakerLabel: null,
    asrConfidence: null,
    diarizationConfidence: null,
    lowConfidence: false,
  }))
  const parsed = transcriptionOutputSchema.safeParse({
    source: "user_supplied",
    language: null,
    segments,
  })
  if (!parsed.success) {
    throw new TranscriptionError(
      "TEXT_SOURCE_INVALID",
      "The supplied text did not contain usable transcript content.",
      false,
      parsed.error,
    )
  }
  return parsed.data
}

function htmlToText(value: string): string {
  const withoutHiddenContent = value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|header|footer|li|tr|h[1-6])\s*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return withoutHiddenContent
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
}

export async function extractTextTranscript(
  contentType: string,
  bytes: Uint8Array,
): Promise<TranscriptionOutput> {
  try {
    if (contentType === TEXT) {
      return userSuppliedTranscript(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    }
    if (contentType === HTML) {
      const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      return userSuppliedTranscript(htmlToText(html))
    }
    if (contentType === DOCX) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
      return userSuppliedTranscript(result.value)
    }
    if (contentType === PDF) {
      const parser = new PDFParse({ data: bytes })
      try {
        const result = await parser.getText()
        return userSuppliedTranscript(result.text)
      } finally {
        await parser.destroy()
      }
    }
    throw new TranscriptionError(
      "TEXT_SOURCE_UNSUPPORTED",
      "This source is not a supported text document.",
      false,
    )
  } catch (error) {
    if (error instanceof TranscriptionError) throw error
    throw new TranscriptionError(
      "TEXT_EXTRACTION_FAILED",
      "Text could not be extracted from the submitted document.",
      false,
      error,
    )
  }
}
