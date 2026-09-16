export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertRecord(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
}

export function finiteNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }
  return value;
}

export function requiredString(
  value: unknown,
  message: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim().slice(0, maxLength);
}

export function optionalString(
  value: unknown,
  message: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(message);
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function snap(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize;
}

export function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
