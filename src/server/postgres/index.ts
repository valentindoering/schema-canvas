import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  validateSchemaGraph,
  type SchemaEdge,
  type SchemaGraph,
  type SchemaTable,
} from "../../core/index.js";

export type PostgresSource = { path: string; contents: string };
export type ParsePostgresOptions = {
  tableLabel?: (args: { id: string; schema: string; name: string }) => string;
  tableGroup?: (args: {
    id: string;
    schema: string;
    name: string;
  }) => string | undefined;
  includeExternalTargets?: boolean;
};

type Column = {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  comment?: string;
};

type ParsedTable = SchemaTable & {
  metadata: {
    schema: string;
    name: string;
    sourcePath: string;
    columns: Column[];
    comment?: string;
  };
};

export async function readPostgresSchemaDirectory(
  directory: string,
  options?: ParsePostgresOptions,
) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const sources = await Promise.all(
    entries.map(async (entry) => ({
      path: path.join(directory, entry.name),
      contents: await readFile(path.join(directory, entry.name), "utf8"),
    })),
  );
  return parsePostgresSchema(sources, options);
}

export function parsePostgresSchema(
  input: string | readonly PostgresSource[],
  options: ParsePostgresOptions = {},
): SchemaGraph {
  const sources =
    typeof input === "string"
      ? [{ path: "schema.sql", contents: input }]
      : [...input];
  const tables: ParsedTable[] = [];
  const edges: SchemaEdge[] = [];
  const comments = new Map<string, string>();

  for (const source of sources) {
    const stripped = stripSqlComments(source.contents);
    const withoutGrants = stripped.replace(/\b(?:GRANT|REVOKE)\b[^;]*;/gi, "");
    const createCount = [...withoutGrants.matchAll(/\bCREATE\s+TABLE\b/gi)]
      .length;
    const referencesCount = [...withoutGrants.matchAll(/\bREFERENCES\b/gi)]
      .length;
    const parsedTables = parseTables(withoutGrants, source.path, options);
    if (parsedTables.length !== createCount) {
      throw new Error(
        `Parsed ${parsedTables.length} of ${createCount} CREATE TABLE declarations in ${source.path}.`,
      );
    }
    const sourceEdges = parsedTables.flatMap((table) =>
      parseForeignKeys(withoutGrants, table),
    );
    if (sourceEdges.length !== referencesCount) {
      throw new Error(
        `Parsed ${sourceEdges.length} of ${referencesCount} foreign-key references in ${source.path}.`,
      );
    }
    tables.push(...parsedTables);
    edges.push(...sourceEdges);
    collectComments(withoutGrants, comments);
  }

  const duplicates = duplicateValues(tables.map((table) => table.id));
  if (duplicates.length) {
    throw new Error(`Duplicate table declarations: ${duplicates.join(", ")}.`);
  }

  const knownIds = new Set(tables.map((table) => table.id));
  if (options.includeExternalTargets ?? true) {
    const external = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (knownIds.has(edge.target)) continue;
      const columns = external.get(edge.target) ?? new Set<string>();
      for (const field of edge.targetFields ?? []) columns.add(field);
      external.set(edge.target, columns);
    }
    for (const [id, columns] of external) {
      const { schema, name } = splitTableId(id);
      const group = options.tableGroup?.({ id, schema, name });
      tables.push({
        id,
        label: options.tableLabel?.({ id, schema, name }) ?? id,
        fields: [...columns].map((column) => ({
          name: column,
          type: "external",
          optional: false,
          primaryKey: column === "id",
          foreignKeyTargets: [],
        })),
        external: true,
        ...(group === undefined ? {} : { group }),
        metadata: { schema, name, sourcePath: "", columns: [] },
      });
      knownIds.add(id);
    }
  }

  const missingTargets = edges
    .filter((edge) => !knownIds.has(edge.target))
    .map((edge) => `${edge.source}.${edge.field} -> ${edge.target}`);
  if (missingTargets.length) {
    throw new Error(
      `Foreign keys reference unknown tables: ${missingTargets.join(", ")}.`,
    );
  }

  const sortedEdges = edges.sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  for (const table of tables) {
    const tableComment = comments.get(table.id);
    if (tableComment) table.metadata.comment = tableComment;
    table.fields = table.metadata.columns.map((column) => {
      const comment = comments.get(`${table.id}.${column.name}`);
      if (comment) column.comment = comment;
      const targets = sortedEdges
        .filter(
          (edge) =>
            edge.source === table.id &&
            edge.sourceFields?.includes(column.name),
        )
        .map((edge) => edge.target);
      return {
        name: column.name,
        type: column.type,
        optional: column.nullable,
        primaryKey: column.primaryKey,
        foreignKeyTargets: targets,
        metadata: {
          ...(comment ? { comment } : {}),
        },
      };
    });
  }

  return validateSchemaGraph({
    tables: tables.sort((left, right) => left.id.localeCompare(right.id)),
    edges: sortedEdges,
    warnings: [],
  });
}

