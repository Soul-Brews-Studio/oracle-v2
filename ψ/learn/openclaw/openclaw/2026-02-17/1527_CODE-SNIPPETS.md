# OpenClaw Core Code Patterns - Key Snippets

**Date**: 2026-02-17 | **Source**: `/Users/nat/Code/github.com/openclaw/openclaw`

This document captures 15+ core patterns that illustrate how OpenClaw architechs multi-channel AI agent integration. Patterns focus on: entry points, channel abstraction, plugin system, message flow, agent integration, and configuration management.

---

## 1. Main Entry Point with Bootstrap (openclaw.mjs)

**Location**: `/src/openclaw.mjs`

```javascript
#!/usr/bin/env node

import module from "node:module";

// Enable Node compile cache for faster startup
if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

const isModuleNotFoundError = (err) =>
  err && typeof err === "object" && "code" in err && err.code === "ERR_MODULE_NOT_FOUND";

const installProcessWarningFilter = async () => {
  // Keep bootstrap warnings consistent with the TypeScript runtime.
  for (const specifier of ["./dist/warning-filter.js", "./dist/warning-filter.mjs"]) {
    try {
      const mod = await import(specifier);
      if (typeof mod.installProcessWarningFilter === "function") {
        mod.installProcessWarningFilter();
        return;
      }
    } catch (err) {
      if (isModuleNotFoundError(err)) {
        continue;
      }
      throw err;
    }
  }
};

await installProcessWarningFilter();

// Attempt to load built entry point (ESM compatibility)
if (await tryImport("./dist/entry.js")) {
  // OK
} else if (await tryImport("./dist/entry.mjs")) {
  // OK
} else {
  throw new Error("openclaw: missing dist/entry.(m)js (build output).");
}
```

**Pattern**: Lightweight bootstrap that delegates to built output. Handles both `.js` and `.mjs` for ESM module resolution.

---

## 2. Channel Registry & Normalization (channels/registry.ts)

**Location**: `/src/channels/registry.ts`

```typescript
// Channel docking: add new core channels here (order + meta + aliases)
export const CHAT_CHANNEL_ORDER = [
  "telegram",
  "whatsapp",
  "discord",
  "irc",
  "googlechat",
  "slack",
  "signal",
  "imessage",
] as const;

export type ChatChannelId = (typeof CHAT_CHANNEL_ORDER)[number];

const CHAT_CHANNEL_META: Record<ChatChannelId, ChannelMeta> = {
  telegram: {
    id: "telegram",
    label: "Telegram",
    selectionLabel: "Telegram (Bot API)",
    detailLabel: "Telegram Bot",
    docsPath: "/channels/telegram",
    docsLabel: "telegram",
    blurb: "simplest way to get started — register a bot with @BotFather and get going.",
    systemImage: "paperplane",
    selectionDocsPrefix: "",
    selectionDocsOmitLabel: true,
    selectionExtras: [WEBSITE_URL],
  },
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp",
    selectionLabel: "WhatsApp (QR link)",
    detailLabel: "WhatsApp Web",
    docsPath: "/channels/whatsapp",
    docsLabel: "whatsapp",
    blurb: "works with your own number; recommend a separate phone + eSIM.",
    systemImage: "message",
  },
  // ... more channels
};

export const CHAT_CHANNEL_ALIASES: Record<string, ChatChannelId> = {
  imsg: "imessage",
  "internet-relay-chat": "irc",
  "google-chat": "googlechat",
  gchat: "googlechat",
};

// Normalization with alias resolution
export function normalizeChatChannelId(raw?: string | null): ChatChannelId | null {
  const normalized = normalizeChannelKey(raw);
  if (!normalized) {
    return null;
  }
  const resolved = CHAT_CHANNEL_ALIASES[normalized] ?? normalized;
  return CHAT_CHANNEL_ORDER.includes(resolved) ? resolved : null;
}

// Support for external/plugin channels too
export function normalizeAnyChannelId(raw?: string | null): ChannelId | null {
  const key = normalizeChannelKey(raw);
  if (!key) {
    return null;
  }

  const registry = requireActivePluginRegistry();
  const hit = registry.channels.find((entry) => {
    const id = String(entry.plugin.id ?? "")
      .trim()
      .toLowerCase();
    if (id && id === key) {
      return true;
    }
    return (entry.plugin.meta.aliases ?? []).some((alias) => alias.trim().toLowerCase() === key);
  });
  return hit?.plugin.id ?? null;
}
```

