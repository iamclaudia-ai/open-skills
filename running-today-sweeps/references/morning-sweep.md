# The morning sweep (unattended)

The scheduler starts this session before your human's day begins (`scripts/sweep.ts`, weekdays at 7:00 in the
example tasks). When they open `/today`, the day is ranked and a short note from you sits at the top of the page.

You are running unattended. Nobody will answer, so **never ask a question**: take the conservative option and
say so in your final message. **The only things you change are the Today board's picks and note, and your notes
file.** Never push, open or comment on a PR, post or send a message anywhere, change a ticket, or start other
sessions. Anything that would need one of those becomes a line in your final message for your human.

Your prompt names your notes folder (`<cwd>/tmp/today-sweeps/`).

## 1. Refresh and read the board

```bash
anima today refresh        # recollect every source now; returns { skipped, collections }
anima today list           # every open item, today's date, the note, each source's last collection
anima today board          # what the page shows: top picks, waiting, questions, queue depth, notePicks
```

Check that every collection in the refresh result succeeded. A failed source makes the board incomplete: say so in
your final message, and don't build the note on that source's numbers.

Item keys look like `linear:ENG-123`, `review:owner/repo#42`, `pr:owner/repo#42`, `deploy:repo#42:app`,
`slack:<ledger key>` (promise ledger entries) and `manual:<id>`. Each item has a `section` (`promise`, `review`,
`my_pr`, `ticket`, `promote`), a `stateLabel`, and a `meta` object from its collector.

## 2. Optional: your own sources

If you've added a source of your own (a chat scan that keeps the promise ledger current, for example), run it
here, before ranking, then `anima today refresh` again so its items are on the board.
`references/adding-a-source.md` describes the pattern. Skip this step when there is none.

## 3. The ranked queue

The board shows the first **5** queued items that are your human's to act on right now; as each one finishes or
starts waiting on someone else, the next moves up, and the board's own ranking fills in when the queue runs out.
So rank everything worth their time today, most important first, as many as make sense (up to 25, usually
10-20), with one short reason each (the page shows it under the line):

- **Overdue, or due today**, and promises someone has waited on longest.
- **Project work every day.** Tickets in an active project's current phase carry `meta.currentPhase: true`.
  Queue one or two of them among the first five, so planned work isn't crowded out by everything else. Reason:
  what the ticket moves forward.
- **Their own PRs a session can act on** (`meta.actionable: true`: conflicts, failing checks, changes requested,
  open comments, ready to merge). The `stateLabel` is the reason. A PR that only waits on reviewers needs no
  place: the board lists it under "Waiting on others" and marks a nudge due after 3 days on its own.
- **Tickets and promises they can start**: due soon or high priority first. A started ticket is carried by its
  PR: queue the PR (`pr:` key), not the ticket.
- **Leave out:** reviews (`review:` keys: the board keeps them out of the top 5, and the Reviews page's Review all
  button handles them in one go), anything snoozed (`meta.snoozedUntil` still ahead: don't queue it, don't
  mention it, never unsnooze it), and anything finished.
- **A PR stack takes one place.** Queue it once (any of its PRs); the board says what each PR in it needs.

```bash
anima today set_top --picks '[{"key":"linear:ENG-123","reason":"Due today; the support team is waiting on it"},{"key":"pr:acme/app#481","reason":"Changes requested: two small fixes"}]'
```

Every reason must be true from what you read. The result lists `missing` (keys the board doesn't have: fix
them) and `quiet` (PRs nudged in the last 3 days, left out on purpose).

**Set the queue before the note.** `set_note` records the live picks it was written over (`notePicks`), and the
day refresh compares against them.

## 4. The note

Look at what your human will actually see (`anima today board`: the live top 5 and the waiting list), then:

```bash
anima today set_note --text "…"
```

- **Every fact checked.** Only names, counts and claims you read this morning on the board or in its sources.
  Write people's names as the source gives them; never turn a login or handle into a guessed name.
- **Short:** two to four sentences, about 300 characters (600 is the hard cap; the page sets it large).
- **The shape of the day, not a list:** the one thing that matters most, what's waiting on them, anything good
  (a PR merged, a promise kept). Calm and encouraging, never alarming.
- **No greeting and no signature:** the page already shows "Good morning" above the note and signs it below.
- **Name PRs as `#481` and tickets as `ENG-123`:** the page turns exactly those into links (3+ digit PR numbers),
  so your human can open what the note talks about. "The export PR" links nowhere.
- One emoji at most, at the end, if any.

## 5. Finish

- Append a dated line to `NOTES.md` in your notes folder: sources collected (and any that failed), how many items,
  the queue you set, anything odd.
- Your final message is for your human, if they open the session: the note, the top picks with their reasons, any
  failed source, and anything you'd have asked about. Keep it short.
- If that message holds nothing for them to act on (no failures, no questions), mark the session done so it
  doesn't wait in their Active list:

  ```bash
  anima session set_status --sessionId "$ANIMA_SESSION_ID" --disposition resolved
  ```

  With a failure or a question, leave it open: that message is what they open it for.
