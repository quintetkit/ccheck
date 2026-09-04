/**
 * 検査の本体。
 *
 * 方針は README のとおり「誤検出を出さない」。判断がつかないものは黙って通す。
 * 各指摘には出典 URL を付ける。根拠を示せない指摘は書かない。
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseFrontmatter, str } from "./frontmatter.ts";
import type { Finding, Result } from "./report.ts";
import {
  DEPRECATED_SETTINGS, GLOBAL_CONFIG_ONLY, HANDLER_REQUIRED, HOOK_EVENTS,
  IF_EVENTS, MANAGED_ONLY, MCP_REQUIRED, NO_MATCHER_EVENTS, PATH_RULE_IGNORED, SRC,
} from "./rules.ts";

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
          ? "frontmatter が認識されません。開始の `---` がファイルの1行目にあり、閉じの `---` があるか確認してください"
          : "frontmatter がありません。このファイルはサブエージェントではなく、ただの文書として扱われます",
        because: `開始の \`---\` が1行目にあるときだけ frontmatter として読まれる: ${SRC.agents}`,
      });
      continue;
    }

    const name = str(fm, "name");
    const description = str(fm, "description");

    if (name === undefined) {
      out.push({
        severity: "warn", file: rel,
        message: "`name` がありません。サブエージェントとして読み込まれず、文書として扱われます",
        because: `name の無いファイルは文書扱いになる: ${SRC.agents}`,
      });
    } else {
      if (name.includes(":") || name.startsWith("-")) {
        out.push({
          severity: "error", file: rel, line: fm.entries.get("name")?.line,
          message: `\`name: ${name}\` は読み込まれません。\`:\` を含む名前と \`-\` で始まる名前は無効です`,
          because: `\`-\` で始まるか \`:\` を含む name はファイルごとスキップされる: ${SRC.agents}`,
        });
      }
      if (description === undefined) {
        out.push({
          severity: "error", file: rel, line: fm.endLine,
          message: "`name` はありますが `description` がありません。このファイルはスキップされます",
          because: `name があって description が無いファイルはスキップされる: ${SRC.agents}`,
        });
      }
      const prev = seen.get(name);
      if (prev) {
        out.push({
          severity: "error", file: rel, line: fm.entries.get("name")?.line,
          message: `\`name: ${name}\` が ${prev} と重複しています。どちらか一方しか読み込まれません`,
          because: `name が重複すると、文書化されていないファイル読み取り順で1つだけが読まれる: ${SRC.agents}`,
        });
      } else {
        seen.set(name, rel);
      }
    }

    if (fm.entries.has("cacheTtl")) {
      out.push({
        severity: "error", file: rel, line: fm.entries.get("cacheTtl")?.line,
        message: "`cacheTtl` は frontmatter の直下ではなく `experimental` の中に書きます",
        because: `cacheTtl は experimental マップの中に書く: ${SRC.agents}`,
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
        message: `サーバ "${name}" に \`url\` がありますが \`type\` がありません。`
          + `\`"type": "http"\`（または "sse" / "ws"）を足してください`,
        because: `type の無いエントリは stdio として読まれるため、url だけの指定は設定エラーになりサーバは読み込まれない: ${SRC.mcp}`,
      });
      continue;
    }
    const required = MCP_REQUIRED[type ?? "stdio"];
    if (required && conf[required] === undefined) {
      out.push({
        severity: "error", file: rel, line,
        message: `サーバ "${name}"（type: ${type ?? "stdio"}）に必須の \`${required}\` がありません`,
        because: `トランスポートごとの必須フィールド: ${SRC.mcp}`,
      });
    }
    if (type === "sse") {
      out.push({
        severity: "warn", file: rel, line,
        message: `サーバ "${name}" の \`sse\` は非推奨です。可能なら \`http\` を使ってください`,
        because: `SSE トランスポートは非推奨: ${SRC.mcp}`,
      });
    }
    if (typeof conf.timeout === "number" && conf.timeout < 1000) {
      out.push({
        severity: "warn", file: rel, line,
        message: `サーバ "${name}" の \`timeout: ${conf.timeout}\` はミリ秒として扱われ、1000 未満は無視されます`,
        because: `timeout はミリ秒。1000 未満は無視され MCP_TOOL_TIMEOUT にフォールバックする: ${SRC.mcp}`,
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
        message: `\`${event}\` は既知のフックイベント名ではありません。この項目は読み飛ばされます`,
        because: `未知のフックイベント名はその項目だけが読み飛ばされる: ${SRC.settings}`,
      });
      continue;
    }
    if (!Array.isArray(groups)) continue;

    for (const group of groups) {
      if (!isObj(group)) continue;

      if (group.matcher !== undefined && NO_MATCHER_EVENTS.has(event)) {
        out.push({
          severity: "warn", file: rel, line: evLine,
          message: `\`${event}\` は matcher に対応していません。この \`matcher\` は黙って無視されます`,
          because: `matcher 非対応のイベントに matcher を書いても無視される: ${SRC.hooks}`,
        });
      }
      // mcp__server だけの matcher は完全一致で比較されるので何にもマッチしない
      if (typeof group.matcher === "string"
          && /^mcp__[A-Za-z0-9_-]+$/.test(group.matcher)
          && !group.matcher.includes(".*")) {
        out.push({
          severity: "error", file: rel, line: evLine,
          message: `matcher \`${group.matcher}\` は何にもマッチしません。`
            + `\`${group.matcher}__.*\` のように \`.*\` が必要です`,
          because: `記号を含まない matcher は完全一致で比較されるため、mcp__<server> だけでは一致するツールが無い: ${SRC.hooks}`,
        });
      }

      const handlers = Array.isArray(group.hooks) ? group.hooks : [];
      for (const h of handlers) {
        if (!isObj(h)) continue;
        const type = typeof h.type === "string" ? h.type : undefined;
        if (type === undefined || !(type in HANDLER_REQUIRED)) {
          out.push({
            severity: "error", file: rel, line: evLine,
            message: `${event} のハンドラの \`type\` が ${type ? `\`${type}\`` : "未指定"} です。`
              + `command / http / mcp_tool / prompt / agent のいずれかにしてください`,
            because: `ハンドラの type は5種類: ${SRC.hooks}`,
          });
          continue;
        }
        for (const field of HANDLER_REQUIRED[type]) {
          if (h[field] === undefined) {
            out.push({
              severity: "error", file: rel, line: evLine,
              message: `${event} の \`type: ${type}\` ハンドラに必須の \`${field}\` がありません`,
              because: `type ごとの必須フィールド: ${SRC.hooks}`,
            });
          }
        }
        if (h.if !== undefined && !IF_EVENTS.has(event)) {
          out.push({
            severity: "error", file: rel, line: evLine,
            message: `\`${event}\` では \`if\` が評価されません。このハンドラは決して実行されません`,
            because: `if が評価されるのはツール系イベントのみ: ${SRC.hooks}`,
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
          message: `\`${rule}\` は受理されますが参照されません。`
            + `ファイルパスの規則は \`Read(...)\` と \`Edit(...)\` にだけ効きます`,
          because: `Write / NotebookEdit / Glob / MultiEdit にパス規則を書いても参照されず、起動時に警告が出る: ${SRC.permissions}`,
        });
      }
      if (key === "allow" && rule.startsWith("mcp__") && m) {
        out.push({
          severity: "error", file: rel, line,
          message: `\`${rule}\` は読み込み時に読み飛ばされます。allow の mcp__ 規則に括弧は使えません`,
          because: `設定ファイルの読み込み時、括弧を持つ mcp__ 規則は読み飛ばされる: ${SRC.permissions}`,
        });
      }
      if (key === "allow" && !rule.startsWith("mcp__") && /^[A-Za-z_]*\*/.test(rule)) {
        out.push({
          severity: "warn", file: rel, line,
          message: `\`${rule}\` のような先頭が固定されていない allow の指定は、警告つきで読み飛ばされます`,
          because: `アンカーの無い allow の glob は警告付きでスキップされ、何も自動承認しない: ${SRC.permissions}`,
        });
      }
    }
  }

  const mode = perms.defaultMode;
  if (typeof mode === "string" && (mode === "auto" || mode === "bypassPermissions")
      && (rel.includes(".claude/settings"))) {
    out.push({
      severity: "warn", file: rel, line: lineOf(text, "defaultMode"),
      message: `\`defaultMode: ${mode}\` はプロジェクト設定・ローカル設定からは効きません`,
      because: `auto と bypassPermissions はプロジェクト/ローカル設定からは有効にならない: ${SRC.settingsRef}`,
    });
  }
}

