# NASA Space Apps 2026: Mars Mission Planner

**Deadline: Sunday 15 Nov, 12:00 EST.** Schedule at the top of docs/TASKS.md.

Two-person team. Both of us work with Claude, so **this repo is our shared memory.** If it isn't written in `docs/`, the other person's Claude doesn't know it.

## Start here, every session

0. **Sat 14 Nov: Moss's Claude is offline (weekly limit). Gianluca's Claude owns everything: read [docs/HANDOFF.md](docs/HANDOFF.md) first.**
1. `git pull --rebase --autostash`
2. Open **[docs/TASKS.md](docs/TASKS.md)**, the live task board. It says what to do next, step by step, and how to claim a task.
3. Ask your human whether they're **Moss** or **the Teammate**, then take the first `TODO` task for that person.
4. **Read the SYNC LOG** at the top of `docs/TASKS.md` and add one line to it whenever you start, finish or get stuck (Moss wants both Claudes in step). Pull before every step, push right after.

**Stay in sync while you work.** Both people work at the same time. Commit and push after every finished step (about every 2 minutes), and pull before each step. To get alerted to the other side's changes, your human can run this in your session:

```
/loop 2m git pull --rebase --autostash, re-read docs/TASKS.md, and tell me if anything assigned to me or blocking me changed
```

## Background docs (read before your first task)

1. [docs/PLAN.md](docs/PLAN.md): what we're building, why, features by tier, the demo, who does what
2. [docs/DECISIONS.md](docs/DECISIONS.md): every decision already made, with dates. Don't re-open these without a good reason.
3. [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md): what's still undecided and what we want help brainstorming
4. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): stack, folders, the **data contract** and API shapes. Build against these exactly.
5. [docs/CHALLENGE.md](docs/CHALLENGE.md): NASA's official ask + requirement checklist. **The challenge is about astronauts on foot (Marswalk).**

## One-line summary

A web-based **Mars mission-planning platform** for the challenge *Interplanetary Survival Guide: Martian Map*. You pick a base and a destination. The app computes SAFE / FAST / SCIENCE routes from real NASA terrain data, shows the tradeoffs on a dashboard, has AI explain the recommendation, and animates a rover driving the route.

## Rules for Claude sessions in this repo

- **Every step you write must be actionable.** When you add a task or a plan, give the owner, the exact files, the commands, and a "done when" check, so the other Claude can pick it up cold and act immediately. No vague "look into X".
- **Keep the docs current.** When a decision is made, add it to `docs/DECISIONS.md` (date, decision, why, who). When a question gets answered, move it out of `OPEN-QUESTIONS.md`. Commit doc changes with the code that caused them.
- **Pull before you start, push when you finish.** Two people and two Claudes are working in parallel. Small commits, clear messages.
- **AI is a component, not the product.** Routes, hazards and stats must be *computed* from data. AI explains the results. It never makes them up.
- **Tier 1 before Tier 2 before Tier 3.** The biggest risk is a half-finished project that's technically impressive but incomplete. See the tiers in `docs/PLAN.md`.
- **Real NASA data beats synthetic data.** Synthetic terrain is fine as a placeholder, but the submission must visibly use NASA datasets.
