type Reducer = (value: unknown, recurse: (value: unknown) => string) => string | undefined | void;
export function uneval(value: unknown, replacer?: Reducer): string;
