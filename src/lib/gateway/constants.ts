export const APP_NAME = "Helix";
export const APP_NAME_ZH = "智枢";

export const ADMIN_EMAIL = "haopeng@helix.dev";
export const ADMIN_PASSWORD = "Helix-Li#8kQ2mN7p";
export const ADMIN_NAME = "Haopeng Li";

export const KEY_PREFIX = "sk-hx-";

export const PROVIDER_PRESETS = [
  {
    id: "qwen-token-cn",
    name: "Qwen Token Plan · 北京",
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "qwen-token-sg",
    name: "Qwen Token Plan · 新加坡",
    baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "qwen-intl",
    name: "QwenCloud 国际",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "qwen-cn",
    name: "阿里云百炼 · 北京",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
  },
  {
    id: "custom-http",
    name: "自定义 · HTTP / IP",
    baseUrl: "http://127.0.0.1:8000/v1",
  },
] as const;
