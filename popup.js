import { createPagerClient } from "./cloud.js";
import { createCloudPagerStore } from "./cloud-store.js";
import { createLocalPagerStore } from "./local-store.js";
import { normalizeUrl } from "./store.js";

const client = createPagerClient();
const dataStore = client ? createCloudPagerStore(client) : createLocalPagerStore();

const els = {
  main: document.querySelector("#mainContent"),
  loading: document.querySelector("#loadingState"),
  error: document.querySelector("#errorState"),
  errorMessage: document.querySelector("#errorMessage"),
  retry: document.querySelector("#retryButton"),
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
  mode: document.querySelector("#dataMode"),
  count: document.querySelector("#commentCount"),
  list: document.querySelector("#commentList"),
  empty: document.querySelector("#emptyState"),
  sort: document.querySelector("#sortSelect"),
  identityButton: document.querySelector("#identityButton"),
  dialog: document.querySelector("#identityDialog"),
  identityName: document.querySelector("#identityName"),
  identityId: document.querySelector("#identityId"),
  closeIdentity: document.querySelector("#closeIdentity"),
  doneIdentity: document.querySelector("#doneIdentity"),
  toast: document.querySelector("#toast")
};

let state;
let page;
let activeTab;
let busy = false;

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
  return name.trim().split(/\s+|(?=[A-Z])/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]).join("").toUpperCase();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.setTimeout(() => els.toast.classList.remove("visible"), 2400);
}

function setBusy(nextBusy) {
  busy = nextBusy;
  els.main.setAttribute("aria-busy", String(nextBusy));
  els.main.querySelectorAll("button, textarea, select").forEach((control) => {
    control.disabled = nextBusy;
  });
}

function applySnapshot(nextState) {
  state = nextState;
  page = nextState.page;
  els.postingAs.textContent = state.profile.name;
  els.identityName.textContent = state.profile.name;
  els.identityId.textContent = state.profile.id;
  els.identityButton.disabled = false;
  els.mode.textContent = dataStore.mode === "cloud" ? "Shared discussion" : "Local preview";
  renderPageVote();
  renderComments();
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
  item.dataset.id = String(comment.id);

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

async function runMutation(action, successMessage) {
  if (busy) return false;
  setBusy(true);
  try {
    applySnapshot(await action());
    if (successMessage) showToast(successMessage);
    return true;
  } catch (error) {
    console.error(error);
    showToast(error.message || "Pager could not save that change.");
    return false;
  } finally {
    setBusy(false);
  }
}

async function init() {
  els.loading.hidden = false;
  els.main.hidden = true;
  els.error.hidden = true;
  els.unsupported.hidden = true;

  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !isSupportedUrl(activeTab.url)) {
    els.loading.hidden = true;
    els.unsupported.hidden = false;
    return;
  }

  const canonicalUrl = normalizeUrl(activeTab.url);
  const url = new URL(canonicalUrl);
  els.title.textContent = activeTab.title || url.hostname;
  els.hostname.textContent = url.hostname.replace(/^www\./, "");
  els.favicon.src = activeTab.favIconUrl || "./icons/icon-32.png";

  applySnapshot(await dataStore.initialize({
    canonicalUrl,
    domain: url.hostname,
    title: (activeTab.title || url.hostname).slice(0, 500)
  }));

  els.loading.hidden = true;
  els.main.setAttribute("aria-busy", "false");
  els.main.hidden = false;
}

async function start() {
  try {
    await init();
  } catch (error) {
    console.error(error);
    els.loading.hidden = true;
    els.main.hidden = true;
    els.errorMessage.textContent = dataStore.mode === "cloud"
      ? "Pager couldn’t reach the shared discussion. Check your connection and try again."
      : "Pager couldn’t load its local data. Close the extension and try again.";
    els.error.hidden = false;
  }
}

els.upvote.addEventListener("click", () => runMutation(() => dataStore.castPageVote(1)));
els.downvote.addEventListener("click", () => runMutation(() => dataStore.castPageVote(-1)));
els.sort.addEventListener("change", renderComments);
els.retry.addEventListener("click", start);

els.share.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(activeTab.url);
    showToast("Page link copied");
  } catch (error) {
    console.error(error);
    showToast("Pager couldn’t copy the link.");
  }
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = els.input.value.trim();
  if (!body) return;
  const saved = await runMutation(() => dataStore.postComment(body), "Comment posted");
  if (saved) els.input.value = "";
});

els.list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  const item = event.target.closest(".comment");
  if (!button || !item) return;
  const comment = page.comments.find((entry) => String(entry.id) === item.dataset.id);
  if (!comment) return;

  if (button.dataset.action === "delete") {
    await runMutation(() => dataStore.deleteComment(comment.id), "Comment deleted");
    return;
  }

  const nextVote = button.dataset.action === "up" ? 1 : -1;
  await runMutation(() => dataStore.castCommentVote(comment.id, nextVote));
});

function closeIdentity() {
  els.dialog.close();
}

els.identityButton.addEventListener("click", () => els.dialog.showModal());
els.closeIdentity.addEventListener("click", closeIdentity);
els.doneIdentity.addEventListener("click", closeIdentity);

start();
