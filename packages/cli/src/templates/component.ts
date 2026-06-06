export function componentTemplate(opts: {
  name: string;
}): string {
  return `interface ${opts.name}Props {
  children?: preact.ComponentChildren;
}

export default function ${opts.name}(props: ${opts.name}Props) {
  return (
    <div>
      {props.children}
    </div>
  );
}
`;
}
