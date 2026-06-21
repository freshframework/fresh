---
description: |
  Fresh can be deployed to a variety of platforms easily.
---

While Fresh is designed to be deployed to [Deno Deploy][deno-deploy], it can be
deployed to any system or platform that can run a Deno based web server.

Here are instructions for specific providers / systems:

- [Deno Deploy](#deno-deploy)
- [Docker](#docker)
- [Self Contained Executable](#self-contained-executable)

## Deno Deploy

The recommended way to deploy Fresh is by using Deno Deploy. Deno Deploy
provides a GitHub integration that can deploy your Fresh projects to its
globally distributed edge network in seconds, automatically.

View [the getting started guide][deploy-to-production] for instructions on how
to deploy Fresh to Deno Deploy.

## Docker

You can deploy Fresh to any platform that can run Docker containers. Docker is a
tool to containerize projects and portably run them on any supported platform.

When packaging your Fresh app for Docker, it is important that you set the
`DENO_DEPLOYMENT_ID` environment variable in your container. This variable needs
to be set to an opaque string ID that represents the version of your application
that is currently being run. This could be a Git commit hash, or a hash of all
files in your project. It is critical for the function of Fresh that this ID
changes when _any_ file in your project changes - if it doesn't, incorrect
caching **will** cause your project to not function correctly.

Here is an example `Dockerfile` for a Fresh project:

```dockerfile Dockerfile
FROM denoland/deno:1.38.3

ARG GIT_REVISION
ENV DENO_DEPLOYMENT_ID=${GIT_REVISION}

WORKDIR /app

COPY . .
RUN deno cache main.ts

EXPOSE 8000

CMD ["run", "-A", "main.ts"]
```

To build your Docker image inside of a Git repository:

```sh Terminal
$ docker build --build-arg GIT_REVISION=$(git rev-parse HEAD) -t my-fresh-app .
```

Then run your Docker container:

```sh Terminal
$ docker run -t -i -p 80:8000 my-fresh-app
```

To deploy to a cloud provider, push it to a container registry and follow their
documentation.

- [Amazon Web Services][aws-container-registry]
- [Google Cloud][gcp-container-registry]

## Self Contained Executable

With Deno 2.1, you can create a self-contained executable of your Fresh project
that includes all assets and dependencies. This executable can run on any
platform without requiring Deno to be installed.

```sh Terminal
$ deno task build
$ deno compile --include static --include _fresh --include deno.json -A main.ts
```

[aws-container-registry]: https://docs.aws.amazon.com/AmazonECS/latest/userguide/create-container-image.html#create-container-image-push-ecr
[gcp-container-registry]: https://cloud.google.com/container-registry/docs/pushing-and-pulling
[deno-deploy]: https://deno.com/deploy
[deploy-to-production]: /docs/1.x/getting-started/deploy-to-production
