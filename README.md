# NiGeNje λ-Safe Compiler UI

A browser-based interface for the free, open-source λ-Safe compiler. The UI talks only to the documented public HTTP API of `lambda-safe-service`. Compiler logic and hard-certification semantics live in the backend repository.

## One-command stack

The backend repository owns the Compose file and builds this UI from its independent public Git repository. You do not need to clone the frontend separately or combine the repositories:

```bash
git clone https://github.com/GeorgeOnchaba/lambda-safe.git
cd lambda-safe
mkdir -p secrets
openssl rand -hex 32 > secrets/lambda-safe-api-token
chmod 644 secrets/lambda-safe-api-token
docker compose up --build
```

Open http://localhost:3001. The backend is not published to the host; the UI server proxies requests across the private Docker network and attaches the service bearer token server-side. The browser never receives the token. Keep the token outside Git and generate a unique one for each environment. On Linux, file-backed Compose secrets keep the host file mode and both containers run as UID 10001, so the demo token must be readable by that UID (`0644`).

PowerShell token generation (works in Windows PowerShell 5.1 and PowerShell 7+):

```powershell
New-Item -ItemType Directory -Force secrets | Out-Null
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'secrets/lambda-safe-api-token'), $token)
```

## Local UI development

Requires Node.js 22+ and npm.

```bash
npm install
npm run dev
```

The Vite dev server proxies `/healthz`, `/readyz` and `/v1/*` to `http://compiler:8080` by default. Outside Compose, set `LAMBDA_SAFE_API_TARGET` to a reachable compiler API. The development proxy does not load the Compose secret automatically; use a local compiler running on loopback without a service token, or provide your own trusted development proxy.

## What it supports

- Health and compiler identity display.
- λ-language, JSON projection and auto-detect request formats.
- Static checks and solver-backed compilation.
- Sample valid and failing contracts.
- Diagnostics and full API response inspection.
- Manifest and certificate views and JSON export.
- Artifact integrity/binding verification using the documented backend endpoint.

The interface clearly distinguishes compiler output from the stronger claims it does not establish. The integrity/binding verifier is not a substitute for recompiling through a trusted toolchain.

## Development commands

```bash
npm run build
npm test
```

## Public API contract

- `GET /healthz`
- `GET /readyz`
- `GET /v1/info`
- `POST /v1/check`
- `POST /v1/compile`
- `POST /v1/certificates/verify`

No private packages, hosted credentials, commercial API endpoints, or enterprise-only integration contracts are part of this UI.

## License

MIT. See `LICENSE`.
