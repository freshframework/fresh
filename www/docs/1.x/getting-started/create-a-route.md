---
description: |
  Create a new route to a Fresh project by creating a new file in the `routes/`
  folder.
---

After getting the project running locally, the next step is to add a new route
to the project. Routes encapsulate the logic for handling requests to a
particular path in your project. They can be used to handle API requests or
render HTML pages. For now we are going to do the latter.

Routes are defined as files in the `routes` directory. The file name of the
module is important: it is used to determine the path that the route will
handle. For example, if the file name is `index.js`, the route will handle
requests to `/`. If the file name is `about.js`, the route will handle requests
to `/about`. If the file name is `contact.js` and is placed inside of the
`routes/about/` folder, the route will handle requests to `/about/contact`. This
concept is called _File-system routing_. You can learn more about it on the
[_Concepts: Routing_][concepts-routing] page.

Route files that render HTML are JavaScript or TypeScript modules that export a
JSX component as their default export. This component will be rendered for every
request to the route's path. The component receives a few properties that can be
used to customize the rendered output, such as the current route, the url of the
request, state set by middleware, and handler data (more on the last two later).

In the demo project we'll create a route to handle the `/about` page. To do
this, one needs to create a new `routes/about.tsx` file. In this file, we can
declare a component that should be rendered every time a user visits the page.
This is done with JSX.

> [info]: To learn more about JSX, you can read [this article][jsx] in the React
> documentation. Beware that Fresh does not use React, but rather
> [Preact][preact], a lighter weight virtual dom library that works similar to
> React.

```tsx routes/about.tsx
export default function AboutPage() {
  return (
    <main>
      <h1>About</h1>
      <p>This is the about page.</p>
    </main>
  );
}
```

The new page will be visible at `http://localhost:8000/about`.

<!-- You can find more in depth information about routes on the
[_Concepts: Routes_][concepts-routes] documentation page. The following
pages in the _Getting Started_ guide will also explain more features of routes. -->

[concepts-routing]: /docs/1.x/concepts/routing
[jsx]: https://react.dev/learn/writing-markup-with-jsx
[preact]: https://preactjs.com/

<!-- [concepts-routes]: /docs/1.x/concepts/routes -->
