import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface MockGenConfig {
  spec: string;
  host: string;
  port: number;
  https?: {
    key: string;
    cert: string;
  };
  watch: boolean;
  preserveStateOnReload: boolean;
  stateful: boolean;
  stateResetEndpoint: string;
  endpoints: {
    health: string;
    logs: string;
    state: string;
  };
  data: {
    arrayMin: number;
    arrayMax: number;
    seed?: number;
  };
  latency: {
    min: number;
    max: number;
  };
  chaos: {
    enabled: boolean;
    failureRate: number;
    statusCodes: number[];
  };
  logging: {
    maxEntries: number;
  };
}

const defaultConfig: MockGenConfig = {
  spec: '',
  host: '0.0.0.0',
  port: 3001,
  watch: false,
  preserveStateOnReload: true,
  stateful: true,
  stateResetEndpoint: '/__mock__/reset',
  endpoints: {
    health: '/health',
    logs: '/__mock__/logs',
    state: '/__mock__/state'
  },
  data: {
    arrayMin: 1,
    arrayMax: 5
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

type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends object ? PartialDeep<T[K]> : T[K];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: PartialDeep<T>): T {
  if (!isObject(base) || !isObject(override)) {
    return override as T;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = (base as Record<string, unknown>)[key];
    if (isObject(baseValue) && isObject(value)) {
      result[key] = deepMerge(baseValue, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

async function loadConfigFile(configPath: string): Promise<PartialDeep<MockGenConfig>> {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }
  const fileUrl = pathToFileURL(resolved).href;
  const imported = await import(fileUrl);
  const config = imported.default ?? imported;
  if (!isObject(config)) {
    throw new Error('Config file must export an object.');
  }
  return config as PartialDeep<MockGenConfig>;
}

export async function loadConfig(
  configPath?: string,
  overrides: PartialDeep<MockGenConfig> = {}
): Promise<MockGenConfig> {
  let fileConfig: PartialDeep<MockGenConfig> = {};
  const defaultConfigPath = path.resolve('mock-gen.config.js');

  if (configPath) {
    fileConfig = await loadConfigFile(configPath);
  } else if (fs.existsSync(defaultConfigPath)) {
    fileConfig = await loadConfigFile(defaultConfigPath);
  }

  let merged = deepMerge(defaultConfig, fileConfig);
  merged = deepMerge(merged, overrides);

  if (!merged.spec) {
    throw new Error('Spec path is required. Provide --spec or set `spec` in config.');
  }

  merged.spec = path.resolve(merged.spec);
  return merged;
}

export function coerceNumber(value: unknown, fallback?: number): number | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return num;
}