function parseTables(
  source: string,
  sourcePath: string,
  options: ParsePostgresOptions,
): ParsedTable[] {
  const pattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*))?)\s*\(/gi;
  const result: ParsedTable[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const qualifiedName = match[1];
    if (!qualifiedName) continue;
    const opening = match.index + match[0].lastIndexOf("(");
    const closing = findMatchingParenthesis(source, opening);
    if (closing < 0) throw new Error(`Unclosed CREATE TABLE in ${sourcePath}.`);
    const { schema, name, id } = parseQualifiedName(qualifiedName);
    const body = source.slice(opening + 1, closing);
    const columns = parseColumns(body);
    const tablePrimaryKeys = new Set(
      [...body.matchAll(/PRIMARY\s+KEY\s*\(([^)]*)\)/gi)].flatMap((key) =>
        parseIdentifierList(key[1] ?? ""),
      ),
    );
    for (const column of columns) {
      if (tablePrimaryKeys.has(column.name)) {
        column.primaryKey = true;
        column.nullable = false;
      }
    }
    const group = options.tableGroup?.({ id, schema, name });
    result.push({
      id,
      label: options.tableLabel?.({ id, schema, name }) ?? id,
      fields: [],
      ...(group === undefined ? {} : { group }),
      metadata: { schema, name, sourcePath, columns },
    });
  }
  return result;
}

function parseColumns(body: string): Column[] {
  return splitTopLevel(body).flatMap((definition): Column[] => {
    const value = definition.trim();
    if (
      /^(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b/i.test(
        value,
      )
    ) {
      return [];
    }
    const match =
      /^"((?:[^"]|"")*)"\s+([\s\S]+)$/.exec(value) ??
      /^([a-zA-Z_][\w$]*)\s+([\s\S]+)$/.exec(value);
    if (!match?.[1] || !match[2]) return [];
    const remainder = match[2].trim();
    const primaryKey = /\bPRIMARY\s+KEY\b/i.test(remainder);
    return [
      {
        name: match[1].replaceAll('""', '"'),
        type: columnType(remainder),
        nullable: !primaryKey && !/\bNOT\s+NULL\b/i.test(remainder),
        primaryKey,
      },
    ];
  });
}

