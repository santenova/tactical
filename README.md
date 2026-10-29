# Tactical

A modular, local-first AI console built on React + Vite and the Base44 platform. It combines three things in one interface:

- **AI chat** — streaming completions from a local Ollama runtime, with a spoken voice orb, personas and mission context.
- **Tactical dashboard** — inspection and management of the Elasticsearch cluster that stores everything the app knows.
- **Knowledge cores** — preset and per-user keyword sets that drive web-scrape ingestion, semantic search and summarisation.

Every interaction can be logged to Elasticsearch (`ai_responses`) and optionally to a Google Sheet.

---

## Quick start

Prerequisites: Node 18+, plus a local **Ollama** instance, **Elasticsearch** instance (both optional — the app boots without them, with reduced functionality) and optionally **Browserless** for scraping.

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` with the Base44 app credentials:
   ```
   VITE_BASE44_APP_ID=your_app_id
   VITE_BASE44_APP_BASE_URL=your_backend_url
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```

Open [Base44.com](https://Base44.com) to edit the app on the platform; click **Publish** there to ship changes. Docs: [docs.base44.com](https://docs.base44.com/Integrations/Using-GitHub) · Support: [app.base44.com/support](https://app.base44.com/support).

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Production build to `dist/` (unresolved imports and missing exports are fatal) |
| `npm run preview` | Serve the production build |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run typecheck` | TypeScript check via `jsconfig.json` (JS with `checkJs`-style typing) |

### Local service proxies

`vite.config.js` exposes same-origin proxies so the browser never hits CORS or mixed content:

| Path | Target | Env override |
| --- | --- | --- |
| `/proxy` | `http://localhost:11434` (Ollama) | `VITE_PROXY_TARGET_OLLAMA` |
| `/db` | `http://localhost:9200` (Elasticsearch) | `VITE_PROXY_TARGET_ELASTICSEARCH` |
| `/api`, `/custom` | ngrok tunnel | `VITE_PROXY_TARGET_NGROK` |

`src/lib/localProxies.js` resolves which endpoint to use at boot — the internal proxy when it answers with the service's own JSON, otherwise the direct local port — and caches the result so the boot diagnostics and the panels share one decision.

### Getting your local Ollama and Elasticsearch running

The app boots without either service, but chat needs Ollama and everything knowledge-core related needs Elasticsearch.

**Ollama** (default `http://localhost:11434`, reachable through `/proxy`):

```bash
# macOS / Linux install script; Windows: download the installer from ollama.com
curl -fsSL https://ollama.com/install.sh | sh

ollama serve                        # start the API on :11434
ollama pull llama3:latest           # chat model (default)
ollama pull nomic-embed-text        # embeddings for semantic search
```

If the app is served from a host other than localhost, allow the origin once: `OLLAMA_ORIGINS=* ollama serve`.

**Elasticsearch** (default `http://localhost:9200`, reachable through `/db`) — Docker is the quickest route:

```bash
docker network create tactical
docker run -d --name tactical-es --network tactical -p 9200:9200 \
  -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  -e ES_JAVA_OPTS="-Xms1g -Xmx1g" \
  docker.elastic.co/elasticsearch/elasticsearch:8.13.4
```

Verify both are up before touching the UI:

```bash
curl -s http://localhost:11434/v1/models   # ["llama3:latest", ...]
curl -s http://localhost:9200/_cat/health  # status: green
```

Then reload the app: the boot diagnostics check both services and report `PROXY` or `DIRECT` per endpoint. You can also point the DB, CORE and Model panels at other endpoints (a remote cluster, an ngrok tunnel) from their endpoint pickers, which persist to `localStorage`.

---

## Architecture

```
src/
  App.jsx                  router + auth/query providers
  pages/                   routed screens (Home, InteractionLogs, KnowledgePresets, DataExport)
  components/tools/        every domain panel and canvas widget
  components/ui/           shadcn/ui primitives
  lib/                     endpoint resolution, presets, graph maths, theme + auth helpers
  hooks/                   useLocalStorage, use-mobile
base44/
  functions/logToSheet/    server function: appends a chat log row to Google Sheets
  entities/User.jsonc      user entity customization
```

