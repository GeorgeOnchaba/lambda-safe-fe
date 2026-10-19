import { useEffect, useMemo, useState } from "react";

type Diagnostic = { code?: string; severity?: string; message?: string; [key: string]: unknown };
type ApiResult = {
  status?: string;
  valid?: boolean;
  diagnostics?: Diagnostic[];
  verification?: unknown[];
  excluded_claims?: unknown[];
  artifacts?: {
    manifest?: unknown;
    certificate?: unknown;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};
type CompilerInfo = {
  compiler_version?: string;
  language_version?: string;
  manifest_version?: string;
  certificate_version?: string;
  solver?: unknown;
  [key: string]: unknown;
};

const DEFAULT_CONTRACT = `lambda_safe "0.1";
contract capacity_guard version "1" {
  unit count;
  input replicas: int<count> authority control_plane range [1, 8];
  assume replicas_positive hard: replicas >= 1;
  invariant replicas_bounded hard: replicas <= 8;
}`;

const SAMPLE_COUNTEREXAMPLE = `lambda_safe "0.1";
contract unsafe_capacity version "1" {
  unit count;
  input replicas: int<count> authority control_plane range [1, 8];
  assume replicas_positive hard: replicas >= 1;
  invariant replicas_must_be_zero hard: replicas == 0;
}`;

function pretty(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const raw = await response.text();
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : {}; }
  catch { body = { message: raw || response.statusText }; }
  if (!response.ok && response.status !== 409 && response.status !== 422 && response.status !== 503) {
    const message = (body as { message?: string }).message ?? response.statusText;
    throw new Error(`${response.status} ${message}`);
  }
  return body as T;
}

function statusClass(value?: string | boolean) {
  if (value === true || value === "STATICALLY_CERTIFIED" || value === "ok") return "success";
  if (value === false || value === "INVARIANT_VIOLATED" || value === "INFEASIBLE_CONTEXT") return "danger";
  return "neutral";
}

