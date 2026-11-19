---
name: keeping-notes
description: "MUST be used on any task longer than a quick fix, and first thing after a compaction or in a new session that continues earlier work. Keeps a running tmp/<task>/NOTES.md in the project (the plan, what's done, what's open, and the hard-won facts) written as you go, because compaction and new sessions drop detail the transcript once held. Also covers where working files go: the project's gitignored tmp/, never /tmp or a scratchpad that a reboot wipes. Triggers on: notes, NOTES.md, keep notes, write this down, running notes, task notes, working notes, after compaction, context was compacted, resumed session, new session continuing work, where was I, what did we find, hard-won facts, gotchas, scratch files, temp files, working files, tmp folder, where to put screenshots, helper scripts, long task, multi-step task, investigation log."
---

# Keeping Notes

Context is temporary. Compaction summarizes a conversation and keeps going, but the summary drops exactly the
details that took the longest to find: the id that turned out to matter, the command that finally worked, the
reason an approach was abandoned. A fresh session starts with none of it. The fix is cheap: write those things
down in a file, in the project, while you still have them.

## When to Use

- Any task with more than a few steps, or any investigation (a bug hunt, a data question, a migration).
- **Right after a compaction, or at the start of a session that continues earlier work: read the task's
  NOTES.md before anything else.** It is the most reliable account of where things stand.
- Before handing off to a fresh session (the `handing-off-sessions` skill points the next session at these
  notes rather than repeating them).

## Where the notes live

```text
<project>/tmp/<task>/NOTES.md
```

- `<task>` is a short folder name for the piece of work (`tmp/export-bug/`, `tmp/auth-migration/`).
- **`tmp/` in the project, never `/tmp` or the agent's scratchpad.** System temp folders are wiped on reboot
  and are invisible to the next session. The project's `tmp/` survives, and it is where a later session (or
  a git worktree that links it in) will look.
- `tmp/` must be gitignored. If the project has no `tmp/` entry in `.gitignore`, add one (and say so in your
  summary; in a repo where `.gitignore` changes have side effects, ask your human first). A global git
  ignore (`core.excludesFile`) with a `/tmp/` line covers every repo's root `tmp/` at once.
- `tmp/` is ignored, not private: never put secrets in it.

## What goes in NOTES.md

Keep it short and current. Rewrite sections as things change; it is a working document, not a log.

```markdown
# <Task>: <one-line goal>

## Plan
1. ...
2. ...

## Done
- Fixed the parser (abc1234). Tests: `bun test src/parser.test.ts`, 42 pass.

## Open
- Does the importer need the same fix? Check `src/import.ts:120`.

## Facts (the ones that took effort)
- The API returns ids as strings above 2^53; parse them as strings.
- `make test` skips the integration suite; run `make itest` too.
- Tried caching in the client: rejected, stale reads after a write (see commit def5678).
```

**Hard-won facts are the point.** Anything you had to dig for, measure, or learn by failing: how the data
actually behaves, exact ids and counts, gotchas, which command works and which looks right but doesn't, why a
choice was made, and what not to retry. If it took more than a few minutes to learn, it goes in.

## How to keep it

- **Write as you go, not at the end.** Update the file the moment you learn something that took effort. The end
  of a long session is exactly when context is fullest and a compaction is most likely.
- **Point, don't copy.** Link to files, commits, PRs and issues instead of pasting their contents.
- **Keep working files beside the notes.** Helper scripts, screenshots, downloads, drafts and query results go in
  the same `tmp/<task>/` folder, so the notes can name them and the next session can find them.
- **When a task ends**, fold anything worth keeping into the place it belongs (a code comment, the README, a
  skill, an issue) and leave NOTES.md as the record.

## Notes

- Notes are for the agent and the human alike. A human picking the task up should be able to read NOTES.md and
  know where things stand without opening the transcript.
- If something in the notes turns out to be wrong, fix it at once and say what was wrong. A stale fact in the
  notes misleads every later session.
