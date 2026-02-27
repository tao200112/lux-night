import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  /** Epoch ms when the current window resets */
  resetAtMs: number;
  key: string;
};

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowMs: number;
  /** Include route pathname in key (default true) */
  includeRoute?: boolean;
  /** Override env RATE_LIMIT_STRICT; when true both userId AND IP buckets are checked */
  strict?: boolean;
};

export type RateLimitContext = {
  userId?: string;
  route?: string;
  /** Extra key segment (e.g. Stripe event.id for webhook dedup) */
  extraKey?: string;
};

// ---------------------------------------------------------------------------
// Pre-defined policies
// ---------------------------------------------------------------------------

export const rateLimitPolicies = {
  /** Anonymous / IP pre-gate applied before any auth or body parsing */
  publicBurst: {
    name: 'public_burst',
    limit: 60,
    windowMs: 60_000,
    includeRoute: true,
    strict: true,
  } satisfies RateLimitPolicy,

  loginOrInviteRedeem: {
    name: 'login_invite',
    limit: 5,
    windowMs: 60_000,
    includeRoute: true,
  } satisfies RateLimitPolicy,

  checkinStrict: {
    name: 'checkin',
    limit: 30,
    windowMs: 60_000,
    includeRoute: true,
  } satisfies RateLimitPolicy,

  adminExportStrict: {
    name: 'admin_export',
    limit: 5,
    windowMs: 10 * 60_000,
    includeRoute: true,
    strict: false,
  } satisfies RateLimitPolicy,

  /** Stripe webhook dedup: 1 per event.id per 24h */
  webhookStripeEvent: {
    name: 'stripe_event',
    limit: 1,
    windowMs: 24 * 60 * 60_000,
    includeRoute: false,
    strict: false,
  } satisfies RateLimitPolicy,

  sensitivePost: {
    name: 'sensitive_post',
    limit: 20,
    windowMs: 60_000,
    includeRoute: true,
  } satisfies RateLimitPolicy,

  checkout: {
    name: 'checkout',
    limit: 10,
    windowMs: 60_000,
    includeRoute: true,
  } satisfies RateLimitPolicy,
} as const;

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function envBool(name: string, defaultValue: boolean): boolean {
  const v = (process.env?.[name] ?? '').toString().trim().toLowerCase();
  if (!v) return defaultValue;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  return defaultValue;
}

function getPrefix(): string {
  return (process.env?.RATE_LIMIT_PREFIX ?? 'luxnight').toString().trim() || 'luxnight';
}

function isEnabled(): boolean {
  return envBool('RATE_LIMIT_ENABLED', true);
}

function isStrictDefault(): boolean {
  return envBool('RATE_LIMIT_STRICT', true);
}

function isProd(): boolean {
  return (process.env?.NODE_ENV ?? '').toString() === 'production';
}

// ---------------------------------------------------------------------------
// IP extraction
// ---------------------------------------------------------------------------

export function getRequestIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return '0.0.0.0';
}

// ---------------------------------------------------------------------------
// Route normalization (short hash to avoid overly long Redis keys)
// ---------------------------------------------------------------------------

function hashRoute(pathname: string): string {
  return createHash('sha1').update(pathname).digest('hex').slice(0, 10);
}

function getRoute(req: Request): string {
  try {
    return new URL(req.url).pathname || '/';
  } catch {
    return '/';
  }
}

// ---------------------------------------------------------------------------
// Upstash REST helpers
// ---------------------------------------------------------------------------

function nowMs(): number {
  return Date.now();
}

function makeMember(ts: number): string {
  return `${ts}:${Math.random().toString(36).slice(2)}`;
}

type UpstashConfig = { url: string; token: string };

function getUpstashConfig(): UpstashConfig | null {
  const url = process.env?.UPSTASH_REDIS_REST_URL?.toString().trim() ?? '';
  const token = process.env?.UPSTASH_REDIS_REST_TOKEN?.toString().trim() ?? '';
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

async function upstashPipeline(
  cfg: UpstashConfig,
  commands: Array<Array<string | number>>,
): Promise<any[]> {
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`UPSTASH_HTTP_${res.status}: ${text}`);
  }
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error('UPSTASH_INVALID_RESPONSE');
  return json;
}

function parsePipelineResult<T = unknown>(entry: any): T {
  if (entry?.error) throw new Error(entry.error);
  return entry?.result as T;
}

// ---------------------------------------------------------------------------
// Dev in-memory fallback (fixed window, only for NODE_ENV=development)
// ---------------------------------------------------------------------------

const devMemory = new Map<string, { count: number; resetAt: number }>();

async function devFixedWindow(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitDecision> {
  const now = nowMs();
  const existing = devMemory.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    devMemory.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAtMs: resetAt, key };
  }
  existing.count += 1;
  devMemory.set(key, existing);
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    resetAtMs: existing.resetAt,
    key,
  };
}

// ---------------------------------------------------------------------------
// Sliding window (Upstash sorted set)
// ---------------------------------------------------------------------------

