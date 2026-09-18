import { getPage, getState, normalizeUrl, saveState } from "./store.js";
import { createPagerClient } from "./cloud.js";

// Phase 1 only prepares the cloud client. Until Supabase is configured and the
// shared schema exists, Pager deliberately continues using its local MVP store.
const pagerCloudClient = createPagerClient();
console.info(`Pager data mode: ${pagerCloudClient ? "cloud-ready" : "local"}`);

const els = {
  main: document.querySelector("#mainContent"),
  unsupported: document.querySelector("#unsupportedState"),
  title: document.querySelector("#pageTitle"),
  hostname: document.querySelector("#hostname"),
  favicon: document.querySelector("#favicon"),
  score: document.querySelector("#pageScore"),
  upvote: document.querySelector("#upvoteButton"),
  downvote: document.querySelector("#downvoteButton"),
  share: document.querySelector("#shareButton"),
  form: document.querySelector("#commentForm"),
  input: document.querySelector("#commentInput"),
  postingAs: document.querySelector("#postingAs"),
  count: document.querySelector("#commentCount"),
  list: document.querySelector("#commentList"),
  empty: document.querySelector("#emptyState"),
  sort: document.querySelector("#sortSelect"),
  settingsButton: document.querySelector("#settingsButton"),
  dialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  displayName: document.querySelector("#displayNameInput"),
  closeSettings: document.querySelector("#closeSettings"),
  cancelSettings: document.querySelector("#cancelSettings"),
  toast: document.querySelector("#toast")
};

let state;
let page;
let pageKey;
let activeTab;

function isSupportedUrl(url = "") {
  return /^https?:\/\//i.test(url);
}

function relativeTime(timestamp) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  const units = [
    [31536000, "year"], [2592000, "month"], [86400, "day"],
    [3600, "hour"], [60, "minute"], [1, "second"]
  ];
  const [divisor, name] = units.find(([value]) => seconds >= value);
  const amount = Math.floor(seconds / divisor);
  return `${amount} ${name}${amount === 1 ? "" : "s"} ago`;
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.setTimeout(() => els.toast.classList.remove("visible"), 1800);
}

function renderPageVote() {
  els.score.textContent = page.score;
  els.upvote.classList.toggle("active-up", page.vote === 1);
  els.downvote.classList.toggle("active-down", page.vote === -1);
  els.upvote.setAttribute("aria-pressed", String(page.vote === 1));
  els.downvote.setAttribute("aria-pressed", String(page.vote === -1));
}

function createCommentElement(comment) {
  const item = document.createElement("li");
  item.className = "comment";
  item.dataset.id = comment.id;

  const head = document.createElement("div");
  head.className = "comment-head";
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = initials(comment.authorName);
  const author = document.createElement("span");
  author.className = "author";
  author.textContent = comment.authorName;
  const time = document.createElement("time");
  time.className = "timestamp";
  time.dateTime = new Date(comment.createdAt).toISOString();
  time.textContent = relativeTime(comment.createdAt);
  head.append(avatar, author, time);

  const body = document.createElement("p");
  body.className = "comment-body";
  body.textContent = comment.body;

  const actions = document.createElement("div");
  actions.className = "comment-actions";
  const up = document.createElement("button");
  up.className = `comment-vote${comment.vote === 1 ? " active" : ""}`;
  up.type = "button";
  up.dataset.action = "up";
  up.setAttribute("aria-label", "Upvote comment");
  up.textContent = "▲";
  const commentScore = document.createElement("span");
  commentScore.className = "comment-score";
  commentScore.textContent = comment.score;
  const down = document.createElement("button");
  down.className = `comment-vote${comment.vote === -1 ? " active" : ""}`;
  down.type = "button";
  down.dataset.action = "down";
  down.setAttribute("aria-label", "Downvote comment");
  down.textContent = "▼";
  actions.append(up, commentScore, down);

  if (comment.authorId === state.profile.id) {
    const remove = document.createElement("button");
    remove.className = "delete-comment";
    remove.type = "button";
    remove.dataset.action = "delete";
    remove.textContent = "Delete";
    actions.append(remove);
  }

  item.append(head, body, actions);
  return item;
}

function renderComments() {
  const comments = [...page.comments];
  comments.sort(els.sort.value === "new"
    ? (a, b) => b.createdAt - a.createdAt
    : (a, b) => b.score - a.score || b.createdAt - a.createdAt);

  els.list.replaceChildren(...comments.map(createCommentElement));
  els.empty.hidden = comments.length > 0;
  els.count.textContent = `${comments.length} comment${comments.length === 1 ? "" : "s"}`;
}

async function castPageVote(nextVote) {
  const previous = page.vote;
  page.vote = previous === nextVote ? 0 : nextVote;
  page.score += page.vote - previous;
  await saveState(state);
  renderPageVote();
}

async function init() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !isSupportedUrl(activeTab.url)) {
    els.main.hidden = true;
    els.unsupported.hidden = false;
    return;
  }

  state = await getState();
  pageKey = normalizeUrl(activeTab.url);
  page = getPage(state, pageKey);
  await saveState(state);

  const url = new URL(activeTab.url);
  els.title.textContent = activeTab.title || url.hostname;
  els.hostname.textContent = url.hostname.replace(/^www\./, "");
  els.favicon.src = activeTab.favIconUrl || "./icons/icon-32.png";
  els.postingAs.textContent = state.profile.name;
  els.displayName.value = state.profile.name;
  renderPageVote();
  renderComments();
}

els.upvote.addEventListener("click", () => castPageVote(1));
els.downvote.addEventListener("click", () => castPageVote(-1));
els.sort.addEventListener("change", renderComments);

els.share.addEventListener("click", async () => {
  await navigator.clipboard.writeText(activeTab.url);
  showToast("Page link copied");
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = els.input.value.trim();
  if (!body) return;
  page.comments.push({
    id: crypto.randomUUID(),
    authorId: state.profile.id,
    authorName: state.profile.name,
    body,
    createdAt: Date.now(),
    score: 1,
    vote: 1
  });
  els.input.value = "";
  await saveState(state);
  renderComments();
  showToast("Comment posted");
});

els.list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  const item = event.target.closest(".comment");
  if (!button || !item) return;
  const comment = page.comments.find((entry) => entry.id === item.dataset.id);
  if (!comment) return;

  if (button.dataset.action === "delete") {
    page.comments = page.comments.filter((entry) => entry.id !== comment.id);
    showToast("Comment deleted");
  } else {
    const next = button.dataset.action === "up" ? 1 : -1;
    const previous = comment.vote;
    comment.vote = previous === next ? 0 : next;
    comment.score += comment.vote - previous;
  }
  await saveState(state);
  renderComments();
});

function closeDialog() { els.dialog.close(); }
els.settingsButton.addEventListener("click", () => {
  els.displayName.value = state.profile.name;
  els.dialog.showModal();
  els.displayName.select();
});
els.closeSettings.addEventListener("click", closeDialog);
els.cancelSettings.addEventListener("click", closeDialog);
els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = els.displayName.value.trim();
  if (!name) return;
  state.profile.name = name;
  els.postingAs.textContent = name;
  await saveState(state);
  closeDialog();
  renderComments();
  showToast("Display name saved");
});

init().catch((error) => {
  console.error(error);
  els.main.innerHTML = `<section class="unsupported-state"><h1>Something went wrong</h1><p>Close Pager and try opening it again.</p></section>`;
});
