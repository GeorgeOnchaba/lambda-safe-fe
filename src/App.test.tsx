import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

describe("λ-Safe compiler UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/readyz") {
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }
      if (path === "/v1/info") {
        return new Response(JSON.stringify({ compiler_version: "0.1.0" }), { status: 200 });
      }
      if (path === "/v1/check") {
        return new Response(JSON.stringify({ valid: true, diagnostics: [] }), { status: 200 });
      }
      if (path === "/v1/compile") {
        return new Response(JSON.stringify({
          status: "STATICALLY_CERTIFIED",
          valid: true,
          diagnostics: [],
          verification: [],
          excluded_claims: [],
          artifacts: {
            manifest: { schema_version: "0.1", manifest_digest: "abc" },
            certificate: { body: {}, certificate_digest: "def" }
          }
        }), { status: 200 });
      }
      if (path === "/v1/certificates/verify") {
        return new Response(JSON.stringify({
          valid: true, verification_scope: "integrity_and_binding_only", checks: {}, diagnostics: []
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    }));
  });

  it("renders the editor and disables actions until the API is online", async () => {
    render(<App />);
    expect(screen.getByRole("textbox", { name: /contract source/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Compiler online/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Compile contract/i }).hasAttribute("disabled")).toBe(false);
  });

  it("sends compile requests to the public API and displays returned status", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Compiler online/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Compile contract/i }));
    await waitFor(() => expect(screen.getByText(/STATICALLY_CERTIFIED/i)).toBeTruthy());
    expect(fetch).toHaveBeenCalled();
  });

  it("does not invent artifacts when compilation returns none", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/readyz") return new Response(JSON.stringify({status:"ok"}));
      if (path === "/v1/info") return new Response(JSON.stringify({compiler_version:"test"}));
      if (path === "/v1/compile") return new Response(JSON.stringify({status:"INDETERMINATE", diagnostics:[], artifacts:null}), {status:503});
      return new Response(JSON.stringify({valid:true,diagnostics:[]}));
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Compiler online/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Compile contract/i }));
    await waitFor(() => expect(screen.getByText("INDETERMINATE", { selector: ".status-pill" })).toBeTruthy());
    expect(screen.getByText(/A manifest appears here only after successful hard certification/i)).toBeTruthy();
  });
});