function checkSettings(data: unknown, rel: string, text: string, out: Finding[]): void {
  if (!isObj(data)) return;
  const project = rel.includes(".claude/settings");

  for (const [key, value] of Object.entries(data)) {
    const line = lineOf(text, key);

    const replacement = DEPRECATED_SETTINGS[key];
    if (replacement) {
      const dead = key === "disableArtifact" && value === false;
      out.push({
        severity: dead ? "warn" : "warn", file: rel, line,
        message: dead
          ? "`disableArtifact: false` は完全に無視されます。`enableArtifact` を使ってください"
          : `\`${key}\` は非推奨です。${replacement} を使ってください`,
        because: `非推奨キーと置き換え先: ${SRC.settingsRef}`,
      });
    }
    if (project && MANAGED_ONLY.has(key)) {
      out.push({
        severity: "warn", file: rel, line,
        message: `\`${key}\` は組織の管理設定でのみ有効です。このファイルからは効きません`,
        because: `管理設定スコープのキーは共有ファイルからは適用されない: ${SRC.settings}`,
      });
    }
    if (GLOBAL_CONFIG_ONLY.has(key)) {
      out.push({
        severity: "warn", file: rel, line,
        message: `\`${key}\` は \`~/.claude.json\` にのみ書けます。このファイルからは効きません`,
        because: `Global config スコープのキー: ${SRC.settingsRef}`,
      });
    }
  }

  if (isObj(data.env)) {
    for (const [k, v] of Object.entries(data.env)) {
      if (typeof v !== "string") {
        out.push({
          severity: "error", file: rel, line: lineOf(text, k),
          message: `\`env.${k}\` の値が ${typeof v} です。環境変数の値は文字列で書きます（例: "1"）`,
          because: `env は変数名から文字列への対応表: ${SRC.settingsRef}`,
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
        message: `JSON として読めません: ${parsed.error}`,
        because: `設定ファイルは厳密な JSON。\`//\` のコメントや末尾のカンマは構文エラーになる: ${SRC.settings}`,
      });
      continue;
    }
    if (rel.endsWith(".mcp.json")) {
      const servers = isObj(parsed.data) ? parsed.data.mcpServers : undefined;
      if (isObj(servers)) checkMcpServers(servers, rel, text, out);
    } else {
      checkSettings(parsed.data, rel, text, out);
    }
  }

  await checkAgents(root, out, checked);
  return { findings: out, checked };
}
