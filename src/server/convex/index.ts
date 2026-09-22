import path from "node:path";

import ts from "typescript";

import {
  validateSchemaGraph,
  type SchemaField,
  type SchemaGraph,
} from "../../core/index.js";
import {
  findForeignKeys,
  isIdentifierCall,
  isOptionalValidator,
  propertyName,
  lookupDeclaration,
  objectVariants,
  summarizeDiscriminatedUnion,
  summarizeValidator,
  type ForeignKey,
  type ValidatorDeclaration,
} from "./validators.js";

export type ConvexSourceReader = {
  readFile: (filePath: string) => string | undefined;
  fileExists: (filePath: string) => boolean;
};

export type ParseConvexSchemaOptions = {
  sourceReader?: ConvexSourceReader;
  moduleSources?: Readonly<Record<string, string>>;
  followTransitiveImports?: boolean;
  externalTables?: ReadonlySet<string>;
  tableLabel?: (tableId: string) => string;
  tableGroup?: (tableId: string) => string | undefined;
  arrowsDisabled?: (source: string, field: string, target: string) => boolean;
};

export class ConvexSchemaError extends Error {
  readonly diagnostics: string[];

  constructor(diagnostics: string[]) {
    super(
      [
        "Convex schema graph extraction failed.",
        ...diagnostics.map((diagnostic) => `- ${diagnostic}`),
      ].join("\n"),
    );
    this.name = "ConvexSchemaError";
    this.diagnostics = diagnostics;
  }
}

const diskReader: ConvexSourceReader = {
  readFile: (filePath) => ts.sys.readFile(filePath),
  fileExists: (filePath) => ts.sys.fileExists(filePath),
};

const convexAuthModuleSource = `
  import { defineTable } from "convex/server";
  import { v } from "convex/values";
  export const authTables = {
    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      phone: v.optional(v.string()),
      phoneVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
    }),
    authSessions: defineTable({
      userId: v.id("users"),
      expirationTime: v.number(),
    }),
    authAccounts: defineTable({
      userId: v.id("users"),
      provider: v.string(),
      providerAccountId: v.string(),
      secret: v.optional(v.string()),
      emailVerified: v.optional(v.string()),
      phoneVerified: v.optional(v.string()),
    }),
    authRefreshTokens: defineTable({
      sessionId: v.id("authSessions"),
      expirationTime: v.number(),
      firstUsedTime: v.optional(v.number()),
      parentRefreshTokenId: v.optional(v.id("authRefreshTokens")),
    }),
    authVerificationCodes: defineTable({
      accountId: v.id("authAccounts"),
      provider: v.string(),
      code: v.string(),
      expirationTime: v.number(),
      verifier: v.optional(v.string()),
      emailVerified: v.optional(v.string()),
      phoneVerified: v.optional(v.string()),
    }),
    authVerifiers: defineTable({
      sessionId: v.optional(v.id("authSessions")),
      signature: v.optional(v.string()),
    }),
    authRateLimits: defineTable({
      identifier: v.string(),
      lastAttemptTime: v.number(),
      attemptsLeft: v.number(),
    }),
  };
`;

const builtInModuleSources: Readonly<Record<string, string>> = {
  "@convex-dev/auth/server": convexAuthModuleSource,
};

