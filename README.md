# n8n-nodes-piperun-openapi

PipeRun CRM integration for n8n.

This repository is a conversion of PipeRun's official OpenAPI specification into an n8n node, with credential support for token authentication.

For an overview of how the generator and runtime work, see [How This Project Works](HOW_IT_WORKS.md).

For npm release, this package needs to be published under a different name because `n8n-nodes-piperun` is already taken.

## Included Nodes

- `PiperunApi` (`nodes/PiperunApi/`)

## Authentication

PipeRun requires sending your user token in the `token` HTTP header for each API request.  
See official docs: [PipeRun API Authentication](https://developers.pipe.run/reference/autentica%C3%A7%C3%A3o).

In n8n, configure the `PipeRun API` credential (`piperunApi`) and paste your token.

## Custom Fields & Query Parameters

Every operation in the PipeRun node includes an **Additional Parameters** section that supports sending custom data beyond what is defined in PipeRun's static OpenAPI schema:

- **Custom Query Parameters** (`customQueryParameters`): Add key-value query parameters (e.g. `with`, filters) appended to the URL query string.
- **Custom Query (JSON)** (`customQueryJson`): Merge a raw JSON object into the URL query parameters.
- **Custom Body Fields** (`customBodyFields`): Add arbitrary key-value fields merged directly into the root request body payload (supports strings, numbers, booleans, arrays, nested JSON, and expressions).
- **Custom Body (JSON)** (`customBodyJson`): Merge a raw JSON object directly into the root request body payload.

All existing native PipeRun fields are preserved, while any custom fields you provide are seamlessly merged before the request is dispatched.

## Development

### Prerequisites

- Node.js 22+
- npm or pnpm

### Install

```bash
npm install
```

### Available Scripts

#### Build & Development

- **`npm run dev`**: Starts `n8n-node dev` for local node development.
- **`npm run build`**: Compiles and builds the production package into `dist/` via `n8n-node build`.
- **`npm run build:watch`**: Runs the TypeScript compiler in watch mode (`tsc --watch`) to automatically rebuild when source files change.
- **`npm run lint`**: Checks code quality and formatting with ESLint via `n8n-node lint`.
- **`npm run lint:fix`**: Automatically fixes code formatting and lint issues via `n8n-node lint --fix`.

#### Schema Management

- **`npm run getPiperunSchema`**:
  - Fetches the latest official OpenAPI specification from PipeRun (`https://developers.pipe.run/openapi/...`).
  - Archives the previous `schemas/latest.Piperun.openapi.json` to a date-stamped file (`schemas/YYYYMMDD.Piperun.openapi.json`).
  - Saves the updated specification as `schemas/latest.Piperun.openapi.json` with fetch timestamp metadata.
  - Automatically runs `organizePiperunSchemaPaths` on the newly downloaded schema.
- **`npm run organizePiperunSchemaPaths`**:
  - Organizes the `paths` object in `schemas/latest.Piperun.openapi.json` by operation category tag, URL group, and path name.
  - Ensures deterministic structure and clean git diffs when updating schemas.
  - Can also be run with a custom schema path:
    ```bash
    node ./scripts/organizePiperunSchemaPaths.mjs [path/to/schema.json]
    ```

#### Release & Versioning

- **`npm run release`**: Runs pre-release checks and publishes the node package via `n8n-node release`.
- **`npm version (patch|minor|major)`**: Bumps the package version in `package.json`.

## Package Metadata

- Package: use a different npm package name (`n8n-nodes-piperun` is already claimed)
- Homepage: [https://github.com/LesserWords/n8n-nodes-piperun-openapi](https://github.com/LesserWords/n8n-nodes-piperun-openapi)
- License: MIT

## Notes

- The `Piperun` node uses OpenAPI-driven property generation (`@devlikeapro/n8n-openapi-node`).

⚠️ Not official, i made this because i needed it.
