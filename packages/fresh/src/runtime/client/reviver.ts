import {
  Component,
  type ComponentChildren,
  type ComponentType,
  Fragment,
  h,
  render,
  type VNode,
} from "preact";
import { type CustomParser, parse } from "../../jsonify/parse.ts";
import { computed, signal } from "@preact/signals";
import { DATA_FRESH_KEY, PartialMode } from "../shared_internal.ts";

const enum RootKind {
  Island,
  Partial,
}

interface IslandReq {
  kind: RootKind.Island;
  name: string;
  propsIdx: number;
  key: string | null;
  clientOnly: boolean;
  start: Comment | Text;
  end: Comment | Text | null;
}
interface PartialReq {
  kind: RootKind.Partial;
  name: string;
  key: string | null;
  start: Comment | Text;
  end: Comment | Text | null;
}

interface ReviveContext {
  roots: Array<IslandReq | PartialReq>;
  stack: Array<PartialReq | IslandReq>;
  slots: Map<number, { name: string; start: Comment; end: Comment | null }>;
  slotIdStack: number[];
}

interface SlotRef {
  kind: typeof SLOT_SYMBOL;
  name: string;
  id: number;
}
const SLOT_SYMBOL = Symbol.for("_FRESH_SLOT");
function isSlotRef(x: unknown): x is SlotRef {
  return x !== null && typeof x === "object" && "kind" in x &&
    x.kind === SLOT_SYMBOL;
}

export type DeserializedProps = {
  props: Record<string, unknown>;
  slots: SlotRef[];
}[];

export const ACTIVE_PARTIALS = new Map<string, PartialComp>();

export class PartialComp extends Component<
  { children?: ComponentChildren; mode: PartialMode; name: string }
> {
  override componentDidMount() {
    ACTIVE_PARTIALS.set(this.props.name, this);
  }

  render() {
    return this.props.children;
  }
}
PartialComp.displayName = "Partial";

export function revive(
  props: Record<string, unknown>,
  component: ComponentType,
  container: HTMLElement,
  slots: ReviveContext["slots"],
  allProps: DeserializedProps,
) {
  const _render = () => {
    for (const propName in props) {
      const value = props[propName];
      if (isSlotRef(value)) {
        const marker = slots.get(value.id);
        if (marker !== undefined) {
          const root = h(Fragment, null);
          const slotContainer = createRootFragment(
            container,
            marker.start,
            marker.end!,
          );
          domToVNode(
            allProps,
            [root],
            [Marker.Slot],
            slotContainer,
            marker.end!,
          );
          props[propName] = root;
        } else {
          const template = document.querySelector(
            `#frsh-${value.id}-${value.name}`,
          ) as HTMLTemplateElement | null;
          if (template !== null) {
            const root = h(Fragment, null);
            domToVNode(allProps, [root], [Marker.Slot], template.content, null);
            props[propName] = root;
          }
        }
      }
    }

    // TODO: explore hydrate?
    render(h(component, props), container as unknown as HTMLElement);
  };

  // deno-lint-ignore no-window
  "scheduler" in window
    // `scheduler.postTask` is async but that can easily
    // fire in the background. We don't want waiting for
    // the hydration of an island block us.
    // @ts-ignore scheduler API is not in types yet
    ? scheduler!.postTask(_render)
    : setTimeout(_render, 0);
}

export const ISLAND_REGISTRY = new Map<string, ComponentType>();

export const CUSTOM_PARSER: CustomParser = {
  Signal: (value: unknown) => signal(value),
  Computed: (value: unknown) => computed(() => value),
  Slot: (value: { name: string; id: number }): SlotRef => {
    return { kind: SLOT_SYMBOL, name: value.name, id: value.id };
  },
};

export function createReviveCtx(): ReviveContext {
  return {
    roots: [],
    stack: [],
    slots: new Map(),
    slotIdStack: [],
  };
}

