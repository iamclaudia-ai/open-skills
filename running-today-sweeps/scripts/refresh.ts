#!/usr/bin/env bun
/**
 * Keep the Today note in step with the live board during the day. The board keeps its own picks
 * current (the morning's ranked queue, minus what got done or started waiting on someone else,
 * topped up from the board's own ranking), so the note is what falls behind: it still talks about
 * picks that have moved on. A scheduler task runs this every 30 minutes in working hours. Most
 * runs only read `today board` and exit. When the note has fallen behind, it starts one short
 * unattended session that follows references/day-refresh.md.
 *
 *   refresh.ts --cwd <folder> [--profile <name>] [--note-deadline <hour>] [--dry-run] [--force]
 *
 * When to refresh (never within an hour of the last note):
 *   - rerank: the morning queue ran low (fewer than 5 of its items still yours to act on, and the
 *     board is filling picks from its own ranking) and something moved since the note: write a new
 *     ranked queue and a note.
 *   - note: the picks the note was written over (`notePicks`) have moved on: 3 or more of them
 *     (all, when there were fewer), or any one once the note is 2+ hours old, or new work arrived
 *     on a board the note called empty. Write a fresh note; leave the queue alone.
 *
 * It also reports what didn't land, by exiting 1 so the scheduler's failure alert reaches you:
 *   - no note on the board by --note-deadline (default 9, local time): the morning sweep failed;
 *   - the refresh session this script started last time wrote no note within 25 minutes.
 * It never waits for its own session (see sweep.ts for why); the next run checks instead.
 */

import { join } from "node:path";
import {
  anima,
  clock,
  parseArgs,
  readState,
  startSession,
  writeState,
  type PendingRun,
} from "./anima";

const USAGE =
  "usage: refresh.ts --cwd <folder> [--profile <name>] [--note-deadline <hour>] [--dry-run] [--force]";
const MIN_GAP_MIN = 60;
const STALE_MIN = 120;
const PENDING_GRACE_MIN = 25;
const TOP = 5;

/** One line of `today board` (Open Anima's extensions/today/src/board.ts). */
export interface BoardLine {
  key: string;
  title: string;
  lane: string;
  says: string[];
  /** Every PR's key when the line is a stack, bottom first. */
  stack?: string[];
}

export interface Board {
  date: string;
  picks: Array<BoardLine & { fromQueue: boolean; reason: string | null }>;
  waiting: Array<BoardLine & { nudgeDue: boolean }>;
  asking: Array<{ key: string; title: string; question: string }>;
  queue: { open: number; moving: number };
  noteUpdatedAt: string | null;
  /** The live picks when the note was written; null when there is no note. */
  notePicks: string[] | null;
}

export type Mode = "note" | "rerank";

export interface Verdict {
  refresh: boolean;
  mode?: Mode;
  reason: string;
}

/** The note's picks that aren't in the live top 5 any more (done, waiting, or crowded out). */
export function movedOn(board: Pick<Board, "picks" | "notePicks">): string[] {
  const live = new Set(board.picks.flatMap((p) => [p.key, ...(p.stack ?? [])]));
  return (board.notePicks ?? []).filter((key) => !live.has(key));
}

export function decide(input: { now: Date; board: Board }): Verdict {
  const { now, board } = input;
  if (!board.noteUpdatedAt) {
    return { refresh: false, reason: "no note yet today: the morning sweep writes the first" };
  }
  const ageMin = Math.floor((now.getTime() - Date.parse(board.noteUpdatedAt)) / 60_000);
  if (ageMin < MIN_GAP_MIN) return { refresh: false, reason: `the note is only ${ageMin} min old` };

  const noted = board.notePicks ?? [];
  const moved = movedOn(board).length;
  const borrowed = board.picks.filter((p) => !p.fromQueue).length;
  if (board.queue.moving < TOP && borrowed > 0 && moved > 0) {
    return {
      refresh: true,
      mode: "rerank",
      reason: `only ${board.queue.moving} of the morning's queue still yours to act on, and ${borrowed} of the picks come from the board's own ranking`,
    };
  }
  if (moved > 0 && moved >= Math.min(3, noted.length)) {
    return {
      refresh: true,
      mode: "note",
      reason: `${moved} of the ${noted.length} picks the note talks about have moved on`,
    };
  }
  if (moved > 0 && ageMin >= STALE_MIN) {
    return {
      refresh: true,
      mode: "note",
      reason: `the note is ${Math.floor(ageMin / 60)}h old and ${moved} of its picks have moved on`,
    };
  }
  if (board.notePicks !== null && noted.length === 0 && board.picks.length > 0) {
    return { refresh: true, mode: "note", reason: "new work arrived since a note with no picks" };
  }
  return {
    refresh: false,
    reason: `${moved} of ${noted.length} noted picks moved on, note ${ageMin} min old`,
  };
}

/** What became of the refresh session the last run started. */
export function checkPending(
  pending: PendingRun | undefined,
  noteUpdatedAt: string | null,
  now: Date,
): "none" | "landed" | "running" | "failed" {
  if (!pending) return "none";
  const started = Date.parse(pending.startedAt);
  if (noteUpdatedAt && Date.parse(noteUpdatedAt) >= started) return "landed";
  return now.getTime() - started < PENDING_GRACE_MIN * 60_000 ? "running" : "failed";
}

