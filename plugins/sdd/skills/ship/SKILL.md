---
name: ship
description: 完成 VERIFIED 状态的 IDF-SDD 分支，准备并在获得独立授权后发布人工评审包，归档证据、风险、按需发布与监控、回滚和最终验收记录。用户执行 /sdd:ship、要求准备或创建 PR、需要查看分支收尾选项，或要把已合并变更标记完成时使用。
---

# 准备交付

## 目标

把已经验证的工作整理成可追溯、可回滚的评审包。准备交付不代表已经获得 commit、push、创建 PR、merge、丢弃工作或 deploy 的授权。

调用参数：`$ARGUMENTS`

## 执行流程

1. 解析 change id。阅读 `spec.md`、`plan.md`、`verification.md`、`.sdd/policy.md`、[工作流契约](../../references/workflow.md)和[归档契约](../../references/artifacts.md)。
2. 提供 `--complete` 时，要求当前状态为 `IN_REVIEW`，确认交付已经合并或验收，取得不可变的合并或验收引用，然后执行：

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to DONE --merged --accepted-ref "<引用>" --root "${CLAUDE_PROJECT_DIR}"
   ```

   报告归档结果后停止。
3. 其他情况要求当前状态为 `VERIFIED`。检查 Git 状态和范围内完整 diff。状态工具会比较当前变更文件内容指纹与验证阶段指纹；任何实现修改都会阻止交付，直到重新执行 `/sdd:verify`。
4. 创建或复用 `delivery.md`：

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/sdd.mjs" artifact delivery --id <id> --root "${CLAUDE_PROJECT_DIR}"
   ```

5. 填写可评审标题、为什么修改、修改内容、可观察结果、验证证据、风险、归档链接和人工关注点。影响生产的变更还必须记录分阶段发布、监控指标和阈值、适用时的功能开关负责人，以及可执行回滚步骤；仅本地变更需要说明为什么这些内容不适用。在外部评审对象创建前保留 `Delivery-Ref: PENDING`。
6. 重新运行成本最低的交付前检查，确认分支仍与 `verification.md` 一致。实现一致性以内容指纹为准，不得创建第二套验证结论。
7. 分别处理授权参数：
   - `--commit` 只授权暂存已确认的范围内路径并创建一次提交。
   - `--push` 只授权推送已确认分支。
   - `--create-pr` 只授权创建最多一个 PR 或评审请求。
   - 任何一个参数都不授权 merge 或 deploy。
   缺少授权时必须询问，不得推断。混合工作区不得使用宽泛的全量暂存路径。
8. 未授权外部发布时，完成 `delivery.md`，展示可选下一步，保持 `VERIFIED` 状态并停止。不得把删除分支或 worktree 当成默认收尾动作。
9. 授权创建 PR 或评审请求后，用真实 URL 或不可变 id 替换 `Delivery-Ref: PENDING`，然后流转：

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to IN_REVIEW --delivery-ref "<引用>" --root "${CLAUDE_PROJECT_DIR}"
   ```

## 完成条件

- 交付内容与当前已验证 diff 一致。
- 已链接需求、计划、验证、发布和回滚证据。
- 生产变更可回滚、可观察，并定义推进或回滚信号。
- 范围内文件全部可解释，且未包含用户无关变更。
- 所有外部动作都有动作级明确授权。
- `IN_REVIEW` 有真实交付引用，`DONE` 有已授权验收引用。

## 禁止行为

- 假设 `/sdd:ship` 自动授权 push、创建 PR、merge 或 deploy。
- 实现文件修改后复用旧验证。
- 只有本地 PR 文本时就标记 `IN_REVIEW`。
- 在交付摘要中隐藏已知风险或失败检查。
- 把 deploy 当作 ship 授权的一部分，或在没有回滚路径时发布生产变更。
