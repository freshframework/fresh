---
description: |
  Change the source directory to effectively manage your project.
---

As per the
[MDN documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP):

> Content Security Policy (CSP) is an added layer of security that helps to
> detect and mitigate certain types of attacks, including Cross-Site Scripting
> (XSS) and data injection attacks. These attacks are used for everything from
> data theft, to site defacement, to malware distribution.
>
> To enable CSP, you need to configure your web server to return the
> Content-Security-Policy HTTP header. (Sometimes you may see mentions of the
> X-Content-Security-Policy header, but that's an older version and you don't
> need to specify it anymore.)

Fortunately Fresh has built in support for CSP. We don't need to worry about
setting headers ourselves. We just have to configure our routes correctly. Let's
dive into a few examples to see how this works.

Fresh's CSP implementation supports the following

<details>
<summary>directives</summary>

```ts fresh 🍋
export interface ContentSecurityPolicyDirectives {
  // Fetch directives
  /**
   * Defines the valid sources for web workers and nested browsing contexts
   * loaded using elements such as <frame> and <iframe>.
   */
  childSrc?: string[];
  /**
   * Restricts the URLs which can be loaded using script interfaces.
   */
  connectSrc?: string[];
  /**
   * Serves as a fallback for the other fetch directives.
   */
  defaultSrc?: string[];
  /**
   * Specifies valid sources for fonts loaded using @font-face.
   */
  fontSrc?: string[];
  /**
   * Specifies valid sources for nested browsing contexts loading using elements
   * such as <frame> and <iframe>.
   */
  frameSrc?: string[];
  /**
   * Specifies valid sources of images and favicons.
   */
  imgSrc?: string[];
  /**
   * Specifies valid sources of application manifest files.
   */
  manifestSrc?: string[];
  /**
   * Specifies valid sources for loading media using the <audio> , <video> and
   * <track> elements.
   */
  mediaSrc?: string[];
  /**
   * Specifies valid sources for the <object>, <embed>, and <applet> elements.
   */
  objectSrc?: string[];
  /**
   * Specifies valid sources to be prefetched or prerendered.
   */
  prefetchSrc?: string[];
  /**
   * Specifies valid sources for JavaScript.
   */
  scriptSrc?: string[];
  /**
   * Specifies valid sources for JavaScript <script> elements.
   */
  scriptSrcElem?: string[];
  /**
   * Specifies valid sources for JavaScript inline event handlers.
   */
  scriptSrcAttr?: string[];
  /**
   * Specifies valid sources for stylesheets.
   */
  styleSrc?: string[];
  /**
   * Specifies valid sources for stylesheets <style> elements and <link>
   * elements with rel="stylesheet".
   */
  styleSrcElem?: string[];
  /**
   * Specifies valid sources for inline styles applied to individual DOM
   * elements.
   */
  styleSrcAttr?: string[];
  /**
   * Specifies valid sources for Worker, SharedWorker, or ServiceWorker scripts.
   */
  workerSrc?: string[];

  // Document directives
  /**
   * Restricts the URLs which can be used in a document's <base> element.
   */
  baseUri?: string[];
  /**
   * Enables a sandbox for the requested resource similar to the <iframe>
   * sandbox attribute.
   */
  sandbox?: string[];

  // Navigation directives
  /**
   * Restricts the URLs which can be used as the target of a form submissions
   * from a given context.
   */
  formAction?: string[];
  /**
   * Specifies valid parents that may embed a page using <frame>, <iframe>,
   * <object>, <embed>, or <applet>.
   */
  frameAncestors?: string[];
  /**
   * Restricts the URLs to which a document can initiate navigation by any
   * means, including <form> (if form-action is not specified), <a>,
   * window.location, window.open, etc.
   */
  navigateTo?: string[];

  /**
   * The URI to report CSP violations to.
   */
  reportUri?: string;
}
```

</details>

For our examples, we'll just be focused on `styleSrc`, but the technique can be
applied to any of the directives.

We'll start off by having an example stylesheet defined like this:

```css static/example.css
h1 {
  font-size: 25px;
  font-weight: normal;
  margin-top: 5px;
  margin-left: 25px;
}
```

## No CSP

To kick things off, we'll create the following control route which doesn't do
anything with CSP. We include a stylesheet to confirm that our sheet correctly
styles the response.

```tsx routes/noCSP.tsx
import { RouteContext } from "$fresh/server.ts";

export default function Home(req: Request, ctx: RouteContext) {
  return (
    <>
      <h1>This page doesn't use CSP at all. Styles will be applied.</h1>
      <link rel="stylesheet" type="text/css" href="example.css" />
    </>
  );
}
```

We can hit `http://localhost:8000/noCSP` and we should see the following:

```txt Response body
This page doesn't use CSP at all. Styles will be applied.
```

## Incorrect CSP

Let's invoke the `useCSP` hook in our response to try to secure our page. Watch
closely, we're using the wrong URL! This will cause the browser to reject the
stylesheet, due to the header that Fresh produces. We get a `(blocked:csp)`
status when the browser tries to request this resource.

