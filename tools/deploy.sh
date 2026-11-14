#!/usr/bin/env bash
# Deploy exactly what is on GitHub main to https://nasa-eva-planner.vercel.app
# Run on MOSS'S PC ONLY (the Vercel CLI is logged in there), from Git Bash, in the repo root:
#     bash tools/deploy.sh
# Why a snapshot: the Vercel Hobby plan blocks deploys whose git commit author isn't the account owner, so we deploy
# a copy with no git history. Takes ~2 min. If the build fails, the old site stays live (nothing breaks).
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin
SNAP=/c/tmp/deploy-snapshot
rm -rf "$SNAP"
mkdir -p "$SNAP/.vercel"
git archive origin/main web planner | tar -x -C "$SNAP"
cp .vercel/project.json "$SNAP/.vercel/"
echo "Deploying origin/main $(git rev-parse --short origin/main) ..."
cd "$SNAP"
vercel deploy --prod --yes
echo "Done. Check https://nasa-eva-planner.vercel.app and write 'DEPLOYED <commit>' in the SYNC LOG of docs/TASKS.md."
