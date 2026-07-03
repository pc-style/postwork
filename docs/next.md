# Next

Postwork now has the core demo loop in place: a centered reading shell, routable feed filters, quick post creation, post detail with nested replies, spaces, walls, flash experiments, and AI summary/task surfaces. The next work should reduce prototype split-brain and make the deployed demo easier to evaluate.

## 1. make spaces use real post threads

**Why it matters:** `convex/schema.ts` and `convex/spaces.ts` already model spaces, memberships, visibility, and space feeds, but the frontend still renders shared-space content from `src/lib/spaces.tsx` as session-only cards in `src/routes/SpacePage.tsx`. Those cards do not open durable `/posts/$postId` threads, so spaces feel like a parallel mock product.

**Done looks like:** creating or viewing a space post uses the same post detail, replies, unread, priority, search, and agent-summary mechanics as the main feed; visibility is legible; space feeds reuse post-card/thread primitives instead of inert local articles.

**Main files / areas:** `convex/schema.ts`, `convex/posts.ts`, `convex/spaces.ts`, `src/lib/spaces.tsx`, `src/routes/SpacePage.tsx`, `src/routes/SpacesPage.tsx`, `src/components/PostCard.tsx`, `src/routes/PostPage.tsx`.

## 2. consolidate composer surfaces

**Why it matters:** the app has multiple creation paths with slightly different behavior: `QuickPostBar`, `NewPostDialog`, `WallPostDialog`, reply `Composer`, and the space-local composer. That makes the prototype harder to reason about and easier to regress.

**Done looks like:** one composer vocabulary covers posts, replies, wall notes, and space posts where appropriate; validation, disabled states, priority controls, submit shortcuts, and navigation after creation are consistent.

**Main files / areas:** `src/components/QuickPostBar.tsx`, `src/components/NewPostDialog.tsx`, `src/components/WallPostDialog.tsx`, `src/components/Composer.tsx`, `src/routes/SpacePage.tsx`, `src/lib/store.tsx`.

## 3. harden the AI catch-up loop

**Why it matters:** agent summaries and dispatched agent tasks are the clearest differentiator from chat, but they are still split between post summary regeneration, in-memory task state, and local reply injection.

**Done looks like:** stale summaries are obvious after new replies; summary copy explains included context; agent-task results are easy to find from the post and `/agents`; failed/no-key states remain calm; transcripts include enough nested reply context to be useful.

**Main files / areas:** `src/components/AgentSummary.tsx`, `src/components/AgentTasksPanel.tsx`, `src/components/ReplyTree.tsx`, `src/components/SendAgentButton.tsx`, `src/lib/agentTasks.tsx`, `convex/ai.ts`, `convex/agentTasks.ts`.

## 4. prune or graduate flash experiments

**Why it matters:** the lab still contains shipped, deprecated, and active ideas. That is useful while designing, but the demo should not make evaluators wonder which shell/composer is canonical.

**Done looks like:** shipped experiments are clearly historical or removed from the active lab; deprecated experiments either explain their lesson briefly or move to archive; the default app shell remains the canonical experience.

**Main files / areas:** `src/flashExperiments/*`, `src/routes/FlashExperimentsPage.tsx`, `src/components/AppShell.tsx`, `docs/archive/`.

## 5. run a deployed-demo polish pass

**Why it matters:** the product promise depends on immediate readability: quiet density, priority at a glance, and no rough prototype seams.

**Done looks like:** feed, post detail, new post, replies, agents, spaces, walls, and flash lab are checked at desktop and narrow widths; focus states and keyboard paths work; lowercase chrome and single-accent discipline hold; empty/loading/error states share the same voice; Vercel/Plausible/Convex deploy notes are current.

**Main files / areas:** `src/routes/*`, `src/components/*`, `src/index.css`, `README.md`, `docs/product.md`, `docs/design.md`.
