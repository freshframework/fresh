// User-facing runtime helpers: `<Head>` for managing document `<head>`
// from anywhere in the tree (route components, shared components, or
// islands), `<Partial>` for declaring client-updatable page regions, and
// `navigating` — a `makeComputed` signal factory that's `true` while a partial
// navigation is in flight (drive loading indicators off it). Re-exported here
// for discoverability; its serialization home is `fresh/signals`.

export { Head, HeadContext, type HeadProps } from "../runtime/head.ts";
export { navigating } from "../runtime/navigation.ts";
export { Partial, type PartialMode, type PartialProps } from "../runtime/partial.ts";
