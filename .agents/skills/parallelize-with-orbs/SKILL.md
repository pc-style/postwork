---
name: parallelize-with-orbs
description: "Splits work across multiple Amp sub-agents or Orbs and syncs their changes back locally. Use when the user asks to parallelize, use sub-agents, multiple agents, Orbs, fleet, fan out work, run phases concurrently, or combine parallel work with amp sync."
---

# Parallelize with Orbs

Use this skill to turn a larger coding task into several independent Amp workers, run them in parallel when safe, then merge the useful results into one local checkout.

## First decide whether to parallelize

Parallelize only when work can be split into mostly independent vertical slices. Good candidates:

- Independent features in different files or layers.
- Investigation/review tasks that produce evidence, not edits.
- Test repair where each worker owns a specific failing area.
- UI/backend/API slices with clear boundaries and integration contracts.
- Multiple implementation options that need comparable prototypes or analysis.

Do not parallelize when:

- The change is small enough for one agent.
- Multiple workers would edit the same files heavily.
- The architecture is still unknown; investigate first, then split.
- The task requires one coherent refactor across shared types or global state.

## Split the work into agent-sized contracts

Before launching workers, write a short coordinator plan:

1. Desired final outcome.
2. Shared constraints from `AGENTS.md`, product docs, and the current request.
3. Work packages, each with:
   - scope and non-goals,
   - likely files/directories,
   - files it must not edit,
   - validation to run,
   - expected final report shape.
4. Integration order and conflict risk.

Prefer vertical slices that can be accepted or rejected independently. Avoid assigning vague jobs like "fix the frontend" or "clean up backend".

## Local sub-agents vs Orbs

Use the built-in `Task` tool for read-only investigation, reviews, or bounded changes whose intermediate logs are not needed. Run multiple `Task` calls in parallel only when their scopes are independent.

Use Orbs when workers need separate remote machines or independent working trees, especially for:

- long-running implementation branches,
- high-conflict experiments that should not touch the local checkout until reviewed,
- multiple agents working at once on separate areas,
- work you want to continue while the laptop sleeps or switches context.

## Launching Orb workers

The exact Orb launch shortcut can vary by Amp version. Check `amp --help` in the current environment before relying on a shorthand flag.

Known CLI pieces:

- `amp -x "prompt"` runs execute mode: it sends a prompt, prints the final assistant message, and exits.
- Some Amp builds support combining execute mode with an Orb target shorthand such as `-xo` or `-ox`. Treat these as equivalent flag ordering if both are accepted by `amp --help`; the important semantics are "execute this prompt in an Orb".
- If shorthand is unavailable, create/start the Orb from the Amp UI or current manual, then continue with the same worker prompt.

Worker prompt template:

```text
You are worker <name> in a parallel Orb run.

Goal: <specific outcome>.

Context: <shared product/technical constraints>.

Scope:
- Own: <paths/features/tests>.
- Do not edit: <paths owned by other workers>.
- Preserve: <contracts/behavior>.

Process:
1. Inspect only the code needed for this slice.
2. Make the smallest correct change.
3. Run <specific validation>.
4. Stop before broad refactors or unrelated cleanup.

Final response must include:
- thread URL or ID,
- files changed,
- validation results,
- integration notes/conflicts,
- any unresolved blockers.
```

Example launch pattern, after confirming Orb execute syntax in the current Amp version:

```bash
amp -xo "<worker prompt>"
# or, if that build parses flags in the opposite order:
amp -ox "<worker prompt>"
```

When launching a fleet, label each worker by slice and keep a small tracker in the coordinator notes:

```text
worker-a search-api: <thread url> owns convex/posts.ts search behavior
worker-b feed-ui: <thread url> owns src/routes/HomePage.tsx feed controls
worker-c regression: <thread url> read-only test/build investigation
```

## Syncing Orb work locally

Use `amp sync` from the local checkout to mirror or apply a worker Orb's working-tree changes.

Confirmed commands:

```bash
# Live mirror remote Orb working-tree changes into this checkout.
amp sync https://ampcode.com/threads/<thread-id>

# Apply current remote working-tree changes once, then exit.
amp sync --apply https://ampcode.com/threads/<thread-id>

# If the Orb thread is on a different commit and you want Amp to check it out.
amp sync --checkout https://ampcode.com/threads/<thread-id>

# If you intentionally want to keep the current checkout.
amp sync --skip-checkout https://ampcode.com/threads/<thread-id>
```

Use one-shot `--apply` for most integration passes. Use live mirroring only when actively supervising a single Orb and you are comfortable with continuous local changes.

## Integration workflow

Integrate one worker at a time unless their diffs are guaranteed disjoint.

1. Ensure the local checkout is in a known state with `git status --short --branch`.
2. Read the worker's final response or use `read_thread` on the worker thread for a concise outcome summary.
3. Apply the worker's changes:
   ```bash
   amp sync --apply <thread-url-or-id>
   ```
4. Inspect the diff before accepting it:
   ```bash
   git diff --stat
   git diff
   ```
5. Run the narrowest validation that covers that slice.
6. If accepted, keep the changes and move to the next worker. If rejected, revert only that worker's local changes when the user has authorized destructive cleanup, or manually edit around them.
7. After all accepted workers are combined, run the project's canonical verification.

For this repository, the canonical check is:

```bash
bun run build
```

Never run `bun run dev` unless the user explicitly asks.

## Conflict and ownership rules

- Assign each worker explicit file ownership. Shared files need a single owner or a follow-up integration worker.
- Keep shared types/contracts in the coordinator or one designated worker.
- Prefer applying low-level/backend contract changes before UI consumers.
- If two workers produce competing edits, choose one coherent direction; do not paste both together mechanically.
- Re-run validation after resolving conflicts, not just after each independent sync.

## Coordinator responsibilities

The coordinator is responsible for the final result, not the workers. After workers finish:

- Synthesize their reports.
- Inspect actual diffs locally.
- Resolve conflicts and remove duplicate abstractions.
- Run combined verification.
- Summarize what landed, what was rejected, and what remains.
