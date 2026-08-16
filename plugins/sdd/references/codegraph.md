# CodeGraph 集成规范

本插件适配 [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph)。

## 安装与索引

要求 PATH 中存在 1.5.0 或更高版本的 `codegraph` 命令。插件通过 `.mcp.json` 提供 `codegraph serve --mcp`。每个业务仓库使用以下命令建立索引：

```bash
codegraph init <仓库根目录>
```

索引保存在本地 `.codegraph/` 中，MCP 服务运行时会自动同步。使用 `codegraph status` 检查健康状态；自动化环境或文件监听不可用时，使用 `codegraph sync` 主动同步。

## 智能体使用规则

结构性问题优先使用 `codegraph_explore`，不要先进行多轮 grep 和文件读取。一次聚焦查询应覆盖：

- 相关入口和符号；
- 调用路径与依赖；
- 影响范围；
- 相关测试或路由；
- 当前决策需要的源码片段。

除非 CodeGraph 显示过期提示，否则将图谱结果视为当前结果。图谱提示文件待同步时，直接读取该文件。说明文档、生成文件、图谱不支持的配置格式或缺少索引时，使用普通搜索。

## 各阶段查询重点

- `init`：识别架构、入口、模块边界和测试布局。
- `define`：定位业务能力，判断需求是局部还是跨模块。
- `plan`：追踪当前流程、调用方、被调用方、路由、测试和影响范围。
- `build`：导航到精确符号，不重复 `plan.md` 已记录的大范围分析。
- `verify`：先同步，分析最终 diff 影响的符号与测试，检查遗漏调用方和过期文档。

CodeGraph 解释代码结构，不能替代 `spec.md`、`plan.md` 或人工记录的决策原因。