export function parseConvexSchema(
  entryPoint: string,
  options: ParseConvexSchemaOptions = {},
): SchemaGraph {
  const reader = options.sourceReader ?? diskReader;
  const source = reader.readFile(entryPoint);
  if (source === undefined) throw new Error(`Could not read ${entryPoint}.`);
  const sourceFile = ts.createSourceFile(
    entryPoint,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const schemaObject = findDefineSchemaObject(sourceFile);
  if (!schemaObject) throw new Error("Could not find defineSchema({...}).");
  const rootNoArrowFields = new Set(
    parseDirectiveList(source, "noArrowFields"),
  );
  const rootNoArrowTargetTables = new Set(
    parseDirectiveList(source, "noArrowTargetTables"),
  );
  const declarations = collectDeclarationsRecursively(
    entryPoint,
    sourceFile,
    reader,
    { ...builtInModuleSources, ...options.moduleSources },
    options.followTransitiveImports ?? false,
  );
  const externalTables = options.externalTables ?? new Set<string>();
  const tables = collectTables(schemaObject, sourceFile, declarations);
  const tableIds = new Set(tables.map((table) => table.id));
  const diagnostics: string[] = [];
  const edges: SchemaGraph["edges"] = [];

  for (const table of tables) {
    for (const field of table.fields) {
      if (field.arrowsDisabled) continue;
      for (const target of field.foreignKeyTargets) {
        if (
          target.startsWith("_") ||
          externalTables.has(target) ||
          rootNoArrowTargetTables.has(target) ||
          options.arrowsDisabled?.(table.id, field.name, target) === true
        )
          continue;
        if (!tableIds.has(target)) {
          diagnostics.push(
            `${table.id}.${field.name} references missing table \"${target}\".`,
          );
          continue;
        }
        const occurrences = field.discriminatedUnion?.variants.flatMap(
          (variant) =>
            variant.fields
              .filter(
                (member) =>
                  member.type === `id<${target}>` &&
                  member.foreignKeyTargets.includes(target),
              )
              .map((member) => ({
                field: `${field.name}(${field.discriminatedUnion!.discriminator}=${variant.discriminatorValue}).${member.name}`,
                optional: field.optional || member.optional,
              })),
        );
        for (const occurrence of occurrences?.length
          ? occurrences
          : [{ field: field.name, optional: false }])
          edges.push({
            id: `edge-${table.id}.${occurrence.field}.${target}`,
            source: table.id,
            target,
            field: occurrence.field,
            ...(occurrence.field !== field.name
              ? {
                  metadata: {
                    layoutAliases: [
                      `${field.name}->${target}`,
                      `edge-${table.id}.${field.name}.${target}`,
                      field.name,
                    ],
                  },
                }
              : {}),
            optional:
              occurrence.optional ||
              ((
                field.metadata?.foreignKeyOptionality as
                  Record<string, boolean> | undefined
              )?.[target] ??
                field.optional),
          });
      }
    }
  }
  if (diagnostics.length) throw new ConvexSchemaError(diagnostics);
  return validateSchemaGraph({ tables, edges, warnings: [] });

  function collectTables(
    object: ts.ObjectLiteralExpression,
    file: ts.SourceFile,
    declarations: Map<string, ValidatorDeclaration>,
  ) {
    const result = new Map<string, SchemaGraph["tables"][number]>();
    for (const entry of object.properties.flatMap((property) =>
      tableEntries(property, file, declarations),
    )) {
      const argument = resolveDefineTableArgument(
        entry.initializer,
        declarations,
      );
      if (!argument)
        throw new ConvexSchemaError([`Cannot resolve table ${entry.name}.`]);
      const variants = objectVariants(argument, declarations);
      const fieldVariants = variants.map((object) =>
        parseFields(object, object.getSourceFile(), declarations, entry.name),
      );
      const union = summarizeDiscriminatedUnion(argument, declarations);
      const fields = mergeFields(
        fieldVariants,
        union?.variants.map((variant) => variant.discriminatorValue),
      );
      const group = options.tableGroup?.(entry.name);
      result.set(entry.name, {
        id: entry.name,
        label: options.tableLabel?.(entry.name) ?? entry.name,
        fields,
        ...(group === undefined ? {} : { group }),
      });
    }
    return [...result.values()];
  }

  function parseFields(
    object: ts.ObjectLiteralExpression,
    file: ts.SourceFile,
    declarations: Map<string, ValidatorDeclaration>,
    tableId: string,
  ): SchemaField[] {
    const fields = object.properties.flatMap((property): SchemaField[] => {
      if (
        ts.isSpreadAssignment(property) &&
        ts.isIdentifier(property.expression)
      ) {
        const declaration = lookupDeclaration(
          property.expression,
          declarations,
        );
        return declaration?.object
          ? parseFields(
              declaration.object,
              declaration.sourceFile,
              declarations,
              tableId,
            )
          : (() => {
              throw new ConvexSchemaError([
                `Cannot resolve field spread in ${tableId}.`,
              ]);
            })();
      }
      const assignment = ts.isPropertyAssignment(property)
        ? {
            name: propertyName(property.name, file),
            value: property.initializer,
          }
        : ts.isShorthandPropertyAssignment(property)
          ? {
              name: property.name.text,
              value: property.name,
            }
          : undefined;
      if (!assignment) return [];
      const { name, value } = assignment;
      const discriminatedUnion = summarizeDiscriminatedUnion(
        value,
        declarations,
      );
      const keys = uniqueForeignKeys(
        findForeignKeys(value, false, declarations),
      );
      const noArrowFields = new Set([
        ...rootNoArrowFields,
        ...parseDirectiveList(file.text, "noArrowFields"),
      ]);
      return [
        {
          name,
          type: summarizeValidator(
            value,
            file,
            declarations,
            new Set(),
            ts.isIdentifier(value),
          ),
          optional: isOptionalValidator(value, declarations),
          ...(discriminatedUnion ? { discriminatedUnion } : {}),
          foreignKeyTargets: keys.map((key) => key.targetTable),
          arrowsDisabled:
            noArrowFields.has(name) ||
            (keys.length > 0 &&
              keys.every(
                (key) =>
                  key.targetTable.startsWith("_") ||
                  externalTables.has(key.targetTable) ||
                  rootNoArrowTargetTables.has(key.targetTable) ||
                  options.arrowsDisabled?.(tableId, name, key.targetTable) ===
                    true,
              )),
          metadata: {
            foreignKeyOptionality: Object.fromEntries(
              keys.map((key) => [key.targetTable, key.optional]),
            ),
          },
        },
      ];
    });
    const byName = new Map(fields.map((field) => [field.name, field]));
    return [...byName.values()];
  }
}

function collectDeclarationsRecursively(
  entryPoint: string,
  sourceFile: ts.SourceFile,
  reader: ConvexSourceReader,
  moduleSources: Readonly<Record<string, string>>,
  followTransitiveImports: boolean,
) {
  const declarations = new Map<string, ValidatorDeclaration>();
  const visited = new Set<string>();
  visit(entryPoint, sourceFile, true);
  return declarations;

  function visit(
    filePath: string,
    file: ts.SourceFile,
    followImports: boolean,
  ) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    const local = collectDeclarations(file);
    for (const [name, declaration] of local)
      declarations.set(`${filePath}:${name}`, declaration);
    if (!followImports) return;
    for (const statement of file.statements.filter(ts.isImportDeclaration)) {
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const importedPath = specifier.startsWith(".")
        ? resolveLocalImport(path.dirname(filePath), specifier, reader)
        : `/virtual/node_modules/${specifier}.ts`;
      if (!importedPath) continue;
      const source = specifier.startsWith(".")
        ? reader.readFile(importedPath)
        : moduleSources[specifier];
      if (source === undefined) continue;
      const importedFile = ts.createSourceFile(
        importedPath,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      visit(importedPath, importedFile, followTransitiveImports);
      const imported = collectDeclarations(importedFile);
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const item of bindings.elements) {
          const sourceName = item.propertyName?.text ?? item.name.text;
          const declaration =
            imported.get(sourceName) ??
            declarations.get(`${importedPath}:${sourceName}`);
          if (declaration)
            declarations.set(`${filePath}:${item.name.text}`, declaration);
        }
      }
    }
  }
}

