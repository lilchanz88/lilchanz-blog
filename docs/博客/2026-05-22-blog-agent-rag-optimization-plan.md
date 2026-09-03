---
title: blog-agent RAG 使用方式诊断与优化方案
date: 2026-05-22 10:30:00
categories:
  - 技术
tags:
  - RAG
  - LLM
  - Agent
  - Python
  - blog-agent
description: 诊断当前 blog-agent 的 RAG 调用链，明确标准 RAG 应该先检索再生成，并给出可落地的分阶段优化方案。
coverImg: /blog/bg4.webp
draft: true
---

# blog-agent RAG 使用方式诊断与优化方案

## 结论

标准 RAG 流程应该是：

```text
用户问题
  -> 从知识库检索相关片段
  -> 把最相关片段和用户问题一起交给大模型
  -> 大模型基于证据生成答案
  -> 返回答案和引用来源
```

这个理解是正确的。

但当前 `blog-agent` 并不是完全把流程做反了。真实情况更细一点：

- 在真正的 RAG 分支里，代码已经是先 `retrieve()`，再 `generate_rag_answer()`。
- 但在进入 RAG 分支之前，系统可能先调用 LLM 做 `classify_intent()` 意图分类。
- 这会造成一种体验：用户感觉“模型先回答/先判断了，RAG 只是后面补救”。
- 如果意图分类把博客事实问题误判成 `chat`、`diagnosis` 或 `writing_assist`，后台管理端就可能直接走 LLM，不走 RAG。

所以问题不在于 RAG 主流程完全反了，而在于：**RAG 触发策略不够明确，检索证据没有成为博客事实问答的第一优先级。**

## 当前调用链诊断

当前核心入口在 `app/services/chat_service.py` 的 `answer_question()`。

简化后是：

```text
用户问题
  -> 简单问候直接回复
  -> 如果模型启用，先调用 LLM 做意图分类 classify_intent()
  -> 如果是状态查询，返回模型状态
  -> 如果是工具调用，调用工具
  -> 如果是写作 / 诊断 / 闲聊，管理端直接走 LLM
  -> 剩余问题才进入 RAG
  -> retrieve()
  -> generate_rag_answer()
```

真正的 RAG 分支是正确顺序：

```python
sources = retrieve(settings, message, audience=audience)
generated_answer = generate_rag_answer(settings, message, sources)
```

`generate_rag_answer()` 里再把来源片段拼进 prompt：

```text
来源 1: 标题
路径: xxx.md
摘录: ...

来源 2: 标题
路径: xxx.md
摘录: ...
```

所以 RAG 分支本身没有反。

真正的风险在这里：

```python
intent = classify_intent(settings, message, history) if get_model_config(settings).enabled else None
intent = intent or _heuristic_intent(message, history)
```

也就是说，只要模型启用，系统会先问模型：“这个问题属于哪一类？”

这有几个问题：

- 多一次模型调用，延迟和成本都上升。
- 分类模型可能误判。
- 用户问博客事实时，可能被误判成普通聊天。
- 管理端 `admin=True` 时，`chat`、`diagnosis`、`writing_assist` 会直接走 LLM，不一定经过 RAG。
- 前端虽然显示 `RAG：已使用/未使用`，但用户很难知道为什么这次没用 RAG。

## 标准 RAG 应该如何定位

RAG 不是用来替代大模型的。它更像一个“证据层”。

大模型负责：

- 理解用户问题。
- 组织答案。
- 总结片段。
- 用自然语言解释。

RAG 负责：

- 找到和问题相关的博客文章。
- 提供可追溯来源。
- 降低幻觉。
- 让模型不要凭空编造“我的博客里写了什么”。

因此，对于博客助手来说，原则应该是：

```text
只要问题涉及“我的博客内容、某篇文章、博客里是否提到、文章总结、某个主题是否写过”，就应该优先检索。
```

而不是先让模型自由判断。

## 优化目标

本轮优化不追求复杂 Agent，而是让 RAG 路径更稳、更清楚、更符合直觉。

目标如下：

1. 博客事实问题必须优先 RAG。
2. 意图分类不能阻止 RAG。
3. RAG 返回必须带来源。
4. 没有检索到证据时，模型不能伪装成知道博客内容。
5. 前端能清楚展示本次是否使用 RAG、命中了哪些片段、为什么没走 RAG。
6. 后续可以平滑升级到 embedding / LangChain / LangGraph。

## 推荐的新流程

建议把当前流程改成“规则优先 + 检索优先 + 模型辅助”的结构。

