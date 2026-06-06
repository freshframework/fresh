export function middlewareTemplate(opts: {
  utilsImport: string;
}): string {
  return `import { define } from "${opts.utilsImport}";

export default define.middleware(async (ctx) => {
  return await ctx.next();
});
`;
}
