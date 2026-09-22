import ts from "typescript";

import type { SchemaDiscriminatedUnion } from "../../core/types.js";

export type ForeignKey = { targetTable: string; optional: boolean };
export type ValidatorDeclaration = {
  sourceFile: ts.SourceFile;
  initializer: ts.Expression;
  object?: ts.ObjectLiteralExpression;
};

export function summarizeValidator(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
  resolving: ReadonlySet<string> = new Set<string>(),
  expandIdentifiers = false,
): string {
  expression = unwrapExpression(expression);
  if (ts.isCallExpression(expression)) {
    for (const primitive of [
      "string",
      "number",
      "boolean",
      "null",
      "any",
      "bytes",
      "int64",
      "float64",
    ]) {
      if (isValidatorCall(expression, primitive)) return primitive;
    }
    if (isValidatorCall(expression, "id")) {
      return `id<${stringArgument(expression) ?? "unknown"}>`;
    }
    if (isValidatorCall(expression, "literal")) {
      const value = expression.arguments[0];
      return value ? value.getText(sourceFile) : "literal";
    }
    if (isValidatorCall(expression, "optional")) {
      const value = expression.arguments[0];
      return value
        ? summarizeValidator(
            value,
            sourceFile,
            declarations,
            resolving,
            expandIdentifiers,
          )
        : "optional";
    }
    if (isValidatorCall(expression, "array")) {
      const value = expression.arguments[0];
      return value
        ? `array<${summarizeValidator(value, sourceFile, declarations, resolving, expandIdentifiers)}>`
        : "array";
    }
    if (isValidatorCall(expression, "union")) {
      const values = expression.arguments.map((argument) =>
        summarizeValidator(
          argument,
          sourceFile,
          declarations,
          resolving,
          expandIdentifiers,
        ),
      );
      return values.every((value) => value === "object")
        ? `union<${values.length} object variants>`
        : values.join(" | ");
    }
    if (isValidatorCall(expression, "object")) {
      if (!expandIdentifiers) return "object";
      const object = expression.arguments[0];
      if (!object || !ts.isObjectLiteralExpression(object)) return "object";
      return `object{${summarizeObject(object, sourceFile, declarations, resolving).join(", ")}}`;
    }
    if (isValidatorCall(expression, "record")) {
      const [key, value] = expression.arguments;
      return key && value
        ? `record<${summarizeValidator(key, sourceFile, declarations, resolving, expandIdentifiers)}, ${summarizeValidator(value, sourceFile, declarations, resolving, expandIdentifiers)}>`
        : "record";
    }
  }
  if (expandIdentifiers && ts.isIdentifier(expression)) {
    const declaration = lookupDeclaration(expression, declarations);
    if (declaration && !resolving.has(expression.text)) {
      return summarizeValidator(
        declaration.initializer,
        declaration.sourceFile,
        declarations,
        new Set([...resolving, expression.text]),
        true,
      );
    }
  }
  return expression.getText(sourceFile);
}

export function isOptionalValidator(
  expression: ts.Expression,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
  resolving = new Set<string>(),
): boolean {
  expression = unwrapExpression(expression);
  if (
    ts.isCallExpression(expression) &&
    isValidatorCall(expression, "optional")
  ) {
    return true;
  }
  if (ts.isIdentifier(expression)) {
    const declaration = lookupDeclaration(expression, declarations);
    if (declaration && !resolving.has(expression.text)) {
      return isOptionalValidator(
        declaration.initializer,
        declarations,
        new Set([...resolving, expression.text]),
      );
    }
  }
  return false;
}

