import type {
  CanvasDocument,
  SchemaAnnotation,
  SchemaEdge,
  SchemaField,
  SchemaLayout,
  SchemaTable,
} from "../src/core/index.js";

/**
 * A generated, entirely fictional document at the scale of a large production
 * canvas: about 200 tables and roughly 0.5 MB of graph, layout and annotations.
 * Each pending proposal stored with a full baseline used to add the same again.
 */
export function scaleDocument(tableCount = 200): CanvasDocument {
  const words = [
    "harbor",
    "beacon",
    "ledger",
    "orchard",
    "quarry",
    "meadow",
    "lantern",
    "summit",
    "glacier",
    "canyon",
  ];
  const id = (index: number) =>
    `${words[index % words.length]}_${words[Math.floor(index / words.length) % words.length]}_${index}`;
  const literals = (seed: number, count: number) =>
    `union(${Array.from({ length: count }, (_, i) => `literal("${words[(seed + i) % words.length]}_state_${i}")`).join(", ")})`;
  const tables: SchemaTable[] = [];
  const edges: SchemaEdge[] = [];
  for (let index = 0; index < tableCount; index++) {
    const tableId = id(index);
    const fields: SchemaField[] = [
      {
        name: "_id",
        type: `id<${tableId}>`,
        optional: false,
        primaryKey: true,
        foreignKeyTargets: [],
      },
    ];
    for (let ref = 1; ref <= 3 && index - ref * 7 >= 0; ref++) {
      const target = id(index - ref * 7);
      const name = `${target.split("_")[0]}Ref${ref}`;
      fields.push({
        name,
        type: `id<${target}>`,
        optional: ref > 1,
        foreignKeyTargets: [target],
      });
      edges.push({
        id: `edge-${tableId}.${name}.${target}`,
        source: tableId,
        target,
        field: name,
        optional: ref > 1,
      });
    }
    for (let field = 0; field < 12; field++)
      fields.push({
        name: `${words[(index + field) % words.length]}Field${field}`,
        type:
          field % 3 === 0
            ? literals(index + field, 8)
            : field % 3 === 1
              ? `object({ amount: number, currency: string, note: optional(string), tags: array(string) })`
              : "string",
        optional: field % 4 === 0,
        foreignKeyTargets: [],
      });
    if (index % 5 === 0)
      fields.push({
        name: "source",
        type: "union",
        optional: false,
        foreignKeyTargets: [],
        discriminatedUnion: {
          discriminator: "kind",
          variants: ["manual", "imported", "scheduled"].map((value) => ({
            discriminatorValue: value,
            fields: [
              {
                name: "kind",
                type: `literal("${value}")`,
                optional: false,
                foreignKeyTargets: [],
              },
              {
                name: `${value}Detail`,
                type: literals(index, 5),
                optional: true,
                foreignKeyTargets: [],
              },
            ],
          })),
        },
      });
    tables.push({
      id: tableId,
      label: tableId,
      group: words[index % words.length]!,
      fields,
    });
  }
  const layout: SchemaLayout = {};
  for (const [index, table] of tables.entries()) {
    layout[table.id] = {
      x: (index % 20) * 420,
      y: Math.floor(index / 20) * 900,
      ...(index % 4 === 0
        ? {
            markdown: Array.from(
              { length: 12 },
              (_, line) =>
                `- ${words[(index + line) % words.length]} keeps the fictional ${table.id} record ${line} in step with its neighbours`,
            ).join("\n"),
          }
        : {}),
    };
  }
  const annotations: SchemaAnnotation[] = Array.from(
    { length: 40 },
    (_, index) => ({
      id: `note-${index}`,
      kind: "note",
      x: (index % 10) * 900,
      y: 9500 + Math.floor(index / 10) * 400,
      width: 360,
      height: 240,
      color: "slate",
      markdown: `## Fictional region ${index}\n\n${Array.from({ length: 8 }, (_, line) => `- ${words[(index + line) % words.length]} explains a fictional workflow step ${line}`).join("\n")}`,
    }),
  );
  return { graph: { tables, edges, warnings: [] }, layout, annotations };
}
