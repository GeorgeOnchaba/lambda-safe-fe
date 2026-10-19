# NiGeNje λ-Safe Compiler UI

A browser-based interface for the free, open-source λ-Safe compiler. The UI talks only to the documented HTTP API of `lambda-safe-service`; compiler logic and hard-certification semantics remain in the separate backend repository.

## Run the complete stack

The canonical one-file Docker Compose configuration lives in the backend repository. The repositories remain independent; Compose fetches this UI repository as a remote build context, so a sibling checkout is not required.

Clone the backend repository:

```bash
git clone https://github.com/GeorgeOnchaba/lambda-safe.git
cd lambda-safe
mkdir -p secrets
openssl rand -hex 32 > secrets/lambda-safe-api-token
chmod 600 secrets/lambda-safe-api-token
docker compose up --build
```

Open **http://localhost:3000**.

PowerShell alternative for token creation:

```powershell
New-Item -ItemType Directory -Force secrets | Out-Null
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$token = [Convert]::ToHexString($bytes).ToLowerInvariant()
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'secrets/lambda-safe-api-token'), $token)
docker compose up --build
```

The compiler port is not published to the host. The UI server proxies requests across the private Docker network and attaches the service Bearer token server-side; the browser never receives the token. The token file must remain outside Git and should be unique to each environment.

**Compose configuration change status:** the backend repository's single-file remote-frontend build is proposed in [PR #16](https://github.com/GeorgeOnchaba/lambda-safe/pull/16). Until that PR is merged, the current backend `main` branch still expects this UI repository to be checked out as a sibling at `../lambda-safe-fe`.

## Local UI development

Requires Node.js 22+ and npm.

```bash
npm install
npm run dev
```

The Vite dev server proxies `/healthz`, `/readyz` and `/v1/*` to `http://localhost:8080` by default. Set `LAMBDA_SAFE_API_TARGET` to a reachable compiler API when needed. The Vite development proxy does not load the Docker Compose secret automatically; use a local compiler running on loopback without a service token, or provide your own trusted development proxy.

## What it supports

- Health and compiler identity display.
- λ-language, JSON projection and auto-detect request formats.
- Static checks and solver-backed compilation.
- Sample valid and failing contracts.
- Diagnostics and full API response inspection.
- Manifest and certificate views and JSON export.
- Artifact integrity/binding verification using the documented backend endpoint.

The interface distinguishes compiler output from stronger claims it does not establish. Integrity/binding verification is not a substitute for recompiling through a trusted toolchain.

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
