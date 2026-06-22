---
description: |
  Various projects can integrate into Fresh to easily add functionality to your
  project.
---

This section of the docs showcases modules or other projects that integrate with
Fresh. These integrations can be used to add functionality to your project.

## `fresh_charts`

Fresh charts allows for easy integration of [Chart.js][chart-js] charts into
your Fresh project. It provides a `Chart` JSX component that can be used to
render charts on the server and client.

A live demo can be found here: https://fresh-charts.deno.dev/

Documentation for the module can be found here: https://github.com/denoland/fresh_charts

[chart-js]: https://www.chartjs.org/ "Chart.js"

## `fresh_marionette`

Fresh Marionette allows you to start writing end 2 end browser tests in your
Fresh projects with a single import. Then you can run those browser tests in a
GitHub Actions workflow.

The `deno.land/x/fresh_marionette` module has been retired and the example
project (`https://marionette.deno.dev`) is no longer maintained — see
the Fresh [GitHub repository](https://github.com/denoland/fresh) for
current end-to-end testing guidance.

An example project that runs the tests in a GitHub Actions workflow:
https://marionette.deno.dev

Fresh Marionette works with VSCode too! - https://youtu.be/OG77NdqL164
