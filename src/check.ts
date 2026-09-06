/**
 * 検査の本体。
 *
 * 方針は README のとおり「誤検出を出さない」。判断がつかないものは黙って通す。
 * 各指摘には出典 URL を付ける。根拠を示せない指摘は書かない。
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parseFrontmatter, str } from "./frontmatter.ts";
import type { Finding, Result } from "./report.ts";
import {
  DEPRECATED_SETTINGS, HANDLER_REQUIRED, HOOK_EVENTS,
  IF_EVENTS, MCP_REQUIRED, NO_MATCHER_EVENTS, PATH_RULE_IGNORED, SRC,
} from "./rules.ts";
import {
  GLOBAL_CONFIG_ONLY, MANAGED_ONLY, USER_LOCAL_OR_MANAGED, USER_OR_MANAGED,
} from "./scopes.ts";

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

/** JSON の行番号つき読み取り。strict JSON なので `//` と末尾カンマは構文エラー。 */
function parseJsonWithLine(text: string): { data: unknown } | { error: string; line?: number } {
  try {
    return { data: JSON.parse(text) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /position (\d+)/.exec(msg);
    const line = m ? text.slice(0, Number(m[1])).split("\n").length : undefined;
    return { error: msg, line };
  }
}

/** 何行目にそのキーが書かれているかを素朴に探す。見つからなければ undefined。 */
function lineOf(text: string, key: string): number | undefined {
  const lines = text.split("\n");
  const needle = `"${key}"`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return undefined;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/* --------------------------------------------------- .claude/agents/*.md */

async function checkAgents(root: string, out: Finding[], checked: string[]): Promise<void> {
  const dir = join(root, ".claude", "agents");
  if (!(await exists(dir))) return;

  const seen = new Map<string, string>();   // name -> 先に見つけたファイル
  const walk = async (d: string): Promise<string[]> => {
    const found: string[] = [];
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) found.push(...await walk(p));
      else if (e.name.endsWith(".md")) found.push(p);
    }
    return found;
  };

  for (const path of (await walk(dir)).sort()) {
    const rel = relative(root, path).split(sep).join("/");
    checked.push(rel);
    const text = await readFile(path, "utf8");
    const fm = parseFrontmatter(text);

    if (!fm.present) {
      // 1 行目が `---` でないケースを、他と区別して伝える
      const looksLikeFm = text.includes("\n---\n") || text.trimStart().startsWith("---");
      out.push({
        severity: looksLikeFm ? "error" : "warn",
        file: rel,
        message: looksLikeFm
          ? "The frontmatter was not recognised. Check that the opening `---` is the first line of the file and that it is closed."
          : "No frontmatter. This file is treated as a document, not a subagent.",
        because: `Frontmatter is read only when the opening \`---\` is the file's first line: ${SRC.agents}`,
      });
      continue;
    }

    const name = str(fm, "name");
    const description = str(fm, "description");

    if (name === undefined) {
      out.push({
        severity: "warn", file: rel,
        message: "No `name`. This file is not loaded as a subagent; it is treated as a document.",
        because: `A file without a name is treated as a document: ${SRC.agents}`,
      });
    } else {
      if (name.includes(":") || name.startsWith("-")) {
        out.push({
          severity: "error", file: rel, line: fm.entries.get("name")?.line,
          message: `\`name: ${name}\` is not loaded. A name containing \`:\` or starting with \`-\` is invalid.`,
          because: `A name starting with \`-\` or containing \`:\` makes Claude Code skip the whole file: ${SRC.agents}`,
        });
      }
      if (description === undefined) {
        out.push({
          severity: "error", file: rel, line: fm.endLine,
          message: "`name` is present but `description` is missing. This file is skipped.",
          because: `A file with a name but no description is skipped: ${SRC.agents}`,
        });
      }
      const prev = seen.get(name);
      if (prev) {
        out.push({
          severity: "error", file: rel, line: fm.entries.get("name")?.line,
          message: `\`name: ${name}\` is also used by ${prev}, `
            + `which means only one of the two is ever loaded.`,
          because: `Duplicate names leave the choice to an undocumented filesystem read order: ${SRC.agents}`,
        });
      } else {
        seen.set(name, rel);
      }
    }

    if (fm.entries.has("cacheTtl")) {
      out.push({
        severity: "error", file: rel, line: fm.entries.get("cacheTtl")?.line,
        message: "`cacheTtl` goes inside the `experimental` map, not at the top level of the frontmatter.",
        because: `cacheTtl belongs inside the experimental map: ${SRC.agents}`,
      });
    }
  }
}

