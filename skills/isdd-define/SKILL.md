---
name: isdd-define
description: 定义或修订一项 xingyun-sdd 变更，将问题、范围、非目标、验收条件、假设、领域语言、风险和流程模式写入持久的 spec.md。用户执行 /isdd-define、提出功能或缺陷、需要把讨论整理成需求，或在规划前实质性修改已有需求时使用。
---

# 定义需求

## 目标

先明确必须改变什么以及为什么，再选择技术实现。根据风险调整沟通和归档深度，同时保证每项变更都可追溯。

调用参数：`$ARGUMENTS`

## 执行流程

1. 要求仓库已初始化。阅读 `docs/isdd/policy.md`、`docs/isdd/repository.md`、[工作流契约](../../references/workflow.md)、[模式规范](../../references/modes.md)和[归档契约](../../references/artifacts.md)。
2. 如果参数指向已有变更且当前状态不是 `DRAFT`，说明需求在后续阶段被发现有问题，需要重新定义。先自动回退到 `DRAFT`：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to DRAFT --root "${CLAUDE_PROJECT_DIR}"
   ```

   告知用户："检测到变更 `<id>` 当前状态为 `<当前状态>`，已回退到 DRAFT。保留已有的 spec.md 作为参考，你可以在原文基础上修改。" 回退后 `verified_fingerprint` 和 `delivery_ref` 会被清空，之前创建的 MR 将不再关联。

3. 如果参数指向已有的 `DRAFT` 变更，继续使用该记录；否则对原始需求分类：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" classify --text "<需求>" --root "${CLAUDE_PROJECT_DIR}"
   ```

4. 阅读 `docs/isdd/repository.md` 中的统一术语和相关历史决策。使用一次 `codegraph_explore` 定位业务能力、可能影响的模块、已有测试 seam 和大致影响范围。此阶段不得设计技术方案。图谱证据与 lite 判断冲突时，升级模式。
5. 在详细提问前检查需求范围。如果一个请求包含多个可独立验收的能力，先给出小型能力地图，包含稳定 id、职责、依赖和构建顺序；确认后，再为每个能力建立独立变更。
6. 显式列出会影响结果的重要假设。只询问会改变行为、范围、验收、术语或风险的问题。清晰的 lite 需求无需提问；standard 每批最多三个问题，strict 每批最多五个问题。仓库证据已经回答的问题，不得再次进行形式化访谈。
7. 必要时创建变更记录。**必须同时提供 `--id` 和 `--title`**，不要省略 `--id` 让工具报错后再补：

   - `--id`：英文短横线连接的小写标识符，从需求关键词提取（如 `add-avatar-field`、`fix-login-timeout`）。只允许字母、数字、点、下划线和连字符，1-128 个字符，不得包含 `..`。
   - `--title`：中文或英文的自然语言标题。
   - `--mode`：lite、standard 或 strict。
   - `--e2e`：E2E 需求单号（如 `US20260514051844`、`DTS2026071083813`）。创建 MR 时作为 `--e2e-issues` 传入 CodeHub。**此字段可选，但现在填写可避免 ship 阶段再询问。** 如果当前没有单号可省略，但 ship 阶段创建 MR 时必须提供，届时会再次询问。

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" change create --id <英文短横线标识符> --title "<标题>" --mode <模式> --e2e <E2E单号> --root "${CLAUDE_PROJECT_DIR}"
   ```

8. 使用仓库统一语言完成 `docs/isdd/changes/<id>/spec.md`。区分用户可见需求和技术实现决策；让验收条件能够通过行为或约定的确定性信号观察；写清非目标以及当前模式为什么安全。
9. 展示前自行检查规格：
   - 删除占位内容、矛盾和不一致术语；
   - 确保每条验收条件只有一种合理解释；
   - 如果一份计划无法在一次聚焦实现周期内完成，拆分变更；
   - 不保留会实质性改变范围或行为的待决问题。
10. standard 和 strict 模式必须展示问题、范围、非目标、假设、验收条件和模式依据，并获得确认。lite 模式只有在待决问题会改变范围或风险时才暂停。
11. 只有完成条件通过后才能流转：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to DEFINED --root "${CLAUDE_PROJECT_DIR}"
   ```

12. 用户提供 `--auto` 时，仅当最终模式为 lite 才继续。依次遵守 `plan`、`build` 和 `verify` Skill 契约，创建全部归档，并在 ship 或任何外部发布前停止。非 lite 模式忽略自动执行并说明原因。

## 完成条件

- 问题、目标、范围和非目标明确且相互独立。
- 验收条件可测试或可直接观察。
- 风险、假设和模式依据已记录。
- 统一领域术语使用一致。
- 不存在会实质性改变需求行为的待决问题。
- `spec.md` 通过 `DEFINED` 状态校验。

## 禁止行为

- 把技术方案隐藏在验收条件中。
- 只根据需求文字长度选择 lite，而不考虑风险和图谱影响。
- 为避免必要提问而虚构干系人需求。
- 出现 standard 或 strict 触发条件后仍继续 `--auto`。
- 把多个可独立交付的能力强行写进同一份规格。
- 询问仓库证据已经明确回答的问题。
