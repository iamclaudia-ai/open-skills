---
name: running-today-sweeps
description: "MUST be used for Open Anima's Today board sweeps: the scheduled morning sweep that reads the board, ranks the day's top picks (anima today set_top) and writes the note at the top of /today (anima today set_note), and the daytime refresh that rewrites the note when the board has moved on. Also MUST be loaded by a session started by scripts/sweep.ts or scripts/refresh.ts (its prompt names a runbook in references/). Covers the launchers (unattended sessions via session.spawn_agent with parentSessionId NEW), the example scheduler tasks and how to add them, the ranking and note rules, how failures alert you, and adding a source of your own (a chat promise scan, as an example pattern). Nothing in it posts anywhere. Triggers on: Today board, /today, morning sweep, day refresh, today refresh, top picks, set_top, set_note, the note on /today, rank my day, daily plan, notePicks, schedule the sweep, sweep scheduler task, add_task for the sweep, promise ledger, promiseLedger, promises from Slack, chat promises, add a source to Today."
---

# Running Today Sweeps

Open Anima's Today board (`/today`) collects what wants your human's attention: reviews, their PRs, tickets,
promises, merges waiting to ship. The board keeps itself current, but two things on it need judgment, so an
agent writes them: the **ranked picks** (which few things matter today, each with a reason) and a short **note**
at the top of the page. Nothing in the board does this by itself; this skill is the job that does.

- **The morning sweep** (before the day starts): refresh the board, rank the day, write the note.
- **The day refresh** (every 30 minutes in working hours): when the picks the note talks about have moved on,
  write a fresh note that starts from what got done. Most runs only read the board and exit.

Both run as unattended agent sessions. **They only change the board's picks and note, plus their own notes
file.** They never push, post, comment, send messages or change tickets; anything that would need one becomes a
line in the session's final message for your human.

## When to Use

- Setting up the sweeps for an Open Anima install (below).
- A session whose prompt says to run the morning sweep or refresh the Today note: follow the runbook the prompt
  names (`references/morning-sweep.md` or `references/day-refresh.md`).
- Your human asks you to rank their day or rewrite the note now: follow the morning sweep runbook by hand.
- Adding a source of your own to the board: `references/adding-a-source.md`.

## What's here

| Path                              | What it is                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `scripts/sweep.ts`                | Starts the morning sweep session (skips if today already has a note)         |
| `scripts/refresh.ts`              | Decides whether the note fell behind; starts a refresh session when it has   |
| `scripts/anima.ts`                | Shared helpers: the `anima` CLI, flags, a small state file                   |
| `scripts/refresh.test.ts`         | Tests for when a refresh fires and when a run counts as failed (`bun test`)  |
| `references/morning-sweep.md`     | The morning session's runbook: read, rank, note                              |
| `references/day-refresh.md`       | The refresh session's runbook                                                |
| `references/adding-a-source.md`   | Example pattern: promises from team chat through the promise ledger          |
| `scheduler/tasks.example.json`    | Two scheduler tasks: weekday morning sweep, refresh every 30 minutes         |
| `scheduler/add-tasks.ts`          | Prints (or, with `--apply`, runs) the `anima scheduler add_task` calls       |

## Setting it up