/* ------------------------------------------------------------- .mcp.json */

function checkMcpServers(
  servers: Record<string, unknown>, rel: string, text: string, out: Finding[],
): void {
  for (const [name, conf] of Object.entries(servers)) {
    if (!isObj(conf)) continue;
    const line = lineOf(text, name);
    const type = typeof conf.type === "string" ? conf.type : undefined;

    if (conf.url !== undefined && type === undefined) {
      out.push({
        severity: "error", file: rel, line,
        message: `Server "${name}" has a \`url\` but no \`type\`. `
          + `Add \`"type": "http"\` (or "sse" / "ws").`,
        because: `An entry with no type is read as a stdio server, so a url-only entry is a configuration error and the server is skipped: ${SRC.mcp}`,
      });
      continue;
    }
    const required = MCP_REQUIRED[type ?? "stdio"];
    if (required && conf[required] === undefined) {
      out.push({
        severity: "error", file: rel, line,
        message: `Server "${name}" (type: ${type ?? "stdio"}) is missing the required \`${required}\``,
        because: `Required fields per transport: ${SRC.mcp}`,
      });
    }
    if (type === "sse") {
      out.push({
        severity: "warn", file: rel, line,
        message: `Server "${name}" uses the deprecated \`sse\` transport. Use \`http\` where available.`,
        because: `The SSE transport is deprecated: ${SRC.mcp}`,
      });
    }
    if (typeof conf.timeout === "number" && conf.timeout < 1000) {
      out.push({
        severity: "warn", file: rel, line,
        message: `Server "${name}": \`timeout: ${conf.timeout}\` is in milliseconds; values below 1000 are ignored.`,
        because: `timeout is in milliseconds and anything under 1000 is ignored, falling through to MCP_TOOL_TIMEOUT: ${SRC.mcp}`,
      });
    }
  }
}

/* ------------------------------------------------------------------ hooks */

function checkHooks(hooks: unknown, rel: string, text: string, out: Finding[]): void {
  if (!isObj(hooks)) return;

  for (const [event, groups] of Object.entries(hooks)) {
    const evLine = lineOf(text, event);
    if (!HOOK_EVENTS.has(event)) {
      out.push({
        severity: "warn", file: rel, line: evLine,
        message: `\`${event}\` is not a known hook event name. This entry is skipped.`,
        because: `An unknown hook event name causes that entry alone to be skipped: ${SRC.settings}`,
      });
      continue;
    }
    if (!Array.isArray(groups)) continue;

    for (const group of groups) {
      if (!isObj(group)) continue;

      if (group.matcher !== undefined && NO_MATCHER_EVENTS.has(event)) {
        out.push({
          severity: "warn", file: rel, line: evLine,
          message: `\`${event}\` does not support matchers. This \`matcher\` is silently ignored.`,
          because: `A matcher on an event without matcher support is silently ignored: ${SRC.hooks}`,
        });
      }
      // mcp__server だけの matcher は完全一致で比較されるので何にもマッチしない
      if (typeof group.matcher === "string"
          && /^mcp__[A-Za-z0-9_-]+$/.test(group.matcher)
          && !group.matcher.includes(".*")) {
        out.push({
          severity: "error", file: rel, line: evLine,
          message: `matcher \`${group.matcher}\` matches no tool. `
            + `\`${group.matcher}__.*\` is required — the \`.*\` is not optional.`,
          because: `A matcher with no special characters is compared as an exact string, so mcp__<server> alone matches nothing: ${SRC.hooks}`,
        });
      }

      const handlers = Array.isArray(group.hooks) ? group.hooks : [];
      for (const h of handlers) {
        if (!isObj(h)) continue;
        const type = typeof h.type === "string" ? h.type : undefined;
        if (type === undefined || !(type in HANDLER_REQUIRED)) {
          out.push({
            severity: "error", file: rel, line: evLine,
            message: `${event} handler has a \`type\` of `
              + `${type ? `\`${type}\`` : "(missing)"}. `
              + `It must be one of command / http / mcp_tool / prompt / agent.`,
            because: `A handler type is one of five values: ${SRC.hooks}`,
          });
          continue;
        }
        for (const field of HANDLER_REQUIRED[type]) {
          if (h[field] === undefined) {
            out.push({
              severity: "error", file: rel, line: evLine,
              message: `The ${event} \`type: ${type}\` handler is missing the required \`${field}\``,
              because: `Required fields per handler type: ${SRC.hooks}`,
            });
          }
        }
        if (h.if !== undefined && !IF_EVENTS.has(event)) {
          out.push({
            severity: "error", file: rel, line: evLine,
            message: `\`${event}\` does not evaluate \`if\`. This handler never runs.`,
            because: `if is evaluated only on tool events: ${SRC.hooks}`,
          });
        }
      }
    }
  }
}