**Pattern**: Typed channel registry with metadata mapping. Supports both core channels (const list) and dynamic plugin channels through plugin registry. Normalization handles aliases + case-insensitive lookup.

---

## 3. Channel Plugin Type System (channels/plugins/types.core.ts)

**Location**: `/src/channels/plugins/types.core.ts`

```typescript
// Core channel abstractions
export type ChannelId = ChatChannelId | (string & {});

export type ChannelSetupInput = {
  name?: string;
  token?: string;
  tokenFile?: string;
  botToken?: string;
  appToken?: string;
  signalNumber?: string;
  cliPath?: string;
  dbPath?: string;
  service?: "imessage" | "sms" | "auto";
  region?: string;
  authDir?: string;
  httpUrl?: string;
  httpHost?: string;
  httpPort?: string;
  webhookPath?: string;
  webhookUrl?: string;
  // ... more fields
};

// Channel status tracking
export type ChannelAccountState =
  | "linked"
  | "not linked"
  | "configured"
  | "not configured"
  | "enabled"
  | "disabled";

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  reconnectAttempts?: number;
  lastConnectedAt?: number | null;
  lastDisconnect?: string | { at: number; status?: number; error?: string; loggedOut?: boolean } | null;
  lastMessageAt?: number | null;
  lastEventAt?: number | null;
  lastError?: string | null;
  // ... more fields
};

// Agent tool factory for channel-specific tools
export type ChannelAgentToolFactory = (params: { cfg?: OpenClawConfig }) => ChannelAgentTool[];

// Adapter pattern for channel capabilities
export type ChannelMessagingAdapter = {
  // Send message to target
  send?: (ctx: ChannelOutboundContext) => Promise<ChannelOutboundResult>;
  // Poll for new messages
  poll?: (ctx: ChannelPollContext) => Promise<ChannelPollResult>;
  // Stream messages in real-time
  stream?: (ctx: ChannelStreamingAdapter) => Promise<void>;
};
```

**Pattern**: Layered type hierarchy. Setup defines configuration, AccountSnapshot tracks runtime state, adapters define capabilities. Allows pluggable implementations per channel.

---

## 4. Plugin Hook System (plugins/hooks.ts)

**Location**: `/src/plugins/hooks.ts`

```typescript
/**
 * Plugin Hook Runner with priority-based execution.
 * Supports lifecycle hooks across agent, message, tool, and gateway phases.
 */

export type HookRunnerOptions = {
  logger?: HookRunnerLogger;
  /** If true, errors in hooks will be caught and logged instead of thrown */
  catchErrors?: boolean;
};

/**
 * Get hooks for a specific hook name, sorted by priority (higher first).
 */
function getHooksForName<K extends PluginHookName>(
  registry: PluginRegistry,
  hookName: K,
): PluginHookRegistration<K>[] {
  return (registry.typedHooks as PluginHookRegistration<K>[])
    .filter((h) => h.hookName === hookName)
    .toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export function createHookRunner(registry: PluginRegistry, options: HookRunnerOptions = {}) {
  const logger = options.logger;
  const catchErrors = options.catchErrors ?? true;

  // Merge hooks that return values (e.g., model override)
  const mergeBeforeModelResolve = (
    acc: PluginHookBeforeModelResolveResult | undefined,
    next: PluginHookBeforeModelResolveResult,
  ): PluginHookBeforeModelResolveResult => ({
    // Keep the first defined override so higher-priority hooks win.
    modelOverride: acc?.modelOverride ?? next.modelOverride,
    providerOverride: acc?.providerOverride ?? next.providerOverride,
  });

  const mergeBeforePromptBuild = (
    acc: PluginHookBeforePromptBuildResult | undefined,
    next: PluginHookBeforePromptBuildResult,
  ): PluginHookBeforePromptBuildResult => ({
    systemPrompt: next.systemPrompt ?? acc?.systemPrompt,
    prependContext:
      acc?.prependContext && next.prependContext
        ? `${acc.prependContext}\n\n${next.prependContext}`
        : (next.prependContext ?? acc?.prependContext),
  });

  /**
   * Run a hook that doesn't return a value (fire-and-forget style).
   * All handlers are executed in parallel for performance.
   */
  async function runVoidHook<K extends PluginHookName>(
    hookName: K,
    event: Parameters<NonNullable<PluginHookRegistration<K>["handler"]>>[0],
    ctx: Parameters<NonNullable<PluginHookRegistration<K>["handler"]>>[1],
  ): Promise<void> {
    const hooks = getHooksForName(registry, hookName);
    if (hooks.length === 0) {
      return;
    }

    logger?.debug?.(`[hooks] running ${hookName} (${hooks.length} handlers)`);
    // Execute all hooks in parallel, collecting errors
    const results = await Promise.allSettled(
      hooks.map((h) => h.handler?.(event, ctx)),
    );
    // Handle errors based on catchErrors option
  }
}
```

