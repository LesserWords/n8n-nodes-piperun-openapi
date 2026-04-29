# n8n-nodes-piperun-openapi

PipeRun CRM integration for n8n.

This repository is a conversion of PipeRun's official OpenAPI specification into an n8n node, with credential support for token authentication.

For npm release, this package needs to be published under a different name because `n8n-nodes-piperun` is already taken.

## Included Nodes

- `Piperun` (`nodes/Piperun/`)

## Authentication

PipeRun requires sending your user token in the `token` HTTP header for each API request.  
See official docs: [PipeRun API Authentication](https://developers.pipe.run/reference/autentica%C3%A7%C3%A3o).

In n8n, configure the `PipeRun API` credential (`piperunApi`) and paste your token.

## Development

### Prerequisites

- Node.js 22+
- npm or pnpm

### Install

```bash
npm install
```

### Run in dev mode

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Package Metadata

- Package: use a different npm package name (`n8n-nodes-piperun` is already claimed)
- Homepage: [https://github.com/LesserWords/n8n-nodes-piperun-openapi](https://github.com/LesserWords/n8n-nodes-piperun-openapi)
- License: MIT

## Notes

- The `Piperun` node uses OpenAPI-driven property generation (`@devlikeapro/n8n-openapi-node`).
- The repository still contains starter example nodes (`Example`, `GithubIssues`) for reference.
