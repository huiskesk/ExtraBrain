const BLOCKED_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
];

const URI_ATTRIBUTES = new Set(["href", "src", "xlink:href"]);
const ALLOWED_URI_SCHEMES = new Set(["http", "https", "mailto", "tel", "asset", "data"]);
const SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:/i;

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  BLOCKED_TAGS.forEach((tag) => {
    doc.querySelectorAll(tag).forEach((node) => node.remove());
  });

  doc.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      const normalizedValue = value.toLowerCase();

      if (name.startsWith("on")) {
        node.removeAttribute(attribute.name);
        return;
      }

      if (!URI_ATTRIBUTES.has(name)) {
        return;
      }

      if (normalizedValue.startsWith("javascript:")) {
        node.removeAttribute(attribute.name);
        return;
      }

      const schemeMatch = normalizedValue.match(SCHEME_REGEX);
      if (schemeMatch) {
        const scheme = schemeMatch[0].slice(0, -1);
        if (!ALLOWED_URI_SCHEMES.has(scheme)) {
          node.removeAttribute(attribute.name);
        }
      }
    });
  });

  return doc.body.innerHTML;
}
