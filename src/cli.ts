#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { TelegramAdsClient } from "./api/client.js";
import { loadConfig } from "./config.js";
import { ConfigError } from "./errors.js";
import { createServer } from "./server.js";
import { SERVER_NAME, VERSION } from "./version.js";

const program = new Command();

program
  .name(SERVER_NAME)
  .description("MCP server for the official Telegram Ads API")
  .version(VERSION, "-v, --version", "Print the version");

program
  .command("serve", { isDefault: true })
  .description("Start the MCP server over stdio")
  .action(async () => {
    const config = loadConfig();
    const { serveStdio } = await import("@modelcontextprotocol/server/stdio");
    const handle = serveStdio(() => createServer({ config }), {
      onerror: (error) => process.stderr.write(`[${SERVER_NAME}] ${error.message}\n`),
    });

    const shutdown = () => {
      void handle.close().finally(() => process.exit(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    process.stderr.write(
      `[${SERVER_NAME}] ready on stdio (mode=${config.mode}, code_mode=${config.codeMode})\n`,
    );
  });

program
  .command("doctor")
  .description("Check configuration and verify the access token against the API")
  .action(async () => {
    const config = loadConfig();
    const client = new TelegramAdsClient({
      token: config.token,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });

    console.log(`${pc.bold("Node")}        ${process.version}`);
    console.log(`${pc.bold("Token")}       ${redact(config.token)}`);
    console.log(`${pc.bold("Mode")}        ${config.mode}`);
    console.log(`${pc.bold("Code Mode")}   ${config.codeMode}`);
    console.log(`${pc.bold("Base URL")}    ${config.baseUrl}`);
    console.log(`${pc.bold("Audit log")}   ${config.auditLog ?? pc.dim("disabled")}`);
    console.log(
      `${pc.bold("Caps")}        cpm=${config.maxCpm ?? "∞"} ad=${config.maxAdBudget ?? "∞"} daily=${
        config.maxDailyBudget ?? "∞"
      }`,
    );

    const account = await client.getCurrentAccount();
    console.log("");
    console.log(pc.green("✓ Connected to the Telegram Ads API"));
    console.log(`  account_id:  ${account.account_id}`);
    console.log(`  title:       ${account.title ?? "—"}`);
    console.log(`  currency:    ${account.currency}`);
    console.log(`  remaining:   ${account.remaining_budget ?? "—"}`);
    console.log(`  ads budget:  ${account.ads_budget ?? "—"}`);
  });

program
  .command("init")
  .description("Write MCP client configuration for local use")
  .option("--client <client...>", "claude-desktop, cursor, opencode, claude-code, codex, or all", [
    "claude-desktop",
  ])
  .option("--token <token>", "Telegram Ads token (defaults to TELEGRAM_ADS_TOKEN)")
  .option("--mode <mode>", "read-only or write", "read-only")
  .option("--code-mode <mode>", "off, read-only or write", "read-only")
  .option(
    "--local <path>",
    "Run a local checkout instead of npx (path to the repository root, must be built)",
  )
  .option("--github", "Launch the GitHub package instead of the npm package", false)
  .option("--print", "Print the configuration instead of writing files", false)
  .action(async (options: InitOptions) => {
    const token = options.token ?? process.env.TELEGRAM_ADS_TOKEN;
    if (!token) {
      throw new ConfigError(
        "Provide --token or set TELEGRAM_ADS_TOKEN. Create a token at https://ads.telegram.org/account/api.",
      );
    }
    if (!["read-only", "write"].includes(options.mode)) {
      throw new ConfigError("--mode must be read-only or write.");
    }
    if (!["off", "read-only", "write"].includes(options.codeMode)) {
      throw new ConfigError("--code-mode must be off, read-only or write.");
    }

    const clients = expandClients(options.client);
    const env = {
      TELEGRAM_ADS_TOKEN: token,
      TG_ADS_MODE: options.mode,
      TG_ADS_CODE_MODE: options.codeMode,
    };

    if (options.local && options.github) {
      throw new ConfigError("Use either --local or --github, not both.");
    }

    let launch: { command: string; args: string[] } = {
      command: "npx",
      args: ["-y", options.github ? GITHUB_PACKAGE : SERVER_NAME],
    };
    if (options.local) {
      const root = resolve(options.local);
      const entry = join(root, "dist", "cli.js");
      try {
        await access(entry);
      } catch {
        throw new ConfigError(`${entry} was not found. Run "npm run build" in ${root} first.`);
      }
      launch = { command: "node", args: [entry] };
    }

    const standardEntry = { ...launch, env };
    const openCodeEntry = {
      type: "local",
      command: [launch.command, ...launch.args],
      environment: env,
      enabled: true,
    };

    for (const client of clients) {
      if (client === "claude-desktop") {
        await writeConfig(
          claudeDesktopPath(),
          (config) => ({
            ...config,
            mcpServers: { ...asObject(config.mcpServers), "telegram-ads": standardEntry },
          }),
          options.print,
        );
      } else if (client === "cursor") {
        await writeConfig(
          join(homedir(), ".cursor", "mcp.json"),
          (config) => ({
            ...config,
            mcpServers: { ...asObject(config.mcpServers), "telegram-ads": standardEntry },
          }),
          options.print,
        );
      } else if (client === "opencode") {
        await writeConfig(
          join(homedir(), ".config", "opencode", "opencode.json"),
          (config) => ({
            ...config,
            mcp: { ...asObject(config.mcp), "telegram-ads": openCodeEntry },
          }),
          options.print,
        );
      } else if (client === "claude-code") {
        console.log(
          `\n${pc.bold("Claude Code")}\n  claude mcp add telegram-ads --scope user \\\n` +
            `    --env TELEGRAM_ADS_TOKEN=<your-token> --env TG_ADS_MODE=${options.mode} \\\n` +
            `    -- ${shellLaunch(launch)}\n`,
        );
      } else if (client === "codex") {
        console.log(
          `\n${pc.bold("Codex")}\n  codex mcp add telegram-ads \\\n` +
            `    --env TELEGRAM_ADS_TOKEN=<your-token> --env TG_ADS_MODE=${options.mode} \\\n` +
            `    -- ${shellLaunch(launch)}\n`,
        );
      }
    }

    if (!options.print) {
      console.log(
        pc.yellow(
          "\nThe token is stored in plain text in the files above. Keep them private and revoke the token if exposed.",
        ),
      );
      console.log(`Restart the client, then ask it to run ${pc.cyan("tg_get_account")}.`);
    }
  });

const GITHUB_PACKAGE = "github:furkankoykiran/telegram-ads-mcp";

interface InitOptions {
  client: string[];
  token?: string;
  mode: string;
  codeMode: string;
  local?: string;
  github: boolean;
  print: boolean;
}

function shellLaunch(launch: { command: string; args: string[] }): string {
  return [launch.command, ...launch.args]
    .map((part) => (/\s/.test(part) ? `"${part}"` : part))
    .join(" ");
}

function expandClients(requested: string[]): string[] {
  const valid = new Set(["claude-desktop", "cursor", "opencode", "claude-code", "codex"]);
  const result = new Set<string>();

  for (const value of requested) {
    if (value === "all") {
      for (const client of valid) result.add(client);
      continue;
    }
    if (!valid.has(value)) {
      throw new ConfigError(`Unknown client "${value}". Use: ${[...valid].join(", ")}, or all.`);
    }
    result.add(value);
  }
  return [...result];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function writeConfig(
  path: string,
  update: (config: Record<string, unknown>) => Record<string, unknown>,
  print: boolean,
): Promise<void> {
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw new ConfigError(`Could not read ${path}: ${(error as Error).message}`);
    }
  }

  const next = update(current);

  if (print) {
    console.log(`\n${pc.bold(path)}\n${JSON.stringify(next, null, 2)}\n`);
    return;
  }

  await mkdir(dirname(path), { recursive: true });
  if (Object.keys(current).length > 0) {
    await copyFile(path, `${path}.bak`);
  }
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`${pc.green("✓")} ${path}`);
}

function claudeDesktopPath(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  return join(homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function redact(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${pc.red("Error:")} ${message}\n`);
  process.exit(1);
});
