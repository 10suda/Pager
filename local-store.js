import { getPage, getState, saveState } from "./store.js";

export function createLocalPagerStore() {
  let state;
  let page;

  function snapshot() {
    return { profile: state.profile, page };
  }

  return {
    mode: "local",

    async initialize({ canonicalUrl }) {
      state = await getState();
      page = getPage(state, canonicalUrl);
      await saveState(state);
      return snapshot();
    },

    async castPageVote(nextVote) {
      const previous = page.vote;
      page.vote = previous === nextVote ? 0 : nextVote;
      page.score += page.vote - previous;
      await saveState(state);
      return snapshot();
    },

    async postComment(body) {
      page.comments.push({
        id: crypto.randomUUID(),
        authorId: state.profile.id,
        authorName: state.profile.name,
        body,
        createdAt: Date.now(),
        score: 0,
        vote: 0
      });
      await saveState(state);
      return snapshot();
    },

    async castCommentVote(commentId, nextVote) {
      const comment = page.comments.find((entry) => entry.id === commentId);
      if (!comment) throw new Error("That comment is no longer available.");
      const previous = comment.vote;
      comment.vote = previous === nextVote ? 0 : nextVote;
      comment.score += comment.vote - previous;
      await saveState(state);
      return snapshot();
    },

    async deleteComment(commentId) {
      page.comments = page.comments.filter((entry) => entry.id !== commentId);
      await saveState(state);
      return snapshot();
    }
  };
}
