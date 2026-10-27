import { expect, test } from "bun:test"
import { SenseNovaAuthPlugin, _internal } from "./index.mjs"

const { PROTOCOL, MODELS, model, entry, variants, pickProtocol, liveModel } = _internal

test("protocol defaults to chat and accepts all documented APIs", () => {
  expect(pickProtocol(undefined)).toBe("chat")
  expect(pickProtocol("Anthropic")).toBe("anthropic")
  expect(pickProtocol("responses")).toBe("responses")
  expect(pickProtocol("invalid")).toBe("chat")
})

test("protocols point to the Token Plan gateway", () => {
  expect(PROTOCOL.chat).toEqual({
    npm: "@ai-sdk/openai-compatible",
    base: "https://token.sensenova.cn/v1",
  })
  expect(PROTOCOL.anthropic.base).toBe("https://token.sensenova.cn")
  expect(PROTOCOL.responses.base).toBe("https://token.sensenova.cn/v1")
})

test("SenseNova Flash Lite has its documented multimodal limits", () => {
  const e = entry(MODELS[0], "chat")
  expect(e.limit).toEqual({ context: 262_144, output: 65_536 })
  expect(e.modalities.input).toEqual(["text", "image"])
  expect(e.tool_call).toBe(true)
  expect(e.reasoning).toBe(true)
})

test("chat and Anthropic variants use the gateway's effort fields", () => {
  const m = MODELS[0]
  expect(variants(m, "chat").high).toEqual({ reasoningEffort: "high" })
  expect(variants(m, "anthropic").high).toEqual({
    thinking: { type: "enabled" },
    output_config: { effort: "high" },
  })
  expect(variants(m, "anthropic").none).toEqual({ thinking: { type: "disabled" } })
})

test("Responses only exposes its effective reasoning toggle", () => {
  expect(variants(MODELS[0], "responses")).toEqual({ none: { reasoningEffort: "none" } })
})

test("video is only declared on the protocol that accepts it", () => {
  const m = MODELS.find((x) => x.id === "deepseek-flash")
  expect(model(m, "chat").capabilities.input.video).toBe(true)
  expect(model(m, "anthropic").capabilities.input.video).toBe(false)
  expect(model(m, "responses").capabilities.input.video).toBe(false)
})

test("live model metadata supplies limits, modalities and prices", () => {
  const m = liveModel(
    {
      id: "new-model",
      name: "New Model",
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
      context_length: 100_000,
      max_output_length: 8_192,
      supported_features: ["tools", "reasoning"],
      pricing: { prompt: "1.5", completion: "3", input_cache_read: "0.2" },
    },
    "chat",
  )
  expect(model(m, "chat").limit).toEqual({ context: 100_000, output: 8_192 })
  expect(model(m, "chat").cost.input).toBe(1.5)
  expect(model(m, "chat").capabilities.input.image).toBe(true)
  expect(model(m, "chat").capabilities.toolcall).toBe(true)
})

test("live metadata updates known model limits and drops stale modality claims", () => {
  const m = liveModel(
    {
      id: "deepseek-flash",
      input_modalities: ["text"],
      output_modalities: ["text"],
      context_length: 1_048_576,
      max_output_length: 65_536,
      pricing: { prompt: "0", completion: "0", input_cache_read: "0" },
    },
    "chat",
  )
  expect(m.context).toBe(1_048_576)
  expect(m.output).toBe(65_536)
  expect(m.image).toBe(false)
  expect(m.video).toBe(false)
  expect(m.efforts).toContain("max")
})

test("static catalog includes the gateway's DeepSeek V4.1 alias", async () => {
  const plugin = await SenseNovaAuthPlugin({}, {})
  const cfg = {}
  await plugin.config(cfg)
  expect(cfg.provider.sensenova.models["deepseek-v4.1-flash"].limit).toEqual({
    context: 1_048_576,
    output: 65_536,
  })
})

