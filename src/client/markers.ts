// Shared low-level helper for the comment-marker conventions Fresh uses to
// delimit server-rendered regions: island pairs (`fresh-island:N` …
// `/fresh-island`), page-level signal pairs (`fresh-signal:N` …
// `/fresh-signal`), and `<Partial>` regions (`fresh-partial:<mode>:<name>` …
// `/fresh-partial`).
//
// Only the *walk* over the document's comment nodes is common to every
// consumer. The *pairing* deliberately is not: partials pair via a sibling scan
// (`partials.ts` `findMatchingEnd`) because they slice the DOM range between a
// start and end that must be siblings, while islands/signals pair via a flat
// document-order stack (`islands.ts` `pairMarkers`) so a nested island — which
// sits inside the outer island's content, not as a sibling — still pairs.

/** Yield every comment node under `root`, in document order. */
export function* walkComments(root: Node): Generator<Comment> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  for (let c = walker.nextNode(); c !== null; c = walker.nextNode()) {
    yield c as Comment;
  }
}