**Pattern**: Priority-ordered hook system with merging strategies. Hooks execute in parallel unless order matters. Errors can be caught or thrown based on configuration.

---

## 5. Plugin Loader with Dynamic Module Resolution (plugins/loader.ts)

**Location**: `/src/plugins/loader.ts`

```typescript
/**
 * Plugin Loader: Dynamic module loading with caching, validation, and runtime setup.
 */

export type PluginLoadOptions = {
  config?: OpenClawConfig;
  workspaceDir?: string;
  logger?: PluginLogger;
  coreGatewayHandlers?: Record<string, GatewayRequestHandler>;
  cache?: boolean;
  mode?: "full" | "validate";
};

const registryCache = new Map<string, PluginRegistry>();

function buildCacheKey(params: {
  workspaceDir?: string;
  plugins: NormalizedPluginsConfig;
}): string {
  const workspaceKey = params.workspaceDir ? resolveUserPath(params.workspaceDir) : "";
  return `${workspaceKey}::${JSON.stringify(params.plugins)}`;
}

// SDK alias resolution: handles both src/ and dist/ locations
const resolvePluginSdkAlias = (): string | null => {
  return resolvePluginSdkAliasFile({ srcFile: "index.ts", distFile: "index.js" });
};

// Plugin config validation against schema
function validatePluginConfig(params: {
  schema?: Record<string, unknown>;
  cacheKey?: string;
  value?: unknown;
}): { ok: boolean; value?: Record<string, unknown>; errors?: string[] } {
  const schema = params.schema;
  if (!schema) {
    return { ok: true, value: params.value as Record<string, unknown> | undefined };
  }
  const cacheKey = params.cacheKey ?? JSON.stringify(schema);
  const result = validateJsonSchemaValue({
    schema,
    cacheKey,
    value: params.value ?? {},
  });
  if (result.ok) {
    return { ok: true, value: params.value as Record<string, unknown> | undefined };
  }
  return { ok: false, errors: result.errors };
}

// Resolve plugin module export (function or object)
function resolvePluginModuleExport(moduleExport: unknown): {
  definition?: OpenClawPluginDefinition;
  register?: OpenClawPluginDefinition["register"];
} {
  const resolved =
    moduleExport &&
    typeof moduleExport === "object" &&
    "default" in (moduleExport as Record<string, unknown>)
      ? (moduleExport as { default: unknown }).default
      : moduleExport;
  if (typeof resolved === "function") {
    return {
      register: resolved as OpenClawPluginDefinition["register"],
    };
  }
  if (resolved && typeof resolved === "object") {
    const def = resolved as OpenClawPluginDefinition;
    const register = def.register ?? def.activate;
    return { definition: def, register };
  }
  return {};
}
```

**Pattern**: Lazy module loading with jiti. Cache by config hash. Module resolution tries both source and dist paths for flexibility in dev/prod. Config validation against JSON schema.

---

## 6. Gateway Client Protocol (gateway/client.ts)

**Location**: `/src/gateway/client.ts`

