# Daily Metricool refresh

Status: designed, not switched on. Creating the scheduled task from the build session was blocked
twice pending explicit approval.

What it does once a day (suggested 5:47 AM US Eastern), read-only:
1. Pulls 28 days of published posts, follower counts, the next 14 days of scheduled posts and
   per-post comment counts for the RSH Sports brand (Metricool brand id 5695688).
2. Rewrites four documents in the artifact database, collection `live`:
   `metricool`, `followers`, `scheduled`, `comments`.
3. Never schedules, edits or publishes anything, and never touches the page or other documents.

Document formats are defined by the readers in `artifact/live.js` (`start`, `findFollowerRows`,
`compactScheduled`, `replyBox`). Field ids used for comments are in `artifact/seed/comments_fields.json`
when a pull has been run in this checkout.

To refresh by hand: ask Claude in the build session to "refresh the numbers".
