# Adding a source of your own: promises from chat (an example pattern)

The Today board collects GitHub, Linear and a **promise ledger** out of the box. The ledger is the hook for
everything else: a JSON file that something you run keeps current, which the board reads and never writes. This
page describes one pattern built on it: a morning scan of your team chat for things your human promised ("sure,
I'll take a look") or was asked to do, so those don't sink under project work. It is a pattern to adapt, not code
that ships here; the details depend on your chat tool and what access you give the agent.

Everything in it is read-only toward other people. The scan reads; the session triages and drafts; your human
decides what gets said or filed.

## The ledger

Point a project at a file in `~/.anima/anima.json` (`extensions.today.config.projects[].promiseLedger`, an absolute
path), then restart the gateway. The shape (Open Anima's `extensions/today/src/collectors/ledger.ts`):

```json
{
  "last_scan": "2023-11-15T07:02:11Z",
  "threads": {
    "C0123:1700000000.000100": {
      "status": "open",
      "title": "Reply to Jordan: is the export fix live?",
      "permalink": "https://chat.example.com/archives/C0123/p1700000000000100",
      "where": "#data-team",
      "asker": "Jordan Lee",
      "note": "Asked on Tuesday",
      "ticket": "ENG-123",
      "since": "2023-11-14T22:13:20Z"
    }
  }
}
```

- Only `"status": "open"` entries reach the board, as `promise` items keyed `slack:<ledger key>` (whatever chat
  they come from). Other statuses are your own bookkeeping: use them to remember decisions.
- A stable key per thread (channel id plus the thread's timestamp works well) lets the next scan skip what was
  already decided.
- `title` is the line on the board: phrase it as the action ("Reply to Jordan: is the export fix live?").
  `asker` is who's waiting, written as the chat shows their name.
- Promises big enough for a ticket can live in Linear instead: give the ticket the project's promise label
  (`linear.promiseLabel` in the project config) and the Linear collector files it under Promises.

## The scan (in the morning sweep, step 2)

1. **Read since the last scan.** Start from the ledger's `last_scan`, with an hour of overlap so nothing falls
   between runs. Read through a tool the session can use: a chat MCP server's read and search tools, or a small
   script with a **read-only** token. Look at threads your human wrote in or was mentioned in, and their direct
   messages.
2. **Find candidates loosely, then triage carefully.** A keyword match ("I'll", "will do", "can you", a mention)
   finds candidates; most aren't real. For each, read the thread's tail and decide: **open** (still owed),
   **tracked** (a ticket or PR covers it), **done** (delivered, or the asker was answered), **dismissed** (not
   theirs, or not a promise).
3. **Check the open ones again** before recording them: one promise often shows up in several threads, and a
   thread can look unanswered when the answer came in a direct message.
4. **Record every decision in the ledger**, with when you decided it, so the next scan only shows threads with
   new replies since.
5. **Learn from the board.** When your human dismisses a promise on the board (it isn't theirs), the ledger has to
   learn it, or the next scan brings it back:

   ```bash
   anima today list --status dismissed --doneBy user --section promise --doneSince <ISO time of the last sweep>
   ```

   For each `slack:<key>` item there, set that ledger entry to `dismissed`.
6. `anima today refresh`, so the new open promises are on the board before you rank the day.

## What the session does with them

- **Rank them** like any other item. A promise someone has waited on for days deserves a high place.
- **Draft, never send.** A reply to the asker ("on it, tracking it in ENG-123"), a "this shipped" update when the
  ticket is done, a suggested ticket for real work: all of these go in the final message as drafts, with the
  thread's permalink above each. Your human sends them, or tells a session to.
- **Security topics in public channels** stay out of drafts beyond ticket ids and severity.

## Access and safety

- Give the sweep sessions a **profile** (`agentHost.sessionProfiles` in `anima.json`, passed with `--profile` to
  the launchers) that allows the chat tools it reads with and denies the ones that post, react or edit. With an
  `anima-only` MCP profile, `mcpServers` adds the chat server and `allowedTools` names the read tools; see
  Open Anima's `packages/agent-host/src/profiles.ts` and `docs/HUMAN-IN-THE-LOOP.md`.
- Use a token with read scopes only, when your chat tool offers one. A token that can't post is a gate no prompt
  can talk its way around.
- Keep the ledger and the scan's working files in the sweep folder's `tmp/` (gitignored): chat content is
  private, and it never belongs in a commit.
