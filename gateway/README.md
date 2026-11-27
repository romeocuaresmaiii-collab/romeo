# RSH Sports posting gateway

RSH's own posting service, so the Marketing OS can post without Metricool. Phase 1 is Bluesky. YouTube, Pinterest,
Meta (Instagram + Facebook) and TikTok get added here as each platform approves RSH's developer app.

**Why a gateway?** The app page can't hold passwords or reach outside websites, and Claude must never see the
account password either. The gateway is a tiny Cloudflare Worker (free plan) that keeps the credentials as encrypted
secrets and posts when it gets a request carrying RSH's gateway token.

```
App (approved post) ──► publishQueue in the app's storage ──► Claude session at the slot time ──► Gateway ──► Bluesky
                                                    ▲                                                   │
                                                    └──────────── post link + likes / reposts / replies ┘
```

## One-time setup (about 15 minutes, Anthony or an account owner)

1. **Make a Bluesky app password.** In Bluesky: Settings → Privacy and security → App passwords → Add, and name it
   "RSH gateway". Copy it. Never use the account's main password.
2. **Make the Worker.** Sign in to dash.cloudflare.com (free account) → Workers & Pages → Create → Create Worker,
   name it `rsh-post-gateway` → Deploy. Then click **Edit code**, replace everything with the contents of
   `gateway/worker.js` from this repository, and click **Deploy**.
3. **Add three secrets.** Open the Worker → Settings → Variables and Secrets → Add, with type **Secret** for each:
   - `BSKY_HANDLE`: the account handle, e.g. `rshsports.bsky.social`
   - `BSKY_APP_PASSWORD`: the app password from step 1
   - `GATEWAY_TOKEN`: a long random string (at least 32 characters). A password manager can generate one.
4. **Tell Claude the Worker's address**, e.g. `rsh-post-gateway.<your-subdomain>.workers.dev`. Do **not** paste any
   secret into the chat. Claude will open a secure form where you paste `GATEWAY_TOKEN` once. It is stored as an
   encrypted credential for that address only, and Claude never sees it.
5. Claude checks `/health`. When it shows the account, the owner switches Bluesky to direct posting, and from then on
   approved Bluesky posts skip Metricool.

## Routes

All routes need `Authorization: Bearer <GATEWAY_TOKEN>`.

| Route | What it does |
|---|---|
| `GET /health` | Logs in and returns the account handle (proves the secrets work) |
| `POST /bluesky/post` | `{ text, image?: { base64, mime, alt }, langs? }`: posts. Text is at most 300 characters, the image at most about 950 KB. Links such as rshsports.com are made clickable. |
| `GET /bluesky/stats?uris=at://…` | Likes, reposts, replies and quotes for up to 25 posts |
| `GET /bluesky/profile` | Follower, following and post counts |

## Safety

- The app password exists only as a Cloudflare secret. To revoke it, delete the app password in Bluesky.
- A wrong or missing token gets `401`. Change `GATEWAY_TOKEN` any time; then update the credential in Claude.
- The gateway only posts; it never deletes or edits. Nothing posts unless a campaign was approved in the app.
- Test offline with `node gateway/test.mjs`, which uses a stand-in for Bluesky and posts nothing.
