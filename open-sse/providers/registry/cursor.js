const baseModels = [
  { id: "default", name: "Auto (Server Picks)" },
  { id: "composer-2.5", name: "Composer 2.5" },
  { id: "claude-fable-5", name: "Claude Fable 5" },
  { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
  { id: "gpt-5.5", name: "GPT 5.5" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { id: "gpt-5.3-codex", name: "GPT 5.3 Codex" },
  { id: "claude-opus-4-7", name: "Claude Opus 4.7" },
  { id: "grok-build-0.1", name: "Grok Build 0.1" },
  { id: "gpt-5.4", name: "GPT 5.4" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
  { id: "gpt-5.2", name: "GPT 5.2" },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
  { id: "gpt-5.4-mini", name: "GPT 5.4 Mini" },
  { id: "gpt-5.4-nano", name: "GPT 5.4 Nano" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
  { id: "grok-4.3", name: "Grok 4.3" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  { id: "gpt-5.2-codex", name: "GPT 5.2 Codex" },
  { id: "gpt-5.1-codex-max", name: "GPT 5.1 Codex Max" },
  { id: "gpt-5.1", name: "GPT 5.1" },
  { id: "gemini-3-flash", name: "Gemini 3 Flash" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
  { id: "gpt-5.1-codex-mini", name: "GPT 5.1 Codex Mini" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
  { id: "gpt-5-mini", name: "GPT 5 Mini" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "kimi-k2.5", name: "Kimi K2.5" },
];

const composerVariants = [
  { id: "composer-2.5-fast", name: "Composer 2.5 Fast" },
];

const opus48And47VariantSuffixes = [
  ["high", "High"],
  ["thinking-high", "Thinking High"],
  ["high-fast", "High Fast"],
  ["thinking-high-fast", "Thinking High Fast"],
  ["xhigh", "xHigh"],
  ["thinking-xhigh", "Thinking xHigh"],
  ["xhigh-fast", "xHigh Fast"],
  ["thinking-xhigh-fast", "Thinking xHigh Fast"],
];

const opus46VariantSuffixes = [
  ["high", "High"],
  ["thinking-high", "Thinking High"],
  ["high-fast", "High Fast"],
  ["thinking-high-fast", "Thinking High Fast"],
];

function buildVariants(baseId, baseName, suffixes) {
  return suffixes.map(([suffix, name]) => ({
    id: `${baseId}-${suffix}`,
    name: `${baseName} ${name}`,
  }));
}

const curatedVariants = [
  ...composerVariants,
  ...buildVariants("claude-opus-4-8", "Claude Opus 4.8", opus48And47VariantSuffixes),
  ...buildVariants("claude-opus-4-7", "Claude Opus 4.7", opus48And47VariantSuffixes),
  ...buildVariants("claude-opus-4-6", "Claude Opus 4.6", opus46VariantSuffixes),
];

export default {
  id: "cursor",
  priority: 50,
  alias: "cu",
  uiAlias: "cu",
  display: {
    name: "Cursor IDE",
    icon: "edit_note",
    color: "#00D4AA",
    website: "https://cursor.com",
    notice: {
      signupUrl: "https://cursor.com",
    },
  },
  category: "oauth",
  transport: {
    baseUrl: "https://api2.cursor.sh",
    chatPath: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    format: "cursor",
    headers: {
      "connect-accept-encoding": "gzip",
      "connect-protocol-version": "1",
      "Content-Type": "application/connect+proto",
      "User-Agent": "connect-es/1.6.1",
    },
    clientVersion: "3.1.0",
  },
  models: [
    ...baseModels,
    ...curatedVariants,
  ],
  oauth: {
    apiEndpoint: "https://api2.cursor.sh",
    chatEndpoint: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    modelsEndpoint: "/aiserver.v1.AiService/GetDefaultModelNudgeData",
    api3Endpoint: "https://api3.cursor.sh",
    agentEndpoint: "https://agent.api5.cursor.sh",
    agentNonPrivacyEndpoint: "https://agentn.api5.cursor.sh",
    clientVersion: "3.1.0",
    clientType: "ide",
    dbKeys: {
      accessToken: "cursorAuth/accessToken",
      machineId: "storage.serviceMachineId",
    },
  },
};