```text
用户问题
  -> 先判断是否是系统状态 / 工具命令
  -> 判断是否像博客事实问题
  -> 如果像博客事实问题，直接 retrieve()
  -> 如果检索到 sources，走 RAG 生成
  -> 如果没检索到 sources，明确告诉用户证据不足
  -> 其他写作 / 诊断 / 闲聊，再走 LLM
```

也就是：

```text
工具和状态优先
博客事实问题检索优先
普通开放问题模型优先
```

## 具体整改方案

### 第一阶段：修正 RAG 触发策略

新增一个本地判断函数，例如：

```python
def _looks_like_blog_fact_question(message: str) -> bool:
    keywords = {
        "我的博客",
        "当前博客",
        "博客里",
        "文章里",
        "哪篇文章",
        "写过",
        "提到",
        "总结",
        "主要写",
        "内容",
        "这篇文章",
    }
    return any(keyword in message for keyword in keywords)
```

然后在调用 `classify_intent()` 之前先做判断。

新顺序：

```text
1. 问候
2. 状态查询
3. 工具命令
4. 博客事实问题 -> 直接 RAG
5. 其他问题 -> LLM 意图分类或普通 LLM
```

这样可以避免“问博客内容却被模型误判成闲聊”。

### 第二阶段：拆出独立 RAG 函数

当前 RAG 逻辑写在 `answer_question()` 后半段。建议拆成：

```python
def answer_with_rag(settings, message, audience, intent) -> ChatData:
    sources = retrieve(settings, message, audience=audience)
    if not sources:
        return no_evidence_answer(...)
    answer = generate_rag_answer(settings, message, sources)
    return ChatData(...)
```

好处：

- `answer_question()` 更短。
- RAG 行为更容易测试。
- 以后升级向量检索时不用动主编排函数。

### 第三阶段：增强 RAG 元信息

当前返回的 `meta` 只有：

```json
{
  "mode": "rag",
  "intent": "blog_qa",
  "rag_used": true,
  "tool": null,
  "model": {}
}
```

建议增加：

```json
{
  "rag": {
    "audience": "admin",
    "retriever": "keyword_tfidf",
    "source_count": 4,
    "top_score": 12.4,
    "reason": "blog_fact_question"
  }
}
```

这样前端可以显示：

```text
RAG：已使用
检索器：keyword_tfidf
命中来源：4
最高分：12.4
触发原因：博客事实问题
```

用户就不会感觉系统“偷偷绕开了模型”或“答非所问”。

### 第四阶段：改进无证据回答

如果用户问：

```text
我的博客有没有写 LangChain？
```

但检索不到证据，不应该让模型自由发挥。

应该回答：

```text
我没有在当前博客知识库里找到 LangChain 相关内容。
这不代表你一定没写过，可能是索引未更新或关键词不匹配。
你可以尝试：
1. 重建索引
2. 换关键词搜索
3. 检查文章是否是 draft/private
```

这比“模型凭印象回答”更可靠。

### 第五阶段：优化检索质量

当前检索是关键词 + TF-IDF 风格评分。

优点：

- 简单。
- 本地可控。
- 不依赖 embedding 服务。
- 适合小博客。

缺点：

- 语义理解弱。
- 同义词难匹配。
- 中文长句效果有限。
- 不支持“意思相近但词不一样”的召回。

建议分两步升级。

先做轻量增强：

- 查询扩展：把“AI”扩展为“大模型、LLM、人工智能”。
- 标题加权：标题命中分数更高。
- 标签和分类加权。
- frontmatter description 加权。
- 每篇文章允许返回多个 chunk，而不是每篇只返回一个。

再做语义增强：

- 引入 embedding。
- 保存向量索引。
- 检索时同时跑 keyword search 和 vector search。
- 最后做 hybrid rerank。

推荐目标：

```text
hybrid_score = keyword_score * 0.4 + vector_score * 0.6
```

## 推荐的新架构

```text
answer_question()
  -> handle_direct_greeting()
  -> handle_admin_status()
  -> handle_admin_tool()
  -> should_use_rag()
      -> answer_with_rag()
          -> retrieve()
          -> generate_rag_answer()
  -> answer_with_llm()
```

也可以画成：

```text
用户问题
  |
  v
状态 / 工具判断
  |
  v
是否博客事实问题？
  | 是
  v
RAG 检索
  |
  v
有证据？ ---- 否 ----> 返回“证据不足”
  |
  是
  v
LLM 基于证据回答
  |
  v
返回答案 + 来源 + RAG 元信息
```

## 实施计划

### Step 1：增加 RAG 触发判断

修改：

- `app/services/chat_service.py`

新增：

- `_looks_like_blog_fact_question()`
- `_answer_with_rag()`

验收：

