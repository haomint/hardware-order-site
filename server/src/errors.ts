import { apiErrors, StageBApiErrorSchema, stageBErrors } from "../../shared/index.ts";

export class ApiFailure extends Error {
  readonly code: keyof typeof apiErrors;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: keyof typeof apiErrors, fieldErrors?: Record<string, string>) {
    super(apiErrors[code].message);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

type OrderFailureCode = "ORDER_PRODUCTS_UNAVAILABLE" | "IDEMPOTENCY_KEY_CONFLICT"
  | "ORDER_TOTAL_TOO_LARGE" | "TOO_MANY_REQUESTS" | "ORDER_NOT_FOUND" | "ORDER_STATUS_CONFLICT";
type UnavailableItems = Extract<
  ReturnType<typeof StageBApiErrorSchema.parse>, { code: "ORDER_PRODUCTS_UNAVAILABLE" }
>["unavailableItems"];

export class OrderFailure extends Error {
  readonly status: 404 | 409 | 429;
  readonly response: ReturnType<typeof StageBApiErrorSchema.parse>;

  constructor(code: Exclude<OrderFailureCode, "ORDER_PRODUCTS_UNAVAILABLE">);
  constructor(code: "ORDER_PRODUCTS_UNAVAILABLE", unavailableItems: UnavailableItems);
  constructor(code: OrderFailureCode, unavailableItems?: UnavailableItems) {
    const { status, message } = stageBErrors[code];
    super(message);
    this.status = status;
    this.response = StageBApiErrorSchema.parse(
      unavailableItems ? { code, message, unavailableItems } : { code, message },
    );
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
