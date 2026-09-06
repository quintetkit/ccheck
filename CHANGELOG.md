# Changelog

## 1.2.0

### Added: keys that are valid but do not apply from the file they are written in

71 settings keys apply only from a **managed**, **user**, or **global config**
file. Writing one into a project's `.claude/settings.json` is not a JSON error
and produces no startup warning. It does nothing at all.

```
warn  .claude/settings.json:63
      `autoMode` applies from user or managed settings only. It has no effect from this file.
```

Three things made this worth doing properly.

**The list is now generated, not typed.** It comes from the scope column of the
official settings table (`scripts/extract-setting-scopes.py` reads the snapshot
in `docs-snapshot/`). Hand-copying had left 25 of the 39 `Managed` keys out, and
the 23 `User or managed` keys out entirely — this was 20 keys covered out of 71.

**Nested keys are matched by their dotted name.** The documentation names them
`sandbox.network.strictAllowlist`, and only the top level was ever inspected, so
all eight `sandbox.*` entries produced nothing. Descent stops as soon as a parent
matches, so `policyHelper` and `policyHelper.path` are not both reported.

**`~/.claude/settings.json` is the user scope.** The path looks identical to a
project file, so the scope is decided by whether the scanned root is the home
directory. Without that, running `ccheck ~` on a real configuration containing
`autoMode` reports a key that is correctly placed — the exact false positive this
tool exists to avoid.

`User, local, or managed` keys are reported from `settings.json` and not from
`settings.local.json`, because they do apply from the latter.

## 1.1.0

- GitHub Action (`quintetkit/ccheck@v1`), `--format github` for CI annotations
- Published to npm as `@quintetkit/ccheck`

## 1.0.0

- Initial release: `.claude/settings.json`, `.claude/agents/*.md`, `.mcp.json`,
  and hooks configuration, with every finding citing the documentation
