---
title: "Superpowers"
date: 2026-05-15 09:27:22
draft: true
---

# Superpowers 使用指南

> Superpowers 是一组工程实践规范插件，通过 slash commands 提供系统化的开发工作流。

## 安装信息

- **来源**: `claude-plugins-official` 官方市场
- **版本**: 5.1.0
- **安装命令**: `claude plugins install superpowers@claude-plugins-official`
- **Token 开销**: 按需加载，基线约 2-3K tokens

---

## 基础命令

### 开发工作流

| 命令 | 用途 | 何时使用 |
|------|------|----------|
| `/superpowers:using-superpowers` | 查看可用命令总览 | 首次使用 / 忘记命令时 |
| `/superpowers:brainstorming` | 头脑风暴、方案探索 | 拿到模糊需求，想探索方向 |
| `/superpowers:writing-plans` | 编写技术方案 | 复杂功能开发前 |
| `/superpowers:executing-plans` | 执行方案 | 方案确定后 |

### 代码开发

| 命令 | 用途 | 何时使用 |
|------|------|----------|
| `/superpowers:test-driven-development` | TDD 工作流 | 写新功能、修 bug |
| `/superpowers:systematic-debugging` | 系统调试 | 定位未知 bug |
| `/superpowers:subagent-driven-development` | 并行 Agent 开发 | 多个独立任务可并行时 |
| `/superpowers:dispatching-parallel-agents` | 调度并行任务 | 同上 |

### 代码审查

| 命令 | 用途 | 何时使用 |
|------|------|----------|
| `/superpowers:requesting-code-review` | 请求代码审查 | 开发完成，准备合并前 |
| `/superpowers:receiving-code-review` | 接受审查反馈 | 收到 review 意见后 |
| `/superpowers:verification-before-completion` | 完成前验证 | 任何修改后提交前 |

### Git 工作流

| 命令 | 用途 | 何时使用 |
|------|------|----------|
| `/superpowers:using-git-worktrees` | Git worktree 操作 | 需要隔离开发环境 |
| `/superpowers:finishing-a-development-branch` | 完成开发分支 | 分支准备合并时 |
| `/superpowers:writing-skills` | 编写新 Skill | 想沉淀可复用模式时 |

---

## 典型工作流

### 新功能开发
```
/brainstorming → /writing-plans → /executing-plans → /verification-before-completion → /requesting-code-review
```

### Bug 修复
```
/systematic-debugging → /test-driven-development → /verification-before-completion → /requesting-code-review
```

### 复杂重构
```
/brainstorming → /writing-plans → /subagent-driven-development → /verification-before-completion
```

---

## 使用注意事项

- 所有命令都以 `/superpowers:` 前缀调用
- Token 开销是按需加载，只有调用时才消耗
- 每个命令会提供详细步骤和检查清单
- 适合需要严谨工程流程的场景，简单修改不需要走完整流程

