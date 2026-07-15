import { NextResponse } from "next/server";
import type { ZodError, ZodSchema } from "zod";

/** Format Zod validation error into a readable string */
export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

/**
 * Safely parse and validate request data against a Zod schema.
 * Returns `{ success: true, data }` on success, or
 * returns a `{ success: false, response }` NextResponse (400) on failure.
 */
export function validateRequest<T>(
  schema: ZodSchema<T>,
  input: unknown
):
  | { success: true; data: T }
  | { success: false; response: NextResponse } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    response: NextResponse.json(
      { error: formatZodError(result.error) },
      { status: 400 }
    ),
  };
}
