---
description: |
  Data fetching in Fresh happens inside of route handler functions. These can pass route data to the page via page props.
---

Server side data fetching in Fresh is accomplished through asynchronous handler
functions. These handler functions can call a `ctx.render()` function with the
data to be rendered as an argument. This data can then be retrieved by the page
component through the `data` property on the `props`.

Here is an example:

```tsx routes/projects/[id].tsx
interface Project {
  name: string;
  stars: number;
}

export const handler: Handlers<Project> = {
  async GET(_req, ctx) {
    const project = await db.projects.findOne({ id: ctx.params.id });
    if (!project) {
      return ctx.renderNotFound({
        message: "Project does not exist",
      });
    }
    return ctx.render(project);
  },
};

export default function ProjectPage(props: PageProps<Project>) {
  return (
    <div>
      <h1>{props.data.name}</h1>
      <p>{props.data.stars} stars</p>
    </div>
  );
}
```

The type parameter on the `PageProps`, `Handlers`, `Handler`, and `FreshContext`
can be used to enforce a TypeScript type to use for the render data. Fresh
enforces during type checking that the types in all of these fields are
compatible within a single page.

## Asynchronous routes

As a shortcut for combining a `GET` handler with a route, you can define your
route as `async`. An `async` route (a route that returns a promise) will be
called with the `Request` and a `RouteContext` (similar to a `HandlerContext`).
Here is the above example rewritten using this shortcut:

```tsx routes/projects/[id].tsx
interface Project {
  name: string;
  stars: number;
}

export default async function ProjectPage(_req, ctx: FreshContext) {
  const project: Project | null = await db.projects.findOne({
    id: ctx.params.id,
  });

  if (!project) {
    return <h1>Project not found</h1>;
  }

  return (
    <div>
      <h1>{project.name}</h1>
      <p>{project.stars} stars</p>
    </div>
  );
}
```