export function boot(
  initialIslands: Record<string, ComponentType>,
  islandProps: string,
) {
  const ctx = createReviveCtx();
  _walkInner(ctx, document.body);

  const keys = Object.keys(initialIslands);
  for (let i = 0; i < keys.length; i++) {
    const name = keys[i];
    ISLAND_REGISTRY.set(name, initialIslands[name]);
  }

  const allProps = parse<DeserializedProps>(
    islandProps,
    CUSTOM_PARSER,
  );

  for (let i = 0; i < ctx.roots.length; i++) {
    const root = ctx.roots[i];

    if (root.end === null) continue;

    // Check that the browser didn't reparent our markers due to
    // invalid HTML nesting (e.g. <div> inside <p>). When this
    // happens the start and end markers end up under different
    // parents and hydration would fail with a DOMException.
    if (root.start.parentNode !== root.end.parentNode) {
      const label = root.kind === RootKind.Island
        ? `island "${root.name}"`
        : `partial "${root.name}"`;
      // deno-lint-ignore no-console
      console.error(
        `Fresh hydration error: the ${label} has invalid HTML nesting. ` +
          `Its start and end markers were reparented by the browser into ` +
          `different DOM nodes. This is usually caused by placing a ` +
          `block-level element (like <div>) inside an inline element ` +
          `(like <p> or <span>). Check the HTML around this ${
            root.kind === RootKind.Island ? "island" : "partial"
          } for invalid nesting.`,
      );
      continue;
    }

    const container = createRootFragment(
      // deno-lint-ignore no-explicit-any
      root.start.parentNode as any,
      root.start,
      root.end,
    );

    if (root.kind === RootKind.Island) {
      const props = allProps[root.propsIdx].props;
      const component = ISLAND_REGISTRY.get(root.name)!;

      revive(props, component, container, ctx.slots, allProps);
    } else if (root.kind === RootKind.Partial) {
      const props: Record<string, unknown> = {
        name: root.name,
        children: null,
      };

      const domRoot = h(Fragment, null);
      domToVNode(allProps, [domRoot], [Marker.Partial], container, root.end!);
      props.children = domRoot.props.children;

      // deno-lint-ignore no-explicit-any
      revive(props, PartialComp as any, container, ctx.slots, allProps);
    }
  }
}

const SHOW_MARKERS = false;

interface FreshMarker extends Text {
  _frshMarker: string;
}

export function isFreshMarkerText(node: Node): node is FreshMarker {
  return node.nodeType === Node.TEXT_NODE &&
    // deno-lint-ignore no-explicit-any
    typeof (node as any)._frshMarker === "string";
}

/**
 * Replace comment markers with empty text nodes to hide them
 * in DevTools. This is done to avoid user confusion.
 */
export function maybeHideMarker(marker: Comment): Comment | Text {
  if (SHOW_MARKERS) return marker;
  const text = new Text("") as FreshMarker;
  text._frshMarker = marker.data;
  marker.parentNode!.insertBefore(text, marker);
  marker.remove();
  return text;
}

function _walkInner(
  ctx: ReviveContext,
  node: Node | Comment,
) {
  if (isElementNode(node)) {
    // No need to traverse into <script> or <style> tags.
    // No need to traverse deeper if we found a slotStart marker.
    // We'll parse slots later when the island is revived.
    if (
      node.nodeName === "SCRIPT" || node.nodeName === "STYLE" ||
      ctx.slotIdStack.length > 0
    ) {
      return;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      _walkInner(ctx, child);
    }
  } else if (isCommentNode(node)) {
    const comment = node.data;
    if (comment.startsWith("frsh:")) {
      node = maybeHideMarker(node);
      const parts = comment.split(":");
      const kind = parts[1];
      if (kind === "island") {
        const name = parts[2];
        const propsIdx = parts[3];
        const key = parts[4];
        const clientOnly = parts[5] === "c";
        const found: IslandReq = {
          kind: RootKind.Island,
          name,
          propsIdx: Number(propsIdx),
          key: key === "" ? null : key,
          clientOnly,
          start: node as Comment,
          end: null,
        };
        if (ctx.stack.length === 0) {
          ctx.roots.push(found);
        }
        ctx.stack.push(found);
      } else if (kind === "slot") {
        const id = +parts[2];
        const slotName = parts[3];
        ctx.slotIdStack.push(id);
        ctx.slots.set(id, {
          name: slotName,
          start: node as Comment,
          end: null,
        });
      } else if (kind === "partial") {
        const name = parts[2];
        const key = parts[3];
        const found: PartialReq = {
          kind: RootKind.Partial,
          name,
          key: key === "" ? null : key,
          start: node as Comment,
          end: null,
        };
        if (ctx.stack.length === 0) {
          ctx.roots.push(found);
        }
        ctx.stack.push(found);
      }
    } else if (comment === "/frsh:island" || comment === "/frsh:partial") {
      node = maybeHideMarker(node);
      const item = ctx.stack.pop();
      if (item !== undefined) {
        item.end = node as Comment;
      }
    } else if (comment === "/frsh:slot") {
      node = maybeHideMarker(node);
      const item = ctx.slotIdStack.pop();
      if (item !== undefined) {
        ctx.slots.get(item)!.end = node as Comment;
      }
    }
  }
}

