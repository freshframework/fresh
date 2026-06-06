export function layoutTemplate(opts: {
  name: string;
  utilsImport: string;
}): string {
  return `import { define } from "${opts.utilsImport}";

export default define.layout(function ${opts.name}Layout({ Component }) {
  return (
    <div>
      <Component />
    </div>
  );
});
`;
}
