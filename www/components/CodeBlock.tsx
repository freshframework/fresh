import { highlightDark } from "../utils/highlight.ts";

export function CodeBlock({
  code,
  lang,
}: {
  code: string;
  lang: "js" | "ts" | "jsx" | "md" | "bash";
}) {
  return (
    <div
      class="text-sm [&>pre]:rounded-lg [&>pre]:leading-relaxed [&>pre]:p-3 [&>pre]:sm:p-4 [&>pre]:overflow-x-auto"
      data-language={lang}
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{ __html: highlightDark(code, lang) }}
    />
  );
}
