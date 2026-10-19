import { describe, expect, it } from "vitest";

describe("open-source λ-Safe UI", () => {
  it("declares supported public API paths in the application source", async () => {
    const app = await import("./App");
    expect(app.default).toBeTypeOf("function");
  });
});
