// magpie / OpenCode provider plugin: SenseNova Token Plan (商汤日日新)
// The gateway exposes OpenAI Chat Completions, Anthropic Messages and OpenAI
// Responses from one origin. Select the wire API with the `protocol` option.

const PROVIDER = "sensenova"
const ORIGIN = "https://token.sensenova.cn"

// base = what the SDK appends its own path to.
const PROTOCOL = {
  chat: { npm: "@ai-sdk/openai-compatible", base: `${ORIGIN}/v1` },
  anthropic: { npm: "@ai-sdk/anthropic", base: ORIGIN },
  responses: { npm: "@ai-sdk/openai", base: `${ORIGIN}/v1` },
}

const STANDARD_EFFORTS = ["none", "low", "medium", "high", "max"]

// Limits and capabilities are from https://platform.sensenova.cn/docs.
// Token Plan uses account credits rather than token prices, so costs are zero.
const MODELS = [
  {
    id: "sensenova-6.8-flash-lite",
    name: "SenseNova 6.8 Flash Lite",
    context: 262_144,
    output: 65_536,
    efforts: STANDARD_EFFORTS,
    image: true,
    endpoints: ["chat", "anthropic", "responses"],
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    context: 1_000_000,
    output: 384_000,
    efforts: ["none", "minimal", "low", "medium", "high", "max", "xhigh"],
    endpoints: ["chat", "anthropic", "responses"],
  },
  {
    id: "deepseek-flash",
    name: "DeepSeek V4.1 Flash",
    context: 1_000_000,
    output: 393_216,
    efforts: ["none", "low", "high", "max"],
    image: true,
    video: true,
    endpoints: ["chat", "anthropic", "responses"],
  },
  {
    id: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    context: 1_048_576,
    output: 65_536,
    efforts: ["none", "low", "high", "max"],
    endpoints: ["chat", "anthropic", "responses"],
  },
  {
    id: "glm-5.2",
    name: "GLM-5.2",
    context: 1_000_000,
    output: 131_072,
    efforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    endpoints: ["chat", "anthropic", "responses"],
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    context: 1_048_576,
    output: 1_048_576,
    efforts: ["none", "low", "medium", "high", "max"],
    image: true,
    endpoints: ["chat", "anthropic", "responses"],
  },
]

function pickProtocol(value) {
  const name = typeof value === "string" ? value.trim().toLowerCase() : ""
  return Object.hasOwn(PROTOCOL, name) ? name : "chat"
}

function forProtocol(protocol) {
  return MODELS.filter((m) => m.endpoints.includes(protocol))
}

function variants(m, protocol) {
  if (!m.efforts?.length) return undefined
  return Object.fromEntries(
    m.efforts.map((effort) => {
      if (protocol === "responses") {
        // The current compatibility endpoint ignores effort levels except none.
        return effort === "none" ? [effort, { reasoningEffort: "none" }] : null
      }
      if (protocol === "anthropic") {
        return [
          effort,
          effort === "none"
            ? { thinking: { type: "disabled" } }
            : { thinking: { type: "enabled" }, output_config: { effort } },
        ]
      }
      return [effort, { reasoningEffort: effort }]
    }).filter(Boolean),
  )
}

function inputModalities(m) {
  return ["text", ...(m.image ? ["image"] : []), ...(m.video ? ["video"] : [])]
}

function cost(m) {
  return {
    input: m.cost?.input ?? 0,
    output: m.cost?.output ?? 0,
    cache_read: m.cost?.cache_read ?? 0,
    cache_write: 0,
  }
}

function entry(m, protocol) {
  const video = protocol === "chat" && Boolean(m.video)
  const e = {
    name: m.name,
    limit: { context: m.context, output: m.output },
    reasoning: Boolean(m.efforts?.length),
    tool_call: m.tool_call !== false,
    attachment: Boolean(m.image || video),
    modalities: { input: inputModalities({ ...m, video }), output: ["text"] },
    cost: cost(m),
  }
  const v = variants(m, protocol)
  if (v && Object.keys(v).length) e.variants = v
  return e
}

function configModels(protocol) {
  return Object.fromEntries(forProtocol(protocol).map((m) => [m.id, entry(m, protocol)]))
}

function mergeModels(defaults, user) {
  const out = { ...defaults }
  for (const [id, value] of Object.entries(user ?? {})) {
    out[id] = out[id] ? { ...out[id], ...value } : value
  }
  return out
}

