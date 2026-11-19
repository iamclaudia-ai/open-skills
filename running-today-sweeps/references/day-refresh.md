# The day refresh (unattended)

`/today` is a live board. Its top 5 is the morning's ranked queue, minus whatever got done or started waiting on
someone else since, topped up from the board's own ranking when the queue runs short. So the picks keep themselves
current; the note is what falls behind, still talking about picks that have moved on.

`scripts/refresh.ts` starts you when that happens (it checks every 30 minutes in working hours, never within an hour
of the last note). Your prompt gives the **mode**, why it fired, where each of the note's picks went, what was
finished since, the live top picks and what's waiting.

- **mode: note**: write a fresh note. Leave the queue alone (no `set_top`).
- **mode: rerank**: the queue ran low and the board is filling picks from its own ranking. Write a new ranked
  queue, then the note.

This is a short job. You only read the board and write `set_note` (and `set_top` in rerank mode). Never ask a
question, never push, post, comment, send anything, or change a ticket. If you've added a source of your own,
don't run it here: the morning sweep owns that.

## 1. Read the board as it is now

```bash
anima today refresh        # recollect first, so the board isn't minutes stale
anima today board          # live picks, waiting (nudges due), questions, queue depth
anima today list           # every open item, for a rerank
```

If a collection failed (`collections` in the refresh result), work from what you have and keep the note off the
failed source's numbers.

## 2. Rerank mode only: a new ranked queue

Same rules as the morning sweep's step 3 (`references/morning-sweep.md`): everything worth their time today, most
important first, up to 25, one true reason each, past the top 5. Never queue something finished today.

```bash
anima today set_top --picks '[{"key":"pr:acme/app#481","reason":"Conflicts; a session can rebase it"}]'
```

Run `set_top` **before** `set_note`: the note records the live picks it was written over, and the next refresh
compares against them.

## 3. The note

The morning sweep's note rules apply in full: every fact checked, names as the source gives them, two to four
sentences around 300 characters, calm, no greeting or signature (the page adds both), `#481` and `ENG-123` for
links, one emoji at most.

What's different: this note **starts from what got done** since the last one, by name ("#481 merged and
ENG-123 is off your plate"), then turns to what's next: the live top picks from `today board`, not the morning's
list. A pick that moved to Waiting is progress too ("#502 is with the reviewers now"); a nudge that's due is
something they can do in one click. Don't repeat the morning note's wording.

```bash
anima today set_note --text "…"
```

## 4. Finish

Append a dated line to `NOTES.md` in your notes folder: time, mode, why it fired, what was finished, the live picks
(and the new queue in rerank mode). Your final message is the note and the picks, one line each.

Then mark the session done, since everything it made is on the board already:

```bash
anima session set_status --sessionId "$ANIMA_SESSION_ID" --disposition resolved
```

If something failed (a source they should know about, a queue you couldn't set), leave it open instead.
