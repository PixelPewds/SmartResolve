// Similar-complaint clustering and volume-spike detection.
//
// Both steps are real computation on the ticket data:
//  1. Cluster tickets from the last 24 hours by TF-IDF similarity.
//  2. For each cluster, compare complaints in the last 3 hours against the
//     hourly rate of similar complaints over the previous 14 days.
//
// The output is a list of CANDIDATES. Nothing here confirms an incident;
// a supervisor does that, because a burst of similar text can also be a
// coincidence (several unrelated "app crashed" reports after one update).

import { buildIndex, centroid, cosine, topTerms } from './similarity.js';
import { fingerprint, clusterDna } from './fingerprint.js';

const HOUR = 3600e3;
export const JOIN = 0.3;      // similarity needed to join a cluster
const MATCH = 0.26;      // similarity needed to count toward volume history
const RECENT_H = 3;
const WINDOW_H = 24;
const BASELINE_DAYS = 14;

export function detectClusters(tickets, now = Date.now()) {
  const index = buildIndex(tickets);
  const recent = tickets
    .filter((t) => now - Date.parse(t.createdAt) <= WINDOW_H * HOUR)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return groupSimilar(recent, index)
    .filter((c) => c.members.length >= 4)
    .map((c) => describe(c, tickets, index, now))
    .sort((a, b) => b.spike.z - a.spike.z);
}

// Exported for the clustering evaluation, which sweeps `join`.
export function groupSimilar(recent, index, join = JOIN) {
  // Greedy single pass: each ticket joins the most similar cluster centroid,
  // or starts its own. Good enough at this scale and easy to explain.
  const clusters = [];
  for (const t of recent) {
    const v = index.vecs.get(t.id);
    let best = null;
    let bestScore = join;
    for (const c of clusters) {
      const s = cosine(v, c.center);
      if (s >= bestScore) { best = c; bestScore = s; }
    }
    if (best) { best.members.push(t); best.center = centroid(best.members.map((m) => index.vecs.get(m.id))); }
    else clusters.push({ members: [t], center: v });
  }

  // Merge pass: greedy assignment can split one story into two clusters
  // when early members happen to be worded differently. Merge any pair whose
  // centroids are as close as a member would need to be to join.
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      if (cosine(clusters[i].center, clusters[j].center) >= join) {
        clusters[i].members.push(...clusters[j].members);
        clusters[i].members.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        clusters[i].center = centroid(clusters[i].members.map((m) => index.vecs.get(m.id)));
        clusters.splice(j, 1);
        j = i; // re-check against the grown cluster
      }
    }
  }
  return clusters;
}

function describe(c, tickets, index, now) {
  // Volume history: every ticket in the last 14 days that looks like this cluster.
  const like = tickets.filter((t) => {
    const age = now - Date.parse(t.createdAt);
    return age <= BASELINE_DAYS * 24 * HOUR && cosine(index.vecs.get(t.id), c.center) >= MATCH;
  });
  const ageH = (t) => (now - Date.parse(t.createdAt)) / HOUR;
  const recent = like.filter((t) => ageH(t) <= RECENT_H).length;
  const before = like.filter((t) => ageH(t) > RECENT_H).length;
  const baselinePerHour = before / (BASELINE_DAYS * 24 - RECENT_H);
  const expected = baselinePerHour * RECENT_H;
  // Poisson z-score with a small floor so a near-zero baseline cannot blow up.
  const z = (recent - expected) / Math.sqrt(Math.max(expected, 0.5));
  const ratio = recent / Math.max(expected, 0.33);
  const isSpike = recent >= 4 && ratio >= 3;

  // Hourly series for the last 12 hours, for the chart.
  const series = [];
  for (let h = 11; h >= 0; h--) {
    const from = now - (h + 1) * HOUR;
    const to = now - h * HOUR;
    series.push({
      hour: new Date(to).toISOString(),
      count: like.filter((t) => { const at = Date.parse(t.createdAt); return at > from && at <= to; }).length,
      baseline: Number(baselinePerHour.toFixed(2)),
    });
  }

  const vote = (key) => {
    const m = {};
    for (const t of c.members) { const k = key(t); m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1])[0][0];
  };
  // The most central member names the cluster.
  const central = [...c.members].sort((a, b) => cosine(index.vecs.get(b.id), c.center) - cosine(index.vecs.get(a.id), c.center))[0];
  const firstAt = c.members[0].createdAt;

  return {
    title: central.subject,
    keywords: topTerms(c.center, 6),
    category: vote((t) => t.classification.category),
    team: vote((t) => t.team),
    ticketIds: c.members.map((t) => t.id),
    firstReportedAt: firstAt,
    customers: new Set(c.members.map((t) => t.customerId)).size,
    // What the group shares beyond wording: intent, service, error codes.
    dna: { ...clusterDna(c.members.map((t) => t.fingerprint || fingerprint(t))), firstAt, lastAt: c.members.at(-1).createdAt },
    spike: {
      isSpike,
      recent,
      expected: Number(expected.toFixed(2)),
      baselinePerHour: Number(baselinePerHour.toFixed(3)),
      ratio: Number(ratio.toFixed(1)),
      z: Number(z.toFixed(1)),
      windowHours: RECENT_H,
      historyDays: BASELINE_DAYS,
      series,
    },
  };
}

export const overlap = (a, b) => {
  const s = new Set(a);
  const shared = b.filter((x) => s.has(x)).length;
  return shared / Math.min(a.length, b.length || 1);
};