function parseForeignKeys(source: string, table: ParsedTable): SchemaEdge[] {
  const edges: SchemaEdge[] = [];
  let sequence = 0;
  const body = tableBodyFor(source, table);
  if (body === undefined) return edges;
  const tablePattern =
    /(?:(?:ADD\s+)?CONSTRAINT\s+(?:"((?:[^"]|"")*)"|([^"\s]+))\s+)?FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+((?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*))?)\s*\(([^)]*)\)(?:\s+ON\s+DELETE\s+(NO\s+ACTION|RESTRICT|CASCADE|SET\s+NULL|SET\s+DEFAULT))?/gi;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(body))) {
    const sourceFields = parseIdentifierList(match[3] ?? "");
    const target = parseQualifiedName(match[4] ?? "").id;
    edges.push(
      makeEdge(
        table,
        sourceFields,
        target,
        parseIdentifierList(match[5] ?? ""),
        match[1]?.replaceAll('""', '"') ?? match[2],
        match[6],
        sequence,
      ),
    );
    sequence += 1;
  }

  for (const statement of source.split(";")) {
    const target =
      /ALTER\s+TABLE\s+(?:ONLY\s+)?([^\s]+(?:\s*\.\s*[^\s]+)?)/i.exec(
        statement,
      )?.[1];
    if (!target || parseQualifiedName(target).id !== table.id) continue;
    tablePattern.lastIndex = 0;
    while ((match = tablePattern.exec(statement))) {
      const sourceFields = parseIdentifierList(match[3] ?? "");
      const referencedTable = parseQualifiedName(match[4] ?? "").id;
      edges.push(
        makeEdge(
          table,
          sourceFields,
          referencedTable,
          parseIdentifierList(match[5] ?? ""),
          match[1]?.replaceAll('""', '"') ?? match[2],
          match[6],
          sequence,
        ),
      );
      sequence += 1;
    }
  }

  const inlinePattern =
    /(?:\bCONSTRAINT\s+(?:"((?:[^"]|"")*)"|([a-zA-Z_][\w$]*))\s+)?\bREFERENCES\s+((?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*))?)\s*\(([^)]*)\)/i;
  for (const definition of splitTopLevel(body)) {
    if (
      /^(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b/i.test(
        definition.trim(),
      )
    ) {
      continue;
    }
    const column =
      /^"((?:[^"]|"")*)"\s+([\s\S]+)$/.exec(definition.trim()) ??
      /^([a-zA-Z_][\w$]*)\s+([\s\S]+)$/.exec(definition.trim());
    if (!column?.[1] || !column[2]) continue;
    const reference = inlinePattern.exec(column[2]);
    if (!reference) continue;
    const after = column[2].slice(reference.index + reference[0].length);
    const onDelete =
      /\bON\s+DELETE\s+(NO\s+ACTION|RESTRICT|CASCADE|SET\s+NULL|SET\s+DEFAULT)\b/i.exec(
        after,
      )?.[1];
    edges.push(
      makeEdge(
        table,
        [column[1].replaceAll('""', '"')],
        parseQualifiedName(reference[3] ?? "").id,
        parseIdentifierList(reference[4] ?? ""),
        reference[1]?.replaceAll('""', '"') ?? reference[2],
        onDelete,
        sequence,
      ),
    );
    sequence += 1;
  }
  return edges;
}

function makeEdge(
  table: ParsedTable,
  sourceFields: string[],
  target: string,
  targetFields: string[],
  constraint: string | undefined,
  onDelete: string | undefined,
  sequence: number,
): SchemaEdge {
  return {
    id: `edge-${table.id}.${sourceFields.join("+")}.${target}.${sequence}`,
    source: table.id,
    target,
    field: sourceFields.join(", "),
    optional: sourceFields.some(
      (name) =>
        table.metadata.columns.find((column) => column.name === name)
          ?.nullable ?? true,
    ),
    sourceFields,
    targetFields,
    metadata: {
      ...(constraint ? { constraint } : {}),
      ...(onDelete
        ? { onDelete: onDelete.replace(/\s+/g, " ").toUpperCase() }
        : {}),
    },
  };
}

function tableBodyFor(source: string, table: ParsedTable) {
  const pattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+(?:\s*\.\s*[^\s(]+)?)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (!match[1] || parseQualifiedName(match[1]).id !== table.id) continue;
    const opening = match.index + match[0].lastIndexOf("(");
    const closing = findMatchingParenthesis(source, opening);
    return closing < 0 ? undefined : source.slice(opening + 1, closing);
  }
  return undefined;
}

