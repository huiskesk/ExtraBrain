export const MAX_TAG_LENGTH = 40;

export const normalizeTag = (tag: string): string | null => {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.length > MAX_TAG_LENGTH) {
    return null;
  }
  return normalized;
};

export const normalizeTags = (tags: string[] = []): string[] => {
  const seen = new Set<string>();
  const normalizedTags: string[] = [];

  tags.forEach((tag) => {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    normalizedTags.push(normalized);
  });

  return normalizedTags;
};
