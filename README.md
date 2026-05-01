# DHIS2 AI Suite

---

## Repo

This repository contains the **DHIS2 AI Suite** — a DHIS2 web application that provides a conversational assistant for metadata, analytics, tracker workflows, and related operations, powered by **LangChain / LangGraph** and **Azure OpenAI**.

---

## Goal

Give DHIS2 users a **natural-language interface** to the same capabilities they would otherwise drive through the Maintenance app, analytics tools, or APIs:

- **Metadata**: search, create, and update DHIS2 metadata (data elements, org units, programs, indicators, etc.).
- **Analytics**: describe what you want to see; the app routes to analytics workflows and can drive charts and selections.
- **Tracker & data entry**: document-driven and guided flows (where configured), using your instance’s programs and org units.
- **Context**: conversation history and orchestration so multi-step flows (e.g. pick indicators, then run a query) stay coherent.

---

## Requirements

### DHIS2

- A **DHIS2 2.x** instance you can log into (version should match what you test against, e.g. **2.40.x**).
- A user account with permissions appropriate for the actions you ask the assistant to perform (metadata write, analytics read, tracker enrollments, etc.).
- **App Management** authority (or equivalent) if you will **install the built app** from the ZIP bundle on the server.

### Development machine

- **Node.js** (LTS recommended; align with [DHIS2 app development guidance](https://developers.dhis2.org/docs/app-platform/getting-started)).
- **Yarn** (this project uses Yarn scripts).
- **Access** to your DHIS2 base URL for local dev (typically via `yarn start` with a proxy to your instance).

### Cloud / AI services

- **Azure OpenAI** (or compatible endpoint) for chat models used by the agents.
- Optional but commonly used in this codebase:
  - **Azure Document Intelligence** (form / document processing).
  - **Azure Blob Storage** (uploads / scanned documents, when those flows are enabled).
  - **External search API** (optional header/metadata discovery), if `DHIS2_EXTERNAL_SEARCH_URL` is set.

### Skills / training

- Basic **DHIS2 metadata** concepts (programs, data elements, org units, datasets) help you validate assistant output.
- Familiarity with **DHIS2 app development** ([Application Platform](https://platform.dhis2.nu/)) helps when extending agents or tools.

### Server resources (hosting the DHIS2 instance)

The assistant runs **mostly in the browser**; heavy lifting is on your **DHIS2 server** and **Azure APIs**. For DHIS2 sizing guidance, see your platform docs. The [Form Forge README](https://raw.githubusercontent.com/FHI360/custom_form_generator/main/README.md) suggests minimum **16 GB RAM / 4 vCPUs** and higher for larger metadata workloads — treat that as a **DHIS2 host** baseline, not a requirement for the laptop running `yarn start`.

---

## Overview

### What users do

1. Open the app inside DHIS2 (or in dev, against a proxied instance).
2. Ask in plain language (e.g. “list data elements for HIV”, “show trends for last quarter”, “help me register patients from this PDF”).
3. The **router** classifies intent and hands off to a **specialized agent** (metadata, analytics, tracker, aggregate data entry, etc.).
4. A **workflow orchestrator** coordinates UI state: loading, errors, **metadata pickers**, charts, and conversation messages.

### Technical shape

```
User message → Router (LangGraph) → Specialist agent → Tools (DHIS2 App Runtime) → DHIS2 REST API → UI + conversation
```

- **UI**: React 18 + TypeScript, DHIS2 App Platform (`d2-app-scripts`).
- **DHIS2 access**: `@dhis2/app-runtime` data engine (queries and mutations).
- **AI**: LangChain + LangGraph (**use `@langchain/langgraph/web` in the browser**, not the Node-only entry).

More detail: [`docs/overview.md`](docs/overview.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), and [`docs/README.md`](docs/README.md).

---

## Model views (conceptual)

| Area | Responsibility |
|------|----------------|
| **Router agent** | Intent + routing (metadata vs analytics vs tracker vs data entry, etc.). |
| **Specialist agents** | Prompts + tool use for one domain. |
| **Tools (`src/utils/tools/metadata/`)** | Typed DHIS2 operations (search, create, update, batch metadata, tracker helpers). |
| **Workflow orchestrator** | Single place for “what the UI shows next”, selection interrupts, and workflow lifecycle. |
| **App runtime bridge** | `DataEngineProvider` + `dhis2-api` wrap `engine.query` / `engine.mutate`. |

---

## Installation

### Prerequisites

1. **Editor** — VS Code (recommended): [DHIS2 course – VS Code](https://dhis2-app-course.ifi.uio.no/learn/getting-started/development-setup/editor/vs-code/)
2. **Node.js**: [installation guide](https://dhis2-app-course.ifi.uio.no/learn/getting-started/development-setup/nodejs/node-installation/)
3. **Yarn**: [Yarn installation](https://dhis2-app-course.ifi.uio.no/learn/getting-started/development-setup/nodejs/yarn-installation/)
4. **DHIS2 app platform**: [Getting started](https://developers.dhis2.org/docs/app-platform/getting-started)

### Clone and install

```bash
git clone <your-fork-or-repo-url> dhis2-ai-suite
cd dhis2-ai-suite
yarn install
```

This project was bootstrapped with the [DHIS2 Application Platform](https://github.com/dhis2/app-platform).

---

## Configuration

### Environment variables

Create a **`.env`** file in the project root (see also `src/utils/env-config.ts`).

`validateEnvironment()` currently expects all of the following to be set (if any are missing, startup logs an error but the app still loads so you can iterate):

| Variable | Purpose |
|----------|---------|
| `DHIS2_AZURE_ENDPOINT` | Azure OpenAI endpoint URL |
| `DHIS2_AZURE_KEY` | Azure OpenAI API key |
| `DHIS2_OPENAI_MODEL` | Model name |
| `DHIS2_AZURE_API_DEPLOYMENT_NAME` | Deployment name |
| `DHIS2_AZURE_API_VERSION` | API version |
| `DHIS2_DOC_INTELLIGENCE_ENDPOINT` | Azure Document Intelligence endpoint |
| `DHIS2_DOC_INTELLIGENCE_KEY` | Azure Document Intelligence key |
| `DHIS2_MODEL_ID` | Document Intelligence **model ID** (not the chat model) |
| `DHIS2_AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage connection string |
| `DHIS2_AZURE_STORAGE_CONTAINER` | Blob container name |
| `DHIS2_EXTERNAL_SEARCH_URL` | External search service base URL |
| `DHIS2_DEFAULT_PROGRAM_ID` | Program UID for tracker flows (defaults in code if unset — **must match your instance** or you will see 404s) |
| `DHIS2_DEFAULT_ORG_UNIT` | Default org unit UID for tracker flows (same note) |

**Optional / elsewhere in code:**

| Variable | Purpose |
|----------|---------|
| `DHIS2_EXTERNAL_SEARCH_API_KEY` | API key for external search (used in metadata helpers via `import.meta.env`) |
| `DHIS2_EXTERNAL_SEARCH_TIMEOUT` | External search timeout (ms), default 5000 |
| `TEMPERATURE` | Model temperature (default `0`) |
| `DHIS2_ENABLE_DELETE_TOOL` | Enable delete-related tools (`true` / `false`, default `false`) |
| `DHIS2_INDEXEDDB_MAX_STORAGE_MB` | IndexedDB cap in MB (default `50`) |

### Local development with a DHIS2 proxy

Use the same pattern as other DHIS2 apps (see e.g. [academy “start your app”](https://github.com/dhis2/academy-web-app-dev-2022/blob/main/resources/GET_STARTED.md#start-your-dhis2-application-locally)):

```bash
yarn start --proxy https://<your-dhis2-host> --proxyPort 8080
```

Then open the URL printed by the dev server (often `http://localhost:3000`).

---

## Available scripts

In the project directory:

| Command | Description |
|---------|-------------|
| `yarn start` | Dev server (hot reload). |
| `yarn test` | Runs tests under `/src`. See [running tests](https://platform.dhis2.nu/#/scripts/test). |
| `yarn build` | Production build → `build/`; deployable **`.zip`** under `build/bundle/`. See [building](https://platform.dhis2.nu/#/scripts/build). |
| `yarn deploy` | Deploys the built app to a DHIS2 instance (requires prior `yarn build`). See [deploying](https://platform.dhis2.nu/#/scripts/deploy). |

---

## Building a ZIP (production bundle)

```bash
yarn build
```

Locate the bundle under `build/bundle/` (exact filename may include a hash). Install it in DHIS2 under **App Management → Manual install → Upload**, similar to [Form Forge installation steps](https://raw.githubusercontent.com/FHI360/custom_form_generator/main/README.md).

---

## Learn more

- [DHIS2 Application Platform](https://platform.dhis2.nu/)
- [DHIS2 Application Runtime](https://runtime.dhis2.nu/)
- [DHIS2 metadata API (example: 2.40)](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-240/metadata.html)

### LangChain / LangGraph in the browser

Use the **web** build of LangGraph in DHIS2 apps:

```typescript
// Correct for browser / DHIS2 apps
import { createReactAgent } from '@langchain/langgraph/web';

// Incorrect for browser-only bundles
import { createReactAgent } from '@langchain/langgraph';
```

---

## License

BSD-3-Clause (see `package.json`).
