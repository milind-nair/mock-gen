import type { IncomingHttpHeaders } from 'node:http';

export type BodyEncoding = 'utf8' | 'base64';

export interface RecordedBody {
  encoding: BodyEncoding;
  data: string;
}

export interface RecordingEntry {
  id: string;
  timestamp: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: RecordedBody;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body?: RecordedBody;
    latency: number;
  };
}

export interface RecordingSession {
  version: 1;
  target: string;
  createdAt: string;
  entries: RecordingEntry[];
}

export function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      result[key] = value.join(', ');
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function encodeBody(buffer?: Buffer): RecordedBody | undefined {
  if (!buffer || buffer.length === 0) return undefined;
  const text = buffer.toString('utf8');
  const reencoded = Buffer.from(text, 'utf8');
  const isUtf8 = reencoded.length === buffer.length && reencoded.equals(buffer) && !text.includes('\uFFFD');
  if (isUtf8) {
    return { encoding: 'utf8', data: text };
  }
  return { encoding: 'base64', data: buffer.toString('base64') };
}

export function decodeBody(body?: RecordedBody): Buffer | undefined {
  if (!body) return undefined;
  return Buffer.from(body.data, body.encoding === 'base64' ? 'base64' : 'utf8');
}

export function createPathMatcher(pattern?: string): (value: string) => boolean {
  if (!pattern) return () => true;
  if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
    const regex = new RegExp(pattern.slice(1, -1));
    return (value) => regex.test(value);
  }
  return (value) => value.includes(pattern);
}

export function parseStatusList(input?: string): number[] | undefined {
  if (!input) return undefined;
  const values = input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number.parseInt(item, 10))
    .filter((num) => Number.isFinite(num));
  return values.length > 0 ? values : undefined;
}
