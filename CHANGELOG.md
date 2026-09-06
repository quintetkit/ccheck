# Changelog

## 1.2.0

### Added: three permission rules that are accepted and then ignored

```
warn  `Bash(command:rm *)` is ignored. `command` is Bash's own content field and
      cannot be matched as a parameter. Write `Bash(rm *)` instead.
warn  `Bash(git:* push)` treats `:` as a literal character. The `:*` form is
      recognised only at the end of a pattern.
warn  `Bash(git * main)` has a wildcard before the rest of the command, so it
      allows more than it looks like it does.
```

All three are documented as ignored or as a startup warning. The tests run the
exact rule strings from the documentation, including the eleven that must
produce nothing — a permission checker that calls `Read(./src/**/*.ts)` broken
is worse than no checker.

### Deliberately not added: whether a deny/ask rule names a real tool

The documentation says an unknown tool name warns at startup, and that check
needs the current list of tools. All this can hold is a snapshot, so it would
warn on every tool released after it. That is the same reason unknown settings
keys are not checked.


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
