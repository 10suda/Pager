import assert from "node:assert/strict";
import test from "node:test";
import { getVoteMutation } from "../cloud-store.js";

test("a first vote inserts a vote row", () => {
  assert.equal(getVoteMutation(0, 1), "insert");
  assert.equal(getVoteMutation(0, -1), "insert");
});

test("clicking the active vote removes it", () => {
  assert.equal(getVoteMutation(1, 1), "delete");
  assert.equal(getVoteMutation(-1, -1), "delete");
});

test("switching vote direction updates the existing row", () => {
  assert.equal(getVoteMutation(1, -1), "update");
  assert.equal(getVoteMutation(-1, 1), "update");
});
