export default {
  spec: './openapi.yaml',
  port: 3001,
  host: '0.0.0.0',
  watch: true,
  stateful: true,
  preserveStateOnReload: true,
  stateResetEndpoint: '/__mock__/reset',
  endpoints: {
    health: '/health',
    logs: '/__mock__/logs',
    state: '/__mock__/state'
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
