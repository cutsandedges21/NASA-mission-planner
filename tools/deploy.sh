#!/usr/bin/env bash
# Deploy exactly what is on GitHub main to https://nasa-eva-planner.vercel.app
# Run on MOSS'S PC ONLY (the Vercel CLI is logged in there), in Git Bash:
#     bash tools/deploy.sh
# (from the NASA-Hackathon folder; from anywhere else: bash /c/Users/sport/OneDrive/Documents/CodingPersonal/NASA-Hackathon/tools/deploy.sh)
# Why a snapshot: the Vercel Hobby plan blocks deploys whose git commit author isn't the account owner, so we deploy
# a copy with no git history. Takes ~2 min. If the build fails, the old site stays live (nothing breaks).
# Everything is also written to C:\tmp\deploy-log.txt: if something fails, send that file to Gianluca.
set -uo pipefail
LOG=/c/tmp/deploy-log.txt
mkdir -p /c/tmp
exec > >(tee "$LOG") 2>&1

fail() {
  echo
  echo "=================== DEPLOY FAILED ==================="
  echo "$1"
  echo
  echo "The live site is unchanged (still the previous version)."
  echo "If the fix above doesn't work: send C:\\tmp\\deploy-log.txt to Gianluca"
  echo "and ask his Claude to read it (it knows tools/deploy.sh)."
  echo "====================================================="
  exit 1
}

cd "$(dirname "$0")/.." || fail "Can't find the repo folder."
echo "Repo: $(pwd)"

command -v vercel >/dev/null 2>&1 || fail "The Vercel CLI isn't installed. Fix: npm i -g vercel   then run this again."
command -v git >/dev/null 2>&1 || fail "git isn't available. Open Git Bash (not PowerShell or cmd) and run this again."
[ -f .vercel/project.json ] || fail "Missing .vercel/project.json (the link to the Vercel project). It only exists on Moss's PC, in the NASA-Hackathon folder. Run this script from there."

WHO=$(vercel whoami 2>/dev/null | tail -1)
[ -n "$WHO" ] || fail "Not logged in to Vercel. Fix: run   vercel login   (use the cutsandedges21 account), then run this again."
echo "Vercel account: $WHO"

git fetch -q origin || fail "Can't reach GitHub (no internet?). Check the connection and run this again."
COMMIT=$(git rev-parse --short origin/main)
echo "Deploying GitHub main at commit $COMMIT: $(git log -1 --format=%s origin/main)"

SNAP=/c/tmp/deploy-snapshot
rm -rf "$SNAP" || fail "Can't delete $SNAP. Close any terminal or Explorer window that is inside C:\\tmp\\deploy-snapshot, then run this again."
mkdir -p "$SNAP/.vercel"
git archive origin/main web planner | tar -x -C "$SNAP" || fail "Couldn't copy the code out of git."
cp .vercel/project.json "$SNAP/.vercel/"

cd "$SNAP" || fail "Can't open $SNAP."
echo "Building on Vercel (about 2 minutes)..."
if ! vercel deploy --prod --yes; then
  fail "Vercel didn't deploy. Read the error lines just above this box.
- 'Error: ... build failed' / red build errors: the code has a bug. Send the log to Gianluca.
- 'not authorized' / 'TEAM_ACCESS_REQUIRED': run   vercel login   with the cutsandedges21 account.
- network errors: check the internet and run this again."
fi

echo
echo "Checking the live site..."
sleep 5
CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 30 https://nasa-eva-planner.vercel.app/ || echo 000)
if [ "$CODE" = "200" ]; then
  echo "=================== DEPLOY OK ==================="
  echo "Live: https://nasa-eva-planner.vercel.app  (commit $COMMIT)"
  echo "Tell Gianluca: \"deployed $COMMIT\"  (his Claude writes it in the SYNC LOG)."
  echo "================================================="
else
  fail "Deployed, but the site answered HTTP $CODE. Open https://nasa-eva-planner.vercel.app in a browser; if it's broken, send the log to Gianluca."
fi
