// Turn a Fresh-style filesystem layout into a config object.
//
// Conventions handled:
//   routes/index.tsx          -> /
//   routes/about.tsx          -> /about
//   routes/blog/index.tsx     -> /blog
//   routes/blog/[slug].tsx    -> /blog/:slug
//   routes/[...rest].tsx      -> /*
//   routes/(group)/foo.tsx    -> /foo            (route groups are transparent)
//   routes/_app.tsx           -> result.app      (root only)
//   routes/_error.tsx         -> result.error    (root only)
//   routes/.../_layout.tsx    -> layouts chain
//   routes/.../_middleware.tsx -> middlewares chain
//   islands/**/*.{ts,tsx,js,jsx} -> islands[]
//   routes/**/(_islands)/**/*.{ts,tsx,js,jsx} -> islands[]  (co-located)

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FsLike {
  readDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
}

export interface Island {
  path: string;
}

export interface RouteEntry {
  handler: string;
  middlewares: string[];
  layouts: string[];
}

export interface FreshConfig {
  islands: Island[];
  routes: Map<string, RouteEntry>;
  app: string | null;
  error: string | null;
  /**
   * Project-relative path to `entry.client.{ts,tsx,js,jsx}` at the project
   * root, or `null` when no client entry exists.
   */
  clientEntry: string | null;
  /**
   * Project-relative path to `entry.server.{ts,tsx,js,jsx}` at the project
   * root, or `null` when none exists. When present it default-exports an
   * `App` as `app`, whose `app.use(...)` middlewares run ahead of every route.
   */
  serverEntry: string | null;
}

const EXTS = [".tsx", ".ts", ".jsx", ".js"] as const;

export function hasRouteExt(name: string): boolean {
  return EXTS.some((ext) => name.endsWith(ext));
}

export function stripExt(name: string): string {
  for (const ext of EXTS) {
    if (name.endsWith(ext)) return name.slice(0, -ext.length);
  }
  return name;
}

export function segmentToPattern(segment: string): string | null {
  if (/^\(.+\)$/.test(segment)) return null;
  // Named catch-all: `[...path]` → `:path*` (rou3's named-greedy syntax,
  // matches zero-or-more remaining segments and surfaces them under the
  // declared name in `params`). The trailing `*` is what makes it greedy;
  // the leading `:name` is what gives `ctx.params.<name>` instead of the
  // anonymous `_` rou3 falls back to for `**`.
  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
  if (catchAll) return ":" + catchAll[1] + "*";
  const m = segment.match(/^\[(.+)\]$/);
  if (m) return ":" + m[1];
  return segment;
}

export function buildPattern(dirSegments: readonly string[], fileBase: string): string {
  const parts: string[] = [];
  for (const seg of dirSegments) {
    const p = segmentToPattern(seg);
    if (p === null) continue;
    parts.push(p);
  }
  if (fileBase !== "index") {
    const p = segmentToPattern(fileBase);
    if (p !== null) parts.push(p);
  }
  return parts.length === 0 ? "/" : "/" + parts.join("/");
}

function joinPath(...parts: (string | null | undefined)[]): string {
  const joined = parts.filter((p): p is string => !!p).join("/");
  return joined.replace(/\/+/g, "/");
}

export async function buildFreshConfig(fs: FsLike, rootDir = ""): Promise<FreshConfig> {
  const result: FreshConfig = {
    islands: [],
    routes: new Map(),
    app: null,
    error: null,
    clientEntry: null,
    serverEntry: null,
  };

  // Detect the optional client entry at the project root.
  for (const ext of EXTS) {
    const candidate = joinPath(rootDir, "entry.client" + ext);
    if (await fs.exists(candidate)) {
      result.clientEntry = candidate;
      break;
    }
  }

  // Detect the optional programmatic server entry at the project root.
  for (const ext of EXTS) {
    const candidate = joinPath(rootDir, "entry.server" + ext);
    if (await fs.exists(candidate)) {
      result.serverEntry = candidate;
      break;
    }
  }

  const islandsDir = joinPath(rootDir, "islands");
  if (await fs.exists(islandsDir)) {
    await collectIslands(fs, islandsDir, result.islands);
    result.islands.sort((a, b) => a.path.localeCompare(b.path));
  }

  const routesDir = joinPath(rootDir, "routes");
  if (await fs.exists(routesDir)) {
    await walkRoutes(fs, routesDir, [], [], [], result);
    result.islands.sort((a, b) => a.path.localeCompare(b.path));
  }

  return result;
}

async function collectIslands(fs: FsLike, dir: string, out: Island[]): Promise<void> {
  const entries = await fs.readDir(dir);
  for (const e of entries) {
    const full = joinPath(dir, e.name);
    if (e.isDirectory) {
      await collectIslands(fs, full, out);
    } else if (hasRouteExt(e.name)) {
      out.push({ path: full });
    }
  }
}

