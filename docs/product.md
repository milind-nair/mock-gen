# Mock Server Generator - Product Documentation

## Overview

Mock Server Generator turns an OpenAPI 3.x spec into a running mock server in seconds. It supports:

- Automatic route generation from OpenAPI paths
- Schema-based response generation with smart fake data
- Stateful CRUD interactions (in-memory)
- Error and latency simulation via headers
- Hot reload on spec changes
- Traffic recording and replay
- Minimal inspector UI for request logs and state

## Quick Start

```bash
npm install
npm run dev -- start --spec ./examples/openapi.yaml --watch
```

Server defaults to `http://0.0.0.0:3001`.

## Primary Commands

### Start

```bash
mock-gen start --spec ./openapi.yaml --watch
```

Common options:

- `--spec <path>` OpenAPI spec (YAML/JSON)
- `--port <number>` Port to bind (default 3001)
- `--host <host>` Host to bind (default 0.0.0.0)
- `--watch` Hot reload on spec changes
- `--stateful` Stateful CRUD (default)
- `--stateless` Always generate new data

### Record

```bash
mock-gen record --target https://api.example.com --output recordings
```

### Replay

```bash
mock-gen replay --recording recordings/session.json
```

## Mocking Behavior

### Response Selection

For each operation, a default response is chosen:

- Prefer the first `2xx` response
- Otherwise use `default` or the first available response

### Data Generation

Response data is generated in this order:

1. Schema `example` or `examples`
2. Enum values
3. JSON Schema Faker output
4. Fallback generator

Smart field hints apply to keys like `email`, `id`, `name`, `date`, `url`, `ipv4`.

### Stateful vs Stateless

Stateful mode (default):

- Collections start empty
- `POST` creates and stores a resource
- `GET` collection returns stored items
- `GET` item returns stored item or 404
- `PUT` replaces, `PATCH` merges, `DELETE` removes

Stateless mode:

- Every request returns a generated response
- No in-memory store is used

## Inspector UI

Open in your browser:

```
GET /__mock__/ui
```

The UI shows recent request logs and a live state snapshot.

## Error & Latency Simulation

Send headers to force behavior:

- `X-Mock-Status: 500`
- `X-Mock-Delay: 1500`

## Useful Endpoints

- `GET /health`
- `POST /__mock__/reset`
- `GET /__mock__/logs`
- `GET /__mock__/state`
- `GET /__mock__/ui`
