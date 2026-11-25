# 业务仓接入

1. 从技能目录把 Java 探针复制到现有的测试 source set（Maven 默认 src/test/java）。命令为 `python scripts/api_test.py install-probe --root <repo> --test-source <module>/src/test/java`。探针使用项目的 Spring Boot Test、Spring MVC、JUnit Jupiter、Mockito；不引入生产依赖。多模块可放测试 fixtures 模块或分别安装。升级时比较已安装文件并显式更新。
2. 每个 suite 应有且仅有一个完整的 @SpringBootTest 路由清单测试，使测试 profile 与发布 profile 暴露相同业务路由。一个 suite 对应一个隔离构建命令及一份完整清单。避免同次调用运行其他 suite 的清单。各构建命令可以从聚合项目启动并用构建筛选器精确选择模块。将 .isdd-api/ 以及构建目录列入业务仓 .gitignore，提交其余源代码、测试、配置和计划。
3. 在业务测试类注册 `@ExtendWith(ApiEvidence.class)`。清单测试注入 ApplicationContext 和 Evidence，调用 `evidence.inventory(application)`。业务用例示例：

```java
@Test void testRejectShippedOrder(ApiEvidence.Evidence evidence) throws Exception {
    when(store.find("42")).thenReturn(shippedOrder);
    var result = mvc.perform(post("/orders/42/cancel"))
        .andExpect(status().isConflict()).andReturn();
    verify(store, never()).save(any());
    verifyNoInteractions(events);
    evidence.scenario("reject-shipped", result, OrderService.class);
}
```

方法级 Evidence 隔离并行或参数化用例。JUnit 成功回调提交结果，构建失败使整轮失效。完整上下文可在无需 Docker 的环境替换 DB、缓存、消息端口；Web 切片要显式导入真实 Service。不要把探针当成断言。需要诊断未标记的旧用例时，在其 MockMvc builder 配置 `alwaysDo(ApiEvidence.hitRecorder())`。Spring 6 与 Spring 7 的 Boot 测试注解包名应服从项目 BOM。

4. 建立 config/isdd/api-tests.json。sources 和 XML 文件相对仓库根目录，command 是 argv 数组，cwd 决定构建工作目录。多模块或多个发布 profile 使用不同 suite id。exclude 的键必须是精确的运行时操作，值是审核理由；expectedOperations 可由独立发布清单或规范提出，缺项即失败。避免用业务包白名单静默剪裁路由。

```json
{
  "version": 1,
  "enforceFull": true,
  "minimumChangedUnit": 80,
  "suites": [{
    "id": "orders", "cwd": ".", "command": ["mvn", "clean", "verify"],
    "sources": ["src/main/java"],
    "unitXml": "target/site/jacoco/jacoco.xml",
    "componentXml": "target/site/jacoco-it/jacoco.xml",
    "expectedOperations": ["GET /orders/{id}"],
    "exclude": {}
  }]
}
```

Maven 用 Surefire 执行 *Test，Failsafe 绑定 integration-test 和 verify 执行 *IT。JaCoCo 为两类任务分别设置 prepare-agent/report 与 prepare-agent-integration/report-integration 并生成 XML。保留业务项目原有 argLine。用实际 wrapper 名称和参数替换 mvn，Windows wrapper 通常为 mvnw.cmd。Gradle 使用两个独立 Test 任务 test、integrationTest，分别生成 XML，配置 jacocoTestReport 和针对 integrationTest 的 JacocoReport 的 sourceDirectories、classDirectories 和 executionData；把这些任务全部列入命令，例如 ["./gradlew","clean","test","integrationTest","jacocoTestReport","jacocoIntegrationTestReport","--rerun-tasks","--no-build-cache"]，Windows 使用 gradlew.bat。按实际测试源码位置安装探针。不要向 unitXml 填入 combined XML。报告应覆盖相同完整生产源码，包括未执行类；不同 source set 的同名文件须可唯一解析。每条命令都应生成本轮新 XML，只有增量统计需要 Git 比较基线。纯补测变更中没有新增可执行生产行时，分母为 0，显示不适用。独立团队可省略增量门槛，未配置 XML 的行覆盖显示未采集。

5. plan 写入 config/isdd/api-plans/<id>.json。operation 从 audit 复制（含方法、路径、条件）。例如：

每个 suite 可用 profiles 列表校验清单测试中实际激活的 Spring profiles（含专用测试 profile）。非标准 JUnit 输出目录用 junit 数组提供相对 cwd 的 XML glob。命令须确保测试失败返回非零；运行器也检查 JUnit XML 中的失败和零执行。对本次更改且完全未出现在 JaCoCo 清单的生产文件，验证报告阻止声明增量通过。只有经评审核实的纯声明文件可在顶层 nonExecutableSources 按精确路径和理由登记，报告会展示这些例外。

```json
{
  "mode": "change",
  "scenarios": [
    {"suite":"orders","operation":"POST /orders/{id}/cancel","id":"reject-shipped","expected":"409；未写库、未发布取消事件"}
  ]
}
```

mode=full 验收整个服务；change 额外核对每个新增或受影响的场景。历史治理按批准范围分批时显式配置 enforceFull=false、mode=batch，并把 audit 中每条 covered 的 [suite,operation] 放进 baseline 数组；计划场景必须通过且基线不能回退，全量缺口仍逐条显示。最终项目恢复 enforceFull=true。SDD 应提交配置和计划供评审核对，CI 使用同一脚本重跑 verify。stdout 是 JSON，构建日志在 stderr。