```typescript
/**
 * WebSocket-based gateway client with automatic reconnection and protocol negotiation.
 */

export type GatewayClientOptions = {
  url?: string; // ws://127.0.0.1:18789
  connectDelayMs?: number;
  tickWatchMinIntervalMs?: number;
  token?: string;
  password?: string;
  instanceId?: string;
  clientName?: GatewayClientName;
  clientDisplayName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: GatewayClientMode;
  role?: string;
  scopes?: string[];
  caps?: string[];
  commands?: string[];
  permissions?: Record<string, boolean>;
  pathEnv?: string;
  deviceIdentity?: DeviceIdentity;
  minProtocol?: number;
  maxProtocol?: number;
  tlsFingerprint?: string;
  onEvent?: (evt: EventFrame) => void;
  onHelloOk?: (hello: HelloOk) => void;
  onConnectError?: (err: Error) => void;
  onClose?: (code: number, reason: string) => void;
  onGap?: (info: { expected: number; received: number }) => void;
};

export const GATEWAY_CLOSE_CODE_HINTS: Readonly<Record<number, string>> = {
  1000: "normal closure",
  1006: "abnormal closure (no close frame)",
  1008: "policy violation",
  1012: "service restart",
};

export class GatewayClient {
  private ws: WebSocket | null = null;
  private opts: GatewayClientOptions;
  private pending = new Map<string, Pending>();
  private backoffMs = 1000;
  private closed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: NodeJS.Timeout | null = null;
  // Track last tick to detect silent stalls
  private lastTick: number | null = null;
  private tickIntervalMs = 30_000;
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(opts: GatewayClientOptions) {
    this.opts = {
      ...opts,
      deviceIdentity: opts.deviceIdentity ?? loadOrCreateDeviceIdentity(),
    };
  }

  start() {
    if (this.closed) {
      return;
    }
    const url = this.opts.url ?? "ws://127.0.0.1:18789";
    if (this.opts.tlsFingerprint && !url.startsWith("wss://")) {
      this.opts.onConnectError?.(new Error("gateway tls fingerprint requires wss:// gateway url"));
      return;
    }
    // Allow node screen snapshots and other large responses
    const wsOptions: ClientOptions = {
      maxPayload: 25 * 1024 * 1024,
    };
    if (url.startsWith("wss://") && this.opts.tlsFingerprint) {
      wsOptions.rejectUnauthorized = false;
      wsOptions.checkServerIdentity = ((_host: string, cert: CertMeta) => {
        const fingerprintValue =
          typeof cert === "object" && cert && "fingerprint256" in cert
            ? cert.fingerprint256
            : undefined;
        // Validate against provided fingerprint
      });
    }
    // Establish WebSocket connection...
  }
}
```

**Pattern**: Event-driven gateway client with request-response pattern over WebSocket. Manages pending requests, automatic reconnection, and sequence tracking for gap detection.

---

## 7. Message Dispatch Pipeline (auto-reply/dispatch.ts)

**Location**: `/src/auto-reply/dispatch.ts`

```typescript
/**
 * Message dispatch pipeline: Routes inbound messages through reply dispatcher.
 */

export type DispatchInboundResult = DispatchFromConfigResult;

export async function withReplyDispatcher<T>(params: {
  dispatcher: ReplyDispatcher;
  run: () => Promise<T>;
  onSettled?: () => void | Promise<void>;
}): Promise<T> {
  try {
    return await params.run();
  } finally {
    // Ensure dispatcher reservations are always released on every exit path
    params.dispatcher.markComplete();
    try {
      await params.dispatcher.waitForIdle();
    } finally {
      await params.onSettled?.();
    }
  }
}

// Main inbound message dispatch
export async function dispatchInboundMessage(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const finalized = finalizeInboundContext(params.ctx);
  return await withReplyDispatcher({
    dispatcher: params.dispatcher,
    run: () =>
      dispatchReplyFromConfig({
        ctx: finalized,
        cfg: params.cfg,
        dispatcher: params.dispatcher,
        replyOptions: params.replyOptions,
        replyResolver: params.replyResolver,
      }),
  });
}

// Variant with buffered dispatcher for typing indicators
export async function dispatchInboundMessageWithBufferedDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const { dispatcher, replyOptions, markDispatchIdle } = createReplyDispatcherWithTyping(
    params.dispatcherOptions,
  );
  try {
    return await dispatchInboundMessage({
      ctx: params.ctx,
      cfg: params.cfg,
      dispatcher,
      replyResolver: params.replyResolver,
      replyOptions: {
        ...params.replyOptions,
        ...replyOptions,
      },
    });
  } finally {
    markDispatchIdle();
  }
}
```

