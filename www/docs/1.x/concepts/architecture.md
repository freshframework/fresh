---
description: |
  Fresh's architecture is designed to make it easy to build fast, scalable, and reliable applications.
---

Fresh is designed to make it easy to build fast, scalable, and reliable
applications. To do this, it makes opinionated decisions about how one should
build web applications. These decisions are backed by strong empirical data
gathered from experts in the field. Some examples of these principles are:

- Page load times should be reduced to a minimum.
- The work performed on the client should be minimized.
- Errors should have a small blast radius - stuff should gracefully degrade.

The single biggest architecture decision that Fresh makes is its usage of the
[islands architecture][islands] pattern. This means that Fresh applications ship
pure HTML to the client by default. Parts of a server-rendered page can then be
independently re-hydrated with interactive widgets (islands). This means that
the client is only responsible for rendering parts of the page that are
interactive enough to warrant the extra effort. Any content that is purely
static does not have related client-side JavaScript and is thus very
lightweight.

<!-- TODO(lucacasonato): elaborate on request handling, form actions, etc. -->

[islands]: https://www.patterns.dev/posts/islands-architecture/
