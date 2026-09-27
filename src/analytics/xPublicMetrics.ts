export type XPublicPostMetric = {
  date: string;
  views: number | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  quotes: number | null;
  bookmarks: number | null;
};

export type XPublicSnapshot = {
  audience: number;
  impressions: number | null;
  engagements: number | null;
  metrics: Record<string, number>;
  posts: XPublicPostMetric[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metric(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

/** Normalize only public profile and post fields; never persist provider payloads or credentials. */
export function summarizeXPublicMetrics(userPayload: unknown, tweetsPayload: unknown): XPublicSnapshot | null {
  const user = record(record(userPayload).data);
  const audience = metric(user.followers);
  if (audience === null || user.unavailable === true) return null;

  const tweets = Array.isArray(record(tweetsPayload).tweets) ? record(tweetsPayload).tweets as unknown[] : [];
  const sampled = tweets.slice(0, 10).map((raw) => {
    const tweet = record(raw);
    return {
      date: typeof tweet.createdAt === 'string' ? tweet.createdAt : '',
      views: metric(tweet.viewCount),
      likes: metric(tweet.likeCount),
      reposts: metric(tweet.retweetCount),
      replies: metric(tweet.replyCount),
      quotes: metric(tweet.quoteCount),
      bookmarks: metric(tweet.bookmarkCount),
    };
  });
  const impressions = sumKnown(sampled.map((post) => post.views));
  const likes = sumKnown(sampled.map((post) => post.likes));
  const reposts = sumKnown(sampled.map((post) => post.reposts));
  const replies = sumKnown(sampled.map((post) => post.replies));
  const quotes = sumKnown(sampled.map((post) => post.quotes));
  const bookmarks = sumKnown(sampled.map((post) => post.bookmarks));
  const engagements = sumKnown([likes, reposts, replies, quotes]);
  const metrics: Record<string, number> = { followers: audience, posts_sampled: sampled.length };
  for (const [key, value] of Object.entries({ recent_post_views: impressions, public_engagements: engagements, likes, reposts, replies, quotes, bookmarks })) {
    if (value !== null) metrics[key] = value;
  }
  return { audience, impressions, engagements, metrics, posts: sampled };
}
