# Pager

Pager is a Chrome extension that adds a Reddit-like discussion layer to every webpage. Open the extension while browsing to vote on the current page and join its comment thread.

## Current MVP

- Page-specific upvotes and downvotes
- Page-specific comments with top/new sorting
- Comment voting and deletion
- Persistent local profile and data using `chrome.storage.local`
- URL normalization so tracking parameters and fragments do not split discussions
- Accessible, responsive Manifest V3 popup
- Reproducible build pipeline that bundles dependencies locally

> **Storage note:** v0.1 is a local-first prototype. Votes and comments persist in the current Chrome profile, but are not yet shared between users. The UI and storage layer are separated so the local adapter can be replaced with an authenticated API in the next phase.

## Development setup

Requirements: Node.js 20 or newer and npm.

```bash
git clone https://github.com/10suda/Pager.git
cd Pager
npm install
npm run check
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the generated `dist` folder.
4. Pin Pager, open any `http` or `https` webpage, and click the Pager icon.

Run `npm run build` after changing extension source files, then click the reload
button on Pager's `chrome://extensions` card.

## Supabase configuration

Pager remains in local MVP mode when cloud configuration is absent. To prepare a
cloud-connected development build:

```bash
cp .env.example .env
```

Fill in the development project's URL and **publishable** key, then run:

```bash
npm run check
```

The build adds only that project's HTTPS origin to `host_permissions`. Never add
a Supabase `service_role` or secret key to `.env`, source control, or an extension
bundle.

## Architecture

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome Manifest V3 configuration |
| `popup.html` | Semantic popup structure |
| `popup.css` | Pager visual system and layout |
| `popup.js` | UI events, rendering, and page interaction |
| `store.js` | Persistence and canonical URL logic |
| `cloud.js` | Supabase client factory and cloud configuration |
| `scripts/build.mjs` | Produces the loadable `dist` extension |

No host permissions or content scripts are required. Pager only reads the active tab's URL, title, and favicon when opened.

## Next phase: shared community data

Replace `store.js` with a remote adapter backed by a service such as Supabase, Firebase, or a small API with PostgreSQL. A production data model should include:

- authenticated users and public profiles;
- canonical pages keyed by normalized URL;
- one page vote and one comment vote per user;
- comments, replies, reports, and moderation state;
- rate limiting, abuse prevention, and server-side score aggregation.

Keep API credentials and privileged keys out of the extension. Only a public client key belongs in the packaged client; authorization must be enforced by the backend.

## License

MIT