export const enum Marker {
  Island,
  Partial,
  Slot,
}

interface ServerSlotProps {
  name: string;
  id: number;
  children?: ComponentChildren;
}

// deno-lint-ignore no-explicit-any
function ServerSlot(props: ServerSlotProps): any {
  return props.children;
}

export function domToVNode(
  allProps: DeserializedProps,
  // deno-lint-ignore no-explicit-any
  vnodeStack: VNode<any>[],
  markerStack: Marker[],
  node: Text | Comment | Node | DocumentFragment,
  end: Text | Comment | null,
): void {
  let sib: Node | ChildNode | null = node;
  while (sib !== null) {
    if (sib === end) return;

    // deno-lint-ignore no-explicit-any
    if ((sib as any)._frshRootFrag || sib instanceof DocumentFragment) {
      const firstChild = sib.firstChild;
      if (firstChild !== null) {
        domToVNode(allProps, vnodeStack, markerStack, firstChild, end);
      }
    } else if (isElementNode(sib)) {
      const props: Record<string, unknown> = {};
      for (let i = 0; i < sib.attributes.length; i++) {
        const attr = sib.attributes[i];

        if (attr.nodeName === DATA_FRESH_KEY) {
          props.key = attr.nodeValue;
          continue;
        }

        // Boolean attributes are always `true` when present.
        // See: https://developer.mozilla.org/en-US/docs/Glossary/Boolean/HTML
        props[attr.nodeName] =
          // deno-lint-ignore no-explicit-any
          typeof (sib as any)[attr.nodeName] === "boolean"
            ? true
            : attr.nodeValue;
      }

      const vnode = h(sib.localName, props);
      const marker = markerStack.at(-1);
      const appendVNode = marker === Marker.Slot || marker === Marker.Partial;
      if (appendVNode) {
        addVNodeChild(vnodeStack.at(-1)!, vnode);
        vnodeStack.push(vnode);
      }

      const firstChild = sib.firstChild;
      if (firstChild !== null) {
        domToVNode(allProps, vnodeStack, markerStack, firstChild, end);
      }

      if (appendVNode) {
        vnodeStack.pop();
      }
    } else if (isCommentNode(sib) || isFreshMarkerText(sib)) {
      const comment = isFreshMarkerText(sib) ? sib._frshMarker : sib.data;
      if (comment.startsWith("frsh:")) {
        const parts = comment.split(":");

        const kind = parts[1];
        if (kind === "island") {
          sib = maybeHideMarker(sib);
          markerStack.push(Marker.Island);

          const name = parts[2];
          const propsIdx = parts[3];
          const key = parts[4];
          const island = ISLAND_REGISTRY.get(name);
          if (island === undefined) {
            throw new Error(`Encountered unknown island: ${name}`);
          }

          const props = allProps[+propsIdx].props;
          props.key = key === "" ? undefined : key;

          // deno-lint-ignore no-explicit-any
          const islandVNode = h<any>(island, props);
          addVNodeChild(vnodeStack.at(-1)!, islandVNode);
          vnodeStack.push(islandVNode);
        } else if (kind === "slot") {
          sib = maybeHideMarker(sib);
          markerStack.push(Marker.Slot);

          const id = +parts[2];
          const slotName = parts[3];
          const key = parts[4];

          const vnode = h(ServerSlot, {
            key: key === "" ? undefined : key,
            id,
            name: slotName,
            children: [],
          });

          const parentVNode = vnodeStack.at(-1)!;
          parentVNode.props[slotName] = vnode;
          vnodeStack.push(vnode);
        } else if (kind === "partial") {
          sib = maybeHideMarker(sib);
          markerStack.push(Marker.Partial);

          const name = parts[2];
          const mode = +parts[3] as PartialMode;
          const key = parts[4];
          // deno-lint-ignore no-explicit-any
          let vnode: VNode<any> = h(PartialComp, {
            name,
            key: key === "" ? undefined : key,
            mode,
          });
          const parentVNode = vnodeStack.at(-1);
          if (parentVNode !== undefined) {
            addVNodeChild(parentVNode, vnode);
          }

          if (mode === PartialMode.Append) {
            const active = ACTIVE_PARTIALS.get(name);
            if (active !== undefined) {
              copyOldChildren(vnode.props, active.props.children);
              const wrapper = h(Fragment, null);
              addVNodeChild(vnode, wrapper);
              vnode = wrapper;
            }
          } else if (mode === PartialMode.Prepend) {
            const active = ACTIVE_PARTIALS.get(name);
            if (active !== undefined) {
              copyOldChildren(vnode.props, active.props.children);
              const wrapper = h(Fragment, null);
              if (!vnode.props.children) {
                vnode.props.children = [];
              }
              // deno-lint-ignore no-explicit-any
              (vnode.props.children as Array<VNode<any> | string>).unshift(
                wrapper,
              );
              vnode = wrapper;
            }
          }

          vnodeStack.push(vnode);
        } else if (kind === "key") {
          if (!SHOW_MARKERS) {
            const current = sib;
            sib = sib.nextSibling;
            current.remove();
          }
          const vnode = h(Fragment, { key: parts[2] });
          addVNodeChild(vnodeStack.at(-1)!, vnode);
          vnodeStack.push(vnode);
          continue;
        }
      } else if (
        comment === "/frsh:island" || comment === "/frsh:slot" ||
        comment === "/frsh:partial"
      ) {
        vnodeStack.pop();
        markerStack.pop();
        sib = maybeHideMarker(sib);
      } else if (comment === "/frsh:key") {
        vnodeStack.pop();
        sib = maybeHideMarker(sib);
      }
    } else if (isTextNode(sib)) {
      const marker = markerStack.at(-1);
      if (marker === Marker.Slot || marker === Marker.Partial) {
        addVNodeChild(vnodeStack.at(-1)!, sib.data);
      }
    }

    sib = sib.nextSibling;
  }
}

