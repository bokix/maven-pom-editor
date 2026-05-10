# 更改日志

## [0.1.1] - 2026-05-10

### 新增功能
- **依赖最新版本查询**：在 Dependency Hierarchy 视图中新增按钮，可查询并展示公共仓库（Maven Central）中依赖的最新版本，方便快速了解依赖更新情况

### 问题修复
- **修复 Effective POM 标签页首次加载为空的问题**：打开 POM 视图后，默认激活的 "Effective POM" 标签页现在会自动加载内容，无需手动切换标签页

## [0.1.0] - 2026-04-28

### 架构重构
- **移除 Custom Editor**：不再替换 pom.xml 的默认编辑器，改为通过编辑器标题栏按钮打开辅助视图
- **保留原生编辑体验**：使用 VS Code 原生 XML 编辑器编辑 POM，完整支持语法高亮、IntelliSense、indent-rainbow 等所有扩展功能
- **WebviewPanel 侧边面板**：点击按钮后在右侧打开 "Effective POM"、"Dependency Hierarchy" 和 "Resolved Dependencies" 视图

### 新增功能
- **多模块项目支持**：自动检测多模块 Maven 项目，从根目录使用 `-pl :module -am` 解析子模块依赖；命令失败时自动回退到单模块模式
- **已解析依赖列表**：新增 "Resolved Dependencies" 选项卡，扁平化展示所有已解析依赖；当 `dependency:list` 失败时自动使用 `dependency:tree` 数据回退
- **Maven 路径配置**：新增 `mavenPomEditor.mavenPath` 设置项，支持手动指定 Maven 可执行文件路径
- **VS Code 任务集成**：在任务面板中提供常用 Maven 命令（clean、compile、test、package、install 等），多模块项目自动使用 `-pl -am` 参数
- **右键定位**：在 Dependency Hierarchy 中右键点击依赖，可直接在主编辑器中定位到对应 XML 节点
- **左右联动交互**：点击左栏依赖树节点自动高亮右栏对应项；点击右栏依赖自动在左栏过滤并展开相关路径
- **自动重试机制**：网络错误时自动指数退避重试（最多 3 次）；多模块命令失败时自动回退到单模块模式

### 优化改进
- 移除搜索匹配的橙色高亮，保留绿色选中样式，界面更清爽
- 修复 "隐藏/显示 GroupId" 按钮文字不切换的问题

## [0.0.2] - 2025-10-21

### 功能优化
- 📊 传递依赖完整展示
- 🎯 冲突检测与高亮显示
- 🔄 实时依赖树更新
- 💨 智能缓存机制，提升性能
- 🎭 响应式界面设计，自适应不同窗口大小

### 性能优化
- ⚡ Maven 命令执行缓存
- 🗄️ 依赖树解析结果缓存
- 📊 缓存统计信息查看命令
- 🧹 缓存清理命令

### 命令
- `Maven POM Editor: Clear All Cache` - 清除所有缓存
- `Maven POM Editor: Show Cache Statistics` - 显示缓存统计信息

### 技术栈
- TypeScript
- VS Code Extension API
- Monaco Editor
- Maven CLI 集成

### 系统要求
- VS Code 1.80.0 或更高版本
- Maven 3.x 或更高版本
- Java JDK 8 或更高版本（推荐）


## [0.0.1] - 2025-10-19

这是项目的初始开发版本，包含所有核心功能的实现。

---

## [未发布]

### 计划中
- 多模块项目聚合视图支持
- 依赖版本冲突自动解决建议
- 依赖更新检查功能
- 更多的右键菜单操作
- 性能优化：大型项目加载速度提升

---

**注意**: 对于所有的版本号，我们遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范：
- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

