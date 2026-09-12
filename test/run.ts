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
  { file: ".claude/settings.json", contains: "allowManagedHooksOnly" },
  { file: ".claude/settings.json", contains: "autoMode" },
  { file: ".claude/settings.json", contains: "useAutoModeDuringPlan" },
  // 入れ子。点つなぎの名前で当てないと、`sandbox.*` の8件は1件も出ない
  { file: ".claude/settings.json", contains: "sandbox.network.strictAllowlist" },
  { file: ".claude/agents/e.md", contains: "tools: *" },
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

// **実物**。出荷している `.claude/` の写しで、テストのために書かれたものではない。
// 数日のあいだ `tools: *` が入っていて、当時の規則では通っていた。
//
// ここが落ちたら、意味は2つのどちらか。
//  - 出荷している設定に本当に問題ができた → **設定を直す。fixture ではない**
//  - 実物に対して誤検出が出るようになった
// どちらも赤にする価値がある。
// 由来は test/fixtures/PROVENANCE.md に書いてある
{
  const captured = await check(F + "captured-quartet");
  if (captured.findings.length === 0) pass++;
  else {
    fail++;
    console.log(`  NG 実物の設定に ${captured.findings.length} 件`);
    for (const f of captured.findings) console.log(`     ${f.file}: ${f.message}`);
  }
}

const clean = await check(F + "clean");
if (clean.findings.length === 0) pass++;
else {
  fail++;
  console.log(`  NG 正しい設定に ${clean.findings.length} `);
  for (const f of clean.findings) console.log(`     ${f.file}: ${f.message}`);
}

// `~/.claude/settings.json` は**ユーザ設定**。同じ内容でも、そこでは正しい。
// root がホームのときに「効きません」と出したら嘘になる。
{
  const home = process.env.HOME;
  process.env.HOME = F + "clean-as-home";
  const asHome = await check(F + "clean-as-home");
  process.env.HOME = home;
  const wrong = asHome.findings.filter((f) => f.message.includes("has no effect"));
  if (wrong.length === 0) pass++;
  else {
    fail++;
    console.log(`  NG ユーザ設定に ${wrong.length} 件のスコープ指摘`);
    for (const f of wrong) console.log(`     ${f.file}: ${f.message}`);
  }
}

// 権限ルールの表は、**ドキュメントに載っている例そのもの**で確かめる。
// ここは誤検出がいちばん出やすい場所で、正しい書き方を「壊れている」と言ったら終わり
{
  // リポジトリの中に作る。**システムの一時ディレクトリは書けないことがある**
  // （サンドボックスで EACCES になった）
  const { mkdir, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");

  // [ルール, 指摘が出るべきか]
  const cases: Array<[string, boolean]> = [
    // 出てはいけないもの（ドキュメントの「こう書く」例）
    ["Bash(npm run build)", false],
    ["Bash(npm run *)", false],
    ["Bash(git log *)", false],
    ["Bash(ls *)", false],
    ["Bash(ls*)", false],
    ["Bash(ls:*)", false],
    ["Bash(rm *)", false],
    ["Read(./.env)", false],
    ["Read(./src/**/*.ts)", false],
    ["WebFetch(domain:example.com)", false],
    ["Bash(run_in_background:true)", false],
    // 出るべきもの
    ["Bash(git * main)", true],       // `*` のうしろにまだ字が続く
    ["Bash(* --version)", true],
    ["Bash(command:rm *)", true],     // 本体の入力はパラメータ指定できない
    ["Read(file_path:./x)", true],
    ["WebFetch(url:https://x)", true],
    ["Bash(git:* push)", true],       // `:*` は末尾でだけ効く
  ];

  const dir = join(F, ".tmp-perm");
  await rm(dir, { recursive: true, force: true });
  for (const [rule, want] of cases) {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(join(dir, ".claude", "settings.json"),
      JSON.stringify({ permissions: { allow: [rule] } }, null, 2));
    const r = await check(dir);
    const got = r.findings.some((f) => f.message.includes(rule));
    if (got === want) pass++;
    else {
      fail++;
      console.log(`  NG ${rule}: ${want ? "出るべきなのに出ない" : "出てはいけないのに出た"}`);
      for (const f of r.findings) console.log(`     ${f.message}`);
    }
  }
  await rm(dir, { recursive: true, force: true });
}

// パスの deny と、任意のスクリプトを起動できる allow の同居。
//
// **dev.to の読者からの指摘で入れた規則。** 元の提案は「sandbox が無効なら
// 警告する」だったが、ccheck はプロジェクトの設定ファイルしか読まない。
// sandbox はユーザ設定にも管理設定にも書けるので、**見えないものについて
// 「無効だ」とは言えない。** 同じファイルの中だけで決まる形に絞ってある。
//
// ここは誤検出がいちばん怖い。**deny があるだけでは出してはいけない。**
{
  const { mkdir, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");

  // [permissions, 指摘が出るべきか, 説明]
  const cases: Array<[Record<string, string[]>, boolean, string]> = [
    // 出てはいけないもの
    [{ deny: ["Edit(src/generated/**)"] }, false, "deny だけ。逃げ道が無い"],
    [{ deny: ["Edit(src/generated/**)"], allow: ["Bash(npm run *)"] },
      false, "npm は出典が名指ししていない"],
    [{ deny: ["Edit(src/generated/**)"], allow: ["Bash(git commit *)"] },
      false, "ただのコマンド"],
    [{ allow: ["Bash(python *)"] }, false, "パスの deny が無い"],
    [{ deny: ["Bash(rm *)"], allow: ["Bash(python *)"] },
      false, "deny がパスではない"],
    [{ deny: ["Edit(x/**)"], allow: ["Bash(git log --format=node *)"] },
      false, "先頭の語ではない node には反応しない"],
    // 出るべきもの
    [{ deny: ["Edit(src/generated/**)"], allow: ["Bash(python *)"] },
      true, "python を許している"],
    [{ deny: ["Read(.env)"], allow: ["Bash(node *)"] },
      true, "node を許している"],
    [{ deny: ["Read(.env)"], allow: ["Bash(/usr/bin/python3 *)"] },
      true, "絶対パスでも語は python3"],
  ];

  const dir = join(F, ".tmp-deny");
  await rm(dir, { recursive: true, force: true });
  for (const [perms, want, why] of cases) {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(join(dir, ".claude", "settings.json"),
      JSON.stringify({ permissions: perms }, null, 2));
    const r = await check(dir);
    const got = r.findings.some((f) => f.message.includes("not covered by the path deny"));
    if (got === want) pass++;
    else {
      fail++;
      console.log(`  NG ${why}: ${want ? "出るべきなのに出ない" : "出てはいけないのに出た"}`);
      for (const f of r.findings) console.log(`     ${f.message}`);
    }
  }
  await rm(dir, { recursive: true, force: true });
}

console.log(`\n  ${pass} passed / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
