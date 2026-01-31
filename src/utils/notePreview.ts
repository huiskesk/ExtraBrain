import { convertFileSrc } from "@tauri-apps/api/tauri";
import type { Note } from "../types";

const IMAGE_TAG_REGEX = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i;

export const getNoteCoverImage = (note: Note): string | null => {
  if (note.content_type === "pdf") {
    return null;
  }

  const match = note.content.match(IMAGE_TAG_REGEX);
  if (!match) {
    return null;
  }

  const src = match[1]?.trim();
  if (!src) {
    return null;
  }

  if (src.startsWith("/")) {
    return convertFileSrc(src);
  }

  return src;
};