export function findForeignKeys(
  node: ts.Node,
  underOptional: boolean,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
  resolving = new Set<string>(),
): ForeignKey[] {
  if (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isPartiallyEmittedExpression(node)
  ) {
    return findForeignKeys(
      node.expression,
      underOptional,
      declarations,
      resolving,
    );
  }
  if (ts.isCallExpression(node)) {
    if (isValidatorCall(node, "id")) {
      const targetTable = stringArgument(node);
      return targetTable ? [{ targetTable, optional: underOptional }] : [];
    }
    if (isValidatorCall(node, "union")) {
      return mergeUnionForeignKeys(
        node.arguments.map((argument) =>
          findForeignKeys(argument, underOptional, declarations, resolving),
        ),
      );
    }
    const optional = underOptional || isValidatorCall(node, "optional");
    return node.arguments.flatMap((argument) =>
      findForeignKeys(argument, optional, declarations, resolving),
    );
  }
  if (ts.isIdentifier(node)) {
    const declaration = lookupDeclaration(node, declarations);
    if (declaration && !resolving.has(node.text)) {
      return findForeignKeys(
        declaration.initializer,
        underOptional,
        declarations,
        new Set([...resolving, node.text]),
      );
    }
  }
  if (ts.isObjectLiteralExpression(node)) {
    return [
      ...collectObjectValidators(node, declarations, resolving).values(),
    ].flatMap((validator) =>
      findForeignKeys(validator, underOptional, declarations, resolving),
    );
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) =>
      findForeignKeys(element, underOptional, declarations, resolving),
    );
  }
  return [];
}

export function isIdentifierCall(expression: ts.CallExpression, name: string) {
  return (
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === name
  );
}

export function isValidatorCall(
  expression: ts.CallExpression,
  methodName: string,
) {
  return (
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === "v" &&
    expression.expression.name.text === methodName
  );
}

function stringArgument(expression: ts.CallExpression) {
  const value = expression.arguments[0];
  return value && ts.isStringLiteral(value) ? value.text : undefined;
}

function mergeUnionForeignKeys(variants: ForeignKey[][]): ForeignKey[] {
  const found = new Map<
    string,
    { first: number; variants: number; optional: boolean }
  >();
  variants.forEach((foreignKeys, variantIndex) => {
    const local = new Map<string, boolean>();
    for (const key of foreignKeys) {
      local.set(
        key.targetTable,
        (local.get(key.targetTable) ?? false) || key.optional,
      );
    }
    for (const [targetTable, optional] of local) {
      const current = found.get(targetTable);
      found.set(targetTable, {
        first: current?.first ?? variantIndex,
        variants: (current?.variants ?? 0) + 1,
        optional: (current?.optional ?? false) || optional,
      });
    }
  });
  return [...found.entries()]
    .sort((left, right) => left[1].first - right[1].first)
    .map(([targetTable, state]) => ({
      targetTable,
      optional: state.optional || state.variants < variants.length,
    }));
}

function summarizeObject(
  object: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
  resolving: ReadonlySet<string>,
): string[] {
  return [...collectObjectValidators(object, declarations, resolving)].map(
    ([name, initializer]) => {
      const optional = isOptionalValidator(initializer, declarations);
      return `${name}${optional ? "?" : ""}: ${summarizeValidator(initializer, sourceFile, declarations, resolving, true)}`;
    },
  );
}

export function collectObjectValidators(
  object: ts.ObjectLiteralExpression,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
  resolving: ReadonlySet<string>,
  validators = new Map<string, ts.Expression>(),
) {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property)) {
      validators.set(
        propertyName(property.name, property.getSourceFile()),
        property.initializer,
      );
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      validators.set(property.name.text, property.name);
      continue;
    }
    if (!ts.isSpreadAssignment(property)) continue;
    const spread = resolveObjectLiteral(
      property.expression,
      declarations,
      resolving,
    );
    if (spread)
      collectObjectValidators(
        spread.object,
        declarations,
        spread.resolving,
        validators,
      );
    else
      throw new Error(
        `Cannot resolve nested field spread: ${property.expression.getText()}.`,
      );
  }
  return validators;
}

function resolveObjectLiteral(
  expression: ts.Expression,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
  resolving: ReadonlySet<string>,
):
  | { object: ts.ObjectLiteralExpression; resolving: ReadonlySet<string> }
  | undefined {
  expression = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(expression))
    return { object: expression, resolving };
  if (!ts.isIdentifier(expression) || resolving.has(expression.text))
    return undefined;
  const declaration = lookupDeclaration(expression, declarations);
  return declaration
    ? resolveObjectLiteral(
        declaration.initializer,
        declarations,
        new Set([...resolving, expression.text]),
      )
    : undefined;
}

