export function apiTemplate(opts: {
  utilsImport: string;
}): string {
  return `import { define } from "${opts.utilsImport}";

export const handler = define.handlers({
  GET(ctx) {
    return Response.json({ ok: true });
  },
});
`;
}