State is intentionally lightweight: UI preferences, endpoint lists, queues and caches live in `localStorage`; documents live in Elasticsearch; users and auth come from Base44. There is no app database collection in the path of the AI features.

### Routes

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | `Home` | Orb, chat, and the six main tabs (see below) |
| `/interaction-logs` | `InteractionLogs` | Search and page through the `ai_responses` index, filter by model |
| `/knowledge-presets` | `KnowledgePresets` | Edit the 20 preset cores, plus the keyword-overlap graph |
| `/data-export` | `DataExport` | Export any Elasticsearch indices as JSON, NDJSON or CSV |

### Home tabs (Navbar)

| Tab | Component | What it does |
| --- | --- | --- |
| `◈ AI` | `ChatPanel`, `OrbCanvas`, `AudioConfigPanel`, `ModelPanel` | Streaming chat, orb state machine, voice and audio settings, model picker |
| `▶ MEDIA` | `MediaRepository`, `MainFeed` | Import local audio/video into a playlist, play with optics modes and audio visualization |
| `◉ REC` | `ScreenRecorder` | Screen + mic capture, timeline, trim and crop |
| `⬡ DB` | `DBPanel` | Cluster/category inspection |
| `◻ BROWSER` | `BrowserlessPanel` | Browserless endpoint tests and script runner |
| `◉ CORE` | `CorePanel` | Knowledge core ingestion, search, summarise, schedule, visualise |

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `F` | Toggle fullscreen orb |
| `Space` | Start/stop recording (REC tab only) |
| `Ctrl/Cmd + I` | Jump to and focus the chat input |

---

## `src/components/tools` reference

### Chat, orb and voice

| File | Responsibility |
| --- | --- |
| `ChatPanel.jsx` | Prompt editor with template insertion, `[PLACEHOLDER]` detection + fill-in dialog, run/cancel, output viewer, canvas charts, run stats, `MissionBrief` drawer. Auto-focuses on Ctrl/Cmd+I. |
| `OrbCanvas.jsx` | The animated filament orb on the AI tab. Reads `mode` (idle / listening / thinking / speaking / crisis), draws with per-mode volatility and surge settings, handles click-to-interrupt and fullscreen. |
| `OrbFullscreen.jsx` | Same orb rendered edge-to-edge with status and transcript overlay. |
| `AudioConfigPanel.jsx` | Three sections — AUDIO, VOICE, ORB — covering mic/analyser init, speech rate/pitch/language, listening toggle and all orb physics sliders. |
| `VoiceConfigPanel.jsx` | Slide-over with six voice presets (TACTICAL, ORACLE, SENTINEL, GHOST, NEMESIS, STEALTH) and custom pitch/rate/volume. Exports `loadVoiceConfig()`, which `Home` applies on mount. |
| `PersonaManager.jsx` | Exports `PERSONAS` — six personas (tactical, oracle, sentinel, ghost, nemesis, stealth), each with system prompt, greeting, theme key and orb settings — plus the picker and custom persona editor. |
| `PersonaBackground.jsx` | Full-screen canvas backdrop; each persona gets its own effect set and particle palette. |
| `MissionBrief.jsx` | Pinned-fact store (`IDENTITY`, `MISSION`, `RULES`, `CONTEXT`, `FACTS`, `OTHER`). Pinned items are injected into every system prompt. |
| `MemoryInspector.jsx` | Long-term memory browser: keyword search, tag filter, pin and delete. Exports `extractKeywords` and `scoreMemory`, used by `Home` for retrieval. |
| `TranscriptArchive.jsx` | Slide-over archive of chat turns with re-engage actions (summarise / elaborate). |
| `PromptLibrary.jsx` | Saved prompt templates by category (Coding, Explanation, Data, AI, Creative, Other). |
| `PromptHistory.jsx` | Previous prompts with reload and clear. |
| `OutputViewer.jsx` | Renders model output as raw text or a sanitised HTML preview. |
| `CanvasOutput.jsx` | Parses numbers and number pairs out of model output and charts them as bar, line, nodes or scatter. |
| `HoverCloud.jsx` | Floating tooltip fed by `data-desc` attributes on hovered elements. |