- “我的博客主要写什么？”必须走 RAG。
- “哪篇文章提到了效率工具？”必须走 RAG。
- “帮我写一篇关于 LangChain 的草稿”不走 RAG，走写作辅助或工具。

### Step 2：调整 `answer_question()` 顺序

把博客事实问题判断提前到 LLM 意图分类之前。

建议顺序：

```text
direct greeting
admin status
admin tool keyword
blog fact -> RAG
LLM intent classify
tool by LLM
writing/diagnosis/chat -> LLM
fallback -> RAG or direct
```

验收：

- 模型启用时，博客事实问题也不会被 `classify_intent()` 带偏。
- 管理端和公开端行为一致：博客事实都优先 RAG。

### Step 3：返回更详细的 RAG meta

修改：

- `ChatData.meta`
- `_response_meta()`
- `_answer_with_rag()`

新增字段：

```json
{
  "rag": {
    "used": true,
    "trigger": "blog_fact_question",
    "retriever": "keyword_tfidf",
    "source_count": 4,
    "top_score": 8.72
  }
}
```

验收：

- 前端能显示这次为什么走 RAG。
- 排查答非所问时能看到是不是没检索到来源。

### Step 4：增加测试

新增测试用例：

```text
test_blog_fact_question_uses_rag_before_llm_intent
test_admin_blog_fact_question_does_not_fallback_to_general_llm
test_no_rag_source_returns_no_evidence_message
test_writing_request_still_uses_llm
test_rag_meta_contains_source_count_and_top_score
```

验收：

- `uv run pytest` 通过。
- 不破坏已有工具调用和模型配置测试。

### Step 5：前端展示优化

修改：

- `blog-admin/src/views/Assistant.vue`

展示：

- 当前模式：RAG / LLM / Tool。
- RAG 触发原因。
- 命中来源数。
- 最高相关分。
- 如果没走 RAG，显示原因：普通聊天 / 写作 / 工具 / 状态查询。

验收：

- 用户能看出这次到底有没有查知识库。
- 用户能知道答非所问是“没检索到”还是“模型生成偏了”。

## 最小代码改造示意

建议先做最小改造，不立刻引入 LangChain。

```python
def _looks_like_blog_fact_question(message: str) -> bool:
    text = message.strip().lower()
    return any(keyword in text for keyword in BLOG_FACT_KEYWORDS) or any(
        keyword in message
        for keyword in ("我的博客", "当前博客", "博客里", "文章里", "哪篇文章", "写过", "提到")
    )
```

```python
def _answer_with_rag(settings: Settings, message: str, audience: str, intent: str = "blog_qa") -> ChatData:
    sources = retrieve(settings, message, audience=audience)
    rag_meta = {
        "used": True,
        "trigger": intent,
        "retriever": "keyword_tfidf",
        "source_count": len(sources),
        "top_score": sources[0].score if sources else 0,
    }
    if not sources:
        return ChatData(
            answer="我没有在当前博客知识库里找到可靠依据。请先重建索引，或换个更具体的问题。",
            sources=[],
            mode="rag",
            meta={**_response_meta(settings, "rag", True, intent=intent), "rag": rag_meta},
        )
    answer = generate_rag_answer(settings, message, sources)
    ...
```

然后在 `answer_question()` 里尽早调用：

```python
if _looks_like_blog_fact_question(message):
    audience = "admin" if admin else "public"
    return _answer_with_rag(settings, message, audience, intent="blog_qa")
```

## 是否需要 LangChain

短期不建议马上引入 LangChain。

原因：

- 当前问题不是“缺框架”，而是“路由顺序和 RAG 策略不清晰”。
- 手写代码更容易调试。
- 博客助手规模还不大，引入 LangChain 会增加抽象层。

适合引入 LangChain 的时机：

- 需要多种 retriever 组合。
- 需要标准化 prompt template。
- 需要结构化 output parser。
- 需要 tracing。
- 需要和 LangSmith / LangGraph 配合。

更推荐的路径是：

```text
先把当前手写 RAG 调顺
  -> 加 embedding 和 hybrid retrieval
  -> 再考虑 LangChain / LangGraph
```

## 最终目标

最终希望 `blog-agent` 的回答逻辑变成：

```text
问博客事实：
  必须查知识库，有证据才回答。

问写作创作：
  模型直接发挥，RAG 可选辅助。

问后台操作：
  走受控工具，不能让模型随便写文件。

问系统状态：
  直接读取真实配置，不让模型猜。
```

这样，RAG 不会变成“装饰品”，LLM 也不会被迫承担它不该承担的事实记忆职责。

一句话总结：

```text
当前 RAG 主分支顺序没有反，但触发策略需要前移。
优化方向是：博客事实问题先检索，再生成；LLM 负责表达，RAG 负责证据。
```
