export function routeTemplate(opts: {
  name: string;
  utilsImport: string;
  hasHandler: boolean;
}): string {
  if (opts.hasHandler) {
    return `import { page } from "fresh";
import { define } from "${opts.utilsImport}";

export const handler = define.handlers({
  GET(ctx) {
    return page({});
  },
});

export default define.page<typeof handler>(function ${opts.name}({ data }) {
  return (
    <div>
      <h1>${opts.name}</h1>
    </div>
  );
});
`;
  }

  return `import { define } from "${opts.utilsImport}";

export default define.page(function ${opts.name}() {
  return (
    <div>
      <h1>${opts.name}</h1>
    </div>
  );
});
`;
}