/** The morning sweep's note should be on the board by the deadline hour. */
export function morningNoteMissing(
  board: Pick<Board, "noteUpdatedAt">,
  now: Date,
  deadlineHour: number,
): boolean {
  return !board.noteUpdatedAt && now.getHours() >= deadlineHour;
}

interface ListItem {
  key: string;
  title: string;
  status: string;
  completedAt: string | null;
}

const lineText = (l: BoardLine) =>
  `- ${l.key}: ${l.title}${l.says.length ? ` (${l.says.join("; ")})` : ""}`;

function refreshPrompt(input: {
  board: Board;
  mode: Mode;
  why: string;
  now: Date;
  finished: ListItem[];
  fate: (key: string) => string;
}): string {
  const { board, mode, why, now, finished, fate } = input;
  const runbook = join(import.meta.dir, "..", "references", "day-refresh.md");
  const live = new Set(board.picks.flatMap((p) => [p.key, ...(p.stack ?? [])]));
  const noted = board.notePicks ?? [];
  return [
    `Load the running-today-sweeps skill and refresh the Today ${mode === "rerank" ? "queue and note" : "note"} exactly as`,
    `${runbook} describes (mode: ${mode}).`,
    "",
    `Date: ${board.date}, ${clock(now)}. Why now: ${why}.`,
    "",
    "The picks the current note talks about, and where they went:",
    ...(noted.length
      ? noted.map((key) => `- ${key}: ${live.has(key) ? "still a pick" : fate(key)}`)
      : ["- none recorded"]),
    "",
    "Finished since the note:",
    ...(finished.length
      ? finished.map((i) => `- ${i.key}: ${i.title} (${i.status})`)
      : ["- nothing yet"]),
    "",
    "The live top picks now:",
    ...(board.picks.length ? board.picks.map(lineText) : ["- none"]),
    "",
    "Waiting on others:",
    ...(board.waiting.length
      ? board.waiting.map((w) => `${lineText(w)}${w.nudgeDue ? " [nudge due]" : ""}`)
      : ["- none"]),
    "",
    "You are running unattended: never ask a question. The only things you change are the Today",
    "board's note (and its picks in rerank mode) and your notes file. Never push, post, comment,",
    "send a message anywhere, or change a ticket.",
  ].join("\n");
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2), USAGE);
  const now = new Date();
  const board = anima(["today", "board"]) as Board;
  const state = readState(args.cwd);
  const problems: string[] = [];

  const pending = checkPending(state.refresh, board.noteUpdatedAt, now);
  if (pending === "running" && !args.force) {
    console.log(`the last refresh (${state.refresh?.sessionId}) is still within its ${PENDING_GRACE_MIN} min`);
    process.exit(0);
  }
  if (pending === "failed") {
    problems.push(
      `the refresh session ${state.refresh?.sessionId} (started ${state.refresh?.startedAt}) wrote no note`,
    );
  }
  if (pending === "landed" || pending === "failed") delete state.refresh;

  if (morningNoteMissing(board, now, args.noteDeadlineHour)) {
    const morning = state.morning;
    const started = morning?.date === board.date;
    problems.push(
      `no note on the Today board by ${args.noteDeadlineHour}:00 (${board.date})${started ? `: the morning sweep session ${morning?.sessionId} didn't write one` : ": the morning sweep didn't start today"}`,
    );
  }

  if (problems.length > 0) {
    if (!args.dryRun) writeState(args.cwd, state);
    console.error(problems.join("\n"));
    process.exit(1);
  }

  const verdict = decide({ now, board });
  if (!verdict.refresh && !args.force) {
    if (!args.dryRun) writeState(args.cwd, state);
    console.log(`no refresh: ${verdict.reason}`);
    process.exit(0);
  }
  const mode: Mode = verdict.mode ?? "note";

  // `today list` returns only open items unless asked: what got finished would vanish.
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const since = board.noteUpdatedAt ?? midnight.toISOString();
  const list = anima(["today", "list", "--doneSince", since]) as { items: ListItem[] };
  const finished = list.items.filter(
    (i) => i.status !== "open" && Date.parse(i.completedAt ?? "") >= Date.parse(since),
  );
  const waiting = new Set(board.waiting.flatMap((w) => [w.key, ...(w.stack ?? [])]));
  const fate = (key: string) => {
    const item = list.items.find((i) => i.key === key);
    if (item && item.status !== "open") return item.status;
    return waiting.has(key) ? "waiting on someone else now" : "crowded out of the top 5";
  };

  const why = verdict.refresh ? verdict.reason : "a manual run (--force)";
  const title = `Today refresh · ${board.date} ${clock(now)}`;
  const prompt = refreshPrompt({ board, mode, why, now, finished, fate });

  if (args.dryRun) {
    console.log(`would start "${title}" in ${args.cwd}${args.profile ? ` (profile ${args.profile})` : ""}:\n\n${prompt}`);
    process.exit(0);
  }

  const sessionId = startSession({ cwd: args.cwd, title, prompt, profile: args.profile });
  writeState(args.cwd, {
    ...state,
    refresh: { sessionId, title, startedAt: now.toISOString(), date: board.date },
  });
  console.log(`started "${title}" (${mode}): session ${sessionId}. ${why}`);
}
