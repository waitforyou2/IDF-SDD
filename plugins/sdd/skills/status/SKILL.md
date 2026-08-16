---
name: status
description: 只读报告 IDF-SDD 仓库就绪情况、进行中与已完成变更、当前状态、阻塞、归档校验失败、CodeGraph 健康状态和准确下一条命令。用户执行 /sdd:status、恢复中断工作，或不清楚当前变更和下一阶段时使用。
---

# 查看 IDF-SDD 状态

## 目标

为开发人员和 Agent 提供只读恢复点。不得隐式推进状态或修复归档。

调用参数：`$ARGUMENTS`

## 执行流程

1. 查询仓库或变更状态：

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/sdd.mjs" status $ARGUMENTS --root "${CLAUDE_PROJECT_DIR}"
   ```

2. 如果 `.codegraph/` 已存在，执行 `codegraph status "${CLAUDE_PROJECT_DIR}"`。索引缺失或待同步时只报告状态，除非用户要求，否则不得重建。
3. 展示：
   - 仓库就绪情况；
   - 每项进行中变更的 id、标题、模式、状态和阻塞原因；
   - 阻止下一次流转的归档校验失败；
   - 建议执行的准确命令；
   - 仅在用户要求或确有帮助时展示已完成变更。
4. 存在多个进行中变更且用户未指定时，询问继续哪一项。不得仅根据最近更新时间猜测。

## 完成条件

- 未修改任何文件、状态、Git 引用、任务或外部系统。
- 报告的下一条命令与 `spec.md` 中的权威状态一致。
- 归档校验错误与 CodeGraph 健康状态分开报告。

## 禁止行为

- 手工编辑状态 frontmatter，让状态看起来正常。
- 自动选择多个进行中变更中的一项。
- 未检查 CodeGraph 状态就声称图谱为最新。
