---
name: self-reviewing-prs
description: "MUST be used when the agent has prepared a pull request of its own and the human said to open it, before anyone else reviews it. Covers the self-review pass: the comment sweep over the whole diff, mutation-testing new tests, which judgment calls earn an inline self-review comment and how to write one, phone + desktop screenshots of any UI change (pr-screenshots.py uploads them into the PR body), and the hand-off to the human for the real review. Everything is drafted first and goes to GitHub only with the human's go; the agent never approves or merges its own PR. Triggers on: self-review, self review, review my own PR, after creating a PR, open a PR, opened a PR, PR is ready, pre-review pass, annotate my diff, explain my tradeoffs, flag judgment calls, inline self-review, review before requesting review, PR screenshots, attach screenshot, screenshot in PR, image in PR description, UI change PR, gh pr edit --attach, mutation test, does my test catch the bug, comment sweep, stale comments, reviewer found something."
---

# Self-Reviewing PRs

The pass the agent does on **its own** diff before a human reviewer sees it. The goal is to make the human's
review fast: every judgment call explained where it sits, every test proven to catch what it claims, every UI
change visible without checking anything out.

> A questioned decision costs a review round-trip. A **pre-explained** decision usually costs nothing, because
> the reviewer can see it was weighed rather than missed.

## The gates

Opening a PR, editing its body, uploading screenshots and posting review comments are all visible to other
people. So the agent **prepares all of it locally, then asks once**, listing exactly what will go out:

> Ready to open a draft PR "Export retries" from `export-retries` with the body in `tmp/export/pr-body.md`, two
> screenshots, and 3 self-review comments (`tmp/export/self-review.md`). Go?

A go covers what was listed, nothing more. **The agent never approves, merges, or marks its own PR ready for
review on its own**, and never requests reviewers without being told who.

## Order of operations

1. **Comment sweep** over the whole diff (below), and fix what it finds.
2. **Mutation-test every new test** you'll vouch for (below).
3. **UI change? Take the screenshots** (below) and look at every one yourself.
4. **Draft the PR body** to `tmp/<task>/pr-body.md`: what changed and why, how it was tested, screenshots by
   local path, anything the reviewer should look at first.
5. **Draft the self-review comments** to `tmp/<task>/self-review.md` (below).
6. **Ask your human** (as above). On their go: push, open the PR (as a draft unless they said otherwise), upload
   the screenshots, post the self-review comments as one review with event `COMMENT`.
7. **Hand it to your human for the real review**, with the PR link and a two-line summary. Their review (or
   the reviewers they pick) decides what happens next.

## 1. The comment sweep

Sweep the **whole** diff against its base, not just your last commits. Print the base first, so "I swept"
can't silently mean "I swept my last two commits":

```bash
BASE=$(git merge-base origin/main HEAD) && echo "sweeping $BASE..HEAD"
git diff "$BASE"...HEAD | grep "^+" | grep -E "//|/\*| \* |^\+\s*#"
```

- Tighten code comments hard: say what the code can't. Exposition that doesn't survive the trim goes into a
  self-review comment instead (that's what they're for).
- Hunt for comments the diff **falsified**, including ones outside the diff whose claims the new code broke
  (`grep -rn` for the function names you changed).

## 2. Mutation-test before you claim a test works

A regression test that passes against the unfixed code certifies nothing while looking like proof.

```bash
cp src/export/retry.ts tmp/export/retry.ts.keep    # snapshot
# neuter the fix in place (revert the changed line, make the new branch a no-op)
bun test src/export/retry.test.ts                   # expect RED
cp tmp/export/retry.ts.keep src/export/retry.ts     # restore
git diff --stat HEAD -- src/export/retry.ts         # must be empty if the fix was committed
bun test src/export/retry.test.ts                   # expect GREEN, the whole file
```

- **Don't use `git stash` for this.** `git stash push -- <path>` on a file with no uncommitted changes saves
  nothing and doesn't fail, so the "reverted" run tests the fix; the paired `stash pop` then pops someone
  else's stash. A plain copy can't do either.
- **Name backups so the test runner can't collect them** (`retry.test.ts.keep`, not `keep-retry.test.ts`):
  bun, vitest and jest collect `*.test.ts` from anywhere, `tmp/` included.
- **A negative assertion can pass for the wrong reason.** "Nothing changed" is also true when the code raised
  and rolled back. Anchor it with a positive assertion in the same test, and say in a code comment that the
  anchor is load-bearing.
- **When a mutant survives, suspect the fake before the test.** A fake that performs the real operation from
  inside the system under test can do the code's work for it. Ask of every fake: which side effects does the
  real service *not* have?
- **Timing tests:** make the bug certain, not lucky (put the slow step where the bug lives), and when the test
  measures with a different clock than the code, give the bound slack and a retry or two. Prove it under load
  with a loop of runs, not one.

## 3. Screenshots for any UI change

A reviewer should **see** a UI change before approving it, above all that it fits on a phone. "Screenshots are
in `tmp/`" in a PR body is not attaching them: the reviewer reads the PR on GitHub.

- **Shoot** a ~390px phone and a 1280px desktop for every changed surface, plus the narrowest real layout when
  width is the question. A headless browser (Playwright, Puppeteer) is the easy way. Log
  `document.documentElement.scrollWidth` per shot to prove there's no horizontal scroll. Use example data
  (`example.com` accounts, fake names): screenshots end up in the PR.
