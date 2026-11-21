import { API_METHODS } from "../api/catalog.js";
import type { ApiMethod } from "../api/types.js";

const PRIMITIVES: Record<string, string> = {
  String: "string",
  Integer: "number",
  Float: "number",
  Boolean: "boolean",
  "Integer or String": "number | string",
  InputFile: "never",
};

function tsType(docType: string): string {
  if (docType.startsWith("Array of ")) return `${tsType(docType.slice("Array of ".length))}[]`;
  return PRIMITIVES[docType] ?? "Record<string, unknown>";
}

function paramsType(method: ApiMethod): string {
  const fields = method.params
    .filter((param) => param.name !== "idempotency_key")
    .map((param) => `    ${param.name}${param.required ? "" : "?"}: ${tsType(param.type)};`);
  return fields.length === 0 ? "{}" : `{\n${fields.join("\n")}\n  }`;
}

/** Compact one-line signature used by tg_search output. */
export function signature(method: ApiMethod): string {
  const params = method.params
    .filter((param) => param.name !== "idempotency_key")
    .map((param) => `${param.name}${param.required ? "" : "?"}: ${tsType(param.type)}`);
  return `${method.name}({ ${params.join("; ")} })`;
}

/** TypeScript declarations for the tg namespace inside tg_execute. */
export function buildSdkDts(): string {
  const declarations = API_METHODS.filter((method) => !method.deprecated)
    .map((method) => {
      const doc = method.description.replace(/\*\//g, "*\\/");
      return `  /**\n   * ${doc}\n   *\n   * Returns: ${method.returns}\n   */\n  ${method.name}(params${method.params.some((p) => p.required) ? "" : "?"}: ${paramsType(method)}): Promise<any>;`;
    })
    .join("\n\n");

  return `/**
 * Type declarations for the \`tg\` object available inside tg_execute.
 *
 * Calls are executed sequentially. Write methods only work when the server runs
 * with TG_ADS_MODE=write and TG_ADS_CODE_MODE=write, and tg_execute is called
 * with confirm: true.
 *
 * @example
 * const ads = await tg.getAdsList({ limit: 100 });
 * const active = ads.ads.filter((ad) => ad.status === "active");
 * return active.map((ad) => ({ id: ad.ad_id, title: ad.title, spent: ad.spent_budget }));
 */
declare const tg: {
${declarations}
};

declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
`;
}

export interface MethodMatch {
  name: string;
  description: string;
  write: boolean;
  returns: string;
  signature: string;
}

export function searchMethods(query: string, limit: number, write?: boolean): MethodMatch[] {
  const needle = query.trim().toLowerCase();
  const scored: Array<{ score: number; method: ApiMethod }> = [];

  for (const method of API_METHODS) {
    if (method.deprecated) continue;
    if (write !== undefined && method.write !== write) continue;

    if (!needle) {
      scored.push({ score: 0, method });
      continue;
    }

    const name = method.name.toLowerCase();
    let score = 0;
    if (name === needle) score = 100;
    else if (name.includes(needle)) score = 60;
    else if (method.description.toLowerCase().includes(needle)) score = 30;
    else if (method.params.some((param) => param.name.includes(needle))) score = 15;

    if (score > 0) scored.push({ score, method });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.method.name.localeCompare(b.method.name))
    .slice(0, limit)
    .map(({ method }) => ({
      name: method.name,
      description: method.description,
      write: method.write,
      returns: method.returns,
      signature: signature(method),
    }));
}