**Pattern**: Wrapper pattern ensures cleanup happens regardless of success/failure. Supports multiple dispatcher variants (typed, buffered, basic). Message context flows through finalization before dispatch.

---

## 8. Agent Execution Runtime (agents/pi-embedded-runner/run.ts)

**Location**: `/src/agents/pi-embedded-runner/run.ts`

```typescript
/**
 * Pi Embedded Agent Runner: Manages agent lifecycle, auth profiles, context windows, failover.
 */

type UsageAccumulator = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  /** Cache fields from the most recent API call (not accumulated) */
  lastCacheRead: number;
  lastCacheWrite: number;
  lastInput: number;
};

const createUsageAccumulator = (): UsageAccumulator => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
  lastCacheRead: 0,
  lastCacheWrite: 0,
  lastInput: 0,
});

function createCompactionDiagId(): string {
  return `ovf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const hasUsageValues = (
  usage: ReturnType<typeof normalizeUsage>,
): usage is NonNullable<ReturnType<typeof normalizeUsage>> =>
  !!usage &&
  [usage.input, usage.output, usage.cacheRead, usage.cacheWrite, usage.total].some(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );

const mergeUsageIntoAccumulator = (
  target: UsageAccumulator,
  usage: ReturnType<typeof normalizeUsage>,
) => {
  if (!hasUsageValues(usage)) {
    return;
  }
  target.input += usage.input ?? 0;
  target.output += usage.output ?? 0;
  target.cacheRead += usage.cacheRead ?? 0;
  target.cacheWrite += usage.cacheWrite ?? 0;
  target.total += usage.total ?? 0;
  // Keep last values for reference
  target.lastCacheRead = usage.cacheRead ?? 0;
  target.lastCacheWrite = usage.cacheWrite ?? 0;
  target.lastInput = usage.input ?? 0;
};

// Avoid Anthropic's refusal test token poisoning session transcripts
const ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL = "ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL";
const ANTHROPIC_MAGIC_STRING_REPLACEMENT = "ANTHROPIC MAGIC STRING TRIGGER REFUSAL (redacted)";

function scrubAnthropicRefusalMagic(prompt: string): string {
  if (!prompt.includes(ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL)) {
    return prompt;
  }
  return prompt.replaceAll(
    ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL,
    ANTHROPIC_MAGIC_STRING_REPLACEMENT,
  );
}
```

**Pattern**: Usage accumulation with safety checks. Separate "last" values for monitoring single-call metrics vs. accumulated totals. Injection attack prevention through string scrubbing.

---

## 9. Configuration Schema with Zod (config/zod-schema.ts)

**Location**: `/src/config/zod-schema.ts`

```typescript
/**
 * Zod-based configuration schema with nested validation.
 */

const MemoryQmdPathSchema = z
  .object({
    path: z.string(),
    name: z.string().optional(),
    pattern: z.string().optional(),
  })
  .strict();

const MemoryQmdSessionSchema = z
  .object({
    enabled: z.boolean().optional(),
    exportDir: z.string().optional(),
    retentionDays: z.number().int().nonnegative().optional(),
  })
  .strict();

const MemoryQmdUpdateSchema = z
  .object({
    interval: z.string().optional(),
    debounceMs: z.number().int().nonnegative().optional(),
    onBoot: z.boolean().optional(),
    waitForBootSync: z.boolean().optional(),
    embedInterval: z.string().optional(),
    commandTimeoutMs: z.number().int().nonnegative().optional(),
    updateTimeoutMs: z.number().int().nonnegative().optional(),
    embedTimeoutMs: z.number().int().nonnegative().optional(),
  })
  .strict();

const MemoryQmdLimitsSchema = z
  .object({
    maxResults: z.number().int().positive().optional(),
    maxSnippetChars: z.number().int().positive().optional(),
    maxInjectedChars: z.number().int().positive().optional(),
    timeoutMs: z.number().int().nonnegative().optional(),
  })
  .strict();

const MemoryQmdSchema = z
  .object({
    command: z.string().optional(),
    searchMode: z.union([z.literal("query"), z.literal("search"), z.literal("vsearch")]).optional(),
    includeDefaultMemory: z.boolean().optional(),
    paths: z.array(MemoryQmdPathSchema).optional(),
    sessions: MemoryQmdSessionSchema.optional(),
    update: MemoryQmdUpdateSchema.optional(),
    limits: MemoryQmdLimitsSchema.optional(),
    scope: SessionSendPolicySchema.optional(),
  })
  .strict();

