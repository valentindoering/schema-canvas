import ts from "typescript";

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
    const declaration = declarations.get(expression.text);
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
    const declaration = declarations.get(expression.text);
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
    const declaration = declarations.get(node.text);
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

function isValidatorCall(expression: ts.CallExpression, methodName: string) {
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

function collectObjectValidators(
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
  const declaration = declarations.get(expression.text);
  return declaration
    ? resolveObjectLiteral(
        declaration.initializer,
        declarations,
        new Set([...resolving, expression.text]),
      )
    : undefined;
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

export function propertyName(name: ts.PropertyName, sourceFile: ts.SourceFile) {
  return ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
    ? name.text
    : name.getText(sourceFile);
}
