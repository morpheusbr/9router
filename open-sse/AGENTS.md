# open-sse

Provider-agnostic SSE engine: 1 request → any provider → SSE to client.

## Request Lifecycle (Chat)
`handlers/chatCore.js` → `services/model.js` (resolve provider) → **pre-translate hooks** (`rtk/`, `headroom.js`, `caveman.js` - fail-open) → `executors/index.js` → `translator/index.js` (client → provider) → `executor.execute()` → `translateResponse` (provider → client) → SSE out.

## Directory Map
- `config/`: Constants. No hardcodes allowed elsewhere.
- `translator/`: Format conversion. Direct routes skip OpenAI lossy hop.
- `executors/`: Upstream calls. `DefaultExecutor` handles OpenAI-compat.
- `providers/`: Registry. Generate with `scripts/`.
- `handlers/`: Cores per modality (chat, image, etc).
- `rtk/`: Request body token-killer (in-place mutation, fail-open).
- `services/`: Core logic (auth, refresh, combo, usage).
- `utils/`: Helpers (streams, proxy, cloaking).

## Rules
- **No hardcoding**: Use `config/` and `translator/schema/`.
- **Direct Routes**: Use `<source>:<target>` translator pairs for fragile data (thinking, tool ids, images). Avoid OpenAI middleman if possible.
- **Fail-Open Hooks**: `rtk/` and `headroom.js` mutate in-place. Never throw. Skip `is_error` blocks.
- **Side-effect Registration**: Translators must call `register()` and be imported in `translator/index.js`.
- **Auto-generated Registry**: Do not hand-edit `registry/index.js`.

## Add New
- **Provider**: Copy `providers/REGISTRY_TEMPLATE.js` → `registry/{id}.js`. Add models to `config/providerModels.js`. Regenerate index: `node scripts/migrate-registry.mjs`.
- **Executor**: Only for non-OpenAI APIs (protobuf/binary). Subclass `BaseExecutor`, add to `executors/index.js`.
- **Translator**: Add `request|response/<from>-to-<to>.js`, call `register()`. Import in `translator/index.js`.
