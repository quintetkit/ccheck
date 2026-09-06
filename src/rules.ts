/**
 * 検査ルール。
 *
 * ここに書いてよいのは、**公式ドキュメントに「エラーになる」「スキップされる」
 * 「無視される」と明記されているものだけ**。推測は書かない。
 * 各ルールの `because` に出典を持たせているのはそのため。
 *
 * 原文は docs-snapshot/ に保存してある（2026-09-04 取得）。
 *
 * 意図的に検査しないもの（誤検出になるため）:
 *  - 未知のキー: 公式が「スキーマは最新 CLI に遅れる」と明記している。
 *    新機能を使うたびに誤検出する
 *  - model / availableModels の値: 有効値の網羅リストが未文書化
 *  - Read/Edit のパスパターンの妥当性: アンカー4種 × gitignore 意味論で
 *    誤検出のリスクが高すぎる
 *  - frontmatter の真偽値を true/false に限る: yes/no/on/off/1/0 も有効
 *  - **deny / ask のツール名が実在するか**: 公式は「知らないツール名なら起動時に
 *    警告する」としているが、その判定には最新のツール一覧が要る。
 *    こちらが持てるのはスナップショットだけなので、**新しいツールが増えるたびに
 *    誤検出する。** 未知の設定キーを検査しないのと同じ理由で、これも入れない
 */

const D = "https://code.claude.com/docs/en";

export const SRC = {
  agents: `${D}/sub-agents`,
  hooks: `${D}/hooks`,
  mcp: `${D}/mcp`,
  settings: `${D}/settings`,
  settingsRef: `${D}/settings-reference`,
  permissions: `${D}/permissions`,
  skills: `${D}/slash-commands`,
} as const;

/** hooks の有効なイベント名（hooks ページの見出しから抽出、33 個） */
export const HOOK_EVENTS = new Set([
  "SessionStart", "Setup", "InstructionsLoaded", "UserPromptSubmit",
  "UserPromptExpansion", "MessageDisplay", "PreToolUse", "PermissionRequest",
  "PostToolUse", "PostToolUseFailure", "PostToolBatch", "PermissionDenied",
  "Notification", "SubagentStart", "SubagentStop", "TaskCreated", "TaskCompleted",
  "Stop", "StopFailure", "TeammateIdle", "ConfigChange", "CwdChanged",
  "DirectoryAdded", "FileChanged", "WorktreeCreate", "WorktreeRemove",
  "PreCompact", "PostCompact", "PreModelSwitch", "PostModelSwitch",
  "SessionEnd", "Elicitation", "ElicitationResult",
]);

/** matcher を書いても黙って無視されるイベント */
export const NO_MATCHER_EVENTS = new Set([
  "CwdChanged", "UserPromptSubmit", "PostToolBatch", "Stop", "TeammateIdle",
  "TaskCreated", "TaskCompleted", "WorktreeCreate", "WorktreeRemove", "MessageDisplay",
]);

/** `if` が評価されるイベント。これ以外で `if` を書くとハンドラは決して動かない */
export const IF_EVENTS = new Set([
  "PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "PermissionDenied",
]);

/** ハンドラの type ごとの必須フィールド */
export const HANDLER_REQUIRED: Record<string, string[]> = {
  command: ["command"],
  http: ["url"],
  mcp_tool: ["server", "tool"],
  prompt: ["prompt"],
  agent: ["prompt"],
};

/** 非推奨キー → 置き換え先 */
export const DEPRECATED_SETTINGS: Record<string, string> = {
  ignorePatterns: "permissions.deny",
  includeCoAuthoredBy: "attribution (since v2.0.62)",
  disableArtifact: "enableArtifact",
  voiceEnabled: "voice.enabled (since v2.1.92)",
};

/*
 * スコープごとのキー一覧は `scopes.ts` に移した。
 *
 * ここに手で書いていたときは Managed の39件中14件しか入っておらず、
 * `User or managed` の23件は表ごと見落としていた。
 * **手で写す限り、また抜ける。** いまは表から機械的に生成している。
 */

/** パス指定を書いても参照されないツール（Read / Edit のみが対象） */
export const PATH_RULE_IGNORED = new Set(["Write", "NotebookEdit", "Glob", "MultiEdit"]);

/**
 * ツールの「本体の入力」にあたるフィールド。
 *
 * `Bash(command:rm *)` のような**パラメータ指定は無視され、起動時に警告が出る。**
 * 複合コマンドで抜けられてしまうため、公式が意図的に受け付けない。
 * 書きたいなら `Bash(rm *)` / `Read(./path)` / `WebFetch(domain:host)` の形にする。
 */
export const PRIMARY_FIELD: Record<string, string> = {
  Bash: "command",
  PowerShell: "command",
  Read: "file_path",
  Edit: "file_path",
  Write: "file_path",
  Grep: "path",
  Glob: "path",
  NotebookEdit: "notebook_path",
  WebFetch: "url",
};

/** `*` の前に置くと「その位置の文字列すべて」になるツール（コマンド系） */
export const COMMAND_TOOLS = new Set(["Bash", "PowerShell"]);

/** .mcp.json のトランスポート別の必須フィールド */
export const MCP_REQUIRED: Record<string, string> = {
  stdio: "command",
  http: "url",
  "streamable-http": "url",
  sse: "url",
  ws: "url",
};
