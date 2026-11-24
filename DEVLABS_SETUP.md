# Connecting DevLabs to the RSH 24/7 Bots

DevLabs (https://devlabs.atmt.dev) runs AI agents on your own computer. Together with the app's **always-on mode**, it keeps **all 7 bots working 24/7**:

| Bot | Runs in | How often |
|---|---|---|
| Pixel (asset briefs and prompts) | the app, always-on window | every 30 min |
| Quill (captions and SEO) | the app, always-on window | every 30 min |
| Tempo (best times, schedules approved posts in Metricool) | the app, always-on window | every 30 min |
| Ref (checks, next steps) | the app, always-on window | every 30 min |
| Courier (posting status, Metricool queue) | the app, plus DevLabs Night Owl | every 30 min, plus 6:45 AM |
| Reel (video edits and revisions) | the app queues the job, DevLabs Reel edits it | every 15 min |
| Night Owl (daily run, report, watchdog) | DevLabs | daily at 6:45 AM; watchdog hourly |

Nobody has to type "yes": DevLabs runs in Auto mode, and the app only ever schedules posts that have both approvals.

App: https://claude.ai/artifact/YR8cQvQaSPNMVNxngvihpz

---

## 1. One-time setup on the computer that stays on

1. **Install Claude Code** and sign in with the **same Claude account that owns the RSH app**. DevLabs runs Claude Code for each agent; connectors only work with Claude Code agents.
2. **Install ffmpeg** so the agents can cut video:
   - Mac: `brew install ffmpeg`
   - Windows: `winget install ffmpeg`
3. **Install DevLabs** from https://devlabs.atmt.dev/#download. It is free and needs no account.
4. First start:
   - pick **Claude Code** as the AI tool;
   - make a project folder, for example `Documents/RSH-DevLabs`;
   - choose **Auto mode**, so agents work without asking.
5. **Turn on the app's always-on mode** on this same computer:
   - Open https://claude.ai/artifact/YR8cQvQaSPNMVNxngvihpz in Chrome, signed in to the owner account, in its own window. Leave it open; it can sit behind other windows.
   - Go to 24/7 Bots → Setup and tick **"Run all bots 24/7 on this computer"**. The Bots screen then shows **🟢 24/7: the whole team is on duty**.
   - In Chrome → Settings → Performance, add `claude.ai` to **"Always keep these sites active"**, so Chrome never puts the tab to sleep.
   - Set the computer to never sleep while plugged in. On Mac: System Settings → Battery/Energy → "Prevent automatic sleeping".
6. **Check that the agent can reach the RSH app.** In DevLabs, talk to Ramon:
   > "Can you use the ArtifactData tool on https://claude.ai/artifact/YR8cQvQaSPNMVNxngvihpz and list the collection editJobs? Also check that you have the Metricool connector."

   If both work, continue. If not, open Claude Code on that computer, run `/mcp`, and check that the claude.ai connectors (Metricool) are on.

**Safety:**
- Give the agents only the `RSH-DevLabs` folder.
- Set a spending limit per agent (DevLabs → Budgets).
- The prompts below forbid approving, publishing early or changing campaigns. Approval stays with the manager, then Anthony, inside the app.

---

## 2. Import the RSH team (one file)

In DevLabs: **add agent → import floor…** → pick **`devlabs/rsh-sports-24-7-bots.floor.json`** → **hire all** → choose your `RSH-DevLabs` folder.

This adds two Claude Code agents, with their full instructions already written in:
- **Reel - Video Editor**: edits campaign videos and revisions from the app's queue.
- **Night Owl - Daily Run**: sends the app's waiting posts to Metricool, checks the next 7 days, writes the morning report, and reopens the 24/7 window if it stops.

The file was checked with DevLabs' own floor validator. It holds no keys, folders or memory.

## 3. Add three schedules (Ramon → triggers → Schedules)

| When | Request to type |
|---|---|
| Every 15 minutes | `Reel - Video Editor: check the queue.` |
| Every hour | `Night Owl - Daily Run: watchdog.` |
| Every day at 6:45 AM | `Night Owl - Daily Run: daily run.` |

Each agent already knows what these requests mean, because the steps are in its goal.

## 4. What changes for the team

- **No more "yes".** Edit jobs and revisions are picked up within 15 minutes, as long as the computer is on and DevLabs is open. Turn on DevLabs' stay-awake / night-shift setting.
- **Review notes → new cut.** When the manager writes "Changes requested", the app creates a revision job, and Reel delivers the next version.
- **Waiting posts go out** every morning, and the Night Owl report appears in the app's 24/7 Bots → Office.
- **Approvals do not change.** Manager review, then Anthony's final approval, still happen only in the app.
