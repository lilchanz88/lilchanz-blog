---
title: blog-agent 框架学习教程：从 Python 到 RAG、LLM 与 Agent 编排
date: 2026-05-20 20:00:00
categories:
  - 技术
tags:
  - Python
  - RAG
  - LLM
  - Agent
  - FastAPI
description: 用当前 blog-agent 代码为例，梳理 FastAPI、Pydantic、RAG、LLM 适配和工具调用之间的逻辑关系。
coverImg: /blog/bg3.webp
draft: true
---

# blog-agent 框架学习教程

这篇教程不是泛泛介绍 Agent，而是用当前 `/Users/lilchanz/blog-agent` 的真实代码来讲。目标是让你能看懂三件事：

- Python 代码如何组织一个后端服务。
- RAG 是怎样把博客内容变成“可被问答的证据”。
- LLM、RAG、Tool 在 Agent 里分别负责什么。

先记住一句话：当前 `blog-agent` 不是 LangChain 项目，而是一个轻量自研 Agent。它已经具备 LangChain 里常见的几个核心角色：ChatModel、Retriever、Tool、Chain/AgentExecutor。

<img :src="'/lilchanz-blog/blog-agent/architecture.svg'" alt="blog-agent 总体架构" />

## 1. 先看整体分层

`blog-agent` 可以分成 5 层：

| 层级 | 负责什么 | 主要文件 |
| --- | --- | --- |
| API 层 | 接收 HTTP 请求，返回统一响应 | `app/api/chat.py`、`app/api/admin.py` |
| Schema 层 | 定义请求、响应、工具参数的数据形状 | `app/schemas.py` |
| 编排层 | 判断用户意图，决定走 LLM、RAG 还是 Tool | `app/services/chat_service.py` |
| 能力层 | 具体执行模型调用、检索、工具、文章读写 | `app/services/*.py`、`app/rag/*.py` |
| 配置层 | 管理路径、端口、Token、模型配置 | `app/core/config.py`、`app/core/security.py` |

这就是后端项目最常见的思路：接口只负责进出，业务判断放到 service，数据结构用 schema 约束。

## 2. 一次对话请求怎么流动

<img :src="'/lilchanz-blog/blog-agent/request-flow.svg'" alt="一次请求生命周期" />

用户在后台助手输入一句话后，大致经历这些步骤：

1. 前端把 `message` 和最近几轮 `history` 发给后端。
2. FastAPI 路由接收请求。
3. 请求进入 `answer_question()`。
4. `answer_question()` 判断意图。
5. 根据意图选择一种模式：
   - `admin_status`：返回当前模型配置和最近错误。
   - `tool`：执行后台工具。
   - `rag`：先检索博客证据，再让模型基于证据回答。
   - `llm`：直接交给模型回答。
   - `direct`：不用模型，直接返回固定回复。

对应入口：

```python
# app/api/chat.py
@router.post("/chat", response_model=ApiResponse)
def chat(payload: ChatRequest) -> ApiResponse:
    data = answer_question(get_settings(), payload.message, admin=False, history=payload.history)
    return ApiResponse(data=data)
```

管理端入口类似，只是多了 Token 校验，并且 `admin=True`：

```python
# app/api/admin.py
@router.post("/chat", response_model=ApiResponse)
def admin_chat(payload: ChatRequest) -> ApiResponse:
    data = answer_question(get_settings(), payload.message, admin=True, history=payload.history)
    return ApiResponse(data=data)
```

## 3. Python 基础：类、方法和数据模型

你的项目里有两类“类”最重要。

第一类是 `dataclass`。它适合内部使用，轻量、简单，比如 RAG 文档和切块：

```python
@dataclass
class BlogDocument:
    path: str
    title: str
    content: str
    metadata: dict[str, object] = field(default_factory=dict)
```

```python
@dataclass
class Chunk:
    id: str
    title: str
    path: str
    content: str
    url: str | None
    tokens: list[str]
```

第二类是 `Pydantic BaseModel`。它适合 API 请求和响应，因为它能自动校验字段：

```python
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
```

这段代码告诉后端：`message` 必须是 1 到 4000 字符，`history` 最多 12 条。这样前端传错数据时，FastAPI 会自动返回 422，而不是让业务代码崩掉。