test("image generation models and string rows are not invented as chat models", () => {
  expect(liveModel({ id: "sensenova-u1.5-lite", output_modalities: ["image"] }, "chat")).toBeUndefined()
  expect(liveModel("unknown", "chat")).toBeUndefined()
  expect(liveModel({ id: "new", output_modalities: ["text"] }, "chat").name).toBe("new")
})

test("config merges user fields without dropping model defaults", async () => {
  const plugin = await SenseNovaAuthPlugin({}, { protocol: "anthropic" })
  const cfg = {
    provider: {
      sensenova: { name: "mine", models: { "kimi-k3": { name: "custom" } } },
    },
  }
  await plugin.config(cfg)
  expect(cfg.provider.sensenova.name).toBe("mine")
  expect(cfg.provider.sensenova.npm).toBe("@ai-sdk/anthropic")
  expect(cfg.provider.sensenova.api).toBe("https://token.sensenova.cn")
  expect(cfg.provider.sensenova.models["kimi-k3"].name).toBe("custom")
  expect(cfg.provider.sensenova.models["kimi-k3"].limit.context).toBe(1_048_576)
})

test("models hook falls back to the static catalog without auth", async () => {
  const plugin = await SenseNovaAuthPlugin({}, {})
  const provider = { models: { fallback: true } }
  expect(await plugin.provider.models(provider, {})).toBe(provider.models)
})

test("loader uses Bearer auth and ignores other auth methods", async () => {
  const plugin = await SenseNovaAuthPlugin({}, { protocol: "responses" })
  const got = await plugin.auth.loader(async () => ({ type: "api", key: "sk-test" }))
  expect(got.baseURL).toBe("https://token.sensenova.cn/v1")
  expect(got.apiKey).toBe("sk-test")
  expect(await plugin.auth.loader(async () => ({ type: "oauth" }))).toEqual({})
})

test("authenticated fetch signs outgoing requests", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (_request, init) =>
    new Response(JSON.stringify(Object.fromEntries(init.headers.entries())))
  try {
    const plugin = await SenseNovaAuthPlugin({}, {})
    const { fetch: signedFetch } = await plugin.auth.loader(async () => ({
      type: "api",
      key: "sk-secret",
    }))
    const headers = await signedFetch("https://token.sensenova.cn/v1/models").then((r) => r.json())
    expect(headers.authorization).toBe("Bearer sk-secret")
    expect(headers["x-api-key"]).toBe("sk-secret")
  } finally {
    globalThis.fetch = original
  }
})

test("live list replaces the fallback with text models returned by the gateway", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    expect(init.headers.authorization).toBe("Bearer sk-test")
    return Response.json({
      data: [
        {
          id: "new-model",
          input_modalities: ["text"],
          output_modalities: ["text"],
          supported_features: ["tools"],
        },
        { id: "image-only", output_modalities: ["image"] },
      ],
    })
  }
  try {
    const plugin = await SenseNovaAuthPlugin({}, {})
    const out = await plugin.provider.models(
      { models: {} },
      { auth: { type: "api", key: "sk-test" } },
    )
    expect(Object.keys(out)).toEqual(["new-model"])
    expect(out["new-model"].providerID).toBe("sensenova")
  } finally {
    globalThis.fetch = original
  }
})

test("model list failures retain the static catalog", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response("unavailable", { status: 503 })
  try {
    const plugin = await SenseNovaAuthPlugin({}, {})
    const provider = { models: { fallback: true } }
    expect(
      await plugin.provider.models(provider, { auth: { type: "api", key: "sk-test" } }),
    ).toBe(provider.models)
  } finally {
    globalThis.fetch = original
  }
})

test("magpie.icon is the inlined assets/icon.png", async () => {
  const { readFile } = await import("node:fs/promises")
  const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"))
  const icon = pkg.magpie.icon
  expect(icon.startsWith("data:image/png;base64,")).toBe(true)
  const inlined = Buffer.from(icon.slice("data:image/png;base64,".length), "base64")
  const onDisk = await readFile(new URL("./assets/icon.png", import.meta.url))
  expect(inlined.equals(onDisk)).toBe(true)
})
