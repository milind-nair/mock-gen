# Mock Server Generator

Generate a mock API server from an OpenAPI 3.x spec.

## Quick Start

```bash
npm install
npm run dev -- start --spec ./openapi.yaml --watch
```

## Headers for Error/Delay Simulation

- `X-Mock-Status: 500`
- `X-Mock-Delay: 3000`

## Useful Endpoints

- `GET /health`
- `POST /__mock__/reset`
- `GET /__mock__/logs`
- `GET /__mock__/state`

## Config

Copy `mock-gen.config.example.js` to `mock-gen.config.js` and edit.