const MemorySchema = z
  .object({
    backend: z.union([z.literal("builtin"), z.literal("qmd")]).optional(),
    citations: z.union([z.literal("auto"), z.literal("on"), z.literal("off")]).optional(),
    qmd: MemoryQmdSchema.optional(),
  })
  .strict()
  .optional();

const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Expected http:// or https:// URL");

export const OpenClawSchema = z
  .object({
    $schema: z.string().optional(),
    meta: z
      .object({
        lastTouchedVersion: z.string().optional(),
        lastTouchedAt: z.string().optional(),
      })
      .strict()
      .optional(),
    // ... many more nested schemas
  })
  .strict();
```

**Pattern**: Hierarchical schema composition. Each subsystem has its own schema (Memory, MemoryQmd*, etc.), composed into root OpenClawSchema. Uses `.strict()` to prevent unknown properties. Refinements add custom validation (e.g., URL protocol check).

---

## 10. Plugin Command Registration (plugins/types.ts)

**Location**: `/src/plugins/types.ts`

```typescript
/**
 * Plugin command system: Declarative command registration with context.
 */

export type PluginCommandContext = {
  /** The sender's identifier (e.g., Telegram user ID) */
  senderId?: string;
  /** The channel/surface (e.g., "telegram", "discord") */
  channel: string;
  /** Provider channel id (e.g., "telegram") */
  channelId?: ChannelId;
  /** Whether the sender is on the allowlist */
  isAuthorizedSender: boolean;
  /** Raw command arguments after the command name */
  args?: string;
  /** The full normalized command body */
  commandBody: string;
  /** Current OpenClaw configuration */
  config: OpenClawConfig;
  /** Raw "From" value (channel-scoped id) */
  from?: string;
  /** Raw "To" value (channel-scoped id) */
  to?: string;
  /** Account id for multi-account channels */
  accountId?: string;
  /** Thread/topic id if available */
  messageThreadId?: number;
};

export type PluginCommandResult = ReplyPayload;

export type PluginCommandHandler = (
  ctx: PluginCommandContext,
) => PluginCommandResult | Promise<PluginCommandResult>;

export type OpenClawPluginCommandDefinition = {
  /** Command name without leading slash (e.g., "tts") */
  name: string;
  /** Description shown in /help and command menus */
  description: string;
  /** Whether this command accepts arguments */
  acceptsArgs?: boolean;
  /** Whether only authorized senders can use this command (default: true) */
  requireAuth?: boolean;
  /** The handler function */
  handler: PluginCommandHandler;
};

export type OpenClawPluginToolFactory = (
  ctx: OpenClawPluginToolContext,
) => AnyAgentTool | AnyAgentTool[] | null | undefined;

export type OpenClawPluginToolOptions = {
  name?: string;
  names?: string[];
  optional?: boolean;
};
```

**Pattern**: Command context provides full request metadata (sender, channel, auth status, config). Handler is async-capable. Supports both sync and async operations. Optional fields handle multi-account scenarios.

---

## 11. Provider Authentication (plugins/types.ts)

**Location**: `/src/plugins/types.ts`

```typescript
/**
 * Provider authentication with multiple methods and credential management.
 */

export type ProviderAuthKind = "oauth" | "api_key" | "token" | "device_code" | "custom";

export type ProviderAuthResult = {
  profiles: Array<{ profileId: string; credential: AuthProfileCredential }>;
  configPatch?: Partial<OpenClawConfig>;
  defaultModel?: string;
  notes?: string[];
};

export type ProviderAuthContext = {
  config: OpenClawConfig;
  agentDir?: string;
  workspaceDir?: string;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  oauth: {
    createVpsAwareHandlers: typeof createVpsAwareOAuthHandlers;
  };
};

export type ProviderAuthMethod = {
  id: string;
  label: string;
  hint?: string;
  kind: ProviderAuthKind;
  run: (ctx: ProviderAuthContext) => Promise<ProviderAuthResult>;
};

