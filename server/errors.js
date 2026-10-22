export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireThat(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}

export function text(value, field, max = 120) {
  requireThat(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= max,
    400,
    `${field} must contain 1–${max} characters.`,
  );
  return value.trim();
}

export function onlyFields(value, allowed) {
  requireThat(
    value && typeof value === "object" && !Array.isArray(value),
    400,
    "Expected a JSON object.",
  );
  requireThat(
    Object.keys(value).every((key) => allowed.includes(key)),
    400,
    "Unexpected request fields.",
  );
}
