#!/usr/bin/env bun
/**
 * Add the example sweep tasks to Open Anima's scheduler (`scheduler.add_task`).
 *
 *   add-tasks.ts --cwd <folder> [--profile <name>] [--file <tasks.json>] [--apply]
 *
 * --cwd      the folder the sweep sessions start in (their notes go in its tmp/today-sweeps/)
 * --profile  a permission profile for the sweep sessions (appended to each task's args)
 * --file     a task list of your own (default: tasks.example.json beside this script)
 * --apply    actually add them; without it, print the commands and change nothing
 *
 * Placeholders filled in from this machine: @BUN@ (this bun), @SKILL_DIR@ (the skill folder),
 * @CWD@ (--cwd), @PATH@ (bun's and anima's folders plus the system ones: the scheduler runs exec
 * tasks with the gateway's environment, which under a service manager may not find either).
 * A task whose name already exists in the scheduler is skipped; change it with
 * `anima scheduler update_task` or remove it with `anima scheduler cancel_task` first.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { anima, animaBin } from "../scripts/anima";

const USAGE = "usage: add-tasks.ts --cwd <folder> [--profile <name>] [--file <tasks.json>] [--apply]";

interface TaskSpec {
  name: string;
  action: { type: string; target: string; payload?: { args?: string[] } & Record<string, unknown> };
  [key: string]: unknown;
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (!value || value.startsWith("--")) {
    console.error(`${name} needs a value\n\n${USAGE}`);
    process.exit(2);
  }
  return value;
}

/** Replace every placeholder in every string of a JSON value. */
function fill(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === "string") {
    return Object.entries(vars).reduce((s, [k, v]) => s.split(k).join(v), value);
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]));
  }
  return value;
}

/** `scheduler.add_task` params as CLI flags; objects and arrays go as JSON. */
function toFlags(task: TaskSpec): string[] {
  return Object.entries(task).flatMap(([key, value]) => [
    `--${key}`,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}

const shellQuote = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const cwdArg = flag(argv, "--cwd") ?? process.env.TODAY_SWEEP_CWD;
  if (!cwdArg) {
    console.error(`pass --cwd <folder>\n\n${USAGE}`);
    process.exit(2);
  }
  const cwd = resolve(cwdArg);
  if (!existsSync(cwd)) {
    console.error(`${cwd} doesn't exist`);
    process.exit(2);
  }
  const profile = flag(argv, "--profile");
  const file = resolve(flag(argv, "--file") ?? join(import.meta.dir, "tasks.example.json"));
  const apply = argv.includes("--apply");

  const bun = process.execPath;
  const path = [
    ...new Set([
      dirname(bun),
      dirname(animaBin()),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ]),
  ].join(":");
  const vars = { "@BUN@": bun, "@SKILL_DIR@": resolve(import.meta.dir, ".."), "@CWD@": cwd, "@PATH@": path };
  const tasks = (fill(JSON.parse(readFileSync(file, "utf8")), vars) as TaskSpec[]).map((task) => {
    if (profile && task.action.payload?.args) task.action.payload.args.push("--profile", profile);
    return task;
  });

  const existing = new Set(
    ((anima(["scheduler", "list_tasks"]) as { tasks: Array<{ name: string }> }).tasks ?? []).map((t) => t.name),
  );

  for (const task of tasks) {
    if (existing.has(task.name)) {
      console.log(`skip "${task.name}": a task with that name exists`);
      continue;
    }
    const args = ["scheduler", "add_task", ...toFlags(task)];
    if (!apply) {
      console.log(`anima ${args.map(shellQuote).join(" ")}\n`);
      continue;
    }
    const result = anima(args) as { taskId?: string; cronDescription?: string };
    console.log(`added "${task.name}" (${result.taskId}): ${result.cronDescription ?? task.cronExpr}`);
  }
  if (!apply) console.log("Nothing changed. Re-run with --apply to add these.");
}
