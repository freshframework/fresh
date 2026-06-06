export function islandTemplate(opts: {
  name: string;
}): string {
  return `import { useSignal } from "@preact/signals";

interface ${opts.name}Props {
  // Add your props here
}

export default function ${opts.name}(props: ${opts.name}Props) {
  return (
    <div>
      <h2>${opts.name}</h2>
    </div>
  );
}
`;
}