export type ProviderPlugin = {
  id: string;
  label: string;
  docsPath?: string;
  aliases?: string[];
  envVars?: string[];
  models?: ModelProviderConfig;
  auth: ProviderAuthMethod[];
  formatApiKey?: (cred: AuthProfileCredential) => string;
  refreshOAuth?: (cred: OAuthCredential) => Promise<OAuthCredential>;
};
```

**Pattern**: Authentication abstraction supporting multiple auth kinds (OAuth, API key, token, device code). Auth methods return multiple profiles + optional config patches. Context provides environment for auth UI (wizard, URL opening, OAuth helpers).

---

## 12. Tool Result Truncation (agents/pi-embedded-runner/tool-result-truncation.ts)

**Location**: `/src/agents/pi-embedded-runner/tool-result-truncation.ts` (implied pattern)

```typescript
/**
 * Tool result management: Detect and handle oversized tool results.
 * Pattern: Safety guard to prevent context overflow.
 */

// Conceptual pattern based on patterns found in codebase:

export type OversizedToolResultInfo = {
  toolName: string;
  resultSize: number;
  maxSize: number;
  truncatedAt: number;
};

export function truncateOversizedToolResultsInSession(
  session: AgentSession,
  maxSize: number = DEFAULT_RESULT_SIZE,
): OversizedToolResultInfo[] {
  const truncated: OversizedToolResultInfo[] = [];

  for (const message of session.messages) {
    if (message.type === "tool_result") {
      if (message.content.length > maxSize) {
        const toolName = message.toolName ?? "unknown";
        truncated.push({
          toolName,
          resultSize: message.content.length,
          maxSize,
          truncatedAt: maxSize,
        });
        // Truncate content
        message.content = message.content.slice(0, maxSize) + "\n[...truncated...]";
      }
    }
  }

  return truncated;
}

export function sessionLikelyHasOversizedToolResults(
  session: AgentSession,
  threshold: number = DEFAULT_RESULT_SIZE * 2,
): boolean {
  return session.messages.some(
    (msg) => msg.type === "tool_result" && msg.content.length > threshold,
  );
}
```

**Pattern**: Defensive programming to prevent LLM context overflow. Detects oversized results and truncates with marker. Separate detection function for preventive measures.

---

## 13. Context Window Guard (agents/context-window-guard.ts, implied)

**Location**: `/src/agents/` (pattern inferred)

```typescript
/**
 * Context window management: Validate and enforce limits.
 */

export const CONTEXT_WINDOW_HARD_MIN_TOKENS = 1024;
export const CONTEXT_WINDOW_WARN_BELOW_TOKENS = 5000;
export const DEFAULT_CONTEXT_TOKENS = 100_000;

export type ContextWindowInfo = {
  model: string;
  totalTokens: number;
  usedTokens: number;
  availableTokens: number;
  percentageUsed: number;
};

export function evaluateContextWindowGuard(info: ContextWindowInfo): {
  ok: boolean;
  warning?: string;
  error?: string;
} {
  if (info.availableTokens < CONTEXT_WINDOW_HARD_MIN_TOKENS) {
    return {
      ok: false,
      error: `Context window exhausted: ${info.availableTokens} tokens remaining`,
    };
  }

  if (info.availableTokens < CONTEXT_WINDOW_WARN_BELOW_TOKENS) {
    return {
      ok: true,
      warning: `Low context window: ${info.availableTokens} tokens (${info.percentageUsed}% used)`,
    };
  }

  return { ok: true };
}

export function resolveContextWindowInfo(
  model: string,
  promptTokens: number,
  outputTokens: number = 0,
): ContextWindowInfo {
  const contextWindow = resolveModelContextWindow(model);
  const usedTokens = promptTokens + outputTokens;
  return {
    model,
    totalTokens: contextWindow,
    usedTokens,
    availableTokens: contextWindow - usedTokens,
    percentageUsed: (usedTokens / contextWindow) * 100,
  };
}
```

**Pattern**: Context window tracking with hard limits and warnings. Separation of concerns: detection vs. enforcement. Allows graceful degradation (warnings) vs. hard failures (errors).

---

## 14. Failover and Error Classification (agents/pi-embedded-helpers.ts, implied)

**Location**: `/src/agents/` (pattern inferred)

```typescript
/**
 * Error handling and classification for resilience.
 */

