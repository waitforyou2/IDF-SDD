---
name: isdd-init
description: 初始化或修复业务 Git 仓库的 IDF-SDD 环境，建立本地 CodeGraph 索引，识别工程命令，并创建随代码提交的架构、领域语言、决策和团队策略上下文。用户执行 /isdd-init、首次接入 IDF-SDD，或需要修复缺失或过期的 .sdd 仓库元数据时使用。
---

# 初始化 IDF-SDD

## 目标

一次性准备业务仓库，让后续阶段能够使用经过验证的代码结构、项目领域语言、历史决策、团队策略和确定性的状态流转。

调用参数：`$ARGUMENTS`

## 执行流程

1. 解析 Git 根目录并检查 `git status --short`。保留所有现有用户变更。不得在包含多个无关仓库的父目录中初始化。
2. 阅读 [CodeGraph 集成规范](../../references/codegraph.md)和[归档契约](../../references/artifacts.md)。
3. 执行 `codegraph version`。如果命令不可用，init 脚本会自动通过 `npm install -g @colbymchenry/codegraph` 安装；第一次安装失败时自动切换华为镜像源 `https://mirrors.tools.huawei.com/npm/` 重试，安装后恢复原始 registry 配置。安装后仍不可用时在报告中如实记录。
4. 执行 `codecheck --version` 检查 CodeCheck CLI 是否可用。init 脚本会自动通过华为内部 npm 仓库全局安装 `@baize/codecheckcli`（临时配置私有仓库并禁用 SSL 校验，安装后恢复原配置）。安装后仍不可用时在报告中如实记录。
5. 执行：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" init --root "${CLAUDE_PROJECT_DIR}"
   ```

6. 使用一次聚焦的 `codegraph_explore` 仓库分析，覆盖仓库职责、入口、模块边界、主要调用流程、测试布局和高影响区域。构建文件、说明文档、配置、提交历史和 ADR 等图谱无法解释的内容，直接读取原文件。
7. 使用已验证事实替换 `docs/isdd/repository.md` 中的全部占位内容，至少包括：
   - 仓库职责、非职责、入口和深模块 seam；
   - 统一领域术语，以及不得混用的术语；
   - 已存在的 ADR 或其他持久决策记录；
   - 测试位置和成本最低的有效反馈命令；
   - 敏感区域、生成代码、兼容边界和代码归属。
8. 确认或修正 `docs/isdd/repository.yaml`，记录 CodeGraph 状态和至少一条实际可运行的低成本验证命令。不得根据图结构臆测业务语义或架构决策原因。
9. 阅读 `docs/isdd/policy.md`。重复初始化时保留团队已有修改。
10. 执行：

    ```bash
    node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" validate --repo --root "${CLAUDE_PROJECT_DIR}"
    ```

11. 报告新增或修改的文件、CodeGraph 健康状态、CodeCheck 安装状态、识别出的工程命令、验证证据，以及仍需团队确认的事实。

## 完成条件

- `docs/isdd/repository.yaml`、`docs/isdd/repository.md` 和 `docs/isdd/policy.md` 均通过校验。
- `.codegraph/` 已存在，且 `codegraph status` 成功。
- CodeCheck CLI 已安装且 `codecheck --version` 可执行。
- `.codegraph/` 被 Git 忽略，而 `docs/isdd/` 保持可提交。
- 仓库架构和工程命令都有直接证据支持。
- 已记录统一领域语言和历史决策，或明确说明当前不存在。
- 未修改任何无关工作区内容。

## 禁止行为

- 未检查图谱和构建文件，就将生成的仓库上下文视为事实。
- 提交 `.codegraph/`。
- 静默安装 CodeGraph。
- 重复初始化时覆盖团队策略或仓库上下文。
- 把 CodeGraph 结构当成业务术语或架构决策原因的来源。