## 4. 核心数据类和用途

| 类 | 文件 | 用途 |
| --- | --- | --- |
| `Settings` | `app/core/config.py` | 保存博客路径、索引路径、模型配置、CORS 来源 |
| `ChatMessage` | `app/schemas.py` | 一条历史消息，只有 `user` 或 `assistant` |
| `ChatRequest` | `app/schemas.py` | 聊天请求体，包含当前问题和历史消息 |
| `Source` | `app/schemas.py` | RAG 返回的一条来源证据 |
| `ToolResult` | `app/schemas.py` | 工具调用结果 |
| `ChatData` | `app/schemas.py` | 聊天最终返回的数据 |
| `BlogDocument` | `app/rag/loader.py` | 从 Markdown 加载出来的文章文档 |
| `Chunk` | `app/rag/indexer.py` | 文档切块后的检索单元 |
| `RuntimeModelConfig` | `app/services/llm_service.py` | 运行时模型配置 |

看一个项目时，先找这些数据模型，比直接看所有函数更容易。因为数据模型说明了“系统里流动的东西是什么”。

## 5. Agent 编排层：answer_question()

`answer_question()` 是当前项目最像 Agent 大脑的地方。它做的不是回答问题，而是决定“谁来回答”。

核心逻辑可以概括成：

```text
用户问题
  -> 模型或规则判断 intent
  -> 是否状态查询
  -> 是否工具调用
  -> 是否普通管理端对话
  -> 是否需要 RAG
  -> 返回 ChatData
```

几个关键方法：

| 方法 | 作用 |
| --- | --- |
| `_heuristic_intent()` | 模型不可用时，用关键词兜底判断意图 |
| `_status_answer()` | 返回当前模型配置、Base URL、最近调用错误 |
| `_fallback_answer()` | 管理端普通问题走 LLM，失败时返回错误 |
| `_tool_from_message()` | 用规则识别“最近文章、重建索引、构建博客”等工具命令 |
| `answer_question()` | 总入口，串起意图、工具、RAG、LLM |

这是一种很实用的 Agent 写法：不一开始就上复杂框架，先把路由逻辑写清楚。

## 6. RAG：博客内容如何变成证据

<img :src="'/lilchanz-blog/blog-agent/rag-flow.svg'" alt="RAG 流程" />

RAG 的全称是 Retrieval-Augmented Generation，中文可以理解为“检索增强生成”。

它分两段：

第一段是离线建索引：

```text
Markdown 文章
  -> 解析 frontmatter
  -> 提取标题和正文
  -> 按标题段落切块
  -> 分词
  -> 写入 JSON 索引
```

第二段是在线问答：

```text
用户问题
  -> 问题分词
  -> 和索引里的 chunk 算相似度
  -> 取分数最高的来源
  -> 把来源交给 LLM
  -> LLM 基于证据回答
```

### 6.1 loader.py：读取文档

`load_blog_documents()` 负责从博客目录读取 Markdown：

- 默认读取 `/Users/lilchanz/my-blog/docs/**/*.md`。
- 跳过 `.vitepress/dist` 和 `.vitepress/cache`。
- 解析 frontmatter。
- public 索引会过滤 `draft/private/noindex`。
- admin 索引可以包含私有内容和 `llms-full.txt`。

关键方法：

| 方法 | 作用 |
| --- | --- |
| `parse_frontmatter()` | 解析 Markdown 顶部的 YAML-like 元信息 |
| `title_from_content()` | 优先从 frontmatter 取标题，否则取一级标题 |
| `is_private_document()` | 判断文章是否应该从公开索引中排除 |
| `load_blog_documents()` | 返回 `BlogDocument` 列表 |

### 6.2 indexer.py：建索引

`build_index()` 是建索引主函数：

```python
def build_index(settings: Settings, audience: str = "public") -> dict[str, object]:
    include_private = audience == "admin"
    docs = load_blog_documents(settings, include_private=include_private)
    chunks: list[Chunk] = []
    for doc in docs:
        chunks.extend(chunk_document(doc))
```

它把文章变成很多个 `Chunk`。每个 Chunk 有标题、路径、正文片段、URL 和 tokens。

