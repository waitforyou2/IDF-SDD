# 工作流契约

## 仓库生命周期

`/sdd:init` 创建 `.sdd/` 和本地 CodeGraph 索引。仓库初始化独立于单项变更交付。

## 变更生命周期

| 状态 | 含义 | 下一条常规命令 |
|---|---|---|
| `DRAFT` | 变更记录已存在，但需求尚未完整。 | `/sdd:define` |
| `DEFINED` | 范围和验收条件已经稳定。 | `/sdd:plan` |
| `PLANNED` | 技术方案和测试计划已经批准。 | `/sdd:build` |
| `BUILT` | 实现任务和相关本地检查已经完成。 | `/sdd:verify` |
| `VERIFIED` | 验收证据和要求检查已经通过。 | `/sdd:ship` |
| `IN_REVIEW` | 已存在外部交付引用，由人工决定是否合并。 | 等待或处理评审意见 |
| `DONE` | 已由授权人员或系统合并或验收。 | 无 |

## 允许的状态流转

常规流转每次前进一个状态。以下返工流转同样允许：

- 验证失败时：`BUILT → PLANNED`。
- 评审要求修改实现时：`IN_REVIEW → PLANNED`。
- 需求发生实质变化时：`PLANNED → DRAFT`。

确认、失败和阻塞属于门禁结果或元数据，不新增状态。没有明确合并或验收引用时，绝不得标记为 `DONE`。

## 状态归属

`.sdd/changes/<id>/spec.md` 的 YAML frontmatter 是变更状态的唯一权威来源。代码托管平台状态和 Issue 状态可以同步，但不能替代它。

流转到 `VERIFIED` 时，工具会记录从 `base_ref` 开始的全部实现文件内容指纹。流转到 `IN_REVIEW` 时重新计算。创建提交不会改变该指纹，但验证后的文件修改会阻止交付，直到重新执行 `/sdd:verify`。

所有状态流转都必须使用插件工具：

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to <状态>
```

不得手工修改状态 frontmatter。
