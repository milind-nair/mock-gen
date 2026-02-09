export interface RequestLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  response: {
    status: number;
    body: unknown;
    latency: number;
  };
}

export class RequestLogger {
  private entries: RequestLogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number) {
    this.maxEntries = maxEntries;
  }

  log(entry: RequestLogEntry) {
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
  }

  list() {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
  }
}