export default function App() {
  const [source, setSource] = useState(DEFAULT_CONTRACT);
  const [format, setFormat] = useState<"lambda" | "json" | "auto">("lambda");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [info, setInfo] = useState<CompilerInfo | null>(null);
  const [activeTab, setActiveTab] = useState<"result" | "manifest" | "certificate" | "diagnostics">("result");
  const [busy, setBusy] = useState<"check" | "compile" | "verify" | null>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [healthResponse, compilerInfo] = await Promise.all([
          request<{status?: string}>("/readyz"),
          request<CompilerInfo>("/v1/info")
        ]);
        if (!active) return;
        setHealth(healthResponse.status === "ok" ? "online" : "offline");
        setInfo(compilerInfo);
      } catch {
        if (active) setHealth("offline");
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const diagnostics = result?.diagnostics ?? [];
  const resultText = useMemo(() => pretty(result), [result]);

  async function run(action: "check" | "compile") {
    setBusy(action);
    setError("");
    setResult(null);
    try {
      const response = await request<ApiResult>(`/v1/${action}`, {
        method: "POST",
        body: JSON.stringify({ source: { format, content: source } })
      });
      setResult(response);
      setActiveTab(action === "compile" ? "manifest" : "diagnostics");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function verifyArtifacts() {
    if (!result?.artifacts?.manifest || !result?.artifacts?.certificate) {
      setError("Compile a contract successfully before verifying its artifacts.");
      return;
    }
    setBusy("verify");
    setError("");
    try {
      const response = await request<ApiResult>("/v1/certificates/verify", {
        method: "POST",
        body: JSON.stringify({
          manifest: result.artifacts.manifest,
          certificate: result.artifacts.certificate
        })
      });
      setResult({ ...result, artifact_verification: response });
      setActiveTab("result");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Artifact verification failed.");
    } finally {
      setBusy(null);
    }
  }

  const status = String(result?.status ?? (typeof result?.valid === "boolean" ? (result.valid ? "VALID" : "INVALID") : "Awaiting compilation"));

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="#" className="brand" aria-label="Lambda Safe home">
          <span className="brand-mark">λ</span>
          <span><strong>λ-Safe</strong><small>OPEN CORE COMPILER</small></span>
        </a>
        <nav className="top-links" aria-label="Primary navigation">
          <a href="https://github.com/GeorgeOnchaba/lambda-safe" target="_blank" rel="noreferrer">Source <span>↗</span></a>
          <a href="https://github.com/GeorgeOnchaba/lambda-safe/blob/main/docs/language-spec.md" target="_blank" rel="noreferrer">Language spec <span>↗</span></a>
          <a href="https://github.com/GeorgeOnchaba/lambda-safe/blob/main/docs/api.md" target="_blank" rel="noreferrer">API docs <span>↗</span></a>
        </nav>
        <div className={`health-chip ${health}`}><span className="health-dot" />{health === "online" ? "Compiler online" : health === "checking" ? "Connecting…" : "API unavailable"}</div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><span className="pulse" /> DETERMINISTIC · FAIL-CLOSED · LOCAL-FIRST</div>
          <h1>Make your invariants<br /><em>impossible to ignore.</em></h1>
          <p>Write a contract. Check the hard rules. Compile the obligations into a manifest and λ-certificate when every required proof succeeds.</p>
          <div className="hero-tags">
            <span>HARD INVARIANTS</span><span>QF-LIA</span><span>EXPLICIT AUTHORITY</span><span>NO CERTIFICATE ON UNKNOWN</span>
          </div>
        </section>

        <section className="workspace">
          <div className="workspace-head">
            <div><div className="section-kicker">WORKSPACE / 01</div><h2>Contract editor</h2></div>
            <div className="editor-tools">
              <label className="select-wrap"><span className="sr-only">Source format</span><select value={format} onChange={e => setFormat(e.target.value as typeof format)}><option value="lambda">λ language</option><option value="json">JSON projection</option><option value="auto">Auto detect</option></select></label>
              <button className="button button-quiet" onClick={() => { setSource(DEFAULT_CONTRACT); setResult(null); setError(""); }}>Reset sample</button>
              <button className="button button-quiet" onClick={() => { setSource(SAMPLE_COUNTEREXAMPLE); setResult(null); setError(""); }}>Load failing case</button>
            </div>
          </div>

          <div className="editor-grid">
            <div className="editor-panel">
              <div className="panel-top"><span><span className="mini-led" /> contract.lambda</span><span>{source.length.toLocaleString()} chars</span></div>
              <textarea aria-label="Contract source" spellCheck={false} value={source} onChange={e => setSource(e.target.value)} />
              <div className="editor-footer"><span>UTF-8 · Source is sent to your local compiler service</span><span>{source.split("\n").length} lines</span></div>
            </div>
            <aside className="run-panel">
              <div className="run-panel-title">Compile controls</div>
              <p>Static checks and solver-backed compilation are separate operations.</p>
              <button className="button button-primary" disabled={busy !== null || !source.trim() || health !== "online"} onClick={() => void run("compile")}>
                {busy === "compile" ? <><span className="spinner" /> Compiling…</> : <>Compile contract <span>→</span></>}
              </button>
              <button className="button button-secondary" disabled={busy !== null || !source.trim() || health !== "online"} onClick={() => void run("check")}>
                {busy === "check" ? <><span className="spinner" /> Checking…</> : <>Run static checks</>}
              </button>
              <div className="run-divider" />
              <div className="rule-item"><span className="rule-icon">✓</span><div><strong>Authority-aware</strong><small>Rejects hard claims without permitted authority.</small></div></div>
              <div className="rule-item"><span className="rule-icon">✓</span><div><strong>Bounded execution</strong><small>Source, solver and concurrency limits.</small></div></div>
              <div className="rule-item"><span className="rule-icon">✓</span><div><strong>Fail-closed artifacts</strong><small>No hard artifacts for failed or unknown proofs.</small></div></div>
              <div className="note-box"><strong>What this proves</strong><p>Only the declared, supported hard obligations under the exact model and solver recorded in the output. Not arbitrary runtime behavior.</p></div>
            </aside>
          </div>
        </section>

        <section className="results">
          <div className="result-head">
            <div><div className="section-kicker">OUTPUT / 02</div><h2>Compiler output</h2></div>
            <div className="result-actions">
              <span className={`status-pill ${statusClass(result?.status ?? result?.valid)}`}>{status}</span>
              <button className="button button-quiet" disabled={!result} onClick={() => downloadText("lambda-safe-result.json", resultText)}>Export result ↓</button>
            </div>
          </div>
          {error && <div className="error-banner" role="alert"><strong>Request failed</strong><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
          <div className="result-tabs" role="tablist" aria-label="Compiler output tabs">
            {(["result", "manifest", "certificate", "diagnostics"] as const).map(tab => <button key={tab} className={activeTab === tab ? "active" : ""} role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)}>{tab === "result" ? "Summary" : tab === "manifest" ? "Manifest" : tab === "certificate" ? "λ-Certificate" : "Diagnostics"}{tab === "diagnostics" && diagnostics.length > 0 ? <span className="tab-count">{diagnostics.length}</span> : null}</button>)}
          </div>
          <div className="output-panel">
            {activeTab === "result" && <Summary result={result} info={info} />}
            {activeTab === "manifest" && <ArtifactView value={result?.artifacts?.manifest} empty="A manifest appears here only after successful hard certification." filename="manifest.json" />}
            {activeTab === "certificate" && <ArtifactView value={result?.artifacts?.certificate} empty="A λ-certificate appears here only after successful hard certification." filename="lambda-certificate.json" />}
            {activeTab === "diagnostics" && <Diagnostics items={diagnostics} />}
          </div>
          <div className="output-footer">
            <span>{result ? "Response captured locally in this browser session." : "Results will appear here after a check or compilation."}</span>
            <button className="button button-small" disabled={busy !== null || !result?.artifacts?.manifest || !result?.artifacts?.certificate} onClick={() => void verifyArtifacts()}>{busy === "verify" ? "Verifying…" : "Verify artifacts"}</button>
          </div>
        </section>

        <section className="info-grid">
          <div className="info-card"><div className="section-kicker">01 / CHECK</div><h3>Static validation</h3><p>Checks parsing, declarations, types, units, authority and supported-theory boundaries without invoking the solver.</p></div>
          <div className="info-card"><div className="section-kicker">02 / PROVE</div><h3>Hard obligations</h3><p>Checks feasible assumptions, invariant validity and transition feasibility/preservation within the supported QF-LIA fragment.</p></div>
          <div className="info-card"><div className="section-kicker">03 / BIND</div><h3>Verifiable artifacts</h3><p>Produces canonical manifests and certificates only when the required certification pipeline succeeds.</p></div>
        </section>

        <footer className="footer"><span>NiGeNje λ-Safe · Free, open-source core</span><span>Built for local verification, transparent limitations and reproducible contracts.</span></footer>
      </main>
    </div>
  );
}

