// Minimal type shim for the devalue fork that ships without a
// generated `types/index.d.ts`. Covers just the surface we use.
declare module "devalue" {
  type Reducer = (value: unknown, recurse: (value: unknown) => string) => string | undefined | void;
  export function uneval(value: unknown, replacer?: Reducer): string;
}
