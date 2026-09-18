import assert from "node:assert/strict";
import test from "node:test";
import { getPage, normalizeUrl } from "../store.js";

test("normalizeUrl removes fragments and known tracking parameters", () => {
  assert.equal(
    normalizeUrl("https://Example.com/story/?utm_source=newsletter&b=2&a=1#comments"),
    "https://example.com/story?a=1&b=2"
  );
});

test("normalizeUrl preserves meaningful query parameters", () => {
  assert.equal(
    normalizeUrl("https://example.com/search?q=pager&utm_campaign=launch"),
    "https://example.com/search?q=pager"
  );
});

test("getPage returns an existing page without replacing it", () => {
  const existing = { vote: 1, score: 4, comments: [] };
  const state = { pages: { "https://example.com/": existing } };
  assert.equal(getPage(state, "https://example.com/"), existing);
});

test("getPage initializes a blank discussion", () => {
  const state = { pages: {} };
  assert.deepEqual(getPage(state, "https://example.com/"), {
    vote: 0,
    score: 0,
    comments: []
  });
});
