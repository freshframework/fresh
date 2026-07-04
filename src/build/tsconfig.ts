export function freshTsconfigPath(): string {
  return ".fresh/tsconfig.json";
}

export function freshTsconfigContent(): string {
  const config = {
    compilerOptions: {
      rootDirs: ["..", "./types"],
      jsx: "react-jsx",
      jsxImportSource: "preact",
      module: "esnext",
      moduleResolution: "bundler",
      target: "esnext",
      lib: ["esnext", "dom", "dom.iterable", "dom.asynciterable"],
      allowImportingTsExtensions: true,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      esModuleInterop: true,
      isolatedModules: true,
      resolveJsonModule: true,
      types: ["vite/client"],
    },
  };
  return JSON.stringify(config, null, 2) + "\n";
}
