#!/usr/bin/env bun
/**
 * Start the morning sweep: one unattended agent session that reads the Today board, ranks the
 * day (`today.set_top`) and writes the note (`today.set_note`), following
 * references/morning-sweep.md. Nothing it does leaves the machine.
 *
 *   sweep.ts --cwd <folder> [--profile <name>] [--dry-run] [--force]
 *
 * --cwd      the folder the session starts in (any project, or a folder kept for the agent); its
 *            notes go in <folder>/tmp/today-sweeps/. TODAY_SWEEP_CWD works too.
 * --profile  the session's permission profile (default: the session extension's spawnProfile).
 * --dry-run  print the title and prompt, start nothing.
 * --force    run even though today already has a note.
 *
 * It returns as soon as the session has started. A scheduler task that keeps running holds its
 * cron task "due" and fills its history with skipped runs, so the check that the note landed
 * happens later, in refresh.ts (it fails once the --note-deadline hour passes with no note).
 */

import { join } from "node:path";
import { anima, clock, parseArgs, readState, startSession, sweepDir, writeState } from "./anima";

const USAGE = "usage: sweep.ts --cwd <folder> [--profile <name>] [--dry-run] [--force]";

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2), USAGE);
  const today = anima(["today", "list"]) as { date: string; note: string | null };
  if (today.note && !args.force) {
    console.log(`${today.date} already has a note; nothing to do (--force runs anyway)`);
    process.exit(0);
  }

  const runbook = join(import.meta.dir, "..", "references", "morning-sweep.md");
  const startedAt = new Date();
  const title = `Morning sweep · ${today.date}`;
  const prompt = [
    "Load the running-today-sweeps skill and run the morning sweep exactly as",
    `${runbook} describes.`,
    "",
    `Date: ${today.date}, started ${clock(startedAt)}. Notes folder: ${sweepDir(args.cwd)}.`,
    "",
    "You are running unattended: nobody is here to answer, so never ask a question; take the",
    "conservative option and say so in your final message. The only things you change are the",
    "Today board's picks and note (`anima today set_top`, then `anima today set_note`) and your notes",
    "file. Never push, open or comment on a PR, post or send a message anywhere, or change a ticket.",
  ].join("\n");

  if (args.dryRun) {
    console.log(`would start "${title}" in ${args.cwd}${args.profile ? ` (profile ${args.profile})` : ""}:\n\n${prompt}`);
    process.exit(0);
  }

  const sessionId = startSession({ cwd: args.cwd, title, prompt, profile: args.profile });
  writeState(args.cwd, {
    ...readState(args.cwd),
    morning: { sessionId, title, startedAt: startedAt.toISOString(), date: today.date },
  });
  console.log(`started "${title}": session ${sessionId}`);
}
