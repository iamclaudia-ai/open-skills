---
name: handing-off-sessions
description: "MUST be used when a session should continue in a fresh one instead of compacting: the context is getting full (roughly 60-70%) or close to auto-compaction, a long task reached a natural phase boundary, a milestone is done and the next deserves a clean start, or the human says hand off, start a new session, or continue in a new session. Brings NOTES.md up to date, commits what's ready locally, writes tmp/<task>/HANDOFF.md for a reader starting cold, then runs `anima session handoff` (Open Anima) to create, title and prompt the new session in one call, and stops. Outside Anima, it writes the same file and gives the human the path and a title. Triggers on: hand off, handoff, handover, new session, fresh session, continue in a new session, start a new session with a prompt, context is full, context window, running out of context, before compaction, instead of compacting, avoid compaction, next phase, next milestone, pass the baton, successor session, carry on in another session, hand off to a worktree, new branch, worktree handoff."
---

# Handing Off Sessions

Long work outgrows one context window. Compaction keeps going but loses detail in ways nobody can see. A handoff
is the deliberate version: write down exactly what the next session needs, start it, and stop. In Open Anima one
command creates the new session, titles it, sends it the prompt and links the two, and any client showing the old
session follows to the new one.

## When to Use

- The context is getting full (roughly past 60-70%), or a long task is about to cross into auto-compaction.
- A phase or milestone is done and the next one deserves a clean start.
- The human asks to hand off, start fresh, or continue in a new session.
- **Not** for delegating a side task while you keep working: that's a subagent
  (`anima session spawn_agent`, or Claude Code's own Task tool). A handoff *ends* your part of the work.

## Instructions

### 1. Get the notes current first

The handoff prompt should *point at* durable notes, not replace them (see the `keeping-notes` skill). Update
`tmp/<task>/NOTES.md`: what's done, what's open, the hard-won facts.

Commit what's ready, locally. A clean working tree, or a stated reason why it isn't clean, saves the next
session from guessing. Committing is local; **pushing is not**: don't push, open a PR or post anything as part of
a handoff unless your human already said to.

### 2. Write the handoff prompt to a file

Put it in the project's `tmp/<task>/HANDOFF.md`, not a system temp folder (wiped on reboot). The next session
starts cold, so write for a reader who knows nothing about this conversation:

```markdown
Continuing <task> from the previous session. <One line: the goal.>

**Read first:** tmp/<task>/NOTES.md (and any plan doc it names).

**Done:** <what shipped, with commits/PRs: abc1234, PR #42>
**Now:** <the exact next step, concrete enough to start without asking>
**Then:** <what follows, briefly>

**Watch out for:** <the facts that took effort: gotchas, ids, why a choice was made, what NOT to retry>
**Waiting on the human:** <anything they still have to approve: a push, a PR, a post. Don't do it without them.>
**State:** branch <name>, working tree <clean | what's uncommitted and why>, anything running.
```

Keep it short. Facts the notes already hold get a pointer, not a copy.

### 3. Hand off (inside Open Anima)

```bash
anima session handoff --title "Export fix: phase 2 (importer)" --promptFile tmp/export-fix/HANDOFF.md
```

What the command does (method `session.handoff`):

- `--sessionId` is filled in from `$ANIMA_SESSION_ID`, which Anima sets in every session it starts.
- Pass exactly one of `--prompt "<text>"` (short prompts) or `--promptFile <path>`. A relative `--promptFile` is
  read relative to the **caller's workspace folder** (the main checkout, not a worktree you may be in), so from a
  worktree pass an absolute path: `--promptFile "$PWD/tmp/<task>/HANDOFF.md"`.
- The new session takes your agent, model and permission profile, and starts in your **workspace's** folder.
  Override with `--targetCwd <folder>`, `--model` or `--profile` only when the next phase needs it.
- **Working in a git worktree?** Pass `--targetCwd "$PWD"`, or the new session starts in the main checkout and
  works on whatever branch is checked out there.
- It returns the new `sessionId` at once (no streaming), and the new session is already working. The new
  session's first message names your session id, so it can read your transcript
  (`anima session get_history --sessionId <id>`) if the prompt leaves something out.
- Name the title after the work (`"Export fix: phase 2"`), not after the act of handing off.

**On a fresh branch:** when the next phase belongs on its own branch, add `--worktree <branch>`:

```bash
anima session handoff --title "Export fix: phase 2" --promptFile tmp/export-fix/HANDOFF.md --worktree export-fix-2
anima session handoff --title "Export fix: phase 2" --prompt "Read tmp/export-fix/NOTES.md, then ..." \
  --worktree export-fix-2 --worktreeBase origin/main
```

- Anima creates (or reuses) the branch in a worktree at `<repo>.worktrees/<branch>`, from `--worktreeBase`
  (default: origin's default branch, freshly fetched), and starts the new session there. It can't be combined
  with `--targetCwd`, and `--worktreeBase` needs `--worktree`.
- The default bootstrap links the main checkout's `tmp/` into the worktree, so the NOTES.md and HANDOFF.md you
  point at are there. A project can replace the bootstrap with an executable `tmp/scripts/create_worktree`.
- Nothing removes the worktree later; your human does that once the work lands.

### 4. Then stop

- End your turn with one line naming the new session (title and id), and do nothing else in this session. The
  work lives there now.
- Anima marks your session resolved and links it forward; the new one links back.
- **A session hands off once.** A second call is refused. If the handoff failed (the prompt never went out),
  your session stays open: fix the problem and retry.

## Outside Open Anima

`anima session handoff` needs `$ANIMA_SESSION_ID`, which only Anima's agent host sets. In a plain Claude Code
terminal there is nothing to hand off from. Do steps 1 and 2 anyway, then give your human:

- the path to `tmp/<task>/HANDOFF.md`,
- a suggested title,
- the one-liner to start it, for example `claude "$(cat tmp/<task>/HANDOFF.md)"` from the project folder.

## Notes

- **Unattended sessions** (scheduled runs) can hand off too. The new session inherits the same profile, so it
  keeps the same permissions, and an automated session's successor stays automated (`origin`).
- **Who follows.** Only clients showing your session move to the new one; a tab showing something else stays
  put, so a background handoff never yanks your human away from what they're reading.
- The code is `extensions/session/src/lifecycle/session-handoff.ts` in Open Anima; the method is listed in
  `docs/API-REFERENCE.md` and described in `docs/extensions/session.md`.
