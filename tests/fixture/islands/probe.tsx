import type { Signal } from "@preact/signals";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { factory } from "fresh/serializable";
import { makeComputed } from "fresh/signals";

// --- Serializable values exported from an islands file ------------------
// Every export of an `islands/**` file is a serializable function, so these
// can be passed across the wire as island props or used as page-level event
// handlers.

/** A plain serialized function (island-exported). */
export function greet(name: string): string {
  return `hi ${name}`;
}

/** A factory-built handler: closes over a signal + step at the call site. */
export const addTo = factory((sig: Signal<number>, step: number) => {
  return () => {
    sig.value += step;
  };
});

/** A serialized computed (its derivation re-runs on the client). */
export const [double, useDouble] = makeComputed((n: Signal<number>) => n.value * 2);

// --- Islands ------------------------------------------------------------

/**
 * Receives one prop of each serializable shape so a test can confirm each was
 * revived: a signal (rendered reactively), a plain string + number, a plain
 * serialized function (called inline), and a factory-built handler (wired to a
 * button). `data-hydrated` flips once the island has mounted client-side.
 */
export function Probe(props: {
  count: Signal<number>;
  name: string;
  step: number;
  fn: (name: string) => string;
  onBump: () => void;
}) {
  const hydrated = useSignal(false);
  useEffect(() => {
    hydrated.value = true;
  }, []);
  return (
    <div data-testid="probe" data-hydrated={hydrated}>
      <span data-testid="probe-count">{props.count}</span>
      <span data-testid="probe-greet">{props.fn(props.name)}</span>
      <span data-testid="probe-step">{props.step}</span>
      <button id="probe-bump" type="button" onClick={props.onBump}>
        bump
      </button>
    </div>
  );
}

/** A second island that shares the same signal, to test identity continuity. */
export function Mirror(props: { count: Signal<number> }) {
  return <span data-testid="mirror-count">{props.count}</span>;
}

/**
 * Receives rich built-in value types as props and reports, post-hydration,
 * that each was revived as the correct *type* (not a plain object) — so the
 * `instanceof` / `typeof` checks run on the client against the devalue-revived
 * values. The cyclic case confirms a self-reference survives.
 */
export function Values(props: {
  date: Date;
  map: Map<string, number>;
  set: Set<number>;
  big: bigint;
  re: RegExp;
  cyclic: { name: string; self?: unknown };
}) {
  const hydrated = useSignal(false);
  useEffect(() => {
    hydrated.value = true;
  }, []);
  return (
    <div data-testid="values" data-hydrated={hydrated}>
      <span data-testid="v-date">
        {props.date instanceof Date ? props.date.toISOString() : "not-a-date"}
      </span>
      <span data-testid="v-map">
        {props.map instanceof Map ? String(props.map.get("a")) : "not-a-map"}
      </span>
      <span data-testid="v-set">
        {props.set instanceof Set ? [...props.set].join(",") : "not-a-set"}
      </span>
      <span data-testid="v-big">
        {typeof props.big === "bigint" ? String(props.big) : "not-a-bigint"}
      </span>
      <span data-testid="v-re">
        {props.re instanceof RegExp
          ? `${props.re.source}|${props.re.flags}|${props.re.test("ABC")}`
          : "not-a-regexp"}
      </span>
      <span data-testid="v-cyclic">
        {props.cyclic.self === props.cyclic ? "cycle-ok" : "cycle-broken"}
      </span>
    </div>
  );
}