### Models and endpoints

| File | Responsibility |
| --- | --- |
| `ModelPanel.jsx` | Ollama endpoint picker (proxy / localhost variants, saved custom endpoints), model list refresh, pull-model, model info, connection status light. |
| `EndpointManager.jsx` | Generic add/remove/select endpoint list, shared by the panels that need it. |
| `IntroOverlay.jsx` | Boot diagnostics: probes Ollama, Elasticsearch, Browserless and browser speech support, then hands resolved endpoints to `Home.boot()`. Can be overridden. |

### Knowledge cores

| File | Responsibility |
| --- | --- |
| `CorePanel.jsx` | Orchestrator for the CORE tab. Owns core state (`activePersonal`, `coreName`, query queue, embedding + expansion switches), five sub-views, the ingestion loop and the activity log. Exports `INDEX_PREFIX` (`knowledge_core_`) and `coreIndexName()`. |
| `CorePresets.jsx` | Renders the preset chips; selecting one opens the refiner. |
| `CoreRefiner.jsx` | Takes a preset and asks the LLM for a refined keyword set, allows manual edits, then saves it to the user's personal core index. Exports `personalCoreIndex(presetName, userId)`. |
| `PersonalCores.jsx` | Lists personal `<preset>_core_<user id>` indices, shows the saved sets per core, edits keywords, saves/deletes sets, and queues keywords for ingestion. Selecting a core makes it the active core **and** loads its stored keywords into the ingest queue. |
| `SearchPanel.jsx` | Three retrieval modes — FULL-TEXT (fuzzy `multi_match`), SEMANTIC (kNN over `dense_vector`) and HYBRID (native kNN + text, RRF fallback). Ranked, highlighted results with score bars and an optional cited AI answer. |
| `RagAnswer.jsx` | Renders the RAG answer with inline `[n]` citations resolved against the result list. |
| `SummarizePanel.jsx` | Summarises the scraped results of one query per core into `knowledge_core_summaries`. |
| `SchedulerPanel.jsx` | Per-query intervals (15 min … 24 h) that auto-queue scrape runs into ingestion while the tab is open. |
| `KnowledgeCoreViz.jsx` | Recharts view of a core: keyword frequency, domains, ingest timeline and document breakdown. |
| `KeywordGraph.jsx` | Keyword-overlap graph across all cores, with filters for ALL / PERSONAL / PRESETS and core selection. |
| `KeywordGraphCanvas.jsx` | SVG renderer for the graph: force-layout nodes, weighted links, per-core colours. |

#### Ingestion pipeline

```
preset → refine (LLM) → personal core keywords
        ↓
   query queue ──► query expansion (LLM synonyms)
        ↓
   discovery: _cat/indices, excluding knowledge_core_* and *_core_* 
        ↓
   wide-net _search across source indices (up to 10k hits)
        ↓
   optional embeddings (Ollama /api/embeddings, dimension auto-probed)
        ↓
   _bulk index into knowledge_core_<name> or <preset>_core_<user id>
```

Start/stop and the per-batch delay live in the CORE tab; every action is mirrored into the activity log.

#### Index conventions

| Pattern | Meaning |
| --- | --- |
| `knowledge_core_<name>` | A named/preset core built by ingestion |
| `<preset>_core_<user id>` | A user's personal refined core |
| `knowledge_core_summaries` | Generated per-query summaries |
| `ai_responses` | Chat log written on every AI-tab completion |
| everything else | Treated as a source corpus for ingestion |

Core mappings: `query` (keyword), `title`/`snippet` (text), `url` (keyword), `scraped_at` (date) and `embedding` (`dense_vector`, `cosine`) when vectors are enabled.

### Data and media

