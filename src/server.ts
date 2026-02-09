import express, { Request, Response, Router } from 'express';
import cors from 'cors';
import chokidar from 'chokidar';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataGenerator } from './data-generator.js';
import { loadSpec, listOperations, OperationSpec } from './spec.js';
import { MockStore } from './state.js';
import { RequestLogger } from './logger.js';
import { MockGenConfig } from './config.js';

interface RouteMeta {
  method: string;
  path: string;
  expressPath: string;
  isItem: boolean;
  collectionPath: string;
  idParam?: string;
  operation: any;
  responseSchema?: any;
  responseExample?: any;
  defaultStatus: number;
  requestSchema?: any;
}

interface BuildResult {
  router: Router;
  routes: RouteMeta[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parsePath(openApiPath: string) {
  const segments = openApiPath.split('/').filter(Boolean);
  let idParam: string | undefined;
  const expressSegments = segments.map((segment, index) => {
    const match = segment.match(/^\{(.+)\}$/);
    if (match) {
      const name = match[1];
      if (index === segments.length - 1) {
        idParam = name;
      }
      return `:${name}`;
    }
    return segment;
  });

  const isItem = Boolean(idParam);
  const collectionSegments = isItem ? segments.slice(0, -1) : segments;
  const collectionPath = `/${collectionSegments.join('/')}` || '/';

  return {
    expressPath: `/${expressSegments.join('/')}` || '/',
    isItem,
    collectionPath: collectionPath === '/' && openApiPath !== '/' ? `/${collectionSegments.join('/')}` : collectionPath,
    idParam
  };
}

function parseHeaderNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

function selectResponse(operation: any, status: number) {
  const responses = operation?.responses ?? {};
  const candidate = responses[String(status)] ?? responses[status] ?? responses.default;
  if (!candidate) return undefined;
  const content = candidate?.content ?? {};
  const media = content['application/json'] ?? Object.values(content)[0];
  const schema = media?.schema;
  const example = media?.example ?? pickExampleFromExamples(media?.examples);
  return { schema, example };
}

function pickExampleFromExamples(examples: any): any {
  if (!examples) return undefined;
  const first = Object.values(examples)[0] as any;
  if (!first) return undefined;
  if (first.value !== undefined) return first.value;
  return undefined;
}

function ensureId(resource: Record<string, unknown>, idParam?: string, providedId?: string) {
  const idKeys = [idParam, 'id', '_id', 'uuid'].filter(Boolean) as string[];
  for (const key of idKeys) {
    if (resource[key] !== undefined) {
      return String(resource[key]);
    }
  }
  const newId = providedId ?? randomUUID();
  const targetKey = idParam ?? 'id';
  resource[targetKey] = newId;
  return newId;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function buildRouter(
  doc: any,
  config: MockGenConfig,
  store: MockStore,
  dataGen: DataGenerator,
  logger: RequestLogger
): Promise<BuildResult> {
  const router = express.Router();
  const operations = listOperations(doc);
  const routes: RouteMeta[] = [];

  for (const op of operations) {
    const { expressPath, isItem, collectionPath, idParam } = parsePath(op.path);
    const method = op.method.toLowerCase();
    const defaultStatus = op.response?.status ?? (method === 'post' ? 201 : method === 'delete' ? 204 : 200);

    const meta: RouteMeta = {
      method,
      path: op.path,
      expressPath,
      isItem,
      collectionPath,
      idParam,
      operation: op.operation,
      responseSchema: op.response?.schema,
      responseExample: op.response?.example,
      defaultStatus,
      requestSchema: op.requestBody?.schema
    };

    routes.push(meta);

    const handler = async (req: Request, res: Response) => {
      const start = Date.now();
      const headerStatus = parseHeaderNumber(req.header('x-mock-status'));
      const headerDelay = parseHeaderNumber(req.header('x-mock-delay')) ?? 0;
      const chaosStatus = config.chaos.enabled && Math.random() < config.chaos.failureRate
        ? config.chaos.statusCodes[Math.floor(Math.random() * config.chaos.statusCodes.length)]
        : undefined;

      const baseDelay = randomBetween(config.latency.min, config.latency.max);
      const delayMs = baseDelay + headerDelay;
      if (delayMs > 0) {
        await sleep(delayMs);
      }

      let statusOverride = headerStatus ?? chaosStatus;
      let status = statusOverride ?? meta.defaultStatus;
      let responseBody: unknown = undefined;

      if (statusOverride && statusOverride >= 400) {
        const errorSchema = selectResponse(meta.operation, statusOverride);
        if (errorSchema?.example !== undefined) {
          responseBody = errorSchema.example;
        } else if (errorSchema?.schema) {
          responseBody = dataGen.generate(errorSchema.schema);
        } else {
          responseBody = { error: 'Mock error', status: statusOverride };
        }
      } else {
        const result = handleSuccess(req, meta, config, store, dataGen);
        status = statusOverride ?? result.status;
        responseBody = result.body;
      }

      const latency = Date.now() - start;
      logger.log({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers,
        body: req.body,
        response: {
          status,
          body: responseBody,
          latency
        }
      });

      if (req.method.toLowerCase() === 'head' || status === 204) {
        res.status(status).end();
        return;
      }
      res.status(status).json(responseBody);
    };

    const register = (router as any)[method]?.bind(router);
    if (register) {
      register(expressPath, handler);
    }
  }

  return { router, routes };
}

function handleSuccess(
  req: Request,
  meta: RouteMeta,
  config: MockGenConfig,
  store: MockStore,
  dataGen: DataGenerator
): { status: number; body: unknown } {
  const method = meta.method;
  const defaultStatus = meta.defaultStatus;

  if (!config.stateful) {
    return {
      status: defaultStatus,
      body: generateBody(meta, dataGen)
    };
  }

  if (meta.isItem) {
    const id = meta.idParam ? req.params[meta.idParam] : undefined;
    if (!id) {
      return {
        status: 400,
        body: { error: 'Missing path parameter for resource id.' }
      };
    }
    const collectionPath = meta.collectionPath;
    const existing = store.get(collectionPath, id);

    if (['get', 'put', 'patch', 'delete'].includes(method) && !existing) {
      return {
        status: 404,
        body: { error: 'Resource not found', id }
      };
    }

    if (method === 'get') {
      return { status: defaultStatus, body: existing };
    }

    if (method === 'put') {
      const payload = isObject(req.body) ? req.body : {};
      const resource = { ...payload } as Record<string, unknown>;
      ensureId(resource, meta.idParam, id);
      store.set(collectionPath, id, resource);
      return { status: defaultStatus, body: resource };
    }

    if (method === 'patch') {
      const payload = isObject(req.body) ? req.body : {};
      const resource = { ...(existing as Record<string, unknown>), ...payload } as Record<string, unknown>;
      ensureId(resource, meta.idParam, id);
      store.set(collectionPath, id, resource);
      return { status: defaultStatus, body: resource };
    }

    if (method === 'delete') {
      store.delete(collectionPath, id);
      return { status: defaultStatus, body: undefined };
    }
  }

  if (!meta.isItem) {
    const collectionPath = meta.collectionPath;
    if (method === 'get') {
      return { status: defaultStatus, body: store.list(collectionPath) };
    }

    if (method === 'post') {
      const payload = isObject(req.body) ? req.body : undefined;
      const resource = (payload && Object.keys(payload).length > 0)
        ? { ...payload }
        : (generateBody(meta, dataGen) as Record<string, unknown>);

      if (!isObject(resource)) {
        return { status: defaultStatus, body: resource };
      }

      const id = ensureId(resource, meta.idParam);
      store.set(collectionPath, id, resource);
      return { status: defaultStatus, body: resource };
    }
  }

  return { status: defaultStatus, body: generateBody(meta, dataGen) };
}

function generateBody(meta: RouteMeta, dataGen: DataGenerator): unknown {
  if (meta.responseExample !== undefined) {
    return meta.responseExample;
  }
  const schema = meta.responseSchema ?? meta.requestSchema;
  return dataGen.generate(schema);
}

function summarizeRoutes(routes: RouteMeta[]) {
  return routes.map((route) => `${route.method.toUpperCase()} ${route.path}`);
}

function diffRoutes(prev: Set<string>, next: Set<string>) {
  const added = [...next].filter((route) => !prev.has(route));
  const removed = [...prev].filter((route) => !next.has(route));
  return { added, removed };
}

export async function startServer(config: MockGenConfig) {
  const store = new MockStore();
  const logger = new RequestLogger(config.logging.maxEntries);
  const dataGen = new DataGenerator(config);

  let currentRouter: Router = express.Router();
  let currentRoutes = new Set<string>();

  async function rebuild() {
    const doc = await loadSpec(config.spec);
    const result = await buildRouter(doc, config, store, dataGen, logger);
    currentRouter = result.router;
    const routeStrings = summarizeRoutes(result.routes);
    const nextRoutes = new Set(routeStrings);
    const diff = diffRoutes(currentRoutes, nextRoutes);
    currentRoutes = nextRoutes;
    return diff;
  }

  try {
    await rebuild();
  } catch (error) {
    throw new Error(`Failed to load spec: ${(error as Error).message}`);
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get(config.endpoints.health, (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post(config.stateResetEndpoint, (_req, res) => {
    store.reset();
    logger.clear();
    res.status(204).end();
  });

  app.get(config.endpoints.logs, (_req, res) => {
    res.json({ logs: logger.list() });
  });

  app.get(config.endpoints.state, (_req, res) => {
    res.json({ state: store.snapshot() });
  });

  app.use((req, res, next) => currentRouter(req, res, next));

  const server = config.https
    ? https.createServer(
        {
          key: fs.readFileSync(path.resolve(config.https.key)),
          cert: fs.readFileSync(path.resolve(config.https.cert))
        },
        app
      )
    : http.createServer(app);

  server.listen(config.port, config.host, () => {
    console.log('\nMock Server Generator');
    console.log(`Spec: ${config.spec}`);
    console.log(`Server: http://${config.host}:${config.port}`);
    console.log(`Health: ${config.endpoints.health}`);
    console.log(`Routes: ${currentRoutes.size}`);
    console.log('');
  });

  if (config.watch) {
    const watcher = chokidar.watch(config.spec, { ignoreInitial: true });
    watcher.on('change', async () => {
      try {
        const diff = await rebuild();
        if (!config.preserveStateOnReload) {
          store.reset();
        }
        console.log('Spec updated. Reloaded routes.');
        if (diff.added.length > 0) {
          console.log('Added endpoints:');
          diff.added.forEach((route) => console.log(`  + ${route}`));
        }
        if (diff.removed.length > 0) {
          console.log('Removed endpoints:');
          diff.removed.forEach((route) => console.log(`  - ${route}`));
        }
      } catch (error) {
        console.error('Failed to reload spec:', (error as Error).message);
      }
    });
  }
}
