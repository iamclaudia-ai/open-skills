---
name: running-review-sessions
description: "MUST be used when working through the pull requests waiting on your human's review: a review session, clearing the review queue, reviewing several PRs in a row, or a session started by the Today board's Review all button (today.review_queue, titled 'Review queue · <project>'). Runs the bundled check-review-queue tool, takes a cursory look at each PR, picks the order (follow-ups and re-requests first, stacks bottom-up), keeps the plan in tmp/reviews/QUEUE.md, reviews one PR or one stack per session chained with anima session handoff, and DRAFTS each review to tmp/reviews/<number>.md (verdict, summary, inline comments with file:line). Never posts: the human reads the drafts and posts them, or says 'post it'. Also MUST be loaded by a session started from a review-queue handoff, to take the next entry. Triggers on: review session, review queue, Review all, check review queue, crq, check-review-queue, PRs waiting on me, work through my reviews, clear my reviews, review these PRs one by one, review chain, next review, continue the review queue, review a stack, stacked PRs review, review order, which PR first, draft a review, review drafts, tmp/reviews, QUEUE.md, quiet this PR."
---

# Running Review Sessions

Review requests arrive in bunches, and reviews unblock teammates, so it pays to work through them steadily. One
session can't hold several full reviews, so a review session is a **chain**: a queue file that holds the order and
the outcomes, and one fresh session per entry, each handing off to the next. An entry is one PR, or one whole
**stack**: a stacked PR only makes sense next to its base, so a stack gets one session that sees every layer.

**The agent drafts; the human posts.** Every review is written to `tmp/reviews/<number>.md` and nothing is posted
to GitHub. The human reads the drafts, edits them, and posts them, or tells the session to post a specific one.
A review posted under the human's name is the human's decision.

## When to Use

