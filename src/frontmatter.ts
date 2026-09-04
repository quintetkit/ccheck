/**
 * Markdown の frontmatter を読む。
 *
 * YAML の完全な実装は要らない。サブエージェント定義とスラッシュコマンドで
 * 実際に使われる範囲（文字列・配列・真偽値）だけを、行番号つきで読む。
 * 行番号が要るのは、指摘を出すときに「どの行か」を示すため。
 */

export interface Entry {
  value: string | string[];
  /** 1 始まりの行番号 */
  line: number;
}

export interface Frontmatter {
  /** frontmatter が存在したか。無い場合と空の場合を区別する */
  present: boolean;
  entries: Map<string, Entry>;
  /** 本文（frontmatter を除いた残り） */
  body: string;
  /** frontmatter の終端の行番号。ファイル全体を指したいときに使う */
  endLine: number;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return t;
}

function parseValue(raw: string): string | string[] {
  const t = raw.trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((v) => unquote(v));
  }
  return unquote(t);
}

export function parseFrontmatter(text: string): Frontmatter {
  const empty: Frontmatter = { present: false, entries: new Map(), body: text, endLine: 0 };

  // 先頭が `---` の行でなければ frontmatter は無い。BOM は先に落とす。
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = src.split("\n");
  if (lines[0]?.trim() !== "---") return empty;

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) return empty;   // 閉じていない。frontmatter として扱わない

  const entries = new Map<string, Entry>();
  let pendingKey: string | null = null;
  let pendingList: string[] = [];
  let pendingLine = 0;

  const flush = () => {
    if (pendingKey !== null) {
      entries.set(pendingKey, { value: pendingList, line: pendingLine });
      pendingKey = null;
      pendingList = [];
    }
  };

  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;

    // `  - item` 形式の配列
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && pendingKey !== null) {
      pendingList.push(unquote(item[1]));
      continue;
    }
    flush();

    const m = /^([A-Za-z0-9_-]+)\s*:(.*)$/.exec(line);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest.trim() === "") {
      // 次の行から `- item` が続く可能性がある
      pendingKey = key;
      pendingLine = i + 1;
      pendingList = [];
      continue;
    }
    entries.set(key, { value: parseValue(rest), line: i + 1 });
  }
  flush();

  return {
    present: true,
    entries,
    body: lines.slice(end + 1).join("\n"),
    endLine: end + 1,
  };
}

/** 文字列として取り出す。配列だったときは undefined を返す（型の取り違えを検出させる） */
export function str(fm: Frontmatter, key: string): string | undefined {
  const e = fm.entries.get(key);
  return typeof e?.value === "string" ? e.value : undefined;
}

/** 配列として取り出す。`a, b, c` のような文字列も配列として受け取る */
export function list(fm: Frontmatter, key: string): string[] | undefined {
  const e = fm.entries.get(key);
  if (!e) return undefined;
  if (Array.isArray(e.value)) return e.value;
  return e.value.split(",").map((v) => v.trim()).filter((v) => v !== "");
}
