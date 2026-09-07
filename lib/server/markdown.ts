import "server-only";

import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export function renderProjectMarkdown(source: string): string {
  const rendered = marked.parse(source, { async: false, gfm: true });
  return sanitizeHtml(rendered, {
    allowedTags: [
      "a", "blockquote", "br", "code", "del", "details", "div", "em", "h1", "h2", "h3",
      "h4", "h5", "h6", "hr", "img", "input", "kbd", "li", "ol", "p", "pre", "s", "span",
      "strong", "sub", "summary", "sup", "table", "tbody", "td", "th", "thead", "tr", "ul",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      code: ["class"],
      img: ["src", "alt", "title", "width", "height"],
      input: ["checked", "disabled", "type"],
      ol: ["start"],
      td: ["align"],
      th: ["align"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      a: (_tagName, attributes) => {
        const external = /^https?:\/\//i.test(attributes.href ?? "");
        return {
          tagName: "a",
          attribs: external
            ? { ...attributes, target: "_blank", rel: "noreferrer noopener" }
            : attributes,
        };
      },
    },
  });
}