| File | Responsibility |
| --- | --- |
| `DBPanel.jsx` | Elasticsearch dashboard: cluster, indices, shards, aliases and nodes views with sorting, index filtering and a per-index drill-down. Writes the shared active endpoint key. |
| `BrowserlessPanel.jsx` | Endpoint list (proxy / local variants), service tests (health, screenshot, PDF, content), and a custom script runner with output log. |
| `ScreenRecorder.jsx` | `getDisplayMedia` + mic capture, live timer, library, timeline, trim (`start`/`end`) and crop modal. Space toggles recording. |
| `MediaRepository.jsx` | Playlist sidebar: import, duration/size/bitrate/resolution formatting, sort options, selection. |
| `MainFeed.jsx` | Video stage with optics modes (standard / night / thermal), transport controls, audio analyser hookup and track metadata. |

### Chrome and shared UI

| File | Responsibility |
| --- | --- |
| `Navbar.jsx` | Sticky bar with the six tabs, theme picker, and a utility drawer linking to memory, voice, archive, interaction logs, knowledge presets and data export. |
| `ThemeSwitcher.jsx` | Exports `THEMES` (tactical, blood, ghost, amber, matrix, violet, stealth, natural) and `applyTheme()`; eight palettes plus an accent picker. |
| `PageShell.jsx` | Standard page header (icon, title, subtitle) wrapper for the routed pages. |

---

## `src/lib` helpers

| Module | Exports |
| --- | --- |
| `localProxies.js` | `OLLAMA_PROXY_URL`, `ELASTIC_PROXY_URL`, `DIRECT_*` fallbacks, `normalizeOllamaUrl()`, `resolveLocalEndpoints(force)` |
| `esEndpoints.js` | `loadEsEndpoints()`, `saveEsEndpoints()`, `saveActiveEsEndpoint()`, `preferElasticEndpoint()`, `ES_LS_KEY`, `ES_ACTIVE_LS_KEY` |
| `knowledgePresets.js` | `DEFAULT_PRESETS` (20 cores), `PRESET_COLORS`, `loadPresets()`, `savePresets()`, `slugifyPresetName()` |
| `coreGraph.js` | `colorForCore()`, `buildGraph()`, `computeLayout()` (force layout), `fetchPersonalCores()` |
| `orbComment.js` | `fetchOrbComment()` — one short spoken line about a finished answer |

## Local storage keys

| Key | Contents |
| --- | --- |
| `tactical_app_prompt`, `tactical_app_output` | Draft prompt and last output |
| `tactical_app_tab`, `tactical_app_theme`, `tactical_accent_color` | UI position and theme |
| `tactical_app_model`, `tactical_app_persona` | Selected model and persona |
| `tactical_app_voice_enabled`, `tactical_voice_config` | Voice on/off and voice preset |
| `tactical_app_orb_settings`, `tactical_app_mission_brief` | Orb physics and pinned facts |
| `tactical_transcript_log`, `tactical_ltm` | Chat archive and long-term memory |
| `tactical_sheet_id` | Google Sheet used for chat logging |
| `tactical_es_endpoints`, `tactical_es_active_ep` | Elasticsearch endpoints, shared active selection |
| `tactical_browserless_endpoints`, `tactical_bl_active_ep`, `tactical_bl_script` | Browserless config |
| `tactical_knowledge_core_state`, `tactical_core_ui` | Core config, queries, embedding settings, last view |
| `tactical_core_presets`, `tactical_core_schedules` | Preset overrides and scrape schedules |

---

## Backend

`base44/functions/logToSheet/entry.ts` — invoked from the AI tab when a Sheet ID is set. Uses the authorized Google Sheets connector to append `datetime, model, prompt, response, tokens, time taken` to `Sheet1!A:F`. Returns `{ success, updatedRange }` or an error with the provider status.

Authentication, hosting and the Google Sheets OAuth connection are provided by Base44 — no server code is required for them.

## Conventions

- All network clients (Ollama, Elasticsearch, Browserless) are plain `fetch` against a resolved endpoint; no SDKs for them.
- Design tokens live in `src/index.css` (`--neon-*`, `--iris-primary`) and are applied by `ThemeSwitcher`; panels stay within the neon-on-black tactical language.
- Prefer `find_replace` for edits, keep components under ~50 lines where practical, and put shared logic in `src/lib`.
- Builds fail on unresolved imports or missing exports — run `npm run build` before publishing.