async function slidingWindow(
  cfg: UpstashConfig,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitDecision> {
  const now = nowMs();
  const start = now - windowMs;
  const member = makeMember(now);
  const cmds: Array<Array<string | number>> = [
    ['ZREMRANGEBYSCORE', key, 0, start],
    ['ZADD', key, now, member],
    ['ZCARD', key],
    ['PEXPIRE', key, windowMs],
    ['PTTL', key],
  ];
  const out = await upstashPipeline(cfg, cmds);
  const count = Number(parsePipelineResult(out[2]));
  const ttl = Number(parsePipelineResult(out[4]));
  const resetAt = now + (ttl > 0 ? ttl : windowMs);
  const allowed = count <= limit;
  const remaining = allowed ? Math.max(0, limit - count) : 0;
  return { allowed, remaining, resetAtMs: resetAt, key };
}

// ---------------------------------------------------------------------------
// Public API: headers helper
// ---------------------------------------------------------------------------

export function rateLimitHeaders(
  policy: RateLimitPolicy,
  decision: RateLimitDecision,
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(policy.limit),
    'X-RateLimit-Remaining': String(Math.max(0, decision.remaining)),
    'X-RateLimit-Reset': String(decision.resetAtMs),
  };
}

/**
 * Merge rate-limit headers onto an existing Response (works for both
 * Response and NextResponse).  Returns the same object for chaining.
 */
export function withRateLimitHeaders<T extends Response>(
  res: T,
  headers: Record<string, string>,
): T {
  for (const [k, v] of Object.entries(headers)) {
    res.headers.set(k, v);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Core: rateLimit
// ---------------------------------------------------------------------------

export async function rateLimit(
  req: Request,
  policy: RateLimitPolicy,
  ctx: RateLimitContext = {},
): Promise<RateLimitDecision> {
  if (!isEnabled()) {
    return { allowed: true, remaining: policy.limit, resetAtMs: nowMs() + policy.windowMs, key: 'disabled' };
  }

  const cfg = getUpstashConfig();
  const strict = policy.strict ?? isStrictDefault();
  const rawRoute = (policy.includeRoute ?? true) ? (ctx.route ?? getRoute(req)) : '';
  const routeSegment = rawRoute ? hashRoute(rawRoute) : '';
  const userId = (ctx.userId ?? 'anon') || 'anon';
  const ip = getRequestIp(req);
  const prefix = getPrefix();

  const base = `${prefix}:${policy.name}${routeSegment ? `:r${routeSegment}` : ''}`;
  const keys: string[] = [];

  if (ctx.extraKey) {
    keys.push(`${base}:xk:${ctx.extraKey}`);
  } else {
    keys.push(`${base}:uid:${userId}`);
    if (strict) {
      keys.push(`${base}:ip:${ip}`);
    }
  }

  if (!cfg) {
    if (isProd()) {
      return { allowed: false, remaining: 0, resetAtMs: nowMs(), key: 'missing_upstash_config' };
    }
    const decisions = await Promise.all(keys.map(k => devFixedWindow(k, policy.limit, policy.windowMs)));
    const allowed = decisions.every(d => d.allowed);
    const remaining = Math.min(...decisions.map(d => d.remaining));
    const resetAtMs = Math.min(...decisions.map(d => d.resetAtMs));
    return { allowed, remaining, resetAtMs, key: decisions.map(d => d.key).join('|') };
  }

  const decisions = await Promise.all(keys.map(k => slidingWindow(cfg, k, policy.limit, policy.windowMs)));
  const allowed = decisions.every(d => d.allowed);
  const remaining = Math.min(...decisions.map(d => d.remaining));
  const resetAtMs = Math.min(...decisions.map(d => d.resetAtMs));
  return { allowed, remaining, resetAtMs, key: decisions.map(d => d.key).join('|') };
}

// ---------------------------------------------------------------------------
// High-level helper: rateLimitOrResponse
// ---------------------------------------------------------------------------

export async function rateLimitOrResponse(
  req: Request,
  policy: RateLimitPolicy,
  ctx: RateLimitContext = {},
): Promise<{ headers: Record<string, string> } | { response: Response }> {
  const decision = await rateLimit(req, policy, ctx);
  const headers = rateLimitHeaders(policy, decision);

  if (decision.key === 'missing_upstash_config') {
    return {
      response: new Response(
        JSON.stringify({ ok: false, error: 'RATE_LIMIT_CONFIG_MISSING', message: 'Upstash Redis not configured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...headers },
        },
      ),
    };
  }

  if (!decision.allowed) {
    return {
      response: new Response(
        JSON.stringify({ ok: false, error: 'RATE_LIMITED', message: 'Too many requests' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...headers },
        },
      ),
    };
  }

  return { headers };
}

// ---------------------------------------------------------------------------
// Webhook-specific helper: returns 200 instead of 429 (avoids Stripe retries)
// ---------------------------------------------------------------------------

export async function rateLimitWebhookOrResponse(
  req: Request,
  policy: RateLimitPolicy,
  ctx: RateLimitContext,
): Promise<{ headers: Record<string, string>; alreadySeen: boolean } | { response: Response }> {
  const decision = await rateLimit(req, policy, ctx);
  const headers = rateLimitHeaders(policy, decision);

  if (decision.key === 'missing_upstash_config') {
    return {
      response: new Response(
        JSON.stringify({ ok: false, error: 'RATE_LIMIT_CONFIG_MISSING', message: 'Upstash Redis not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...headers } },
      ),
    };
  }

  if (!decision.allowed) {
    return { headers, alreadySeen: true };
  }

  return { headers, alreadySeen: false };
}