- **Look at every shot yourself** before it goes anywhere. That look is what catches the wrapped label and the
  badge rendered three times.
- **Name files for what they show** (`phone-390-empty-state.png`), unique within the PR, and reference them in the
  body by **local path**, phone and desktop side by side:

  ```markdown
  ## Screenshots

  | Phone, 390 | Desktop, 1280 |
  | --- | --- |
  | <img src="./tmp/export/phone-390-empty-state.png" width="260"> | <img src="./tmp/export/desktop-empty-state.png" width="420"> |
  ```

- **After the PR is open** (and only with the go that covered the screenshots), from the repo root:

  ```bash
  python3 <this skill>/scripts/pr-screenshots.py <PR number>
  ```

  It reads the PR's live body, uploads every `./…` image or video it references with `gh pr edit --attach`,
  and rewrites each reference to the uploaded URL. It exits non-zero if any local path is left.
  It needs gh 2.99.0 or newer (the first release with `gh pr edit --attach`). On an older gh, drag the images into the
  description in the browser instead.
- **Why the script:** `--attach` rewrites markdown `![](./file)` references itself, but leaves an HTML
  `<img src="./file">` alone and appends the image at the end instead. `<img>` is what sets a width; the script
  moves the uploaded URLs into the `<img>` tags (matched by file name) and drops the appended copies.
- **On a stacked PR, never replace the whole body with a file you wrote from scratch** (`gh pr edit --body-file`):
  it drops the stack footer gh-stack maintains. The script edits the live body, so the footer survives.
- Data the dev database lacks can be injected by intercepting the API response in the headless browser (so the
  real render path draws it). Say so in the PR.

## 4. What earns an inline self-review comment

Post one wherever a competent reviewer would stop and ask "why did you do it *that* way?"

| Earns a comment                                                                   | Does not                               |
| --------------------------------------------------------------------------------- | -------------------------------------- |
| A deliberate divergence from a sibling implementation                             | Anything the diff already says plainly |
| A guard whose enforcement lives **outside the diff** (base branch, a parent class) | Restating the commit message           |
| An assertion that looks redundant but is load-bearing                             | "Added X, removed Y" narration         |
| An ordering, fallback or trade-off with a visible edge case                       | Apologising for scope                  |
| Exposition cut from a code comment during the sweep                               | Anything better fixed than explained   |

**The most valuable one, consistently:** a guard that is real but invisible in the diff. Reviewers flag things
as missing when they live one PR down a stack or in an included module; naming where the guard lives saves a
round.

**Writing the comment:** lead with a bold one-line claim (it's what shows in the collapsed preview), then the
reasoning, then the invitation. Three short paragraphs at most.

```markdown
**Tradeoff: <the choice>, not <the obvious alternative>.**

<Why the alternative was rejected, in terms of what would drift or duplicate.>

<The cost of the choice, named honestly.> Happy to invert it if you'd rather, but I'd want <the thing that
must not be lost> handled deliberately rather than by omission.
```

**Drafting them:** list each one in `tmp/<task>/self-review.md` as `path:line` plus the body. Line numbers are
**post-change line numbers** in the PR's head (`grep -n` in the working tree), not diff offsets.

**Posting them (after the go):** one review with event `COMMENT` (a self-review is never APPROVE), sent with
the REST API:

```bash
# tmp/export/self-review.json: {"event":"COMMENT","body":"Self-review: the judgment calls, before anyone has to ask.",
#   "comments":[{"path":"src/export/retry.ts","line":48,"side":"RIGHT","body":"**Tradeoff: ...**"}]}
gh api repos/<owner>/<repo>/pulls/<PR>/reviews --method POST --input tmp/export/self-review.json
gh api repos/<owner>/<repo>/pulls/<PR>/comments --jq '.[] | "\(.path):\(.line) -> \(.body[0:70])"'   # check placement
```

A comment on the wrong line is worse than none: check the placement, and fix it (with your human's go) if it's off.

## Where this runs

In the checkout you're already in. You just built this branch; the working tree holds exactly the code under
review, and the mutation probes change your own files on your own branch. The exception: if the PR's branch is
not the one checked out here (another session's, or yours from days ago), use a separate git worktree rather
than switching a checkout someone else may be standing in.

## When a reviewer finds something anyway

1. **Verify the claim against the code first.** Bots are most convincing when wrong.
2. Check whether it already exists on the base before believing "this doesn't exist":
   `git log -1 -S"<symbol>" -- <path>` and `git show origin/main:<path> | grep -c "<symbol>"`.
3. Verify the *suggested fix* separately from the finding: a real finding can carry a fix that makes things worse.
4. Fix it on the PR that owns the code and commit locally. Then draft the thread reply (what changed, and where
   the fix went beyond the suggestion and why) and ask before pushing and replying.

## Notes

- **Unresolved threads can block a merge** when the repo requires conversation resolution. Your own self-review
  threads stay open during review (resolving collapses them and hides the explanation from the reviewer). When
  your human is ready to merge, offer to resolve the ones where you are the only commenter; a thread someone
  replied in is a conversation, so answer it first.
- Merging is your human's call. If they ask you to merge, check the checks are green and nothing was pushed
  since the approval, then do exactly the merge they asked for.
