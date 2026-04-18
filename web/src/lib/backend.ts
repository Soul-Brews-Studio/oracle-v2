export interface SearchResult {
  id: string;
  content: string;
  score: number;
  type: string;
  concepts?: string[];
  created_at?: string;
}

export interface Learning {
  id: string;
  pattern: string;
  concepts?: string[];
  created_at: string;
}

export interface TraceResult {
  query: string;
  chain: string[];
  related: SearchResult[];
}

export interface BackendClient {
  search(query: string): Promise<SearchResult[]>;
  learn(pattern: string, concepts?: string[]): Promise<Learning>;
  list(type?: string, limit?: number): Promise<SearchResult[]>;
  trace(query: string): Promise<TraceResult>;
  read(file: string): Promise<string>;
  concepts(): Promise<string[]>;
  stats(): Promise<Record<string, unknown>>;
}

export class MockBackend implements BackendClient {
  async search(query: string): Promise<SearchResult[]> {
    return [
      { id: "mock-1", content: `Mock result for: ${query}`, score: 0.95, type: "pattern", concepts: ["oracle", "memory"] },
      { id: "mock-2", content: "Hybrid search combines semantic + keyword matching", score: 0.87, type: "concept" },
    ];
  }

  async learn(pattern: string, concepts?: string[]): Promise<Learning> {
    return { id: "mock-learn-1", pattern, concepts, created_at: new Date().toISOString() };
  }

  async list(_type?: string, _limit?: number): Promise<SearchResult[]> {
    return [
      { id: "mock-list-1", content: "Oracle memory layer pattern", score: 1, type: "pattern" },
      { id: "mock-list-2", content: "Plugin system architecture", score: 1, type: "concept" },
    ];
  }

  async trace(query: string): Promise<TraceResult> {
    return { query, chain: ["oracle", "memory", "pattern"], related: await this.search(query) };
  }

  async read(_file: string): Promise<string> {
    return "# Mock file content\n\nThis is a mock response from MockBackend.";
  }

  async concepts(): Promise<string[]> {
    return ["oracle", "memory", "pattern", "plugin", "search", "learn"];
  }

  async stats(): Promise<Record<string, unknown>> {
    return { total: 42, patterns: 12, concepts: 6, backend: "mock" };
  }
}

export class RealBackend implements BackendClient {
  constructor(private baseUrl: string) {}

  private async post<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/${tool}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Backend error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async search(query: string): Promise<SearchResult[]> {
    return this.post("arra_search", { query });
  }

  async learn(pattern: string, concepts?: string[]): Promise<Learning> {
    return this.post("arra_learn", { pattern, concepts });
  }

  async list(type?: string, limit?: number): Promise<SearchResult[]> {
    return this.post("arra_list", { type, limit });
  }

  async trace(query: string): Promise<TraceResult> {
    return this.post("arra_trace", { query });
  }

  async read(file: string): Promise<string> {
    return this.post("arra_read", { file });
  }

  async concepts(): Promise<string[]> {
    return this.post("arra_concepts", {});
  }

  async stats(): Promise<Record<string, unknown>> {
    return this.post("arra_stats", {});
  }
}

let _client: BackendClient | null = null;

export function createBackendClient(): BackendClient {
  // Check env var first
  const envUrl = import.meta.env.PUBLIC_BACKEND_URL;
  if (envUrl) return new RealBackend(envUrl);

  // Check ?api= query param in browser context
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const apiUrl = params.get("api");
    if (apiUrl) return new RealBackend(apiUrl);
  }

  return new MockBackend();
}

export function getBackendClient(): BackendClient {
  if (!_client) _client = createBackendClient();
  return _client;
}