export function unwrapExpression(expression: ts.Expression): ts.Expression {
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

export function propertyName(name: ts.PropertyName, sourceFile: ts.SourceFile) {
  return ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
    ? name.text
    : name.getText(sourceFile);
}

export function resolveValidator(
  expression: ts.Expression,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
  seen = new Set<string>(),
): ts.Expression {
  expression = unwrapExpression(expression);
  if (!ts.isIdentifier(expression)) return expression;
  const key = `${expression.getSourceFile().fileName}:${expression.text}`;
  if (seen.has(key)) throw new Error(`Cyclic validator ${expression.text}.`);
  const declaration = lookupDeclaration(expression, declarations);
  return declaration
    ? resolveValidator(
        declaration.initializer,
        declarations,
        new Set([...seen, key]),
      )
    : expression;
}

export function lookupDeclaration(
  node: ts.Identifier,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
) {
  return declarations.get(`${node.getSourceFile().fileName}:${node.text}`);
}

export function objectVariants(
  expression: ts.Expression,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
): ts.ObjectLiteralExpression[] {
  expression = resolveValidator(expression, declarations);
  if (ts.isObjectLiteralExpression(expression)) return [expression];
  if (ts.isCallExpression(expression)) {
    if (isValidatorCall(expression, "object") && expression.arguments[0])
      return objectVariants(expression.arguments[0], declarations);
    if (isValidatorCall(expression, "union"))
      return expression.arguments.flatMap((item) =>
        objectVariants(item, declarations),
      );
  }
  throw new Error(`Cannot resolve table fields: ${expression.getText()}.`);
}

export function summarizeDiscriminatedUnion(
  expression: ts.Expression,
  declarations: ReadonlyMap<string, ValidatorDeclaration>,
): SchemaDiscriminatedUnion | undefined {
  expression = resolveValidator(expression, declarations);
  if (!ts.isCallExpression(expression)) return undefined;
  if (isValidatorCall(expression, "optional") && expression.arguments[0])
    return summarizeDiscriminatedUnion(expression.arguments[0], declarations);
  if (!isValidatorCall(expression, "union") || expression.arguments.length < 2)
    return undefined;
  const objects = expression.arguments.map((item) => {
    const value = resolveValidator(item, declarations);
    if (!ts.isCallExpression(value) || !isValidatorCall(value, "object"))
      return undefined;
    const argument = value.arguments[0];
    if (!argument) return undefined;
    const object = resolveValidator(argument, declarations);
    return ts.isObjectLiteralExpression(object) ? object : undefined;
  });
  if (objects.some((object) => !object)) return undefined;
  const maps = objects.map((object) =>
    collectObjectValidators(object!, declarations, new Set()),
  );
  const literal = (node: ts.Expression | undefined): string | undefined => {
    if (!node) return undefined;
    const value = resolveValidator(node, declarations);
    if (!ts.isCallExpression(value) || !isValidatorCall(value, "literal"))
      return undefined;
    const argument = value.arguments[0];
    if (!argument) return undefined;
    if (ts.isStringLiteral(argument)) return argument.text;
    if (
      ts.isNumericLiteral(argument) ||
      argument.kind === ts.SyntaxKind.TrueKeyword ||
      argument.kind === ts.SyntaxKind.FalseKeyword
    )
      return argument.getText();
    return undefined;
  };
  const discriminator = [...maps[0]!.keys()].find((name) => {
    const values = maps.map((map) => literal(map.get(name)));
    return (
      values.every((value) => value !== undefined) &&
      new Set(values).size === values.length
    );
  });
  if (!discriminator) return undefined;
  return {
    discriminator,
    variants: maps.map((map) => ({
      discriminatorValue: literal(map.get(discriminator))!,
      fields: [...map]
        .filter(([name]) => name !== discriminator)
        .map(([name, value]) => ({
          name,
          type: summarizeValidator(
            value,
            value.getSourceFile(),
            declarations,
            new Set(),
            true,
          ),
          optional: isOptionalValidator(value, declarations),
          foreignKeyTargets: [
            ...new Set(
              findForeignKeys(value, false, declarations).map(
                (key) => key.targetTable,
              ),
            ),
          ],
        })),
    })),
  };
}
