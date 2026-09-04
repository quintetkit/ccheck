/**
 * 検査結果の型と出力。
 *
 * 誤検出を出さないことを最優先にしているので、深刻度は 2 段階しか持たない。
 * `error`  — ドキュメントで裏が取れた違反。直さないと動かない
 * `warn`   — 動くが、非推奨・将来壊れる書き方
 * 判断がつかないものは、そもそも報告しない（黙って通す）。
 */

export type Severity = "error" | "warn";

export interface Finding {
  severity: Severity;
  /** リポジトリ相対のパス */
  file: string;
  /** 1 始まり。行が特定できないときは省く */
  line?: number;
  /** 何が問題か。1 文 */
  message: string;
  /** なぜそう言えるか。出典 URL を含める */
  because: string;
}

export interface Result {
  findings: Finding[];
  /** 実際に読んだファイル。何も見つけられなかったのか、見て問題が無かったのかを区別する */
  checked: string[];
}

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";

function color(on: boolean, code: string, s: string): string {
  return on ? `${code}${s}${RESET}` : s;
}

/** 人が読む形式。既定。 */
export function formatHuman(r: Result, tty: boolean): string {
  if (r.checked.length === 0) {
    return "Nothing to check. Run this where a .claude/ directory exists.";
  }
  if (r.findings.length === 0) {
    return `No problems (${r.checked.length} files checked)`;
  }

  const lines: string[] = [];
  for (const f of r.findings) {
    const tag = f.severity === "error"
      ? color(tty, RED, "error")
      : color(tty, YELLOW, "warn ");
    const where = f.line ? `${f.file}:${f.line}` : f.file;
    lines.push(`${tag} ${where}`);
    lines.push(`      ${f.message}`);
    lines.push(color(tty, DIM, `      why: ${f.because}`));
    lines.push("");
  }
  const errors = r.findings.filter((f) => f.severity === "error").length;
  const warns = r.findings.length - errors;
  lines.push(`${r.checked.length} files checked. ${errors} error(s), ${warns} warning(s)`);
  return lines.join("\n");
}

/** CI が読む形式。GitHub Actions のアノテーションとして表示される。 */
export function formatGithub(r: Result): string {
  return r.findings
    .map((f) => {
      const level = f.severity === "error" ? "error" : "warning";
      const pos = f.line ? `,line=${f.line}` : "";
      // アノテーションは改行を \n の literal で渡す必要がある
      const msg = `${f.message} / why: ${f.because}`.replace(/\n/g, "%0A");
      return `::${level} file=${f.file}${pos}::${msg}`;
    })
    .join("\n");
}

export function formatJson(r: Result): string {
  return JSON.stringify(r, null, 2);
}

/** error が 1 件でもあれば 1。warn だけなら 0。 */
export function exitCode(r: Result): number {
  return r.findings.some((f) => f.severity === "error") ? 1 : 0;
}
