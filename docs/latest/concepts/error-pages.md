---
description: |
  Error pages can be used to customize the page that is shown when an error occurs in the application.
---

Fresh supports customizing error pages when a request is made but no matching route exists, and when a middleware, route handler, or page component throws an error respectively.

Errors can be customized by creating a `_error.tsx` file in the `routes/` folder. The file must have a default export that is a regular Preact component. A props object of type `PageProps` is passed in as an argument.

Inside the `_error.tsx` file you can show different content based on errors
or status codes with the following code:

```tsx routes/_error.tsx
export default function ErrorPage(props: PageProps) {
  const error = props.error; // Contains the thrown Error or HTTPError
  if (error instanceof HttpError) {
    const status = error.status; // HTTP status code

    // Render a 404 not found page
    if (status === 404) {
      return <h1>404 - Page not found</h1>;
    }

    // Render a 500 internal server error page
    if (status === 500) {
      return <h1>500 - Internal server error</h1>;
    }
  }

  return <h1>Oh no...</h1>;
}
```