function collectDeclarations(sourceFile: ts.SourceFile) {
  const declarations = new Map<string, ValidatorDeclaration>();
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      declarations.set(node.name.text, {
        sourceFile,
        initializer: node.initializer,
        ...(ts.isObjectLiteralExpression(node.initializer)
          ? { object: node.initializer }
          : {}),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return declarations;
}

function findDefineSchemaObject(sourceFile: ts.SourceFile) {
  let result: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      !result &&
      ts.isCallExpression(node) &&
      isIdentifierCall(node, "defineSchema") &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      result = node.arguments[0];
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function tableEntries(
  property: ts.ObjectLiteralElementLike,
  sourceFile: ts.SourceFile,
  declarations: Map<string, ValidatorDeclaration>,
  seen = new Set<string>(),
): Array<{ name: string; initializer: ts.Expression }> {
  if (ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression)) {
    if (seen.has(property.expression.text)) return [];
    const declaration = lookupDeclaration(property.expression, declarations);
    if (!declaration?.object)
      throw new ConvexSchemaError([
        `Cannot resolve table spread ${property.expression.text}.`,
      ]);
    const next = new Set([...seen, property.expression.text]);
    return declaration.object.properties.flatMap((item) =>
      tableEntries(item, declaration.sourceFile, declarations, next),
    );
  }
  if (ts.isPropertyAssignment(property)) {
    return [
      {
        name: propertyName(property.name, sourceFile),
        initializer: property.initializer,
      },
    ];
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    return [{ name: property.name.text, initializer: property.name }];
  }
  return [];
}

function resolveDefineTableArgument(
  expression: ts.Expression,
  declarations: Map<string, ValidatorDeclaration>,
  seen = new Set<ts.Expression>(),
): ts.Expression | undefined {
  if (seen.has(expression)) throw new Error("Cyclic table declaration.");
  const nextSeen = new Set([...seen, expression]);
  expression = unwrapExpression(expression);
  if (ts.isCallExpression(expression)) {
    if (isIdentifierCall(expression, "defineTable"))
      return expression.arguments[0];
    if (ts.isPropertyAccessExpression(expression.expression)) {
      return resolveDefineTableArgument(
        expression.expression.expression,
        declarations,
        nextSeen,
      );
    }
  }
  if (ts.isIdentifier(expression)) {
    const declaration = lookupDeclaration(expression, declarations);
    return declaration
      ? resolveDefineTableArgument(
          declaration.initializer,
          declarations,
          nextSeen,
        )
      : undefined;
  }
  return undefined;
}

function mergeFields(
  variants: SchemaField[][],
  names?: string[],
): SchemaField[] {
  if (variants.length === 1) return variants[0]!;
  const fields = [
    ...new Set(
      variants.flatMap((variant) => variant.map((field) => field.name)),
    ),
  ];
  return fields.map((name) => {
    const present = variants.flatMap((variant, index) => {
      const field = variant.find((candidate) => candidate.name === name);
      return field ? [{ field, index }] : [];
    });
    const targets = [
      ...new Set(present.flatMap(({ field }) => field.foreignKeyTargets)),
    ];
    return {
      name,
      type: [...new Set(present.map(({ field }) => field.type))].join(" | "),
      optional:
        present.length < variants.length ||
        present.some(({ field }) => field.optional),
      foreignKeyTargets: targets,
      arrowsDisabled: present.every(({ field }) => field.arrowsDisabled),
      ...(names && present.length < variants.length
        ? { variants: present.map(({ index }) => names[index]!) }
        : {}),
      metadata: {
        foreignKeyOptionality: Object.fromEntries(
          targets.map((target) => [
            target,
            present.length < variants.length ||
              present.some(
                ({ field }) =>
                  !field.foreignKeyTargets.includes(target) ||
                  (field.metadata?.foreignKeyOptionality &&
                    (
                      field.metadata.foreignKeyOptionality as Record<
                        string,
                        boolean
                      >
                    )[target]),
              ),
          ]),
        ),
      },
      ...(present.length === 1 && present[0]!.field.discriminatedUnion
        ? { discriminatedUnion: present[0]!.field.discriminatedUnion }
        : {}),
    };
  });
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isPartiallyEmittedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function parseDirectiveList(source: string, directive: string): string[] {
  return [
    ...source.matchAll(new RegExp(`@${directive}\\s*\\(([^)]*)\\)`, "g")),
  ].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((value) => value.trim().replace(/^(['\"])(.*)\\1$/, "$2"))
      .filter(Boolean),
  );
}

function resolveLocalImport(
  directory: string,
  specifier: string,
  reader: ConvexSourceReader,
) {
  const base = path.resolve(directory, specifier);
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(
    reader.fileExists,
  );
}

function uniqueForeignKeys(keys: ForeignKey[]) {
  const result = new Map<string, ForeignKey>();
  for (const key of keys) {
    const current = result.get(key.targetTable);
    result.set(key.targetTable, {
      targetTable: key.targetTable,
      optional: Boolean(current?.optional || key.optional),
    });
  }
  return [...result.values()];
}
