# NiGeNje λ-Safe Compiler UI

A browser-based interface for the free, open-source λ-Safe compiler. The UI uses the public HTTP API supplied by `lambda-safe-service`; it does not embed compiler logic or enterprise-only integrations.

## Run the integrated stack

The canonical local-development and demo stack is maintained by the backend repository:

```bash
git clone https://github.com/GeorgeOnchaba/lambda-safe.git
cd lambda-safe
docker compose up --build
```

Open <http://localhost:3000>. The UI proxies API calls to the backend over the private Compose network; the backend is not published to the host by default.

## API

The UI expects the free API routes documented in the backend repository: `GET /healthz`, `GET /readyz`, `GET /v1/info`, `POST /v1/check`, `POST /v1/compile`, and `POST /v1/certificates/verify`.

## Open-source boundary

This repository contains only the open UI. It must not depend on private packages, unpublished endpoints, hosted credentials, or enterprise-only services. Treat every displayed certificate as scoped to the contract and compiler version described by the API; a certificate is not a blanket runtime-safety guarantee.

## License

MIT. See `LICENSE`.