// deno-lint-ignore no-explicit-any
function addVNodeChild(parent: VNode<any>, child: VNode<any> | string) {
  if (!parent.props.children) {
    parent.props.children = [];
  }
  // deno-lint-ignore no-explicit-any
  (parent.props.children as Array<VNode<any> | string>).push(child);
}

export function copyOldChildren(
  props: Record<string, unknown>,
  oldChildren: ComponentChildren,
) {
  props.children = oldChildren !== undefined && oldChildren !== null
    ? Array.isArray(oldChildren) ? oldChildren : [oldChildren]
    : [];
}

export function isCommentNode(node: Node): node is Comment {
  return node.nodeType === Node.COMMENT_NODE;
}
export function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}
export function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE && !("_frshRootFrag" in node);
}

export function createRootFragment(
  parent: Element,
  startMarker: Text | Comment,
  // We need an end marker for islands because multiple
  // islands can share the same parent node. Since
  // islands are root-level render calls any calls to
  // `.appendChild` would lead to a wrong result.
  endMarker: Text | Comment,
): HTMLElement & { _frshRootFrag: boolean } {
  // @ts-ignore this is fine
  const rootFrag = {
    _frshRootFrag: true,
    nodeType: 1,
    parentNode: parent,
    nextSibling: null,
    get firstChild() {
      const child = startMarker.nextSibling;
      if (child === endMarker) return null;
      return child;
    },
    get childNodes() {
      const children: ChildNode[] = [];

      let child = startMarker.nextSibling;
      while (child !== null && child !== endMarker) {
        children.push(child);
        child = child.nextSibling;
      }

      return children;
    },
    insertBefore(node: Node, child: Node | null) {
      parent.insertBefore(node, child ?? endMarker);
    },
    appendChild(child: Node) {
      // We cannot blindly call `.append()` as that would add
      // the new child to the very end of the parent node. This
      // leads to ordering issues when the multiple islands
      // share the same parent node.
      parent.insertBefore(child, endMarker);
    },
    removeChild(child: Node) {
      parent.removeChild(child);
    },
    contains(node: Node | null): boolean {
      if (node === null) return false;

      const children = rootFrag.childNodes;
      for (let i = 0; i < children.length; i++) {
        if (children[i].contains(node)) {
          return true;
        }
      }
      return false;
    },
  };

  // deno-lint-ignore no-explicit-any
  return rootFrag as any;
}
