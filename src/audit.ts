import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface AuditEvent {
  ts: string;
  tool: string;
  outcome: "ok" | "error";
  duration_ms: number;
  account_id?: string;
  method?: string;
  idempotency_key?: string;
  error?: string;
  params?: unknown;
}

const SENSITIVE_KEYS = new Set([
  "add_phones",
  "remove_phones",
  "phone_number",
  "email",
  "legal_name",
]);

/** Keeps PII and long payloads out of the audit log. */
export function summarizeParams(params: unknown): unknown {
  if (!params || typeof params !== "object") return params;
  if (Array.isArray(params)) return params.map(summarizeParams);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = { count: Array.isArray(value) ? value.length : 1 };
    } else if (key === "text" && typeof value === "string") {
      result[key] = { length: value.length };
    } else if (key === "code" && typeof value === "string") {
      result[key] = { length: value.length };
    } else if (typeof value === "string" && value.length > 200) {
      result[key] = `${value.slice(0, 200)}…`;
    } else if (typeof value === "object" && value !== null) {
      result[key] = summarizeParams(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Optional JSONL audit trail. Disabled unless TG_ADS_AUDIT_LOG is set.
 * Writes are serialised so concurrent tool calls cannot interleave lines.
 */
export class AuditLogger {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path?: string) {}

  get enabled(): boolean {
    return Boolean(this.path);
  }

  record(event: Omit<AuditEvent, "ts">): void {
    if (!this.path) return;
    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`;
    this.queue = this.queue
      .then(async () => {
        await mkdir(dirname(this.path as string), { recursive: true });
        await appendFile(this.path as string, line, "utf8");
      })
      .catch((error: unknown) => {
        process.stderr.write(
          `[telegram-ads-mcp] audit log write failed: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      });
  }

  async flush(): Promise<void> {
    await this.queue;
  }
}