/* -------------------------------------------------------- settings.json */

function checkPermissions(perms: unknown, rel: string, text: string, out: Finding[]): void {
  if (!isObj(perms)) return;

  for (const key of ["allow", "ask", "deny"] as const) {
    const rules = perms[key];
    if (!Array.isArray(rules)) continue;
    for (const rule of rules) {
      if (typeof rule !== "string") continue;
      const line = lineOf(text, rule) ?? lineOf(text, key);
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/.exec(rule);

      if (m && PATH_RULE_IGNORED.has(m[1])) {
        out.push({
          severity: "warn", file: rel, line,
          message: `\`${rule}\` is accepted but never consulted. `
            + `File path rules apply only to \`Read(...)\` and \`Edit(...)\`.`,
          because: `A path rule on Write / NotebookEdit / Glob / MultiEdit is never consulted and warns at startup: ${SRC.permissions}`,
        });
      }
      if (key === "allow" && rule.startsWith("mcp__") && m) {
        out.push({
          severity: "error", file: rel, line,
          message: `\`${rule}\` is skipped at load time. An allow rule for mcp__ cannot use parentheses.`,
          because: `When a settings file is loaded, any mcp__ rule with parentheses is skipped: ${SRC.permissions}`,
        });
      }
      if (key === "allow" && !rule.startsWith("mcp__") && /^[A-Za-z_]*\*/.test(rule)) {
        out.push({
          severity: "warn", file: rel, line,
          message: `\`${rule}\` is an unanchored allow glob and is skipped with a warning.`,
          because: `An unanchored allow glob is skipped with a warning and auto-approves nothing: ${SRC.permissions}`,
        });
      }
    }
  }

  const mode = perms.defaultMode;
  if (typeof mode === "string" && (mode === "auto" || mode === "bypassPermissions")
      && (rel.includes(".claude/settings"))) {
    out.push({
      severity: "warn", file: rel, line: lineOf(text, "defaultMode"),
      message: `\`defaultMode: ${mode}\` does not take effect from project or local settings.`,
      because: `auto and bypassPermissions do not take effect from project or local settings: ${SRC.settingsRef}`,
    });
  }
}

/**
 * 設定オブジェクトを `sandbox.network.strictAllowlist` のような**点つなぎの名前**に潰す。
 *
 * ドキュメントの表がその形で書いてあるので、こちらも合わせないと当たらない。
 * 実際 `sandbox.*` の8件は、上の階層しか見ていなかったので1件も出ていなかった。
 *
 * 配列には降りない（`permissions.allow` の中身はキーではない）。
 * 上の階層が当たったらそこで止める（`policyHelper` と `policyHelper.path` を
 * 二重に出さないため）。
 */
function flatKeys(data: Record<string, unknown>, hit: (name: string) => boolean,
                  prefix = ""): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(data)) {
    const name = prefix ? `${prefix}.${key}` : key;
    out.push([name, value]);
    if (isObj(value) && !hit(name)) out.push(...flatKeys(value, hit, name));
  }
  return out;
}

/**
 * このファイルがどのスコープとして読まれるか。
 *
 * `~/.claude/settings.json` は**ユーザ設定**であって、プロジェクト設定ではない。
 * パスの見た目は同じなので、`root` がホームかどうかで分ける。
 * ここを分けないと、ユーザ設定に `autoMode` を書いた人へ
 * 「効きません」と嘘をつくことになる。**1件出た時点で読まれなくなる。**
 */
