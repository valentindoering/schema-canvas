import type { CanvasBounds } from "./canvas-document.js";
import type { CanvasContext } from "./canvas-context.js";

function xml(value: unknown): string {
  return Array.from(String(value), (char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) ||
      (char.length === 1 && code >= 0xd800 && code <= 0xdfff) ||
      code >= 0xfffe
      ? "�"
      : char;
  })
    .join("")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
}
function lines(text: string, width: number, count: number) {
  const chars = Math.max(8, Math.floor(width / 7));
  const result: string[] = [];
  for (const line of text.split("\n")) {
    const parts = Array.from(line);
    do {
      result.push(parts.splice(0, chars).join(""));
    } while (parts.length && result.length <= count);
    if (result.length >= count) break;
  }
  if (text.length > result.join("").length && result.length >= count)
    result[count - 1] = `${result[count - 1]?.slice(0, -1)}…`;
  return result.slice(0, count);
}
const colors = {
  slate: "#e2e8f0",
  blue: "#dbeafe",
  emerald: "#d1fae5",
  amber: "#fef3c7",
  teal: "#ccfbf1",
  rose: "#ffe4e6",
  violet: "#ede9fe",
  standard: "#ffffff",
  quiet: "#f1f5f9",
  highlighted: "#dbeafe",
};
/** A bounded, self-contained schematic. No scripts, foreignObject, remote images, or links. */
export function canvasContextSvg(context: CanvasContext): string {
  const bounds: CanvasBounds[] = [
    ...context.tables.flatMap((t) => (t.bounds ? [t.bounds] : [])),
    ...context.annotations.map((a) => a.annotation),
  ];
  const left = bounds.length ? Math.min(...bounds.map((b) => b.x)) - 32 : 0;
  const top = bounds.length ? Math.min(...bounds.map((b) => b.y)) - 60 : 0;
  const width = Math.max(320, ...bounds.map((b) => b.x + b.width - left + 32));
  const height = Math.max(160, ...bounds.map((b) => b.y + b.height - top + 32));
  const scale = Math.min(1, 1600 / width, 1200 / height);
  const elements: string[] = [];
  const text = (x: number, y: number, value: string, attributes = "") =>
    `<text x="${x}" y="${y}" ${attributes}>${xml(value)}</text>`;
  for (const { annotation: a } of context.annotations.filter(
    (a) => a.annotation.kind === "frame",
  ))
    elements.push(
      `<rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" fill="${colors[a.color]}" fill-opacity="0.25" stroke="#64748b" stroke-dasharray="6 4"/>`,
      text(
        a.x + 8,
        a.y + 18,
        `${a.label ?? "Frame"} [annotation:${a.id}]`,
        'font-weight="bold"',
      ),
    );
  const byId = new Map(context.tables.map((t) => [t.table.id, t]));
  for (const edge of context.relationships) {
    const a = byId.get(edge.source)?.bounds;
    const b = byId.get(edge.target)?.bounds;
    if (!a || !b) continue;
    const color = edge.muted ? "#94a3b8" : "#334155";
    const x1 = a.x + a.width / 2;
    const y1 = a.y + a.height / 2;
    const x2 = b.x + b.width / 2;
    const y2 = b.y + b.height / 2;
    elements.push(
      `<path d="M${x1},${y1} L${x2},${y2}" stroke="${color}" stroke-width="2" ${edge.hidden || edge.optional ? 'stroke-dasharray="5 5"' : ""} fill="none" marker-end="url(#arrow)"/>`,
      text(
        (x1 + x2) / 2,
        (y1 + y2) / 2 - 6,
        `${edge.field}${edge.hidden ? " (hidden)" : ""}`,
        'font-size="11" stroke="#fff" stroke-width="3" paint-order="stroke"',
      ),
    );
  }
  context.tables.forEach((t, index) => {
    if (!t.bounds) return;
    const b = t.bounds;
    const clip = `table-${index}`;
    elements.push(
      `<defs><clipPath id="${clip}"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"/></clipPath></defs><g clip-path="url(#${clip})"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="5" fill="${colors[t.appearance as keyof typeof colors] ?? "#fff"}" stroke="#64748b" ${t.geometry === "estimated" ? 'stroke-dasharray="3 2"' : ""}/>`,
      text(b.x + 10, b.y + 21, t.table.label, 'font-weight="bold"'),
      text(
        b.x + 10,
        b.y + 38,
        `[${t.table.id}]`,
        'font-size="10" fill="#475569"',
      ),
    );
    let y = b.y + 58;
    if (t.markdown)
      for (const line of lines(t.markdown, b.width - 20, 3)) {
        elements.push(text(b.x + 10, y, line, 'font-size="11"'));
        y += 16;
      }
    for (const field of t.table.fields) {
      elements.push(
        text(
          b.x + 10,
          y,
          `${field.primaryKey ? "PK " : ""}${field.name}${field.optional ? "?" : ""}: ${field.type}`,
          `font-size="11"${t.highlightedFields.includes(field.name) ? ' font-weight="bold"' : ""}`,
        ),
      );
      y += 22;
    }
    elements.push("</g>");
  });
  context.annotations
    .filter((a) => a.annotation.kind !== "frame")
    .forEach(({ annotation: a }, index) => {
      const clip = `note-${index}`;
      elements.push(
        `<defs><clipPath id="${clip}"><rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}"/></clipPath></defs><g clip-path="url(#${clip})"><rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" rx="5" fill="${colors[a.color]}" stroke="#94a3b8"/>`,
        text(
          a.x + 10,
          a.y + 18,
          `[annotation:${a.id}]`,
          'font-size="10" fill="#475569"',
        ),
      );
      const content =
        a.kind === "image"
          ? `[Image: ${a.label ?? a.asset ?? a.id}]`
          : (a.markdown ?? a.text ?? a.label ?? "");
      lines(
        content,
        a.width - 20,
        Math.max(1, Math.floor((a.height - 35) / 18)),
      ).forEach((line, i) =>
        elements.push(
          text(a.x + 10, a.y + 38 + i * 18, line, 'font-size="12"'),
        ),
      );
      elements.push("</g>");
    });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.ceil(width * scale))}" height="${Math.max(1, Math.ceil(height * scale))}" viewBox="${left} ${top} ${width} ${height}" data-snapshot-id="${xml(context.snapshotId)}" data-revision="${xml(context.revision)}"><title>Canvas context ${xml(context.snapshotId)}</title><desc>Spatial schematic. Dashed table borders indicate estimated bounds. Hidden relationships are included and labeled. Embedded images are represented by labels. Full text is in the matching context.</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#64748b"/></marker></defs><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#f8fafc"/><g font-family="sans-serif" font-size="13" fill="#0f172a">${text(left + 10, top + 22, `Canvas snapshot ${context.snapshotId.slice(0, 12)} · schematic; spatial proximity is not ownership`, 'font-size="12"')}${elements.join("")}</g></svg>`;
}
