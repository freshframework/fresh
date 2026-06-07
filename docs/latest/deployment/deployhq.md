---
description: "Deploy Fresh to your own server with DeployHQ"
---

[DeployHQ](https://www.deployhq.com) is a Git-based deployment service that
deploys your Fresh app to a server you own (typically a VPS running Deno). It
connects to a GitHub, GitLab, or Bitbucket repository and ships your built
output over SSH, SFTP, or FTP whenever you push, with one-click rollbacks,
multiple environments per project, and config-file injection. Use it when you
want to keep Fresh on infrastructure you already manage without writing your
own deploy script or maintaining a `Dockerfile`.

## Prerequisites

1. A server with Deno installed (any Linux VPS — DigitalOcean, Hetzner, Linode,
   AWS EC2, etc.) and SSH access.
2. Your Fresh app in a Git repository.
3. A free [DeployHQ account](https://www.deployhq.com/signup).

## Setup

1. In DeployHQ, create a new project and link your Fresh repository.
2. Add your server under **Servers & Groups**, pointing to the deploy path on
   your VPS (for example, `/var/www/my-fresh-app`).
3. Under **Build Pipeline**, add the build commands DeployHQ should run before
   uploading:

   ```sh Build pipeline
   deno install --allow-scripts
   deno task build
   ```

   The `deno install --allow-scripts` step is required to populate `node_modules`
   and run any post-install scripts needed by npm packages (e.g. Tailwind CSS),
   matching the Docker deployment pattern.

4. Under **SSH Commands → After upload**, add a command to set the build ID and
   restart your Fresh process (this assumes Fresh is running under `systemd` as
   a service named `my-fresh-app`):

   ```sh After upload SSH command
   sudo systemctl set-environment DENO_DEPLOYMENT_ID=%endrev%
   sudo systemctl restart my-fresh-app
   ```

5. Trigger a deployment from the DeployHQ dashboard or push to your tracked
   branch.

> [info]: Fresh requires the `DENO_DEPLOYMENT_ID`
> [environment variable](/docs/advanced/environment-variables) to change on
> every release for caching to work correctly. DeployHQ provides `%endrev%` in
> SSH commands as the Git commit SHA of the end revision being deployed, which
> is a safe value to use here. If this ID does not change between releases,
> incorrect caching **will** cause your project to misbehave.

## Running Fresh under systemd

A minimal `systemd` service that runs the built Fresh server is:

```ini /etc/systemd/system/my-fresh-app.service
[Unit]
Description=Fresh app
After=network.target

[Service]
WorkingDirectory=/var/www/my-fresh-app
ExecStart=/usr/local/bin/deno serve -A _fresh/server.js
Restart=on-failure
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
```

Reload `systemd` and enable the service once:

```sh Terminal
sudo systemctl daemon-reload
sudo systemctl enable --now my-fresh-app
```

Subsequent deploys are handled entirely by the DeployHQ SSH command above.

## Environment variables

Set runtime environment variables in your `systemd` unit file (`Environment=`
lines) or in a `/etc/default/my-fresh-app` file referenced via
`EnvironmentFile=`. Variables prefixed with `FRESH_PUBLIC_` are available to
[island](/docs/concepts/islands) code — see
[Environment Variables](/docs/advanced/environment-variables).

See the [DeployHQ documentation](https://www.deployhq.com/support) for more
detail on build pipelines, SSH commands, and multi-environment setups.