type Scope = "user" | "project" | "local";

function scopeOf(rel: string, root: string): Scope | undefined {
  if (!rel.includes(".claude/settings")) return undefined;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home && resolve(root) === resolve(home)) return "user";
  return rel.includes("settings.local.json") ? "local" : "project";
}

function checkSettings(data: unknown, rel: string, text: string, out: Finding[],
                       root: string): void {
  if (!isObj(data)) return;
  const scope = scopeOf(rel, root);

  // どのスコープからも効かないもの / このスコープからは効かないものを分けて見る。
  // `User, local, or managed` は **local からは効く**ので、project のときだけ出す
  const blocked = (name: string): string | undefined => {
    if (GLOBAL_CONFIG_ONLY.has(name)) return "`~/.claude.json` only";
    if (scope === undefined || scope === "user") {
      return MANAGED_ONLY.has(name) ? "managed settings only" : undefined;
    }
    if (MANAGED_ONLY.has(name)) return "managed settings only";
    if (USER_OR_MANAGED.has(name)) return "user or managed settings only";
    if (scope === "project" && USER_LOCAL_OR_MANAGED.has(name)) {
      return "user, local, or managed settings only";
    }
    return undefined;
  };

  for (const [key, value] of flatKeys(data, (n) => blocked(n) !== undefined)) {
    const where = blocked(key);
    if (where !== undefined) {
      out.push({
        severity: "warn", file: rel, line: lineOf(text, key.split(".").pop() as string),
        message: `\`${key}\` applies from ${where}. It has no effect from this file.`,
        because: `The scope column of the settings table says where each key applies: ${SRC.settingsRef}`,
      });
    }
  }

  for (const [key, value] of Object.entries(data)) {
    const line = lineOf(text, key);

    const replacement = DEPRECATED_SETTINGS[key];
    if (replacement) {
      const dead = key === "disableArtifact" && value === false;
      out.push({
        severity: dead ? "warn" : "warn", file: rel, line,
        message: dead
          ? "`disableArtifact: false` is ignored entirely. Use `enableArtifact`."
          : `\`${key}\` is deprecated. Use ${replacement} instead.`,
        because: `Deprecated keys and their replacements: ${SRC.settingsRef}`,
      });
    }
  }

  if (isObj(data.env)) {
    for (const [k, v] of Object.entries(data.env)) {
      if (typeof v !== "string") {
        out.push({
          severity: "error", file: rel, line: lineOf(text, k),
          message: `\`env.${k}\` is a ${typeof v}. Environment variable values must be strings (e.g. "1").`,
          because: `env maps variable names to string values: ${SRC.settingsRef}`,
        });
      }
    }
  }

  checkPermissions(data.permissions, rel, text, out);
  checkHooks(data.hooks, rel, text, out);
}

/* ------------------------------------------------------------------ 入口 */

export async function check(root: string): Promise<Result> {
  const out: Finding[] = [];
  const checked: string[] = [];

  const jsonTargets = [
    join(root, ".claude", "settings.json"),
    join(root, ".claude", "settings.local.json"),
    join(root, ".mcp.json"),
  ];

  for (const path of jsonTargets) {
    if (!(await exists(path))) continue;
    const rel = relative(root, path).split(sep).join("/");
    checked.push(rel);
    const text = await readFile(path, "utf8");
    const parsed = parseJsonWithLine(text);

    if ("error" in parsed) {
      out.push({
        severity: "error", file: rel, line: parsed.line,
        message: `Cannot be parsed as JSON: ${parsed.error}`,
        because: `Settings files are strict JSON: a \`//\` comment or a trailing comma is a syntax error: ${SRC.settings}`,
      });
      continue;
    }
    if (rel.endsWith(".mcp.json")) {
      const servers = isObj(parsed.data) ? parsed.data.mcpServers : undefined;
      if (isObj(servers)) checkMcpServers(servers, rel, text, out);
    } else {
      checkSettings(parsed.data, rel, text, out, root);
    }
  }

  await checkAgents(root, out, checked);
  return { findings: out, checked };
}
