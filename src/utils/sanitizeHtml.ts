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
      const value = attribute.value.trim().toLowerCase();

      if (name.startsWith("on")) {
        node.removeAttribute(attribute.name);
        return;
      }

      if (URI_ATTRIBUTES.has(name) && value.startsWith("javascript:")) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  return doc.body.innerHTML;
}
