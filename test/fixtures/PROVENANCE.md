# Where these fixtures came from

A reader of this project pointed out that **fixtures written by the same person
who wrote the implementation share its worldview**, and that coverage can hide a
failure for exactly that reason. They suggested making provenance part of the
test design. This file is that.

| Fixture | Provenance | What it is for |
|---|---|---|
| `broken/` | **Synthetic.** Written to trip specific documented rules | Each rule fires at least once |
| `clean/` | **Synthetic.** Written to be correct, including forms the author does not personally write | **Zero findings, strictly.** The false-positive guard |
| `clean-as-home/` | **Synthetic.** Shaped like a user-scope `~/.claude/` | Scope-dependent rules must not fire on the user's own file |
| `captured-quartet/` | **Captured.** A copy of the `.claude/` this project actually ships in [quartet](https://github.com/quintetkit/quartet) | Real input, not written for a test |

## Why the captured one matters

`captured-quartet/` was not written to exercise anything. It is configuration
that shipped to real users, written months before this linter existed.

**It contained a real defect for several days**: `tools: *` on the coder persona,
which is not a documented pattern — an entry resolving to nothing makes Claude
Code refuse to launch the subagent. The linter passed it, because the rule that
would have caught it did not exist yet.

So the expectation for this fixture is **zero findings**, and a failure here
means one of two things:

- **The shipped configuration now has a real problem.** Go fix the
  configuration, not the fixture
- A rule started producing a false positive on real input

Both are worth a red build.

## The cost, stated plainly

A captured fixture is a snapshot. It does not follow the upstream repository, so
it drifts, and it can start failing for a reason that is not a bug in this tool
— a key that upstream deprecates, for instance.

That is the maintenance cost, and it is real. It is accepted here because the
alternative is a suite in which **every input was written by the person who
wrote the rules.**

The live version of this check lives in quartet's own CI, which runs
`ccheck . --strict` against the working tree on every push. This fixture is the
pinned copy, so this suite keeps a real-world shape even when that repository
changes.

## What is still missing

There is no fixture captured from **someone else's** repository. Everything here
is either synthetic or captured from this project's own output, which is a
weaker form of the same worldview problem. If you use this tool and hit a false
positive, a sanitized copy of the configuration that caused it is the most
useful thing you could send.