async function walkRoutes(
  fs: FsLike,
  dir: string,
  segments: readonly string[],
  midChain: readonly string[],
  layoutChain: readonly string[],
  result: FreshConfig,
): Promise<void> {
  const entries = await fs.readDir(dir);

  const localMid: string[] = [];
  const localLayout: string[] = [];

  for (const e of entries) {
    if (e.isDirectory || !hasRouteExt(e.name)) continue;
    const base = stripExt(e.name);
    const full = joinPath(dir, e.name);
    if (base === "_middleware") localMid.push(full);
    else if (base === "_layout") localLayout.push(full);
    else if (segments.length === 0) {
      if (base === "_app") result.app = full;
      else if (base === "_error") result.error = full;
    }
  }

  const newMid = midChain.concat(localMid);
  const newLayout = layoutChain.concat(localLayout);

  const handlers = entries
    .filter((e) => !e.isDirectory && hasRouteExt(e.name))
    .filter((e) => !stripExt(e.name).startsWith("_"))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const e of handlers) {
    const base = stripExt(e.name);
    const full = joinPath(dir, e.name);
    const pattern = buildPattern(segments, base);
    result.routes.set(pattern, {
      handler: full,
      middlewares: newMid.slice(),
      layouts: newLayout.slice(),
    });
  }

  const subDirs = entries.filter((e) => e.isDirectory).sort((a, b) => a.name.localeCompare(b.name));

  for (const e of subDirs) {
    const full = joinPath(dir, e.name);
    // Co-located islands live in a `(_islands)/` route-group folder (Fresh 2
    // parity). Their files are islands, never routes, so don't recurse into the
    // folder as a URL segment.
    if (e.name === "(_islands)") {
      await collectIslands(fs, full, result.islands);
      continue;
    }
    await walkRoutes(fs, full, segments.concat(e.name), newMid, newLayout, result);
  }
}

// Node-backed FS adapter.
export interface NodeFsPromises {
  readdir(
    path: string,
    opts: { withFileTypes: true },
  ): Promise<Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>>;
  stat(path: string): Promise<unknown>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
}

export function createNodeFs(fsPromises: NodeFsPromises): FsLike {
  return {
    async readDir(dir) {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
      }));
    },
    async exists(p) {
      try {
        await fsPromises.stat(p);
        return true;
      } catch (err) {
        if ((err as { code?: string } | null)?.code === "ENOENT") return false;
        throw err;
      }
    },
    readFile(p) {
      return fsPromises.readFile(p, "utf8");
    },
  };
}

/**
 * In-memory FS for testing. Accepts either:
 *   - a list of paths (content defaults to ""), or
 *   - a record mapping path → content.
 * Directories are inferred from the path structure.
 */
export function createMemFs(files: readonly string[] | Record<string, string>): FsLike {
  const tree = new Map<string, Map<string, "file" | "dir">>();
  const contents = new Map<string, string>();
  tree.set("", new Map());

  const normalize = (p: string) => p.replace(/^\/+/, "").replace(/\/+$/, "");

  const entries: Array<[string, string]> = Array.isArray(files)
    ? files.map((p) => [p, ""])
    : Object.entries(files as Record<string, string>);

  for (const [raw, content] of entries) {
    const norm = normalize(raw);
    if (norm === "") continue;
    const parts = norm.split("/");
    let cur = "";
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      if (!tree.has(cur)) tree.set(cur, new Map());
      const parentMap = tree.get(cur)!;
      if (isLast) {
        parentMap.set(name, "file");
        contents.set(norm, content);
      } else {
        if (parentMap.get(name) !== "file") parentMap.set(name, "dir");
        cur = cur ? cur + "/" + name : name;
        if (!tree.has(cur)) tree.set(cur, new Map());
      }
    }
  }

  return {
    async readDir(dir) {
      const key = normalize(dir);
      const m = tree.get(key);
      if (!m) throw new Error(`ENOENT: not a directory: ${dir}`);
      return Array.from(m.entries()).map(([name, kind]) => ({
        name,
        isDirectory: kind === "dir",
        isFile: kind === "file",
      }));
    },
    async exists(p) {
      const norm = normalize(p);
      if (norm === "") return true;
      if (tree.has(norm)) return true;
      const idx = norm.lastIndexOf("/");
      const parent = idx === -1 ? "" : norm.slice(0, idx);
      const name = idx === -1 ? norm : norm.slice(idx + 1);
      const m = tree.get(parent);
      return m ? m.has(name) : false;
    },
    async readFile(p) {
      const norm = normalize(p);
      if (!contents.has(norm)) {
        throw new Error(`ENOENT: file not found: ${p}`);
      }
      return contents.get(norm)!;
    },
  };
}
