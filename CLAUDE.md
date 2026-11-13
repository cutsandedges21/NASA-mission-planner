# NASA Space Apps 2026: Mars Mission Planner

Two-person team. Both of us work with Claude, so **this repo is our shared memory.** If it isn't written in `docs/`, the other person's Claude doesn't know it.

## Read these before doing anything

1. [docs/PLAN.md](docs/PLAN.md): what we're building, why, features by tier, the demo, who does what
2. [docs/DECISIONS.md](docs/DECISIONS.md): every decision already made, with dates. Don't re-open these without a good reason.
3. [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md): what's still undecided and what we want help brainstorming

## One-line summary

A web-based **Mars mission-planning platform** for the challenge *Interplanetary Survival Guide: Martian Map*. You pick a base and a destination. The app computes SAFE / FAST / SCIENCE routes from real NASA terrain data, shows the tradeoffs on a dashboard, has AI explain the recommendation, and animates a rover driving the route.

## Rules for Claude sessions in this repo

- **Keep the docs current.** When a decision is made, add it to `docs/DECISIONS.md` (date, decision, why, who). When a question gets answered, move it out of `OPEN-QUESTIONS.md`. Commit doc changes with the code that caused them.
- **Pull before you start, push when you finish.** Two people and two Claudes are working in parallel. Small commits, clear messages.
- **AI is a component, not the product.** Routes, hazards and stats must be *computed* from data. AI explains the results. It never makes them up.
- **Tier 1 before Tier 2 before Tier 3.** The biggest risk is a half-finished project that's technically impressive but incomplete. See the tiers in `docs/PLAN.md`.
- **Real NASA data beats synthetic data.** Synthetic terrain is fine as a placeholder, but the submission must visibly use NASA datasets.
