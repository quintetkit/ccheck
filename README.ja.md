# ccheck

`.claude/` の設定を検査し、壊れている箇所と非推奨になった書き方を、
**その根拠になっているドキュメントの行へのリンク付きで**指摘します。

![demo](docs/demo.gif)

Claude Code の設定は週単位で変わります。変更履歴を並べたサイトはいくつもありますが、
**「その変更が自分の設定を壊すか」に答えるものがありません。** 読む人ごとに答えが
違うので、記事や通知では原理的に配信できないからです。だからツールにしました。

## 使う

```bash
npx @quintetkit/ccheck        # リポジトリ直下で
```

実行時の依存はありません。Node 22.18 以降で動きます。

CI に入れる場合:

```yaml
- uses: quintetkit/ccheck@v1
```

## 検査するもの

| 対象 | 見るもの |
|---|---|
| `.claude/settings.json` | JSON の妥当性、非推奨キー、**そのファイルからは効かないキー** |
| 権限ルール | 書けるが無視されるもの: アンカーの無い allow グロブ、参照されないツールへのパス指定、本体の入力へのパラメータ指定、コマンドの途中に置いた `*` |
| `.claude/agents/*.md` | frontmatter の必須項目、名前の重複、無効な名前 |
| `.mcp.json` | トランスポート別の必須項目 |
| hooks 設定 | 存在しないイベント名、何にもマッチしない matcher |

### 書けるが、そこからは効かないキー

設定キーのうち **71 個**は、**管理設定 / ユーザ設定 / `~/.claude.json`** からしか
効きません。プロジェクトの `.claude/settings.json` に書いてもエラーにならず、
起動時の警告も出ません。**ただ何も起きません。**

```
warn  .claude/settings.json:63
      `autoMode` applies from user or managed settings only. It has no effect from this file.
```

一覧は公式の設定表のスコープ列から**機械的に生成**しています。手で写していたときは
Managed の39件中25件が抜けていて、`User or managed` の23件は表ごと落ちていました。

入れ子も見ます。`sandbox.network.strictAllowlist` は、ドキュメントと同じ
**点つなぎの名前**で照合します。

`~/.claude/settings.json` は**ユーザ設定そのもの**なので、そこでは何も出しません。

## あえて検査しないもの

正しい設定を「壊れている」と言う検査は、無いほうがマシです。したがって
**公式ドキュメントが「エラーになる」「スキップされる」「無視される」と
明記しているものだけ**を実装しています。それ以外は黙って通します。

| 検査しないもの | 理由 |
|---|---|
| 未知のキー | 公式が「スキーマは最新の CLI に遅れる」と明記している。やると新機能を使うたびに誤検出する |
| `model` の値 | 有効な値の網羅リストが公開されていない |
| `Read` / `Edit` のパス指定 | アンカー4種と gitignore 式の組み合わせで、誤検出のリスクが高すぎる |
| 真偽値を `true` / `false` に限る | `yes` / `no` / `on` / `off` / `1` / `0` も有効 |

すべての指摘に出典 URL が付きます。ツールの言い分を鵜呑みにせず、
その場で原典を確認できます。

## 出典

`docs-snapshot/` に、根拠にした公式ドキュメントの原文（2026-09-04 取得）があります。
ルールを足すときは、まずそこに該当箇所を探してください。
**「エラーになる」と書かれていないものは、ルールにしません。**

## 終了コード

error が1件でもあれば `1`、なければ `0`。`--strict` を付けると warn でも `1` になります。

## 関連

`ccheck` が見るのは `.claude/` の書き方です。その中に何を書くか
（複数の Claude Code を同時に走らせても衝突しないように、作業をどう分けるか）は
[Quartet](https://github.com/quintetkit/quartet) として MIT で公開しています。
GitHub Issue を軸に、権限を分けた4人格を回す構成です。

hook のイベントごとに、matcher が何に当たるか・`if` がどこで効くかを1枚の表にしました:
[Claude Code の hook イベント一覧](https://quintetkit.github.io/reference/claude-code-hooks.html)。

管理設定・ユーザ設定・`~/.claude.json` からしか効かないキーの一覧はこちらです。
[プロジェクトの設定ファイルでは効かないキー](https://quintetkit.github.io/reference/claude-code-settings-scope.html)。

エラーにならずに読み込まれて、そのまま何もしない権限ルールの一覧もあります。
[書けるのに無視される権限ルール](https://quintetkit.github.io/reference/claude-code-permission-rules.html)。

[scopecheck](https://github.com/quintetkit/scopecheck) は、その一歩手前を見ます。
いま開いている Issue のうち、**どれとどれが同じファイルを宣言していて、
同時に走らせられないか**を出します。

```bash
npx @quintetkit/scopecheck --repo owner/name
```

[sharedfiles](https://github.com/quintetkit/sharedfiles) は git の履歴を読むので、
**宣言が何も要りません。** ほとんどのコミットが触るファイルと、
常に一緒に変わる組を出します。

UI 設計人格・レビュー基準・Issue 単位の並列実行スクリプト・実践ガイド10章を足した
[Quintet は有料](https://quartet-dev.booth.pm/items/8807156)です。

## ライセンス

MIT
