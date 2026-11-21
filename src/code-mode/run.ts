import {
  getQuickJS,
  type QuickJSContext,
  type QuickJSDeferredPromise,
  type QuickJSHandle,
} from "quickjs-emscripten";
import type { Params } from "../api/client.js";
import { API_METHODS } from "../api/catalog.js";

export interface CodeRunOptions {
  code: string;
  call: (method: string, params: Params) => Promise<unknown>;
  allowWrite: boolean;
  isWrite: (method: string) => boolean;
  maxCalls?: number;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface CodeRunResult {
  ok: boolean;
  result?: unknown;
  logs: string[];
  calls: Array<{ method: string; duration_ms: number; ok: boolean }>;
  duration_ms: number;
  error?: string;
}

const PRELUDE = `
(() => {
  const host = globalThis.__host;
  const log = globalThis.__log;
  delete globalThis.__host;
  delete globalThis.__log;

  const tg = {};
  for (const name of Object.keys(host)) {
    tg[name] = async (params) =>
      JSON.parse(await host[name](name, JSON.stringify(params === undefined ? {} : params)));
  }
  globalThis.tg = tg;

  const format = (value) => {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  const write = (level) => (...args) =>
    log((level ? level + " " : "") + args.map(format).join(" ").slice(0, 2000));
  globalThis.console = { log: write(""), warn: write("[warn]"), error: write("[error]") };
})();
`;

function looksLikeFunction(code: string): boolean {
  return /^\s*(async\s+)?(\(|function\b|[A-Za-z_$][\w$]*\s*=>)/.test(code);
}

function wrapCode(code: string): string {
  return looksLikeFunction(code) ? `(${code})()` : `(async () => {\n${code}\n})()`;
}

function errorMessage(context: QuickJSContext, handle: QuickJSHandle): string {
  const dumped: unknown = context.dump(handle);
  if (dumped instanceof Error) return dumped.message;
  if (dumped && typeof dumped === "object" && "message" in dumped) {
    const message = (dumped as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return String(dumped);
}

/**
 * Executes model-written JavaScript inside QuickJS (WebAssembly), with no
 * filesystem, network, process or environment access. The only capability is
 * the `tg` object, whose calls are bridged back to the host through deferred
 * promises. API calls run one at a time, in script order.
 */
export async function runCode(options: CodeRunOptions): Promise<CodeRunResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const deadline = started + timeoutMs;
  const maxCalls = options.maxCalls ?? 25;
  const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024;
  const logs: string[] = [];
  const calls: CodeRunResult["calls"] = [];
  const module = await getQuickJS();
  const context = module.newContext();

  const failed = (error: string): CodeRunResult => ({
    ok: false,
    error,
    logs,
    calls,
    duration_ms: Date.now() - started,
  });

  try {
    context.runtime.setMemoryLimit(64 * 1024 * 1024);
    context.runtime.setMaxStackSize(1024 * 1024);
    context.runtime.setInterruptHandler(() => Date.now() > deadline);

    interface PendingCall {
      deferred: QuickJSDeferredPromise;
      method: string;
      params: Params;
    }
    const queue: PendingCall[] = [];
    let callCount = 0;

    const rejected = (message: string): QuickJSHandle => {
      const promise = context.newPromise();
      const error = context.newError(new Error(message));
      promise.reject(error);
      error.dispose();
      const handle = promise.handle.dup();
      promise.dispose();
      return handle;
    };

    const callHandle = context.newFunction(
      "__call",
      (methodHandle: QuickJSHandle, paramsHandle: QuickJSHandle) => {
        const method = context.getString(methodHandle);

        if (callCount >= maxCalls) {
          return rejected(`Call limit reached (${maxCalls}). Reduce the number of API calls.`);
        }
        if (Date.now() > deadline) {
          return rejected("Execution deadline reached.");
        }
        if (options.isWrite(method) && !options.allowWrite) {
          return rejected(
            `${method} changes state, but Code Mode is read-only. ` +
              "Set TG_ADS_CODE_MODE=write and pass confirm: true to allow writes.",
          );
        }

        let params: Params;
        try {
          const parsed: unknown = JSON.parse(context.getString(paramsHandle));
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return rejected(`${method} expects a plain object of parameters.`);
          }
          params = parsed as Params;
        } catch {
          return rejected(`${method} expects a plain object of parameters.`);
        }

        callCount += 1;
        const deferred = context.newPromise();
        queue.push({ deferred, method, params });
        return deferred.handle.dup();
      },
    );

    const logHandle = context.newFunction("__log", (messageHandle: QuickJSHandle) => {
      if (logs.length < 200) logs.push(context.getString(messageHandle));
    });

    const hostHandle = context.newObject();
    for (const method of API_METHODS) {
      if (method.deprecated) continue;
      context.setProp(hostHandle, method.name, callHandle);
    }

    context.setProp(context.global, "__host", hostHandle);
    context.setProp(context.global, "__log", logHandle);
    hostHandle.dispose();
    callHandle.dispose();
    logHandle.dispose();

    const prelude = context.evalCode(PRELUDE);
    context.unwrapResult(prelude).dispose();

    const evaluation = context.evalCode(wrapCode(options.code), "tg-execute.js");
    if (evaluation.error) {
      const message = errorMessage(context, evaluation.error);
      evaluation.error.dispose();
      return failed(message);
    }

    const handle = context.unwrapResult(evaluation);
    try {
      // Alternate between host API calls and guest microtasks. Every guest
      // await is backed by a deferred promise resolved from this loop.
      for (;;) {
        const next = queue.shift();
        if (next) {
          const callStarted = Date.now();
          try {
            const value = await options.call(next.method, next.params);
            const serialized = context.newString(JSON.stringify(value ?? null));
            next.deferred.resolve(serialized);
            serialized.dispose();
            calls.push({ method: next.method, duration_ms: Date.now() - callStarted, ok: true });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const errorHandle = context.newError(new Error(message));
            next.deferred.reject(errorHandle);
            errorHandle.dispose();
            calls.push({ method: next.method, duration_ms: Date.now() - callStarted, ok: false });
          }
          next.deferred.dispose();
          continue;
        }

        const jobs = context.runtime.executePendingJobs();
        if (jobs.error) {
          const message = errorMessage(context, jobs.error);
          jobs.error.dispose();
          return failed(message);
        }
        if (jobs.value === 0) break;
      }

      const state = context.getPromiseState(handle);
      if (state.type === "pending") {
        return failed("Script returned a promise that never settled.");
      }
      if (state.type === "rejected") {
        const message = errorMessage(context, state.error);
        state.error.dispose();
        return failed(message);
      }

      const value = context.dump(state.value);
      state.value.dispose();
      let serialized: string;
      try {
        serialized = JSON.stringify(value ?? null);
      } catch {
        serialized = String(value);
      }
      if (serialized.length > maxOutputBytes) {
        return failed(
          `Result is ${serialized.length} bytes, above the ${maxOutputBytes} byte limit. ` +
            "Filter or aggregate inside the script and return a smaller object.",
        );
      }

      return {
        ok: true,
        result: value,
        logs,
        calls,
        duration_ms: Date.now() - started,
      };
    } finally {
      handle.dispose();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failed(
      message.includes("interrupted") ? `Execution exceeded the ${timeoutMs} ms limit.` : message,
    );
  } finally {
    context.dispose();
  }
}
