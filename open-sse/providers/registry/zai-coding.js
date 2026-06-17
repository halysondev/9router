export default {
  id: "zai-coding",
  priority: 135,
  alias: "zai-coding",
  display: {
    name: "Z.AI Coding Plan",
    icon: "code",
    color: "#2563EB",
    textIcon: "ZAI",
    website: "https://z.ai",
    notice: {
      apiKeyUrl: "https://z.ai/manage-apikey/apikey-list",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.z.ai/api/coding/paas/v4/chat/completions",
    headers: {},
    quirks: {
      autoToolStream: true,
    },
    usage: {
      url: "https://api.z.ai/api/monitor/usage/quota/limit",
    },
  },
  models: [
    { id: "glm-5.2", name: "GLM 5.2" },
    { id: "glm-5.1", name: "GLM 5.1" },
    { id: "glm-5", name: "GLM 5" },
    { id: "glm-4.7", name: "GLM 4.7" },
  ],
  features: {
    usage: true,
    usageApikey: true,
  },
};