- Your human asks for a review session, or to work through what's waiting on them.
- **The Today board's Review all button** (`today.review_queue`) starts one `Review queue · <project>` session
  in the project's main checkout with a prompt listing the open reviews and their board keys. **Where that prompt
  differs from this skill, the prompt wins** (it carries the board's current approval settings).
- A session started from a review-queue handoff (its prompt names `tmp/reviews/QUEUE.md`): skip to
  [Each entry in the chain](#each-entry-in-the-chain).
- Not for a single PR the human names: just review it (same drafting rule).
- Not for your own PRs: that's `self-reviewing-prs`.

## The queue tool: check-review-queue

Open Anima bundles it at `extensions/today/tools/check-review-queue` (bash; needs `gh` logged in, `jq`). A
prompt from the board names its absolute path; otherwise run it by path from your Open Anima checkout, or put a
symlink to it on your `PATH`. It works without Anima too. It only reads from GitHub.

```bash
check-review-queue                      # from the repo root: the human-readable list
check-review-queue --json -R owner/repo # rows as JSON (what the board and this skill use)
check-review-queue --all                # also the hidden ones: drafts, approved, quieted
check-review-queue --team               # also team requests (hidden by default)
check-review-queue --days 60            # PRs idle longer than N days are hidden (default 30)
check-review-queue --quiet 123          # hide #123 until it's updated again; --unquiet 123 undoes it
```

It lists **follow-ups** (PRs you reviewed that got new commits since, or a reply on a thread you started),
**direct requests**, and **re-requests**. It already hides drafts, PRs a human approved (bot approvals don't
count), quieted PRs, anything idle past `--days`, and **team requests** (a request to a team isn't a request to
you). Trust its filtering; don't re-derive it.

Each `--json` row carries `section` (`requested` | `followup` | `team`), `number`, `title`, `url`, `author`,
`isDraft`, `updatedAt`, `headRefName`, `baseRefName`, `direct`, `approvedBy`, `lastState` and `lastReviewedAt`
(your latest review), `pushedSince`, `replies`, `ageDays`, and for stacks:

- `parent`: the open PR whose head is this PR's base; `null` when it sits on the default branch.
- `stack`: every open PR in its stack, bottom first, the same array on every member; `null` for a lone PR. Each
  member has `number`, `title`, `url`, `author`, `isDraft`, `headRefName`, `baseRefName`, `parent` and
  **`inQueue`**: `true` for PRs waiting on your human, `false` for context PRs (already approved, or never
  requested from them) that the session still has to read to understand the queued layer.

## Starting a review session

### 1. Check for a queue already in flight

Look for `tmp/reviews/QUEUE.md` in the repo. If it still has pending rows, fold this run into it, reconciling
against the live queue (below), rather than starting over or overwriting what another session is working from.
If it's fully done, move it to `tmp/reviews/archive/QUEUE-<date>.md` first.

### 2. Read the live queue

```bash
mkdir -p tmp/reviews
check-review-queue --json -R owner/repo > tmp/reviews/crq.json
```

Group rows into queue entries by the bottom of their stack:

```bash
jq -r 'group_by(.stack[0].number // .number)
  | .[] | "\(.[0].stack[0].number // .[0].number)  queued=\(map(.number))  " +
    (.[0].stack // [] | map("#\(.number)\(if .inQueue then "*" else "" end)") | join(" -> "))' tmp/reviews/crq.json
```

```text
1201  queued=[1201]  #1201* -> #1202 -> #1205
1180  queued=[1188]  #1180 -> #1188*
```

`*` marks queued PRs. The second line is a queued PR sitting on one your human doesn't need to review: still one
entry, with #1180 as context.

### 3. Take a cursory look at each PR

Enough to order them, not a review. One call per PR:

```bash
gh pr view <N> --json number,title,author,baseRefName,headRefName,additions,deletions,changedFiles,body
```

For a stack, look at every member, queued or not. Note the size, the stack, the linked ticket, and whether it
touches work your human has in flight. For a follow-up, see what moved since your human's last review:

```bash
gh api repos/<owner>/<repo>/pulls/<N>/reviews --jq '[.[] | select(.user.login == "<their login>")] | last | .commit_id'
git fetch origin <headRefName> && git log --oneline <that sha>..origin/<headRefName>
```

If it's only a merge from the default branch, or replies that ask nothing, **recommend quieting it** instead of
queueing it (and run `check-review-queue --quiet <N>` only once your human agrees).

### 4. Pick the order

1. **Follow-ups and re-requests first.** The delta is small and the author is waiting on this reviewer.
2. **A stack is one entry, reviewed bottom-up.** Place it by its most urgent queued member.
3. **Your human's own project's PRs before others**, if you know which those are: what you learn may change
   their next step.
4. **Then everything else**, smaller first unless one blocks someone.

Show your human the order as a table (PR or stack, author, size, why it's there) and start. Drafting changes
nothing outside the machine, so there's no need to wait for a go on the order; they can reorder, drop or quiet
entries at any time.

### 5. Write the queue, then start the chain

Write `tmp/reviews/QUEUE.md` (format below), then:

- **This session has room** (started for the review session, or still light): review the first entry here.
- **This session carries other work's context**: update its notes, then hand off to the first entry.

## Each entry in the chain

1. **Read `tmp/reviews/QUEUE.md`**, including the notes carried forward to this entry.
2. **Re-run `check-review-queue --json` and reconcile:**
   - A new re-request or follow-up goes **right after** the current row.
   - A new request goes at the end, unless its `stack` puts it in a stack already queued: then it joins that entry.
   - A pending row the tool no longer lists (someone else approved it, it merged or closed, it went back to
     draft) becomes `skipped` with the reason.
3. **Mark the row `reviewing`** and review it in full (below). Working files go in `tmp/reviews/<N>/`.
4. **Write the draft** to `tmp/reviews/<N>.md` (format below). For a stack, one draft per queued PR.
5. **Record the outcome** on the row (`drafted: APPROVE | COMMENT | REQUEST_CHANGES`) with one line on what the
   draft says. Anything the **next** entry needs goes under its notes.
6. **Ask your human once** when the queue is drafted, or before you hand off with drafts they haven't seen:

   ```bash
   anima today ask --key 'review:<owner>/<repo>#<first N>' --question "Drafts ready: #1201 (approve), #1188 (comment). Read tmp/reviews/; post them yourself or tell me which to post."
   ```

   Use the board key of the first PR (the board prompt lists each PR's key; it is `review:<owner>/<repo>#<N>`).
   Then end your turn with the same question. The question shows under that PR on the Today board, and if it's
   still unanswered after 10 minutes the board sends it through `notify.send`. Outside Anima, just ask in the
   conversation.
7. **Hand off to the next pending row** when your context is getting heavy (one entry per session is a good
   default):

   ```bash
   anima session handoff --title "Review #1188: export retries" \
     --prompt "Review session: take the next entry in tmp/reviews/QUEUE.md. Load running-review-sessions and follow 'Each entry in the chain'. Draft only; post nothing."
   ```

   The prompt stays generic because the queue file holds the state. Title it after the PR (or
   `Review stack #1201-#1205: <theme>`), so the session list reads like the queue. The Today board moves its
   links to the new session by itself.

If your human says "skip it" or "later", mark the row and move on. If they say "stop", leave the remaining rows
`pending` and don't hand off; the next review session will find the queue and pick it up.

### Reviewing a PR in full

- **Don't disturb anyone's checkout.** The board's queue session runs in the main checkout, which your human
  (and other sessions) may be using. Review in a separate git worktree:

  ```bash
  git worktree add --detach ../<repo>-review-<N>
  cd ../<repo>-review-<N> && gh pr checkout <N> --detach
  ```

  Remove it once the draft is written (`git worktree remove ../<repo>-review-<N>`), and only if nothing of
  yours is in it.
- Read the description, the linked ticket, and the whole diff (`gh pr diff <N>`), then the code around it.
- **Run it.** Run the tests, and run the changed path where you can. A claim you checked by running beats one
  you reasoned about.
- **Mutation-check the tests that matter:** break the code a new test is meant to guard and confirm the test
  fails, then restore it (copy the file aside first; `git diff` must come back empty).
- Read existing review threads, so the draft doesn't repeat what someone already said, and note which threads
  the author answered.

### Reviewing a stack

- **One worktree, checked out at the top.** A linear stack's top branch holds every layer
  (`gh pr checkout <top N> --detach`). A forked stack has more than one top: check out each tip in turn.
- **Review each layer against its own base**, not the default branch, so each draft covers only that PR:
  `gh pr diff <N>` or `git diff origin/<baseRefName>...origin/<headRefName>`.
- **Queued PRs (`inQueue: true`)** get a full review and a draft each, bottom-up, so a finding in the base is
  stated before the layers that build on it.
- **Context PRs (`inQueue: false`)**: read them, don't draft for them. If one hides a real problem, mention it in
  the draft of the queued PR it affects, or ask your human.
- Notes between layers stay in `tmp/reviews/<bottom N>/NOTES.md`. If the stack is too big for one session,
  record which layers are drafted and hand off to the same entry.

## The draft: tmp/reviews/<number>.md

```markdown
# #1188 export retries (author: <login>)

**Verdict:** COMMENT   <!-- APPROVE | COMMENT | REQUEST_CHANGES -->

**Summary** (the review body):
Retries look right for 5xx. One real concern about idempotency on the second attempt, and a nit.

**Inline comments** (path:line, post-change line numbers in the PR's head):

- `src/export/retry.ts:48`: The retry re-sends the whole batch; if the first attempt partly succeeded, rows
  are written twice. Could the request carry an idempotency key?
- `src/export/retry.ts:61` (nit): `maxAttempts` reads better as a named constant.

**How I checked:** ran `bun test src/export`, 31 pass; broke the backoff and the new test failed as it should.

**For you:** <anything only your human can judge: a product call, a relationship question, whether this
reviewer should block>
```

- **Verdict guidance:** APPROVE a clean PR or one with only nits; COMMENT for real concerns. REQUEST_CHANGES is
  a strong signal to a teammate: draft it only for a real blocker, and say why in "For you".
- **Line numbers** are post-change line numbers in the PR's head (`grep -n` in the checked-out worktree), not
  diff offsets.
- **If your human says "post it"** (for one named PR, after reading the draft), post exactly that draft, with
  inline comments, as one review. Write it as JSON and send it with the REST API:

  ```bash
  # tmp/reviews/1188.json: {"event":"COMMENT","body":"...","comments":[{"path":"src/export/retry.ts","line":48,"side":"RIGHT","body":"..."}]}
  gh api repos/<owner>/<repo>/pulls/1188/reviews --method POST --input tmp/reviews/1188.json
  gh pr view 1188 --json reviews --jq '.reviews[-1] | {state, author: .author.login}'   # check it registered
  ```

  A go covers the PR they named, nothing more. Mark the row `posted` afterwards.

## QUEUE.md format

```markdown
# Review queue: owner/repo (started 2026-01-12)

| # | PR | Author | Size | Status |
|---|----|--------|------|--------|
| 1 | #1175 retry budget (re-request) | <login> | +120/-30, 4 files | drafted: APPROVE |
| 2 | stack **#1201** -> #1202 -> **#1205** import pipeline | <login> | +900, 22 files | reviewing |
| 3 | stack #1180 -> **#1188** export retries | <login> | +410/-22, 8 files | pending |

## Notes

### #1175 (re-request)
Re-request after a COMMENT on 2026-01-09. Draft: approve; the fix holds, one nit on naming.

### stack #1201 -> #1205
Queued: #1201, #1205. Context: #1202. #1201 drafted: COMMENT. For #1205: the base renames X; check it uses the new name.
```

A stack row names every member bottom first, the queued ones in bold. Its status covers the whole entry; the
per-PR outcomes go in its notes.

Statuses: `pending`, `reviewing`, `drafted: APPROVE | COMMENT | REQUEST_CHANGES`, `posted` (your human posted it,
or said to), `held: <question>`, `skipped: <reason>`, `quieted`.

## When the queue is empty

Tell your human the queue is drafted, with one line per PR and the paths of the drafts. Leave the session open
while drafts wait on them: that message is what they open it for. Once they've posted (or dropped) the drafts,
archive the queue file and mark the session done:

```bash
anima session set_status --sessionId "$ANIMA_SESSION_ID" --disposition resolved
```

The board closes each review item by itself once the review is posted and the PR leaves the queue.

## GitHub's GraphQL budget

Everything running `gh` as one user (their terminal, every session, the Today board's collectors) shares
**5,000 GraphQL points an hour**. `gh pr view --json` and `gh api graphql` draw from it; REST calls
(`gh api repos/...`) have their own budget. When it runs out, every `gh pr view` fails with
`API rate limit exceeded` until the reset.

- Check it (free): `gh api rate_limit --jq .resources.graphql` (`used`, `remaining`, `reset` as epoch seconds).
- Prefer one `gh pr view <N> --json <only the fields you need>` per PR over repeated calls.
- The Today board pauses its own GitHub collection below `githubReserve` (default 1,000) remaining.

## Notes

- **Outside Anima** (no `$ANIMA_SESSION_ID`) there's nothing to hand off from and no board to ask on. Write the
  queue and the drafts anyway, ask in the conversation, and give your human the next title and prompt to start
  by hand.
- **Depth over speed.** Every review gets the full process (read it, run it, check the claims). A draft your
  human can trust is the whole point of the chain.
- **Never post, approve, request changes, resolve threads or re-request reviewers on your own.** All of those
  are visible to other people and go out under your human's name.
