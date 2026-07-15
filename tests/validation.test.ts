import { describe, it, expect } from "vitest";
import { z } from "zod";
import { formatZodError, validateRequest } from "@/lib/validation/helpers";
import { addressParam, searchQuery, emptyParams } from "@/lib/validation/schemas";

describe("addressParam", () => {
  it("validates a correct address", () => {
    const result = addressParam.safeParse("0xabc123def456");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("0xabc123def456");
    }
  });

  it("trims and lowercases", () => {
    const result = addressParam.safeParse("  0xABC123  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("0xabc123");
    }
  });

  it("rejects empty string", () => {
    const result = addressParam.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects non-hex string", () => {
    const result = addressParam.safeParse("not-an-address");
    expect(result.success).toBe(false);
  });

  it("rejects missing 0x prefix", () => {
    const result = addressParam.safeParse("123abc");
    expect(result.success).toBe(false);
  });
});

describe("searchQuery", () => {
  it("validates non-empty query", () => {
    const result = searchQuery.safeParse("WETH");
    expect(result.success).toBe(true);
  });

  it("trims whitespace", () => {
    const result = searchQuery.safeParse("  WETH  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("WETH");
    }
  });

  it("rejects empty string", () => {
    const result = searchQuery.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects very long query", () => {
    const long = "a".repeat(201);
    const result = searchQuery.safeParse(long);
    expect(result.success).toBe(false);
  });
});

describe("emptyParams", () => {
  it("accepts empty object", () => {
    const result = emptyParams.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects unexpected keys", () => {
    const result = emptyParams.safeParse({ limit: "50" });
    expect(result.success).toBe(false);
  });
});

describe("formatZodError", () => {
  it("formats single issue", () => {
    const schema = z.string().min(1, "Required");
    const result = schema.safeParse("");
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("Required");
    }
  });

  it("formats multiple issues", () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    });
    const result = schema.safeParse({ name: "", age: -1 });
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("name");
      expect(msg).toContain("age");
    }
  });

  it("includes field paths", () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: "bad" });
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("email");
    }
  });
});

describe("validateRequest", () => {
  it("returns success with parsed data", () => {
    const schema = z.object({ q: z.string().min(1) });
    const result = validateRequest(schema, { q: "test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe("test");
    }
  });

  it("returns 400 response on validation failure", () => {
    const schema = z.object({ q: z.string().min(1) });
    const result = validateRequest(schema, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });

  it("returns error message in response body", async () => {
    const schema = z.object({ q: z.string().min(1, "Query is required") });
    const result = validateRequest(schema, { q: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const body = await result.response.json();
      expect(body.error).toContain("Query is required");
    }
  });
});