function collectComments(source: string, comments: Map<string, string>) {
  const pattern =
    /COMMENT\s+ON\s+(TABLE|COLUMN)\s+([^\s]+(?:\s*\.\s*[^\s]+){0,2})\s+IS\s+'((?:[^']|'')*)'/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (!match[1] || !match[2]) continue;
    const pieces = splitQualifiedName(match[2]);
    const comment = (match[3] ?? "").replaceAll("''", "'");
    if (match[1].toUpperCase() === "TABLE") {
      comments.set(parseQualifiedName(match[2]).id, comment);
    } else if (pieces.length >= 2) {
      const column = pieces.pop();
      comments.set(
        `${parseQualifiedName(pieces.join(".")).id}.${column}`,
        comment,
      );
    }
  }
}

function parseQualifiedName(value: string) {
  const pieces = splitQualifiedName(value);
  const name = pieces.at(-1) ?? "";
  const schema = pieces.length > 1 ? (pieces.at(-2) ?? "public") : "public";
  return { schema, name, id: schema === "public" ? name : `${schema}.${name}` };
}

function splitQualifiedName(value: string) {
  return value
    .split(/\s*\.\s*/)
    .map((part) => part.trim().replace(/^"|"$/g, "").replaceAll('""', '"'))
    .filter(Boolean);
}

function splitTableId(id: string) {
  const pieces = id.split(".");
  return pieces.length > 1
    ? { schema: pieces[0] ?? "public", name: pieces.slice(1).join(".") }
    : { schema: "public", name: id };
}

function parseIdentifierList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim().replace(/^"|"$/g, "").replaceAll('""', '"'))
    .filter(Boolean);
}

function columnType(definition: string) {
  let depth = 0;
  let single = false;
  let double = false;
  const upper = definition.toUpperCase();
  const boundaries = [
    " DEFAULT ",
    " NOT NULL",
    " NULL",
    " PRIMARY KEY",
    " REFERENCES ",
    " CHECK ",
    " UNIQUE",
    " GENERATED ",
    " COLLATE ",
    " CONSTRAINT ",
  ];
  for (let index = 0; index < definition.length; index += 1) {
    const character = definition[index];
    const next = definition[index + 1];
    if (single) {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") single = false;
      continue;
    }
    if (double) {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') double = false;
      continue;
    }
    if (character === "'") single = true;
    else if (character === '"') double = true;
    else if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    if (
      depth === 0 &&
      boundaries.some((boundary) => upper.slice(index).startsWith(boundary))
    ) {
      return normalizeType(definition.slice(0, index));
    }
  }
  return normalizeType(definition);
}

function normalizeType(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/"([^"]+)"/g, "$1");
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let single = false;
  let double = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (single) {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") single = false;
      continue;
    }
    if (double) {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') double = false;
      continue;
    }
    if (character === "'") single = true;
    else if (character === '"') double = true;
    else if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function findMatchingParenthesis(value: string, opening: number) {
  let depth = 0;
  let single = false;
  let double = false;
  for (let index = opening; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (single) {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") single = false;
      continue;
    }
    if (double) {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') double = false;
      continue;
    }
    if (character === "'") single = true;
    else if (character === '"') double = true;
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function stripSqlComments(value: string) {
  let result = "";
  let single = false;
  let double = false;
  let line = false;
  let block = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (line) {
      if (character === "\n") {
        line = false;
        result += character;
      }
      continue;
    }
    if (block) {
      if (character === "*" && next === "/") {
        block = false;
        index += 1;
      }
      continue;
    }
    if (single) {
      result += character;
      if (character === "'" && next === "'") {
        result += next;
        index += 1;
      } else if (character === "'") single = false;
      continue;
    }
    if (double) {
      result += character;
      if (character === '"' && next === '"') {
        result += next;
        index += 1;
      } else if (character === '"') double = false;
      continue;
    }
    if (character === "-" && next === "-") {
      line = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      block = true;
      index += 1;
      continue;
    }
    if (character === "'") single = true;
    if (character === '"') double = true;
    result += character;
  }
  return result;
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