function Summary({ result, info }: { result: ApiResult | null; info: CompilerInfo | null }) {
  if (!result) return <div className="empty-state"><div className="empty-orbit">λ</div><h3>Ready when you are</h3><p>Run a static check or compile the sample contract to inspect the compiler's actual output.</p><div className="empty-hint">No request is sent until you press a compile control.</div></div>;
  const artifacts = Boolean(result.artifacts?.manifest && result.artifacts?.certificate);
  const checks = Array.isArray(result.verification) ? result.verification.length : 0;
  return <div className="summary-content">
    <div className="summary-banner"><div className={`summary-symbol ${statusClass(result.status ?? result.valid)}`}>{result.valid === false || ["INVARIANT_VIOLATED", "INFEASIBLE_CONTEXT"].includes(String(result.status)) ? "!" : artifacts ? "✓" : "i"}</div><div><h3>{artifacts ? "Hard obligations certified" : result.valid === false ? "Contract rejected or requires changes" : "Static evaluation complete"}</h3><p>{artifacts ? "The API returned both a manifest and a λ-certificate." : "Review the diagnostics and status before taking the next step."}</p></div></div>
    <div className="metric-grid"><Metric label="Compiler version" value={String(info?.compiler_version ?? "From API")} /><Metric label="Verification records" value={String(checks)} /><Metric label="Excluded claims" value={String(Array.isArray(result.excluded_claims) ? result.excluded_claims.length : 0)} /><Metric label="Artifacts" value={artifacts ? "2 emitted" : "None emitted"} /></div>
    <div className="result-facts"><h4>Certification boundary</h4><p>Artifact presence is derived from the response, not inferred from an HTTP status alone. Review the certificate's scope and input digests before relying on it.</p><code>verification_scope: integrity_and_binding_only</code></div>
    {result.artifact_verification !== undefined && <div className="sub-result"><h4>Latest artifact verification</h4><pre>{pretty(result.artifact_verification)}</pre></div>}
    <details className="raw-details"><summary>Inspect complete API response</summary><pre>{pretty(result)}</pre></details>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function ArtifactView({ value, empty, filename }: { value: unknown; empty: string; filename: string }) {
  if (!value) return <div className="tab-empty"><div>◇</div><p>{empty}</p></div>;
  return <div className="artifact-view"><div className="artifact-bar"><span>{filename}</span><button className="button button-small" onClick={() => downloadText(filename, pretty(value))}>Download JSON ↓</button></div><pre>{pretty(value)}</pre></div>;
}

function Diagnostics({ items }: { items: Diagnostic[] }) {
  if (items.length === 0) return <div className="tab-empty"><div>✓</div><p>No diagnostics to display yet, or the API returned no diagnostic entries.</p></div>;
  return <div className="diagnostics-list">{items.map((item, index) => <article className="diagnostic" key={`${String(item.code ?? "diagnostic")}-${index}`}><span className={`severity ${String(item.severity ?? "information")}`}>{String(item.severity ?? "info")}</span><div><strong>{String(item.code ?? "Diagnostic")}</strong><p>{String(item.message ?? pretty(item))}</p><details><summary>Details</summary><pre>{pretty(item)}</pre></details></div></article>)}</div>;
}
