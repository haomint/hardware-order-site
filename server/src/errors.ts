import { apiErrors } from "../../shared/index.ts";

export class ApiFailure extends Error {
  readonly code: keyof typeof apiErrors;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: keyof typeof apiErrors, fieldErrors?: Record<string, string>) {
    super(apiErrors[code].message);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

type Issue = { path: readonly PropertyKey[]; message: string };
export type Schema<T = unknown> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Issue[] } };
  parse(value: unknown): T;
};

export function validate<T>(schema: Schema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const fields = new Map<string, string>();
  for (const { path, message } of result.error.issues) {
    const key = path.map(String).join(".");
    if (key && !fields.has(key)) fields.set(key, message);
  }
  throw new ApiFailure("INVALID_REQUEST", fields.size ? Object.fromEntries(fields) : undefined);
}
