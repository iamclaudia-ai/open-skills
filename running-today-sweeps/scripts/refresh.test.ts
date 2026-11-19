import { describe, expect, test } from "bun:test";
import { type Board, checkPending, decide, morningNoteMissing, movedOn } from "./refresh";

const at = (hhmm: string) => new Date(`2026-01-14T${hhmm}:00`);

function board(overrides: Partial<Board> = {}): Board {
  return {
    date: "2026-01-14",
    picks: [
      { key: "pr:acme/app#101", title: "a", lane: "act", says: [], fromQueue: true, reason: null },
      { key: "linear:ENG-2", title: "b", lane: "act", says: [], fromQueue: true, reason: null },
    ],
    waiting: [],
    asking: [],
    queue: { open: 8, moving: 8 },
    noteUpdatedAt: at("08:00").toISOString(),
    notePicks: ["pr:acme/app#101", "linear:ENG-2"],
    ...overrides,
  };
}

describe("movedOn", () => {
  test("a stack member still on the board counts as live", () => {
    const b = board({
      picks: [
        {
          key: "pr:acme/app#101",
          title: "stack",
          lane: "act",
          says: [],
          fromQueue: true,
          reason: null,
          stack: ["pr:acme/app#101", "pr:acme/app#102"],
        },
      ],
      notePicks: ["pr:acme/app#102", "linear:ENG-9"],
    });
    expect(movedOn(b)).toEqual(["linear:ENG-9"]);
  });
});

describe("decide", () => {
  test("no note yet: the morning sweep's job", () => {
    expect(decide({ now: at("10:00"), board: board({ noteUpdatedAt: null, notePicks: null }) }).refresh).toBe(false);
  });

  test("never within an hour of the last note", () => {
    const b = board({ notePicks: ["linear:ENG-7", "linear:ENG-8", "linear:ENG-9"] });
    expect(decide({ now: at("08:45"), board: b }).refresh).toBe(false);
  });

  test("three noted picks moved on: a fresh note", () => {
    const b = board({ notePicks: ["linear:ENG-7", "linear:ENG-8", "linear:ENG-9", "linear:ENG-2"] });
    expect(decide({ now: at("09:10"), board: b })).toMatchObject({ refresh: true, mode: "note" });
  });

  test("one moved on: waits until the note is two hours old", () => {
    const b = board({ notePicks: ["linear:ENG-7", "linear:ENG-2", "pr:acme/app#101"] });
    expect(decide({ now: at("09:30"), board: b }).refresh).toBe(false);
    expect(decide({ now: at("10:05"), board: b })).toMatchObject({ refresh: true, mode: "note" });
  });

  test("the queue ran low and the board borrows picks: rerank", () => {
    const b = board({
      queue: { open: 3, moving: 2 },
      picks: [
        { key: "linear:ENG-2", title: "b", lane: "act", says: [], fromQueue: true, reason: null },
        { key: "linear:ENG-5", title: "c", lane: "act", says: [], fromQueue: false, reason: null },
      ],
    });
    expect(decide({ now: at("11:00"), board: b })).toMatchObject({ refresh: true, mode: "rerank" });
  });

  test("new work on a board the note called empty", () => {
    const b = board({ notePicks: [] });
    expect(decide({ now: at("09:30"), board: b })).toMatchObject({ refresh: true, mode: "note" });
  });

  test("nothing moved: no refresh", () => {
    expect(decide({ now: at("15:00"), board: board() }).refresh).toBe(false);
  });
});

describe("checkPending", () => {
  const pending = {
    sessionId: "s1",
    title: "Today refresh",
    startedAt: at("10:00").toISOString(),
    date: "2026-01-14",
  };

  test("nothing pending", () => {
    expect(checkPending(undefined, null, at("10:30"))).toBe("none");
  });

  test("a note written after the start landed", () => {
    expect(checkPending(pending, at("10:04").toISOString(), at("10:30"))).toBe("landed");
  });

  test("still inside its grace", () => {
    expect(checkPending(pending, at("08:00").toISOString(), at("10:20"))).toBe("running");
  });

  test("no newer note after the grace: failed", () => {
    expect(checkPending(pending, at("08:00").toISOString(), at("10:30"))).toBe("failed");
  });
});

describe("morningNoteMissing", () => {
  test("only once the deadline hour has come", () => {
    const empty = { noteUpdatedAt: null };
    expect(morningNoteMissing(empty, at("08:30"), 9)).toBe(false);
    expect(morningNoteMissing(empty, at("09:00"), 9)).toBe(true);
    expect(morningNoteMissing({ noteUpdatedAt: at("07:10").toISOString() }, at("12:00"), 9)).toBe(false);
  });
});
