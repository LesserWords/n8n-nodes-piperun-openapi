# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-10-29

### Added
- **New `Talk` Resource (Atendimentos / CXM):**
  - `Listar Atendimentos` (`GET /talk/attendances`)
  - `Ver Detalhes Do Atendimento` (`GET /talk/attendances/{attendance_id}`)
  - `Listar Mensagens Do Atendimento` (`GET /talk/attendances/{attendance_id}/messages`)
  - `Listar Status Do Atendimento` (`GET /talk/attendances/{attendance_id}/status`)
- **Entity-Scoped DataList Record Operations:**
  - `Companies`: `Listar Registros Da Empresa` (`GET /companies/{company_id}/datalists/{datalist_id}/records`) and `Adicionar Registro Na Empresa` (`POST /companies/{company_id}/datalists/{datalist_id}/records`)
  - `Deals`: `Listar Registros Da Oportunidade` (`GET /deals/{deal_id}/datalists/{datalist_id}/records`) and `Adicionar Registro Na Oportunidade` (`POST /deals/{deal_id}/datalists/{datalist_id}/records`)
  - `Persons`: `Listar Registros Da Pessoa` (`GET /persons/{person_id}/datalists/{datalist_id}/records`) and `Adicionar Registro Na Pessoa` (`POST /persons/{person_id}/datalists/{datalist_id}/records`)
- **New Query Parameters on Existing Operations:**
  - Added `with` query parameter to `Persons` -> `Listar Pessoas` (`GET /persons`).
  - Added `cursor` query parameter to `Datalists` -> `Listar Listas De Dados` (`GET /datalists`).
  - Added `page`, `show`, `sort`, and `desc` query parameters to `Datalists` -> `Listar Registros De Uma Lista De Dados` (`GET /datalists/{id}/records`).
- **Resilient Schema Fetcher (`scripts/getPiperunSchema.mjs`):**
  - Reconstructs the OpenAPI 3.1 schema directly from `developers.pipe.run` SSR reference pages and ReadMe API registries when direct `/openapi/...` downloads are disabled.
  - Validates the newly fetched schema before archiving `schemas/latest.Piperun.openapi.json`.

### Breaking Changes & Migration Guide

> **Note:** Over 95% of existing operations (`Deals`, `Persons`, `Companies`, `Activities`, `Proposals`, `Notes`, `Pipelines`, `Stages`, `Users`, `Custom Fields`, credentials, and `Additional Parameters`) are **100% unchanged**. Existing n8n workflows are only affected if they use the specific `Datalists` record operations or `Deals` required-field rule operations listed below.

#### 1. `Datalists` Record Operations Renamed / Consolidated (`6` operations)
If an existing workflow has a PipeRun node configured with `Resource: Datalists` and one of the following operations, re-select the replacement operation in the node UI:

| Old Operation in `0.4.1` (`Datalists`) | Replacement in `0.5.0` |
| :--- | :--- |
| `Ver Detalhes De Resposta De Lista De Dados` | `Datalists` -> **`Ver Detalhes Do Registro Da Lista De Dados`** (`GET /datalists/{datalist_id}/records/{record_id}`) |
| `Atualizar Registro De Lista De Dados` | `Datalists` -> **`Atualizar Registro Em Uma Lista De Dados`** (`PUT /datalists/{datalist_id}/records/{record_id}` — now uses `record_id` instead of `id`) |
| `Atualizar Registros Em Uma Lista De Dados Copy` *(was `DELETE /datalists/{datalist_id}/records/{id}`)* | `Datalists` -> **`Deletar Registro De Lista De Dados`** (`DELETE /datalists/{datalist_id}/records/{record_id}`) |
| `Listar Respostas De Lista De Dados` | `Datalists` -> **`Listar Registros De Uma Lista De Dados`** (`GET /datalists/{id}/records`), or use the new entity-scoped `Listar Registros Da Empresa / Oportunidade / Pessoa` operations |
| `Adicionar Resposta A Lista De Dados` / `Adicionar Registros Em Uma Lista De Dados` | PipeRun deprecated unlinked record creation (`POST /datalists/{id}/records`). Use the new entity-scoped operations under **`Companies`**, **`Deals`**, or **`Persons`**:<br>• `Companies` -> **`Adicionar Registro Na Empresa`**<br>• `Deals` -> **`Adicionar Registro Na Oportunidade`**<br>• `Persons` -> **`Adicionar Registro Na Pessoa`** |

#### 2. `Deals` Required Field Rules Removed Upstream (`5` operations)
PipeRun removed the `/deals/requiredFieldRules` endpoints from their official API documentation, so the following operations are no longer generated under `Resource: Deals`:
- `Adicionar Regra De Preenchimento De Campos` (`POST /deals/requiredFieldRules`)
- `Listar Regras De Preenchimento De Campos` (`GET /deals/requiredFieldRules`)
- `Ver Detalhes Da Regra De Preenchimento De Campo` (`GET /deals/requiredFieldRules/{required_field_rule_id}`)
- `Atualizar Regra De Preenchimento De Campo` (`PUT /deals/requiredFieldRules/{required_field_rule_id}`)
- `Deletar Regra De Preenchimento De Campo` (`DELETE /deals/requiredFieldRules/{required_field_rule_id}`)

---

## [0.4.1] - 2026-04-30

### Added
- Support for **Custom Query Parameters**, **Custom Query (JSON)**, **Custom Body Fields**, and **Custom Body (JSON)** under `Additional Parameters` across all operations via `piperunPreSend`.
- Added project architecture documentation (`HOW_IT_WORKS.md`).

---

## [0.4.0] - 2026-04-30

### Changed
- Grouped endpoints into resource categories derived from URL paths and moved optional filters into per-operation `Additional Parameters` collections.

---

## [0.3.0] - 2026-04-30

### Added
- Added schema fetching (`getPiperunSchema`) and deterministic path organization (`organizePiperunSchemaPaths`) scripts.
