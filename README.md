# Mock Server Generator

Generate a mock API server from an OpenAPI 3.x spec.

## Quick Start

```bash
npm install
npm run dev -- start --spec ./openapi.yaml --watch
```

You can also use the included sample spec:

```bash
npm run dev -- start --spec ./examples/openapi.yaml --watch
```

## Headers for Error/Delay Simulation

- `X-Mock-Status: 500`
- `X-Mock-Delay: 3000`

## Useful Endpoints

- `GET /health`
- `POST /__mock__/reset`
- `GET /__mock__/logs`
- `GET /__mock__/state`
- `GET /__mock__/ui`

## Recording & Replay

```bash
# Record traffic via local proxy
mock-gen record --target https://api.example.com --output recordings --include /users

# Replay a session
mock-gen replay --recording recordings/recording-2026-02-09T12-00-00-000Z.json
```

## Tests

```bash
npm test
```

## Config

Copy `mock-gen.config.example.js` to `mock-gen.config.js` and edit.
