# Mock Server Generator - Developer Documentation

## Project Structure

Key modules:

- `src/spec.ts` OpenAPI loading and dereferencing
- `src/data-generator.ts` Schema-driven data generation
- `src/state.ts` In-memory CRUD store
- `src/server.ts` Route registration and server startup
- `src/logger.ts` Request log tracking
- `src/inspector.ts` Inspector HTML rendering
- `src/record.ts` Recording proxy server
- `src/replay.ts` Replay server
- `src/recording.ts` Recording schema and helpers

## Architecture Summary

Request flow:

1. Express routes are generated from OpenAPI paths.
2. Error/latency overrides are applied (headers or chaos mode).
3. In stateful mode, CRUD uses the in-memory store.
4. Stateless mode generates responses from JSON Schema.
5. Responses are logged for the inspector UI.

## Configuration

Config is loaded from:

- `--config <path>` if provided
- `./mock-gen.config.js` if present
- CLI flags override config values

Example:

```javascript
export default {
  spec: './examples/openapi.yaml',
  port: 3001,
  host: '0.0.0.0',
  watch: true,
  preserveStateOnReload: true,
  stateful: true,
  stateResetEndpoint: '/__mock__/reset',
  endpoints: {
    health: '/health',
    logs: '/__mock__/logs',
    state: '/__mock__/state',
    ui: '/__mock__/ui'
  },
  inspector: {
    enabled: true,
    refreshMs: 2000
  },
  data: {
    arrayMin: 1,
    arrayMax: 5,
    seed: 12345
  },
  latency: {
    min: 0,
    max: 0
  },
  chaos: {
    enabled: false,
    failureRate: 0.1,
    statusCodes: [500]
  },
  logging: {
    maxEntries: 500
  }
};
```

## Testing

Tests use Node's `node:test` and run through `tsx`.

```bash
npm test
```

Included tests:

- `tests/server.test.ts` Stateful CRUD flow
- `tests/record-replay.test.ts` Recording and replay flow

Some sandboxed environments block IPC sockets used by `tsx`. If you see `EPERM` on a pipe, run tests outside the sandbox.

## Troubleshooting

### Empty list responses

Stateful mode starts collections empty. Use `POST` or run stateless mode.

### Invalid spec errors

Specs are validated by `@apidevtools/swagger-parser`. Fix spec issues or validate with a linter.

### Replay returns 404

Replay matches on `METHOD + full URL` (including query string). Ensure the request matches a recorded entry.
