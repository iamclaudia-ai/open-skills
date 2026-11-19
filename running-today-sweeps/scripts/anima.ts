/**
 * Shared helpers for the sweep launchers: run the `anima` CLI, parse the common flags, and keep a
 * small state file (which sweep session started when) in the sweep folder's tmp/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** The `anima` CLI: $ANIMA_BIN, else `anima` on PATH, else ~/.local/bin/anima (Open Anima's getting-started spot). */
export function animaBin(): string {
  const fromEnv = process.env.ANIMA_BIN;
  if (fromEnv) return fromEnv;
  const onPath = Bun.which("anima");
  if (onPath) return onPath;
  const local = join(homedir(), ".local", "bin", "anima");
  if (existsSync(local)) return local;
  throw new Error("the anima CLI isn't on PATH: put it there or set ANIMA_BIN");
}

/** Call one gateway method through the CLI (`anima <extension> <method> --flag value …`); it prints JSON. */
export function anima(args: string[], timeoutMs = 120_000): unknown {
  const res = Bun.spawnSync([animaBin(), ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
  });
  if (!res.success) {
    const err = res.stderr.toString().trim() || `exit ${res.exitCode}`;
    throw new Error(`anima ${args.slice(0, 2).join(" ")}: ${err}`);
  }
  const out = res.stdout.toString().trim();
  return out ? (JSON.parse(out) as unknown) : null;
}

export interface LauncherArgs {
  /** Folder the sweep sessions start in; their notes go in its tmp/today-sweeps/. */
  cwd: string;
  /** Permission profile for the session; omitted, the session extension's spawnProfile applies. */
  profile?: string;
  dryRun: boolean;
  force: boolean;
  /** refresh.ts: the hour (local) by which the morning note must be on the board. */
  noteDeadlineHour: number;
}

export function parseArgs(argv: string[], usage: string): LauncherArgs {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i === -1) return undefined;
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) fail(`${flag} needs a value`, usage);
    return next;
  };
  const cwd = value("--cwd") ?? process.env.TODAY_SWEEP_CWD;
  if (!cwd) fail("pass --cwd <folder> (or set TODAY_SWEEP_CWD)", usage);
  const deadline = Number(value("--note-deadline") ?? "9");
  if (!Number.isInteger(deadline) || deadline < 0 || deadline > 23) {
    fail("--note-deadline is an hour, 0-23", usage);
  }
  return {
    cwd: resolve(cwd),
    profile: value("--profile"),
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    noteDeadlineHour: deadline,
  };
}

function fail(message: string, usage: string): never {
  console.error(`${message}\n\n${usage}`);
  process.exit(2);
}

/** A sweep session this launcher started and hasn't confirmed yet. */
export interface PendingRun {
  sessionId: string;
  title: string;
  startedAt: string;
  /** The board's local date when it started (`today.list` / `today.board` `date`). */
  date: string;
}

export interface SweepState {
  morning?: PendingRun;
  refresh?: PendingRun;
}

export function sweepDir(cwd: string): string {
  return join(cwd, "tmp", "today-sweeps");
}

function statePath(cwd: string): string {
  return join(sweepDir(cwd), "state.json");
}

export function readState(cwd: string): SweepState {
  const path = statePath(cwd);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SweepState;
  } catch {
    return {};
  }
}

export function writeState(cwd: string, state: SweepState): void {
  const path = statePath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Start a top-level agent session that works unattended: `session.spawn_agent` with
 * parentSessionId "NEW" creates it in `cwd`, titles it and sends the prompt in one call.
 */
export function startSession(options: {
  cwd: string;
  title: string;
  prompt: string;
  profile?: string;
}): string {
  const args = [
    "session",
    "spawn_agent",
    "--parentSessionId",
    "NEW",
    "--cwd",
    options.cwd,
    "--name",
    options.title,
    "--prompt",
    options.prompt,
  ];
  if (options.profile) args.push("--profile", options.profile);
  const result = anima(args) as { sessionId?: string } | null;
  if (!result?.sessionId) throw new Error("session.spawn_agent returned no sessionId");
  return result.sessionId;
}

/** "9:30 AM" in the machine's zone. */
export function clock(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