function model(m, protocol) {
  const e = entry(m, protocol)
  const p = PROTOCOL[protocol]
  return {
    id: m.id,
    providerID: PROVIDER,
    name: m.name,
    api: { id: m.id, url: p.base, npm: p.npm },
    status: "active",
    cost: { input: e.cost.input, output: e.cost.output, cache: { read: e.cost.cache_read, write: 0 } },
    limit: { context: e.limit.context, output: e.limit.output },
    options: {},
    headers: {},
    capabilities: {
      temperature: true,
      reasoning: e.reasoning,
      attachment: e.attachment,
      toolcall: e.tool_call,
      input: {
        text: true,
        image: Boolean(m.image),
        audio: false,
        video: protocol === "chat" && Boolean(m.video),
        pdf: false,
      },
      output: { text: true, image: false, audio: false, video: false, pdf: false },
      interleaved: false,
    },
    release_date: "",
    variants: e.variants ?? {},
  }
}

function authHeaders(key) {
  return { authorization: `Bearer ${key}`, "x-api-key": key }
}

function modelRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : (payload?.data ?? payload?.models ?? payload?.result ?? [])
  return Array.isArray(rows) ? rows : []
}

function finite(...values) {
  return values.find((value) => Number.isFinite(value) && value >= 0)
}

function liveModel(row, protocol) {
  const id = typeof row === "string" ? row : (row?.id ?? row?.model)
  if (typeof id !== "string" || !id) return undefined
  const known = MODELS.find((m) => m.id === id)
  const input = Array.isArray(row?.input_modalities) ? row.input_modalities : []
  const output = Array.isArray(row?.output_modalities) ? row.output_modalities : []
  if (known) {
    return {
      ...known,
      context: finite(row?.context_length) ?? known.context,
      output: finite(row?.max_output_length) ?? known.output,
      image: input.length ? input.includes("image") : known.image,
      video: protocol === "chat" && input.includes("video"),
      cost: {
        input: finite(Number(row?.pricing?.prompt)) ?? 0,
        output: finite(Number(row?.pricing?.completion)) ?? 0,
        cache_read: finite(Number(row?.pricing?.input_cache_read)) ?? 0,
      },
    }
  }
  if (typeof row !== "object") return undefined

  // U1.5 and other image-only models do not use any of these text SDKs.
  if (!output.includes("text")) return undefined
  const features = Array.isArray(row.supported_features) ? row.supported_features : []
  return {
    id,
    name: typeof row.name === "string" ? row.name : id,
    context: finite(row.context_length) ?? 262_144,
    output: finite(row.max_output_length) ?? 65_536,
    efforts: features.includes("reasoning") ? STANDARD_EFFORTS : [],
    tool_call: features.includes("tools"),
    image: input.includes("image"),
    video: protocol === "chat" && input.includes("video"),
    cost: {
      input: finite(Number(row.pricing?.prompt)) ?? 0,
      output: finite(Number(row.pricing?.completion)) ?? 0,
      cache_read: finite(Number(row.pricing?.input_cache_read)) ?? 0,
    },
    endpoints: [protocol],
  }
}

async function listModels(key, protocol) {
  const res = await fetch(`${ORIGIN}/v1/models`, {
    headers: { ...authHeaders(key), accept: "application/json" },
  })
  if (!res.ok) return undefined
  return modelRows(await res.json())
    .map((row) => liveModel(row, protocol))
    .filter(Boolean)
}

export const SenseNovaAuthPlugin = async (input, options) => {
  const protocol = pickProtocol(options?.protocol)
  const p = PROTOCOL[protocol]

  return {
    config: async (cfg) => {
      cfg.provider ??= {}
      const was = cfg.provider[PROVIDER] ?? {}
      cfg.provider[PROVIDER] = {
        name: "SenseNova (商汤日日新)",
        npm: p.npm,
        api: p.base,
        ...was,
        models: mergeModels(configModels(protocol), was.models),
      }
    },

    auth: {
      provider: PROVIDER,
      methods: [{ type: "api", label: "SenseNova API key", placeholder: "sk-…" }],
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth?.type !== "api" || !auth.key) return {}
        const key = auth.key
        return {
          baseURL: p.base,
          apiKey: key,
          async fetch(request, init) {
            const headers = new Headers(init?.headers ?? {})
            headers.set("authorization", `Bearer ${key}`)
            headers.set("x-api-key", key)
            return fetch(request, { ...init, headers })
          },
        }
      },
    },

    provider: {
      id: PROVIDER,
      async models(provider, { auth } = {}) {
        if (auth?.type !== "api" || !auth.key) return provider.models
        let rows
        try {
          rows = await listModels(auth.key, protocol)
        } catch {
          return provider.models
        }
        if (!rows?.length) return provider.models
        return Object.fromEntries(rows.map((m) => [m.id, model(m, protocol)]))
      },
    },
  }
}

export const _internal = {
  PROVIDER,
  ORIGIN,
  PROTOCOL,
  MODELS,
  pickProtocol,
  forProtocol,
  variants,
  entry,
  model,
  modelRows,
  liveModel,
  listModels,
  authHeaders,
}
