function requireData(result, action) {
  if (result.error) {
    const error = new Error(`${action}: ${result.error.message}`);
    error.cause = result.error;
    throw error;
  }
  return result.data;
}

export function getVoteMutation(currentVote, nextVote) {
  if (currentVote === nextVote) return "delete";
  return currentVote === 0 ? "insert" : "update";
}

async function ensureAnonymousUser(client) {
  const sessionResult = await client.auth.getSession();
  const session = requireData(sessionResult, "Unable to restore your Pager identity").session;
  if (session?.user) return session.user;

  const signInResult = await client.auth.signInAnonymously();
  const signInData = requireData(signInResult, "Unable to create your Pager identity");
  if (!signInData.user) throw new Error("Supabase did not return an anonymous user.");
  return signInData.user;
}

async function getOrCreatePage(client, userId, details) {
  const existing = await client
    .from("pages")
    .select("id, canonical_url, domain, title, score")
    .eq("canonical_url", details.canonicalUrl)
    .maybeSingle();
  const page = requireData(existing, "Unable to load this page");
  if (page) return page;

  const inserted = await client
    .from("pages")
    .insert({
      canonical_url: details.canonicalUrl,
      domain: details.domain,
      title: details.title,
      created_by: userId
    })
    .select("id, canonical_url, domain, title, score")
    .single();

  if (!inserted.error) return inserted.data;

  // Another visitor may create the same page between our SELECT and INSERT.
  if (inserted.error.code === "23505") {
    return requireData(
      await client
        .from("pages")
        .select("id, canonical_url, domain, title, score")
        .eq("canonical_url", details.canonicalUrl)
        .single(),
      "Unable to load the page created by another visitor"
    );
  }

  return requireData(inserted, "Unable to create this page");
}

async function loadOwnPageVote(client, pageId, userId) {
  const result = await client
    .from("page_votes")
    .select("value")
    .eq("page_id", pageId)
    .eq("user_id", userId)
    .maybeSingle();
  return requireData(result, "Unable to load your page vote")?.value ?? 0;
}

async function loadComments(client, pageId, userId) {
  const comments = requireData(
    await client
      .from("comments")
      .select("id, author_id, body, score, created_at")
      .eq("page_id", pageId)
      .eq("status", "visible")
      .order("created_at", { ascending: false }),
    "Unable to load comments"
  );

  if (!comments.length) return [];

  const authorIds = [...new Set(comments.map((comment) => comment.author_id))];
  const commentIds = comments.map((comment) => comment.id);
  const [profilesResult, votesResult] = await Promise.all([
    client.from("profiles").select("id, display_name").in("id", authorIds),
    client
      .from("comment_votes")
      .select("comment_id, value")
      .eq("user_id", userId)
      .in("comment_id", commentIds)
  ]);
  const profiles = requireData(profilesResult, "Unable to load comment authors");
  const votes = requireData(votesResult, "Unable to load your comment votes");
  const names = new Map(profiles.map((profile) => [profile.id, profile.display_name]));
  const ownVotes = new Map(votes.map((vote) => [vote.comment_id, vote.value]));

  return comments.map((comment) => ({
    id: comment.id,
    authorId: comment.author_id,
    authorName: names.get(comment.author_id) ?? "Pager user",
    body: comment.body,
    createdAt: Date.parse(comment.created_at),
    score: comment.score,
    vote: ownVotes.get(comment.id) ?? 0
  }));
}

export function createCloudPagerStore(client) {
  let user;
  let profile;
  let pageRecord;
  let snapshot;

  async function refresh() {
    const [pageResult, vote, comments] = await Promise.all([
      client
        .from("pages")
        .select("id, canonical_url, domain, title, score")
        .eq("id", pageRecord.id)
        .single(),
      loadOwnPageVote(client, pageRecord.id, user.id),
      loadComments(client, pageRecord.id, user.id)
    ]);
    pageRecord = requireData(pageResult, "Unable to refresh this page");
    snapshot = {
      profile: { id: profile.id, name: profile.display_name },
      page: { id: pageRecord.id, score: pageRecord.score, vote, comments }
    };
    return snapshot;
  }

  return {
    mode: "cloud",

    async initialize(details) {
      user = await ensureAnonymousUser(client);
      profile = requireData(
        await client
          .from("profiles")
          .select("id, display_name")
          .eq("id", user.id)
          .single(),
        "Unable to load your Pager profile"
      );
      pageRecord = await getOrCreatePage(client, user.id, details);
      return refresh();
    },

    async castPageVote(nextVote) {
      const currentVote = snapshot.page.vote;
      let result;

      const mutation = getVoteMutation(currentVote, nextVote);
      if (mutation === "delete") {
        result = await client
          .from("page_votes")
          .delete()
          .eq("page_id", pageRecord.id)
          .eq("user_id", user.id)
          .select("page_id")
          .single();
      } else if (mutation === "insert") {
        result = await client
          .from("page_votes")
          .insert({ page_id: pageRecord.id, user_id: user.id, value: nextVote })
          .select("page_id")
          .single();
      } else {
        result = await client
          .from("page_votes")
          .update({ value: nextVote })
          .eq("page_id", pageRecord.id)
          .eq("user_id", user.id)
          .select("page_id")
          .single();
      }

      requireData(result, "Unable to save your page vote");
      return refresh();
    },

    async postComment(body) {
      requireData(
        await client
          .from("comments")
          .insert({ page_id: pageRecord.id, author_id: user.id, body })
          .select("id")
          .single(),
        "Unable to post your comment"
      );
      return refresh();
    },

    async castCommentVote(commentId, nextVote) {
      const comment = snapshot.page.comments.find((entry) => entry.id === commentId);
      if (!comment) throw new Error("That comment is no longer available.");

      let result;
      const mutation = getVoteMutation(comment.vote, nextVote);
      if (mutation === "delete") {
        result = await client
          .from("comment_votes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user.id)
          .select("comment_id")
          .single();
      } else if (mutation === "insert") {
        result = await client
          .from("comment_votes")
          .insert({ comment_id: commentId, user_id: user.id, value: nextVote })
          .select("comment_id")
          .single();
      } else {
        result = await client
          .from("comment_votes")
          .update({ value: nextVote })
          .eq("comment_id", commentId)
          .eq("user_id", user.id)
          .select("comment_id")
          .single();
      }

      requireData(result, "Unable to save your comment vote");
      return refresh();
    },

    async deleteComment(commentId) {
      requireData(
        await client
          .from("comments")
          .update({ status: "deleted" })
          .eq("id", commentId)
          .eq("author_id", user.id)
          .select("id")
          .single(),
        "Unable to delete your comment"
      );
      return refresh();
    }
  };
}
