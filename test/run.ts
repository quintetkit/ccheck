/**
 * fixtures に対する検査結果を突き合わせる。
 *
 * 壊れた入力で「検出できること」より、**正しい入力で1件も出さないこと**のほうが
 * 重要なので、clean は 0 件を厳密に要求する。
 */
import { check } from "../src/check.ts";

const F = new URL("./fixtures/", import.meta.url).pathname;

interface Expect { file: string; contains: string }

const expected: Expect[] = [
  { file: ".claude/settings.json", contains: "ignorePatterns" },
  { file: ".claude/settings.json", contains: "disableArtifact: false" },
  { file: ".claude/settings.json", contains: "diffTool" },
  { file: ".claude/settings.json", contains: "env.DEBUG" },
  { file: ".claude/settings.json", contains: "Write(src/**)" },
  { file: ".claude/settings.json", contains: "mcp__memory(read)" },
  { file: ".claude/settings.json", contains: "B*" },
  { file: ".claude/settings.json", contains: "defaultMode: bypassPermissions" },
  { file: ".claude/settings.json", contains: "mcp__memory__.*" },
  { file: ".claude/settings.json", contains: "is missing the required `command`" },
  { file: ".claude/settings.json", contains: "CwdChanged" },
  { file: ".claude/settings.json", contains: "SessionStart" },
  { file: ".claude/settings.json", contains: "NotARealEvent" },
  { file: ".mcp.json", contains: "noType" },
  { file: ".mcp.json", contains: "noCmd" },
  { file: ".mcp.json", contains: "oldSse" },
  { file: ".mcp.json", contains: "tinyTime" },
  { file: ".claude/agents/a.md", contains: "bad:name" },
  { file: ".claude/agents/b.md", contains: "description" },
  { file: ".claude/agents/c.md", contains: "is also used by" },
  { file: ".claude/agents/c.md", contains: "cacheTtl" },
  { file: ".claude/agents/d.md", contains: "No frontmatter" },
];

let pass = 0, fail = 0;

const broken = await check(F + "broken");
for (const e of expected) {
  const hit = broken.findings.some((f) => f.file === e.file && f.message.includes(e.contains));
  if (hit) pass++;
  else { fail++; console.log(`  NG 検出されず: ${e.file} / ${e.contains}`); }
}

// すべての指摘に出典が付いているか
for (const f of broken.findings) {
  if (!f.because.includes("https://")) {
    fail++; console.log(`  NG 出典なし: ${f.file} / ${f.message}`);
  } else pass++;
}

const clean = await check(F + "clean");
if (clean.findings.length === 0) pass++;
else {
  fail++;
  console.log(`  NG 正しい設定に ${clean.findings.length} `);
  for (const f of clean.findings) console.log(`     ${f.file}: ${f.message}`);
}

console.log(`\n  ${pass} passed / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