You need Open Anima running with the Today extension configured (`docs/extensions/today.md` in Open Anima), the
`anima` CLI on `PATH` (Open Anima's `docs/GETTING-STARTED.md`, "Put the anima CLI on your PATH"), and Bun.

1. **Pick the sweep folder.** The sessions start there, and their notes and state go in its
   `tmp/today-sweeps/`. Any folder works (a project, or one kept for the agent); make sure `tmp/` is gitignored
   if it's a repo.
2. **Pick a profile** for the sessions. Without `--profile` they run under the session extension's
   `spawnProfile` (`auto`, Claude Code's auto mode, out of the box). For a hard guarantee that a sweep can't push
   or post, define a profile that denies those commands (Open Anima's `docs/HUMAN-IN-THE-LOOP.md` has a `gated`
   example) and pass `--profile gated`.
3. **Try it by hand first:**

   ```bash
   bun <this skill>/scripts/sweep.ts --cwd ~/agent --dry-run     # prints the title and prompt
   bun <this skill>/scripts/sweep.ts --cwd ~/agent               # starts the morning sweep now
   bun <this skill>/scripts/refresh.ts --cwd ~/agent --dry-run   # says whether a refresh would fire, and why
   ```

   The session shows in the web chat's ACTIVE pane under Background (it's an automated session). Watch one run
   and read its final message before you schedule it.
4. **Schedule it** (when your human agrees):

   ```bash
   bun <this skill>/scheduler/add-tasks.ts --cwd ~/agent [--profile gated]           # prints the commands
   bun <this skill>/scheduler/add-tasks.ts --cwd ~/agent [--profile gated] --apply   # adds the tasks
   anima scheduler list_tasks --tags '["today-sweeps"]'
   ```

   Edit `tasks.example.json` (or pass `--file` with your own copy) to change the times. Cron is **local time**,
   and in Open Anima's scheduler day-of-month and day-of-week must **both** match (see its
   `docs/extensions/scheduler.md`, "Gotchas").

## The example tasks

| Task                   | When                                | Policies                                                                 |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `Today: morning sweep` | `0 7 * * 1-5` (weekdays 7:00)       | `missedPolicy: fire_once` within 3 h (`startDeadlineSeconds: 10800`), alert on the first failure |
| `Today: day refresh`   | `*/30 8-17 * * 1-5` (8:00 to 17:30) | `missedPolicy: skip`, alert after 2 failures in a row                    |

Both are `exec` tasks running `bun <script> --cwd <folder>`, with `concurrency: skip_if_running`, no retries (a
retry could start a second session), and a `PATH` that finds `bun` and `anima` (the scheduler runs exec tasks with
the gateway's environment, which under a service manager may be minimal). The `today-sweeps` tag groups them.

## How failures reach you

The scheduler sends `notify.send` when a task starts failing (after `alertAfterFailures` failed runs in a row)
and again when it recovers, so make sure Open Anima's notify extension has a real delivery configured.

- **The launchers never wait for their session.** A scheduler run that keeps going holds its cron task "due", and
  every 5-second tick then records a skipped run. So `sweep.ts` and `refresh.ts` start the session, note it in
  `tmp/today-sweeps/state.json`, and exit.
- **`refresh.ts` does the checking.** It exits 1 (a failed run) when there's still no note on the board by the
  `--note-deadline` hour (default 9, machine-local time), or when the refresh session it started last time wrote
  no note within 25 minutes. Its output says which.
- A session that hit a problem leaves itself open in the ACTIVE pane with the details in its final message;
  one that finished cleanly marks itself resolved.

## The rules both runbooks share

- **`set_top` before `set_note`.** `today.set_note` records the live picks it was written over (`notePicks` in
  `today.board`), which is how `refresh.ts` tells the note has fallen behind.
- **Every fact checked.** The note and each pick's reason say only what the session read on the board or in its
  sources that day.
- **Reviews never take a pick** (the board leaves them out; the Reviews page's Review all button handles them),
  snoozed items are left alone, and a PR stack takes one place.
- **Unattended means no questions.** Take the conservative option and say so in the final message.

## Methods used (all Open Anima gateway methods, through the `anima` CLI)

- `today.refresh`, `today.list` (`--doneSince`, `--status`, `--section`, `--doneBy`), `today.board`
- `today.set_top` (`--picks '[{"key":…,"reason":…}]'`, up to 25), `today.set_note` (`--text`, up to 600 chars)
- `session.spawn_agent` (`--parentSessionId NEW --cwd … --name … --prompt …`, optional `--profile`)
- `session.set_status` (`--disposition resolved`)
- `scheduler.add_task`, `scheduler.list_tasks`

`docs/API-REFERENCE.md` in Open Anima lists every parameter.
