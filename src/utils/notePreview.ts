import { convertFileSrc } from "@tauri-apps/api/tauri";
import type { Note } from "../types";

const IMAGE_TAG_REGEX = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i;
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*]\((\S+?)(?:\s+["'][^"']*["'])?\)/i;
const LOCAL_ASSET_PREFIX = "asset://localhost/";
const PDF_EMBED_REGEX = /<embed\b[^>]*\btype=["']application\/pdf["'][^>]*>/i;
const PDF_EMBED_SRC_REGEX = /<embed\b[^>]*\bsrc=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>/i;
const PDF_LINK_REGEX = /\[[^\]]+]\(([^)]+\.pdf)(?:\s+["'][^"']*["'])?\)/i;

const normalizeAssetPath = (assetPath: string): string => {
  let normalized = assetPath;
  try {
    normalized = decodeURIComponent(assetPath);
  } catch {
    normalized = assetPath;
  }

  if (!normalized.startsWith("/") && !/^[A-Za-z]:/.test(normalized)) {
    normalized = `/${normalized}`;
  }

  return normalized.replace(/\\/g, "/");
};

export const getNoteCoverImage = (note: Note): string | null => {
  if (note.content_type === "pdf") {
    return null;
  }

  const match = note.content.match(IMAGE_TAG_REGEX) ?? note.content.match(MARKDOWN_IMAGE_REGEX);
  if (!match) {
    return null;
  }

  const src = match[1]?.trim();
  if (!src) {
    return null;
  }

  if (src.startsWith("data:")) {
    return src;
  }

  if (src.startsWith("http")) {
    return src;
  }

  if (src.startsWith(LOCAL_ASSET_PREFIX)) {
    const assetPath = normalizeAssetPath(src.slice(LOCAL_ASSET_PREFIX.length));
    return convertFileSrc(assetPath);
  }

  if (src.startsWith("/")) {
    return convertFileSrc(src);
  }

  return src;
};

export const noteHasPdfAttachment = (note: Note): boolean => {
  if (note.content_type === "pdf") {
    return true;
  }
  return (
    PDF_EMBED_REGEX.test(note.content) ||
    PDF_EMBED_SRC_REGEX.test(note.content) ||
    PDF_LINK_REGEX.test(note.content)
  );
};
