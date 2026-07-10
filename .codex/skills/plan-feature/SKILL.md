---
name: plan-feature
description: Create and maintain detailed implementation plans for new software features. Use when the user asks to plan, specify, scope, break down, prepare, execute, resume, update, or track a feature plan, especially when the output should include structured phases, checklists, tests per phase, targeted codebase exploration, token-efficient context synthesis, strategic commit suggestions, progress updates, and a saved Markdown plan under docs/features/feature-slug.md.
---

# Plan Feature

Use this skill to produce or maintain a durable feature implementation plan. When the user asks to execute an existing plan, apply normal coding workflow while keeping the plan document current.

## Workflow

1. Interview the user first.
2. Explore the codebase only after the interview, using the answers to keep exploration targeted.
3. Synthesize the relevant context before planning.
4. Generate a structured, phase-based implementation plan.
5. Save the plan as `docs/features/<feature>.md`.
6. During execution, update the saved plan as phases and checklist items progress.

## Interview

Ask enough questions to remove ambiguity before reading many files. Prefer concise batches of 3-7 questions. Do not ask for facts that can be discovered cheaply from the repository.

Cover:

- Goal and user-facing behavior.
- Target users, entry points, and affected platforms.
- Current pain, expected outcome, and non-goals.
- UX, API, data model, integration, migration, and compatibility constraints.
- Acceptance criteria and edge cases.
- Testing expectations, including automated tests and manual QA.
- Rollout, telemetry, performance, accessibility, privacy, and security concerns when relevant.

If the user wants speed over completeness, ask only the blocking questions and mark unresolved items as assumptions in the plan.

## Directed Exploration

After the interview, inspect the repository with focused commands. Use `rg`/`rg --files` first. Read only files that inform the plan.

Start with the smallest useful set:

- Project instructions: `AGENTS.md`, `README.md`, package manifests, framework config.
- Existing planning docs: `docs/`, backlog files, architecture notes, related feature plans.
- Relevant source files found by feature terms, routes, components, services, hooks, stores, tests, schemas, or API names from the interview.
- Existing tests for the same feature area.

Avoid broad directory dumps. If exploration becomes large, stop and summarize what is known, then continue with narrower searches.

## Context Synthesis

Before writing the plan, produce a compact working summary for yourself and use it to drive the plan. Include only decision-useful context:

- Current architecture and feature area ownership.
- Existing patterns to follow.
- Relevant files and why they matter.
- Known constraints, risks, and open questions.
- Test surfaces already available.

Prefer file references over pasted code. Do not include long source excerpts unless essential.

## Plan Requirements

Write the generated plan in the dominant language of the project documentation. If the project language is mixed, match the user's language.

The plan must be detailed enough for another Codex session to resume without redoing discovery. Include:

- Title and metadata: feature name, date, status, authoring context.
- Objective and non-goals.
- Current-state summary with relevant files.
- Decisions, assumptions, and open questions.
- Proposed architecture and data/control flow.
- Phased implementation checklist.
- Tests for every phase.
- Manual QA, accessibility, performance, security/privacy, and regression checks where applicable.
- Rollout/backout notes if the feature affects production behavior.
- Strategic commit plan with small, reviewable commits grouped by phase.
- Progress tracking instructions for execution sessions.
- Future-session handoff with exact next steps, key files, commands, and unresolved decisions.

For each phase include:

- Status: `Not started`, `In progress`, `Blocked`, or `Done`.
- Purpose.
- Files or areas likely to change.
- Implementation checklist using Markdown checkboxes.
- Tests to add or run using Markdown checkboxes.
- Acceptance criteria.
- Suggested commit boundary and example commit message.
- Risks and validation notes.

## During Plan Execution

When executing a saved plan, treat `docs/features/<feature>.md` as the source of truth.

Before starting work:

- Read the plan and identify the active phase.
- Confirm unresolved decisions that block implementation.
- Mark the phase as `In progress` when work begins.

While working:

- Update phase checklists as items are completed.
- Add new checklist items when discovery changes the implementation path.
- Keep tests, manual QA, risks, and handoff notes current.
- Record important deviations from the original plan with a short reason.
- Suggest strategic commit points when a coherent, tested slice is complete. Do not create commits unless the user asks.

When a phase is complete:

- Mark the phase as `Done`.
- Check off completed implementation and test items.
- Add evidence: files changed, tests run, manual checks performed, and known residual risks.
- Suggest the next commit boundary, including what files or changes belong together and an example commit message.
- Update the future-session handoff with the next phase, exact next steps, and any blockers.
- Tell the user what was completed, what validation was done, and what the next step is before moving on.

Do not wait until the end of the full feature to update the plan. Keep the document useful for immediate resume in another session.

## File Output

Create `docs/features/` if it does not exist.

Name the file with a stable slug derived from the feature, for example:

```text
docs/features/<feature-slug>.md
```

Do not overwrite an existing plan unless the user explicitly asks to update it. If a file already exists, either update it with clear preservation of prior content or choose a suffix such as `-v2` after confirming the intent when needed.

## Token Discipline

Optimize for context quality, not exhaustive reading:

- Interview before exploration.
- Prefer searches over full-file reads.
- Read nearby tests and interfaces before deep implementation details.
- Summarize findings once, then refer to the summary.
- Keep the skill's final response short: report the saved path, major plan sections, and any unresolved questions.

## Stop Conditions

Ask the user before proceeding if:

- Core requirements conflict.
- The feature depends on missing product decisions.
- The plan would require access to private systems or unavailable credentials.
- The requested output path conflicts with existing files and the update strategy is unclear.
