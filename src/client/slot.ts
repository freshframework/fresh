// Client runtime for island "slots" — JSX passed as an island prop.
//
// The server can't serialize a VNode prop structurally (its `type` may be an
// arbitrary component). Instead it renders the JSX to real DOM — inline between
// `<!--fresh-slot:N-->` / `<!--/fresh-slot-->` markers if the island rendered
// the prop, or into a `<template data-fresh-slot="N">` at the end of the body if
// it didn't — and serializes the prop as `slot(N)`.
//
// `slot(N)` (called while the boot data script builds `data`, BEFORE the island
// re-renders) captures that server-rendered DOM into a fragment and hands back a
// `<Slot>` placeholder. When the island renders the prop, `<Slot>` swaps itself
// out for the captured DOM — so the server-rendered subtree (which may contain
// anything, serializable or not) lands wherever the island places it.

import { Component, h, type VNode } from "preact";
import { bootNodes, currentBootState } from "./islands.ts";
import { walkComments } from "./markers.ts";

const COMMENT_NODE = 8;
const SLOT_START_PREFIX = "fresh-slot:";
const SLOT_END = "/fresh-slot";

/**
 * Placeholder component that, once mounted, replaces itself in the DOM with the
 * captured server-rendered node — then hydrates that grafted subtree, so any
 * page-level islands / signals / event handlers in the slot come alive in their
 * grafted position. It never re-renders, so the grafted DOM stays put. (A
 * hacky-but-effective graft; a cleaner version would want Preact support for
 * adopting an existing node.)
 */
interface SlotState {
  nodes: Node[];
  hydrated?: true;
}

export class Slot extends Component<{ state: SlotState }, {}> {
  componentDidMount(): void {
    this.base!.replaceWith(...this.props.state.nodes);
    if (this.props.state.hydrated) return;
    this.props.state.hydrated = true;
    const state = currentBootState();
    if (state !== null) bootNodes(this.props.state.nodes, state);
  }
  componentWillUnmount(): void {
    for (const node of this.props.state.nodes) node.parentNode?.removeChild(node);
  }
  render() {
    return "";
  }
}
/**
 * Revive an island slot prop: capture slot `N`'s server-rendered DOM and return
 * a `<Slot>` that will graft it in when the island renders the prop. Called from
 * the serialized boot data, before hydration runs.
 */
export function slot(index: number): VNode<{ state: SlotState }> {
  return h(Slot, { state: { nodes: captureSlotNode(index) } });
}

/** Pull slot `N`'s DOM out of the page — from inline markers, else a template. */
function captureSlotNode(index: number): Node[] {
  const inline = captureInlineSlot(index);
  if (inline !== null) return inline;

  const tpl = document.querySelector<HTMLTemplateElement>(`template[data-fresh-slot="${index}"]`);
  if (tpl !== null) {
    const content = Array.from(tpl.content.childNodes);
    tpl.remove();
    return content;
  }
  // Nothing found — graft an empty fragment so the island still renders.
  return [];
}

/**
 * Move the nodes between `<!--fresh-slot:N-->` and `<!--/fresh-slot-->` (their
 * own contiguous siblings) into a fragment, removing the markers. Returns null
 * if the start marker isn't in the live DOM (the slot wasn't rendered inline).
 */
function captureInlineSlot(index: number): Node[] | null {
  const target = `${SLOT_START_PREFIX}${index}`;
  let start: Comment | null = null;
  for (const c of walkComments(document.body)) {
    if (c.data === target) {
      start = c;
      break;
    }
  }
  if (start === null) return null;

  const nodes = [] as Node[];
  let n = start.nextSibling;
  while (n !== null) {
    const next = n.nextSibling;
    if (n.nodeType === COMMENT_NODE && (n as Comment).data === SLOT_END) {
      n.remove();
      break;
    }
    nodes.push(n); // moves `n` out of the live DOM and into the fragment
    n = next;
  }
  start.remove();
  return nodes;
}