```tsx routes/incorrectCSP.tsx
import { RouteConfig, RouteContext } from "$fresh/server.ts";
import { useCSP } from "$fresh/runtime.ts";

export default function Home(req: Request, ctx: RouteContext) {
  useCSP((csp) => {
    if (!csp.directives.styleSrc) {
      csp.directives.styleSrc = [];
    }
    csp.directives.styleSrc.push("http://www.example.com");
  });
  return (
    <>
      <h1>This page violates our configured CSP. Styles won't be applied.</h1>
      <link rel="stylesheet" type="text/css" href="example.css" />
    </>
  );
}

export const config: RouteConfig = {
  csp: true,
};
```

We can hit `http://localhost:8000/incorrectCSP` and we should see the following:

```txt Response body
This page violates our configured CSP. Styles won't be applied.
```

## Correct CSP

Let's fix our simple mistake and use the correct URL. Everything is working
correctly here.

```tsx routes/correctCSP.tsx
import { RouteConfig, RouteContext } from "$fresh/server.ts";
import { useCSP } from "$fresh/runtime.ts";

export default function Home(req: Request, ctx: RouteContext) {
  useCSP((csp) => {
    if (!csp.directives.styleSrc) {
      csp.directives.styleSrc = [];
    }
    csp.directives.styleSrc.push("http://localhost:8000/example.css");
  });
  return (
    <>
      <h1>This page adheres to our configured CSP. Styles will be applied.</h1>
      <link rel="stylesheet" type="text/css" href="example.css" />
    </>
  );
}

export const config: RouteConfig = {
  csp: true,
};
```

We can hit `http://localhost:8000/correctCSP` and we should see the following:

```txt Response body
This page adheres to our configured CSP. Styles will be applied.
```

## No Route Config

What happens if we forget to use a `RouteConfig` in our route?

```tsx routes/cspNoRouteConfig.tsx
import { RouteContext } from "$fresh/server.ts";
import { useCSP } from "$fresh/runtime.ts";

export default function Home(req: Request, ctx: RouteContext) {
  useCSP((csp) => {
    if (!csp.directives.styleSrc) {
      csp.directives.styleSrc = [];
    }
    csp.directives.styleSrc.push("http://www.example.com");
  });
  return (
    <>
      <h1>
        This page violates our configured CSP. But we don't have a{" "}
        <code>RouteConfig</code>{" "}
        enabled, so Fresh doesn't know to use the CSP. Styles will be applied.
      </h1>
      <link rel="stylesheet" type="text/css" href="example.css" />
    </>
  );
}
```

We can hit `http://localhost:8000/cspNoRouteConfig` and we should see the
following:

```txt Response body
This page violates our configured CSP. But we don't have a RouteConfig enabled, so Fresh doesn't know to use the CSP. Styles will be applied.
```

## Reporting

Let's touch on the reporting aspect of CSP. CSP (and Fresh's framework) support
a `reportOnly` flag and a `reportUri` endpoint. This is a destination that
should be able to receive `POST` requests. If the `reportOnly` flag is enabled,
then the browser will ignore the CSP headers and log any issues to the
`reportUri` destination.

```tsx routes/incorrectCSPwithReport.tsx
import { RouteConfig, RouteContext } from "$fresh/server.ts";
import { useCSP } from "$fresh/runtime.ts";

export default function Home(req: Request, ctx: RouteContext) {
  useCSP((csp) => {
    csp.reportOnly = true;
    if (!csp.directives.styleSrc) {
      csp.directives.styleSrc = [];
    }
    csp.directives.reportUri = "http://localhost:8000/reportHandler";
    csp.directives.styleSrc.push("http://www.example.com");
  });
  return (
    <>
      <h1>
        This page violates our configured CSP. But we're using "reportOnly".
        Styles will be applied.
      </h1>
      <link rel="stylesheet" type="text/css" href="example.css" />
    </>
  );
}

export const config: RouteConfig = {
  csp: true,
};
```

```ts routes/reportHandler.ts
import { FreshContext } from "$fresh/server.ts";

export const handler = {
  async POST(req: Request, _ctx: FreshContext) {
    const body = await req.json();
    const report = JSON.stringify(body, null, 2);

    await Deno.writeTextFile("./csp-reports.txt", report + "\n", {
      append: true,
    });
    return new Response(null, { status: 200 });
  },
};
```

We can hit `http://localhost:8000/incorrectCSPwithReport` and we should see the
following:

```txt Response body
This page violates our configured CSP. But we're using "reportOnly". Styles will be applied.
```

We can then check our server and we'll see that `csp-reports.txt` has an entry
like this:

```json csp-reports.txt
{
  "csp-report": {
    "document-uri": "http://localhost:8000/incorrectCSPwithReport",
    "referrer": "http://localhost:8000/incorrectCSPwithReport",
    "violated-directive": "style-src-elem",
    "effective-directive": "style-src-elem",
    "original-policy": "default-src 'none'; style-src 'unsafe-inline' http://www.example.com; report-uri http://localhost:8000/reportHandler; script-src 'nonce-0f2d8259315d40479e8c21979128ac0d'; connect-src 'self'",
    "disposition": "report",
    "blocked-uri": "http://localhost:8000/example.css",
    "line-number": 37,
    "source-file": "http://localhost:8000/incorrectCSPwithReport",
    "status-code": 200,
    "script-sample": ""
  }
}
```
