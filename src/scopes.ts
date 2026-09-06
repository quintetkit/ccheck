/**
 * プロジェクトの `.claude/settings.json` に書いても効かないキー。
 *
 * **このファイルは生成物。** 手で編集しない。
 *   python3 scripts/extract-setting-scopes.py --write
 *
 * 出典は公式ドキュメントの一覧表のスコープ列（2026-09-04 取得のスナップショット）。
 * 手で写していたときは Managed の39件中14件しか入っておらず、
 * `User or managed` の23件は丸ごと抜けていた。**表から機械的に写す。**
 */

/** 管理者が配る設定からのみ効く（スコープ: Managed） — 39 件 */
export const MANAGED_ONLY = new Set([
  "allowAllClaudeAiMcps",
  "allowManagedHooksOnly",
  "allowManagedMcpServersOnly",
  "allowManagedPermissionRulesOnly",
  "allowedChannelPlugins",
  "blockedMarketplaces",
  "browserExternalPageTools",
  "channelsEnabled",
  "claudeMd",
  "disableBrowserExternalNavigation",
  "disableCommandPluginSources",
  "disableDesktopLocalSessions",
  "disableMobileSimulatorTools",
  "disableSideloadFlags",
  "forceLoginGatewayUrl",
  "forceRemoteSettingsRefresh",
  "managedSourcesBehavior",
  "modelPricing",
  "parentSettingsBehavior",
  "pluginSuggestionMarketplaces",
  "pluginTrustMessage",
  "policyHelper",
  "policyHelper.path",
  "policyHelper.refreshIntervalMs",
  "policyHelper.timeoutMs",
  "requiredMaximumVersion",
  "requiredMinimumVersion",
  "sandbox.bwrapPath",
  "sandbox.filesystem.allowManagedReadPathsOnly",
  "sandbox.network.allowManagedDomainsOnly",
  "sandbox.socatPath",
  "sshHostAllowlist",
  "strictKnownMarketplaces",
  "strictPluginOnlyCustomization",
  "strictPluginOnlyCustomization.agents",
  "strictPluginOnlyCustomization.hooks",
  "strictPluginOnlyCustomization.mcp",
  "strictPluginOnlyCustomization.skills",
  "wslInheritsWindowsSettings",
]);

/** ユーザ設定か管理設定からのみ効く（スコープ: User or managed） — 23 件 */
export const USER_OR_MANAGED = new Set([
  "askUserQuestionTimeout",
  "autoContinueAtUsageLimit",
  "autoMode",
  "autoMode.classifyAllShell",
  "desktopSessionCleanupPeriodDays",
  "dialogExpiry",
  "feedbackDrafts",
  "footerLinksRegexes",
  "modelPicker",
  "pluginConfigs",
  "processWrapper",
  "sandbox.allowAppleEvents",
  "sandbox.credentials.allowPlaintextInject",
  "sandbox.credentials.awsPairs",
  "sandbox.credentials.sigv4",
  "sandbox.filesystem.disabled",
  "sandbox.network.strictAllowlist",
  "sandbox.network.tlsTerminate",
  "sandbox.ripgrep",
  "skipAutoPermissionPrompt",
  "spellcheck",
  "sshConfigs",
  "vimInsertModeRemaps",
]);

/** ユーザ / ローカル / 管理設定からのみ効く（スコープ: User, local, or managed） — 3 件 */
export const USER_LOCAL_OR_MANAGED = new Set([
  "skipDangerousModePermissionPrompt",
  "syncClaudeAiSkills",
  "useAutoModeDuringPlan",
]);

/** `~/.claude.json` からのみ効く（スコープ: Global config） — 6 件 */
export const GLOBAL_CONFIG_ONLY = new Set([
  "autoConnectIde",
  "autoInstallIdeExtension",
  "diffTool",
  "externalEditorContext",
  "permissionExplainerEnabled",
  "teammateDefaultModel",
]);