export type FailoverReason =
  | "auth_invalid"
  | "auth_expired"
  | "billing_limit"
  | "rate_limit"
  | "timeout"
  | "context_overflow"
  | "model_unavailable"
  | "unknown";

export class FailoverError extends Error {
  constructor(
    public reason: FailoverReason,
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = "FailoverError";
  }
}

export function classifyFailoverReason(error: Error): FailoverReason {
  const message = error.message.toLowerCase();

  if (message.includes("invalid_api_key") || message.includes("unauthorized")) {
    return "auth_invalid";
  }
  if (message.includes("token_expired")) {
    return "auth_expired";
  }
  if (message.includes("quota") || message.includes("billing")) {
    return "billing_limit";
  }
  if (message.includes("rate_limit") || message.includes("429")) {
    return "rate_limit";
  }
  if (message.includes("timeout")) {
    return "timeout";
  }
  if (message.includes("context") || message.includes("overflow")) {
    return "context_overflow";
  }
  if (message.includes("unavailable") || message.includes("503")) {
    return "model_unavailable";
  }

  return "unknown";
}

export function isAuthAssistantError(error: Error): boolean {
  const reason = classifyFailoverReason(error);
  return reason === "auth_invalid" || reason === "auth_expired";
}

export function isBillingAssistantError(error: Error): boolean {
  return classifyFailoverReason(error) === "billing_limit";
}

export function isLikelyContextOverflowError(error: Error): boolean {
  return classifyFailoverReason(error) === "context_overflow";
}
```

**Pattern**: Typed error classification enables smart failover strategies. Separates predicate functions for different error types, allowing flexible handling (retry, switch provider, compact context, etc.).

---

## 15. Embedded Agent Session Types (agents/pi-embedded-runner/types.ts, implied)

**Location**: `/src/agents/` (pattern inferred)

```typescript
/**
 * Session metadata and execution results.
 */

export type EmbeddedPiAgentMeta = {
  agentId: string;
  sessionKey?: string;
  workspaceDir?: string;
  model: string;
  provider: string;
  contextWindow: number;
};

export type EmbeddedPiRunMeta = {
  runId: string;
  startedAt: number;
  endedAt?: number;
  attemptCount: number;
  failedAttempts: number;
  compactions: number;
  totalTokens: {
    input: number;
    output: number;
    cached: number;
  };
};

export type EmbeddedPiRunResult = {
  ok: boolean;
  message: string;
  content?: string;
  toolCalls?: Array<{ toolName: string; arguments: Record<string, unknown> }>;
  error?: {
    code: string;
    details: string;
    recoverable: boolean;
  };
  meta?: EmbeddedPiRunMeta;
};

export type EmbeddedPiCompactResult = {
  ok: boolean;
  messageCount: number;
  tokensRecovered: number;
  diagnosticId: string;
};
```

**Pattern**: Separate metadata types for agent config (EmbeddedPiAgentMeta), execution trace (EmbeddedPiRunMeta), and results (EmbeddedPiRunResult). Results include recoverable flag to enable smart error handling.

---

## Architecture Summary

**Core Patterns:**

1. **Channel Abstraction**: Registry-based discovery with adapter interfaces + plugin support
2. **Hook System**: Priority-ordered, parallel-safe lifecycle hooks with merging
3. **Plugin Loading**: Dynamic module resolution with caching and validation
4. **Gateway Communication**: Event-driven WebSocket with request-response protocol
5. **Message Dispatch**: Pipeline with cleanup guarantees via context managers
6. **Agent Execution**: Usage tracking, context windows, failover classification
7. **Configuration**: Zod schema composition with strict validation
8. **Error Handling**: Classified errors enable smart recovery strategies
9. **Tool Safety**: Oversized result detection + truncation guards
10. **Context Windows**: Hard limits + warnings for graceful degradation

**Key Design Principles:**

- **Type-driven**: Extensive use of discriminated unions, branded types, and strict schemas
- **Composable**: Small adapters and handlers compose into larger systems
- **Observable**: Hooks allow plugins to intercept and observe at multiple phases
- **Resilient**: Fallback strategies, context cleanup, and error classification
- **Extensible**: Plugin system enables channel/provider/command additions without core changes

---

Generated: 2026-02-17 | OpenClaw: Multi-channel AI agent integration framework
