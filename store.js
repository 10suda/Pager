const ROOT_KEY = "pagerState";

const defaultState = () => ({
  profile: {
    id: crypto.randomUUID(),
    name: `Guest ${Math.floor(1000 + Math.random() * 9000)}`
  },
  pages: {}
});

export async function getState() {
  const result = await chrome.storage.local.get(ROOT_KEY);
  if (result[ROOT_KEY]) return result[ROOT_KEY];

  const state = defaultState();
  await saveState(state);
  return state;
}

export async function saveState(state) {
  await chrome.storage.local.set({ [ROOT_KEY]: state });
}

export function getPage(state, pageKey) {
  if (!state.pages[pageKey]) {
    state.pages[pageKey] = { vote: 0, score: 0, comments: [] };
  }
  return state.pages[pageKey];
}

export function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = "";
  [
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "fbclid", "mc_cid", "mc_eid"
  ].forEach((key) => url.searchParams.delete(key));
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
  url.searchParams.sort();
  return url.toString();
}
