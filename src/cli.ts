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
  // 指摘は英語で出るので、ヘルプも英語に揃える。
  // npm と Marketplace に出す以上、既定は英語のほうが届く
  console.log(`ccheck - lint your .claude/ configuration

  ccheck [directory] [options]

Options:
  --format human|github|json  output format (default: human; github reads better in CI)
  --strict                    exit 1 on warnings too
  --help                      this

Every finding cites the documentation that says so. A rule that cannot be
cited is not written, because a checker that guesses stops being read.`);
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
