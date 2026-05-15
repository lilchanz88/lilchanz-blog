<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";

type ChatRole = "user" | "assistant";

interface ChatSource {
  title?: string;
  path?: string;
  url?: string;
  score?: number;
  excerpt?: string;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
  timestamp: Date;
}

const API_URL = "http://localhost:8008/api/v1/chat";

const sessionId = ref("");
const isOpen = ref(false);
const messages = ref<ChatMessage[]>([]);
const inputText = ref("");
const isLoading = ref(false);
const error = ref("");
const lastFailedText = ref("");
const messagesEl = ref<HTMLElement | null>(null);

onMounted(() => {
  sessionId.value = crypto.randomUUID();
});

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const scrollToBottom = async () => {
  await nextTick();
  messagesEl.value?.scrollTo({
    top: messagesEl.value.scrollHeight,
    behavior: "smooth",
  });
};

const normalizeSources = (sources: unknown): ChatSource[] => {
  if (!Array.isArray(sources)) return [];

  return sources
    .filter((source): source is ChatSource => typeof source === "object" && source !== null)
    .slice(0, 4);
};

const sendMessage = async (text = inputText.value) => {
  const messageText = text.trim();
  if (!messageText || isLoading.value) return;

  error.value = "";
  inputText.value = "";
  messages.value.push({
    id: createId(),
    role: "user",
    content: messageText,
    timestamp: new Date(),
  });
  await scrollToBottom();

  isLoading.value = true;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: messageText,
        session_id: sessionId.value,
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const result = await response.json();
    const data = result?.data ?? {};
    const answer = typeof data.answer === "string" ? data.answer : "";

    messages.value.push({
      id: createId(),
      role: "assistant",
      content: answer || "我暂时没有拿到可用回答，请稍后再试。",
      sources: normalizeSources(data.sources),
      timestamp: new Date(),
    });
    lastFailedText.value = "";
  } catch (requestError) {
    console.error(requestError);
    error.value = "暂时无法连接博客问答服务，请稍后重试。";
    lastFailedText.value = messageText;
    messages.value.push({
      id: createId(),
      role: "assistant",
      content: "抱歉，博客问答服务现在没有响应。",
      timestamp: new Date(),
    });
  } finally {
    isLoading.value = false;
    await scrollToBottom();
  }
};

const retryLastMessage = () => {
  if (lastFailedText.value) {
    void sendMessage(lastFailedText.value);
  }
};
</script>

<template>
  <button class="chat-fab" type="button" :aria-expanded="isOpen" aria-label="打开博客 AI 聊天" @click="isOpen = !isOpen">
    <span aria-hidden="true">{{ isOpen ? "×" : "💬" }}</span>
  </button>

  <Transition name="chat-panel">
    <section v-if="isOpen" class="chat-panel" aria-label="博客 AI 聊天窗口">
      <header class="chat-header">
        <div>
          <p class="chat-kicker">Blog AI</p>
          <h2>问问这座博客</h2>
        </div>
        <button class="chat-close" type="button" aria-label="关闭聊天窗口" @click="isOpen = false">×</button>
      </header>

      <div ref="messagesEl" class="chat-body">
        <div v-if="messages.length === 0" class="chat-empty">
          <p>Ask me anything about this blog.</p>
        </div>

        <div v-if="error" class="chat-error" role="alert">
          <span>{{ error }}</span>
          <button v-if="lastFailedText" type="button" @click="retryLastMessage">Retry</button>
        </div>

        <article
          v-for="message in messages"
          :key="message.id"
          class="chat-message"
          :class="`chat-message--${message.role}`"
        >
          <div class="chat-bubble">
            <p>{{ message.content }}</p>
          </div>

          <div v-if="message.sources?.length" class="chat-sources">
            <a
              v-for="source in message.sources"
              :key="source.url || source.path || source.title"
              :href="source.url || source.path"
              target="_blank"
              rel="noreferrer"
            >
              {{ source.title || source.path || source.url || "来源" }}
            </a>
          </div>
        </article>

        <div v-if="isLoading" class="chat-loading" aria-live="polite">
          <span />
          <span />
          <span />
        </div>
      </div>

      <form class="chat-footer" @submit.prevent="sendMessage()">
        <textarea
          v-model="inputText"
          rows="1"
          placeholder="输入你的问题..."
          :disabled="isLoading"
          @keydown.enter.exact.prevent="sendMessage()"
        />
        <button type="submit" :disabled="isLoading || !inputText.trim()">
          {{ isLoading ? "..." : "发送" }}
        </button>
      </form>
    </section>
  </Transition>
