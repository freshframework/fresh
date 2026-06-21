import { Signal } from "@preact/signals";
import { makeComputed } from "fresh/signals";
import { factory } from "fresh/serializable";

export const [double, useDouble] = makeComputed((value: Signal<number>) => {
  return value.value * 2;
});

export const createAlert = factory((message: string) => {
  return () => alert(message);
});

export const doAlert = () => {
  alert("Hello from a non-factory function!");
};
