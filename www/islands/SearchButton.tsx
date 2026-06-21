import { useEffect, useRef } from "preact/hooks";
import docsearchModule from "@docsearch/js";

// Copied from algolia source code
type DocSearchProps = {
  appId: string;
  apiKey: string;
  indexName: string;
  container: HTMLElement | string;
};

// Workaround: Deno resolves this npm package as CJS, hiding the callable default export
const docsearch = docsearchModule as unknown as (props: DocSearchProps) => void;

export default function SearchButton(props: {
  docsearch?: (args: DocSearchProps) => void;
  class?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      const init = props.docsearch ?? docsearch;
      init({
        appId: "CWUS37S0PK",
        apiKey: "caa591b6dcb2c9308551361d954a728b",
        indexName: "fresh",
        container: ref.current,
      });
    }
  }, [ref.current]);
  return <div title="Search Button" class={"h-9 mb-6 " + (props.class ?? "")} ref={ref}></div>;
}