这里的分词不是向量 embedding，而是简单的中英文 token：

```python
def tokenize(text: str) -> list[str]:
    lower = text.lower()
    latin = re.findall(r"[a-z0-9_+-]{2,}", lower)
    cjk = re.findall(r"[\u4e00-\u9fff]", text)
    cjk_bigrams = ["".join(cjk[i : i + 2]) for i in range(max(0, len(cjk) - 1))]
    return latin + cjk + cjk_bigrams
```

这说明当前 RAG 是“关键词检索 + TF-IDF 风格评分”，不是向量数据库。它的优点是简单、可控、没有额外服务；缺点是语义理解弱，比如“效率工具”和“提升开发生产力”不一定能很好匹配。

### 6.3 retriever.py：检索证据

`retrieve()` 做三件事：

1. 读取索引文件。
2. 给每个 chunk 打分。
3. 返回分数最高的文章来源。

返回的是 `Source`：

```python
class Source(BaseModel):
    title: str
    path: str
    url: str | None = None
    score: float
    excerpt: str
```

这就是为什么前端可以显示“引用来源”。RAG 好不好，关键就在这些来源是否真的相关。

## 7. LLM：模型为什么是主脑

`llm_service.py` 是模型适配层。它有三个角色：

| 角色 | 方法 |
| --- | --- |
| 保存和读取模型配置 | `get_model_config()`、`set_model_config()` |
| 调用模型接口 | `_chat_completion()` |
| 封装具体任务 | `generate_general_answer()`、`generate_rag_answer()`、`classify_intent()`、`classify_tool_call()` |

当前设计是“模型为主，RAG 为辅”：

- 写作、诊断、普通聊天：直接走模型。
- 问博客事实：先检索，再让模型基于证据回答。
- 需要行动：走工具。
- 模型不可用：用规则兜底，不伪装成智能回答。

这比“任何问题都先 RAG”更自然。因为 RAG 适合回答事实，不适合做开放式写作和问题诊断。

## 8. OpenAI-compatible 与 Anthropic-compatible

你的 `llm_service.py` 现在支持两类接口。

OpenAI-compatible：

```text
POST {base_url}/chat/completions
Authorization: Bearer API_KEY
```

Anthropic-compatible：

```text
POST {base_url}/v1/messages
x-api-key: API_KEY
anthropic-version: 2023-06-01
```

判断逻辑在：

```python
def is_anthropic_compatible(base_url: str) -> bool:
    return "/apps/anthropic" in base_url or base_url.rstrip("/").endswith("/anthropic")
```

这就是模型适配层的意义：上层 `chat_service` 不关心接口细节，只说“帮我生成答案”。至于到底是 OpenAI 格式还是 Anthropic 格式，由 `llm_service` 处理。

## 9. Tool：让 Agent 能做事

如果只有 LLM 和 RAG，助手只能回答。加入 Tool 后，助手可以执行后台动作。

当前工具在 `tool_service.py` 注册：

| 工具名 | 作用 |
| --- | --- |
| `search_posts` | 搜索文章 |
| `read_post` | 读取文章 |
| `list_recent_posts` | 列出最近文章 |
| `create_draft` | 创建草稿 |
| `update_post_frontmatter` | 修改文章 frontmatter |
| `reindex_knowledge_base` | 重建知识库索引 |
| `build_blog` | 构建博客 |

核心调度函数：

```python
def dispatch_tool(settings: Settings, name: str, args: dict[str, Any]) -> ToolResult:
    schema = TOOL_SCHEMAS.get(name)
    handler = TOOL_HANDLERS.get(name)
    if not schema or not handler:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool is not registered")
    parsed = schema.model_validate(args)
    return handler(settings, parsed)
```

这里有一个很重要的设计：先用 Pydantic schema 校验参数，再执行 handler。这样模型即使给错参数，也不会直接写坏文件。

## 10. 和 LangChain 的关系

<img :src="'/lilchanz-blog/blog-agent/langchain-map.svg'" alt="LangChain 概念映射" />

如果用 LangChain 的语言翻译当前项目，可以这样理解：

