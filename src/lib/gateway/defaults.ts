/** Server-only upstream seed. Fill apiKey in the Helix console, do not commit secrets. */
export const DEFAULT_UPSTREAM = {
  name: "Qwen Token Plan",
  baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  apiKey: "",
  models: [
    { publicName: "qwen3.8-flash", upstreamName: "qwen3.8-flash" },
    { publicName: "helix-flash", upstreamName: "qwen3.8-flash" },
  ],
} as const;
