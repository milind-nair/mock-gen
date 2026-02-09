export class MockStore {
  private data = new Map<string, Map<string, unknown>>();

  getCollection(basePath: string): Map<string, unknown> {
    if (!this.data.has(basePath)) {
      this.data.set(basePath, new Map());
    }
    return this.data.get(basePath)!;
  }

  list(basePath: string): unknown[] {
    return Array.from(this.getCollection(basePath).values());
  }

  get(basePath: string, id: string): unknown | undefined {
    return this.getCollection(basePath).get(id);
  }

  set(basePath: string, id: string, value: unknown) {
    this.getCollection(basePath).set(id, value);
  }

  delete(basePath: string, id: string): boolean {
    return this.getCollection(basePath).delete(id);
  }

  reset() {
    this.data.clear();
  }

  snapshot() {
    const output: Record<string, Record<string, unknown>> = {};
    for (const [path, collection] of this.data.entries()) {
      output[path] = Object.fromEntries(collection.entries());
    }
    return output;
  }
}
