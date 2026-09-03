---
name: isdd-abandon
description: 取消一项不再需要的 xingyun-sdd 变更，将其标记为 ABANDONED 状态。归档文件保留但不计入活跃变更列表。用户执行 /isdd-abandon、确认变更不再需要时使用。
---

# 取消变更

## 目标

安全地将不再需要的变更标记为已取消，使其不再出现在活跃变更列表中。归档文件保留以供追溯。

调用参数：`$ARGUMENTS`

## 执行流程

1. 解析 change id。读取 `spec.md` 确认当前状态。
2. 已完成（DONE）的变更不能取消。如需回滚已完成变更，请新建变更。
3. 向用户确认：变更 `<id>`（标题）将被取消，此操作不可恢复，归档文件保留但不再追踪。获得用户明确确认后才继续。
4. 执行取消：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" abandon --id <id> [--reason "<取消原因>"] --root "${CLAUDE_PROJECT_DIR}"
   ```

5. 报告取消结果，告知用户归档文件保留在 `docs/isdd/changes/<id>/`。

## 完成条件

- 用户已明确确认取消操作。
- 变更状态为 `ABANDONED`。
- 归档文件未被删除。

## 禁止行为

- 未经用户确认就取消变更。
- 取消已完成的（DONE）变更。
- 删除归档文件。