| LangChain 概念 | 当前实现 |
| --- | --- |
| `ChatModel` | `llm_service._chat_completion()` |
| `PromptTemplate` | `generate_general_answer()` 里的 system prompt |
| `Retriever` | `rag.retriever.retrieve()` |
| `DocumentLoader` | `rag.loader.load_blog_documents()` |
| `TextSplitter` | `rag.indexer.chunk_document()` |
| `Tool` | `tool_service.TOOL_HANDLERS` |
| `AgentExecutor` | `chat_service.answer_question()` |
| `OutputParser` | `classify_tool_call()` 里的 JSON 解析 |

所以你学 LangChain 时，不要只记 API。可以把它看成一套标准化组件：

```text
输入
  -> Prompt
  -> Model
  -> Retriever
  -> Tool
  -> Output Parser
  -> Memory
  -> 最终答案
```

你的 `blog-agent` 是这些组件的手写版。手写版更适合学习，因为你能看到每一步到底发生了什么。

## 11. 当前框架的优点和限制

优点：

- 结构清楚，没有过早引入复杂框架。
- Pydantic schema 做了参数边界。
- RAG 有 public/admin 两套索引，权限意识比较好。
- LLM 适配层已经能支持不同接口风格。
- 工具调用集中注册，后续扩展方便。

限制：

- RAG 还是关键词检索，不是真正语义向量检索。
- 意图分类依赖模型时会额外消耗一次模型调用。
- 工具调用还不是真正的流式多步 Agent。
- 没有长期 memory，history 只来自前端最近几轮。
- 没有 LangChain/LangGraph 那种标准化 tracing 和 workflow graph。

这些限制不是坏事。对个人博客后台来说，当前架构轻、可控、容易调试。等你真正遇到复杂需求，再引入 LangChain 或 LangGraph 会更稳。

## 12. 学习顺序建议

第一阶段：Python 后端基础

- 看 `Settings`、`BaseModel`、`dataclass`。
- 理解函数参数、返回值、异常处理。
- 理解 FastAPI 的 router。

第二阶段：请求生命周期

- 从 `app/main.py` 开始。
- 跟踪 `/api/v1/admin/chat`。
- 一路看到 `answer_question()`。

第三阶段：RAG

- 看 `loader.py` 如何读文章。
- 看 `indexer.py` 如何切块、分词、打分。
- 看 `retriever.py` 如何返回来源。

第四阶段：LLM

- 看模型配置如何保存。
- 看 `_chat_completion()` 如何选择接口。
- 看 `generate_rag_answer()` 如何把来源塞进 prompt。

第五阶段：Tool

- 看 `TOOL_SCHEMAS` 和 `TOOL_HANDLERS`。
- 学会新增一个工具。
- 理解为什么工具参数必须校验。

第六阶段：再学 LangChain

先把当前项目看明白，再去学 LangChain。你会发现 LangChain 不是魔法，它只是把你现在手写的这些模式抽象成标准组件。

## 13. 如果要升级成更强的 Agent

下一步可以从这几个方向升级：

| 方向 | 怎么改 |
| --- | --- |
| 语义 RAG | 增加 embedding，把 JSON 索引升级为向量索引 |
| 更稳的意图分类 | 用结构化输出，减少模型返回脏文本 |
| 多步工具调用 | 让模型可以先查文章，再生成草稿，再询问是否保存 |
| 流式输出 | 前端边生成边显示，提升对话体验 |
| 可观察性 | 记录每次 intent、sources、tool、model error |
| LangGraph | 当流程变复杂时，把 `answer_question()` 拆成状态图 |

最推荐的下一步是语义 RAG。因为你的博客内容会越来越多，关键词检索很快会碰到“意思相关但词不一样”的问题。

## 14. 总结

当前 `blog-agent` 的核心逻辑可以压缩成一句话：

```text
FastAPI 收请求，Pydantic 校验数据，chat_service 判断意图，
需要事实就走 RAG，需要生成就走 LLM，需要行动就走 Tool。
```

学 Python 时，看它的数据模型和函数调用。

学 RAG 时，看文档如何被加载、切块、分词、评分、作为来源交给模型。

学 LangChain 时，把它和当前代码对照：LangChain 只是把这些能力组件化、标准化、可组合化。

真正理解 Agent，不是先背框架名，而是先理解这条链路：输入、判断、检索、生成、行动、返回。
