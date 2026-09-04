#!/usr/bin/env node
/**
 * ccheck — .claude/ の設定を検査する。
 *
 *   node src/cli.ts [path] [--format human|github|json] [--strict]
 *
 * 終了コード: error があれば 1、そうでなければ 0。
 * --strict を付けると warn でも 1 を返す（CI を止めたい場合）。
 */
import { check } from "./check.ts";
import { exitCode, formatGithub, formatHuman, formatJson } from "./report.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string): boolean => args.includes(`--${name}`);

if (has("help")) {
  console.log(`ccheck — .claude/ の設定を検査する

  ccheck [ディレクトリ] [オプション]

オプション:
  --format human|github|json  出力形式（既定: human。CI では github が読みやすい）
  --strict                    warn でも終了コードを 1 にする
  --help                      これ

指摘には必ず出典を付けています。根拠を示せないものは報告しません。`);
  process.exit(0);
}

const root = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--format")
  ?? ".";

const result = await check(root);
const format = flag("format") ?? (process.env.GITHUB_ACTIONS === "true" ? "github" : "human");

switch (format) {
  case "github": {
    const s = formatGithub(result);
    if (s) console.log(s);
    console.log(formatHuman(result, false));
    break;
  }
  case "json":
    console.log(formatJson(result));
    break;
  default:
    console.log(formatHuman(result, process.stdout.isTTY));
}

const code = exitCode(result);
process.exit(has("strict") && result.findings.length > 0 ? 1 : code);