</template>

<style scoped>
.chat-fab,
.chat-close,
.chat-footer button,
.chat-error button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.chat-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 50%;
  color: var(--vp-c-bg);
  background: var(--vp-c-brand-1);
  box-shadow: var(--vp-shadow-3);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
}

.chat-fab:hover {
  transform: translateY(-2px);
  background: var(--vp-c-brand-2);
}

.chat-fab span {
  font-size: 24px;
  line-height: 1;
}

.chat-panel {
  position: fixed;
  right: 24px;
  bottom: 88px;
  z-index: 999;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(380px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 112px));
  overflow: hidden;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  box-shadow: var(--vp-shadow-4);
}

.chat-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.chat-kicker {
  margin: 0 0 4px;
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.chat-header h2 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}

.chat-close {
  display: grid;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  color: var(--vp-c-text-2);
  background: transparent;
}

.chat-close:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-default-soft);
}

.chat-body {
  min-height: 260px;
  overflow-y: auto;
  padding: 16px;
  background: var(--vp-c-bg);
}

.chat-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  color: var(--vp-c-text-2);
  text-align: center;
}

.chat-empty p {
  margin: 0;
  font-size: 14px;
}

.chat-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft);
  border-radius: 8px;
  font-size: 13px;
}

.chat-error button {
  flex: 0 0 auto;
  color: var(--vp-c-danger-1);
  background: transparent;
  font-weight: 700;
}

.chat-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.chat-message--user {
  align-items: flex-end;
}

.chat-message--assistant {
  align-items: flex-start;
}

.chat-bubble {
  max-width: 86%;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.chat-bubble p {
  margin: 0;
  white-space: pre-wrap;
}

.chat-message--user .chat-bubble {
  color: var(--vp-c-bg);
  background: var(--vp-c-brand-1);
}

.chat-message--assistant .chat-bubble {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.chat-sources {
  display: flex;
  max-width: 86%;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-sources a {
  display: inline-flex;
  max-width: 100%;
  overflow: hidden;
  padding: 4px 8px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-loading {
  display: inline-flex;
  gap: 5px;
  padding: 10px 12px;
}

.chat-loading span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
  animation: chatPulse 1s infinite ease-in-out;
}

.chat-loading span:nth-child(2) {
  animation-delay: 0.15s;
}

.chat-loading span:nth-child(3) {
  animation-delay: 0.3s;
}

.chat-footer {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.chat-footer textarea {
  width: 100%;
  min-width: 0;
  max-height: 108px;
  resize: vertical;
  padding: 10px 12px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  line-height: 1.4;
  outline: none;
}

.chat-footer textarea:focus {
  border-color: var(--vp-c-brand-1);
}

.chat-footer button {
  flex: 0 0 auto;
  min-width: 56px;
  padding: 0 14px;
  color: var(--vp-c-bg);
  background: var(--vp-c-brand-1);
  border-radius: 8px;
  font-weight: 700;
}

.chat-footer button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.chat-panel-enter-active,
.chat-panel-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.chat-panel-enter-from,
.chat-panel-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@keyframes chatPulse {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (max-width: 640px) {
  .chat-fab {
    right: 16px;
    bottom: 16px;
  }

  .chat-panel {
    right: 16px;
    bottom: 80px;
    max-height: calc(100vh - 104px);
  }
}
</style>
