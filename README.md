# Pager

Pager is a Chrome extension that adds a Reddit-like discussion layer to every webpage. Open the extension while browsing to vote on the current page and join its comment thread.

## Current MVP

- Page-specific upvotes and downvotes
- Page-specific comments with top/new sorting
- Comment voting and deletion
- Shared discussions backed by Supabase
- Persistent anonymous identity stored in `chrome.storage.local`
- URL normalization so tracking parameters and fragments do not split discussions
- Accessible, responsive Manifest V3 popup
- Reproducible build pipeline that bundles dependencies locally

> **Identity note:** Pager creates an anonymous Supabase user the first time the
> configured extension opens. The generated pseudonym persists in that Chrome
> profile. Clearing Pager's extension storage or uninstalling it creates a new
> identity; Pager does not use IP or MAC addresses as identity keys.

## Development setup

Requirements: Node.js 22 or newer and npm.

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

Pager uses a local preview store when cloud configuration is absent. To create a
shared, cloud-connected build:

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

## Database development

The `supabase` directory contains Pager's reproducible database configuration:

- `migrations/20260918161400_pager_initial_schema.sql` creates profiles, pages,
  comments, votes, reports, blocks, score triggers, and row-level security;
- `database.types.ts` contains generated TypeScript types for the deployed schema;
- `config.toml` enables anonymous users locally and disables accidental Data API
  grants for new tables.

Anonymous Supabase users receive a stable generated pseudonym such as
`CopperOtter-482193`. Raw vote rows are private, public scores are maintained by
database triggers, and browser clients cannot update aggregate scores directly.

## Architecture

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome Manifest V3 configuration |
| `popup.html` | Semantic popup structure |
| `popup.css` | Pager visual system and layout |
| `popup.js` | UI events, rendering, and page interaction |
| `store.js` | Local persistence and canonical URL logic |
| `cloud.js` | Supabase client factory and cloud configuration |
| `cloud-store.js` | Anonymous auth and secured shared-data operations |
| `local-store.js` | Offline/local preview adapter |
| `scripts/build.mjs` | Produces the loadable `dist` extension |

Pager uses no content scripts or broad website access. A configured build grants
network access only to its Supabase project origin, and Pager reads the active
tab's URL, title, and favicon only when opened.

## Cloud behavior

On first open, Pager creates an anonymous Supabase session and receives a stable
generated pseudonym. Opening a webpage creates or retrieves its canonical page
record. Comments and votes are shared across installations, while row-level
security limits each browser identity to its own votes and comments. Only the
public publishable key is packaged with the extension.

## License

MIT
