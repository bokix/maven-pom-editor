# Maven POM Editor

English | [中文](README.zh.md)

[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](https://marketplace.visualstudio.com/items?itemName=Bokix.maven-pom-editor)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A VS Code extension that provides visual editing and dependency management for POM files in Maven projects. View dependency hierarchies through an intuitive interface, quickly exclude conflicting dependencies, and make Maven dependency management simple and efficient.

## ✨ Features

### 🔍 Dependency Management
- **Dependency Hierarchy Visualization**: Tree view of all project dependencies and their transitive dependencies
- **Resolved Dependencies List**: Flat list of all resolved dependencies for quick version and scope inspection
- **Dependency Filtering**: Quickly search and filter specific dependencies by groupId, artifactId, or version
- **Conflict Detection**: Automatically identifies and marks version conflicts, duplicates, and circular dependencies
- **Bidirectional Linking**: Click a dependency tree node to automatically locate it in the resolved dependencies list, and vice versa
- **Multi-module Project Support**: Automatically detects multi-module Maven projects and uses `-pl :module -am` to correctly resolve submodule dependencies from the root directory

### 🎨 POM Auxiliary View
- **Effective POM Viewer**: View the complete configuration after Maven resolution to understand the final result of inheritance and property substitution
- **Editor Integration**: Edit POM files in the native VS Code editor with all language features and extension support
- **Right-click Navigation**: Right-click a dependency in the dependency view to directly locate the corresponding XML node in the main editor

### 🚀 User Experience
- **Toolbar Button**: After opening a `pom.xml` file, click the button in the top-right corner of the editor to open the auxiliary view
- **Tab Switching**: Seamlessly switch between "Effective POM", "Dependency Hierarchy", and "Resolved Dependencies" views
- **Responsive Interface**: Adaptive layout supporting different window sizes
- **Smart Caching**: Maven command result caching to avoid repeated parsing, with manual refresh support
- **Auto Retry**: Automatic exponential backoff retry on network errors; automatic fallback to single-module mode when multi-module commands fail
- **VS Code Task Integration**: Provides common Maven commands (clean, compile, test, package, install, etc.) in the VS Code Tasks panel, with multi-module project support

## 📸 Feature Showcase

### Dependency Hierarchy Visualization
![Dependency Hierarchy](images/dependency-hierarchy.png)
*Tree view of all project dependencies and their transitive dependencies for an intuitive understanding of the dependency structure*

### Dependency Search and Filtering
![Dependency Search](images/dependency-search.png)
*Quickly search and locate specific dependencies with real-time filtering*

## 📦 Installation

### Install from Marketplace
1. Open VS Code
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (macOS) to open the Extensions panel
3. Search for "Maven POM Editor"
4. Click "Install"

### Install from VSIX File
```bash
code --install-extension maven-pom-editor-0.1.1.vsix
```

## 🎯 Usage

### Open the POM Auxiliary View
1. Open any `pom.xml` file in your project
2. Click the **"Open Maven POM View"** button (square icon) in the top-right corner of the editor
3. Or use **"Open Maven POM View"** from the editor's right-click context menu
4. The auxiliary panel will open on the right side, containing three tabs: "Effective POM", "Dependency Hierarchy", and "Resolved Dependencies"

### Feature Usage

#### View Dependency Tree
1. After opening the POM auxiliary view, click the "Dependency Hierarchy" tab
2. Expand dependency nodes to view transitive dependencies
3. Use the search box at the top to filter specific dependencies
4. Click a node in the left panel tree to automatically highlight the corresponding dependency in the right panel; click a dependency in the right panel to filter and display related paths in the left panel

#### Locate a Dependency in the Editor
1. Right-click a dependency in the dependency tree or resolved dependencies list
2. Select "Locate in Editor"
3. The main editor will automatically scroll and locate the dependency's position in the `pom.xml`

#### View Resolved Dependencies List
1. Click the "Resolved Dependencies" tab
2. View all resolved dependencies, including groupId, artifactId, version, and scope
3. If sibling modules have not been built, the extension will automatically fall back to dependency tree data to ensure the list is always available

#### View Effective POM
1. Click the "Effective POM" tab
2. View the complete configuration after Maven resolution
3. Supports syntax highlighting and code folding

#### Run Maven Tasks
1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS) to open the Command Palette
2. Type and select **"Tasks: Run Task"**
3. Select a task starting with `Maven:`, such as `Maven: clean install (module-name)`
4. For multi-module projects, the `-pl :module -am` parameters will be automatically used to correctly build the required modules from the root directory

## 📋 System Requirements

### Required
- **VS Code**: 1.80.0 or higher
- **Maven**: Local Maven 3.x or higher installation (used for resolving dependency information)
- **Operating System**: Windows, macOS, or Linux

### Recommended
- **Java**: JDK 8 or higher (required for Maven to run)
- Add Maven to your system PATH environment variable

## ⚙️ Configuration

The extension automatically detects your Maven installation (priority order: configured path → Maven Wrapper → common installation paths → system PATH). To manually specify the Maven path, configure it in VS Code settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `mavenPomEditor.mavenPath` | `string` | `""` | Absolute path to the Maven executable, e.g., `/opt/homebrew/bin/mvn`. Leave empty for automatic detection. |

### Configuration Example

Add to `settings.json`:

```json
{
  "mavenPomEditor.mavenPath": "/opt/homebrew/bin/mvn"
}
```

## 🐛 Known Issues

- For very large projects (over 1000 dependencies), dependency tree loading may take longer
- In some cases, Maven command execution may fail due to permission issues
- In multi-module projects, if sibling module dependencies have not yet been built to the local repository, the `Resolved Dependencies` page will fall back to `Dependency Hierarchy` data, which may differ slightly from the true resolved dependencies list

If you encounter other issues, please report them on [GitHub Issues](https://github.com/bokix/maven-pom-editor.git/issues).

## 🔄 Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version change history.

## 🤝 Contributing

Contributions, issue reports, and suggestions are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Powerful code editor
- [VS Code Extension API](https://code.visualstudio.com/api) - Extension development framework
- [Maven](https://maven.apache.org/) - Project dependency management tool

## 📞 Support

- 🐛 [Report Issues](https://github.com/bokix/maven-pom-editor.git/issues)
- 💬 [Discussions](https://github.com/bokix/maven-pom-editor.git/discussions)
- 📧 Contact: bokix.sun@gmail.com

---

**Enjoy using Maven POM Editor!** If you find it helpful, please give us a ⭐️ rating on the [Marketplace](https://marketplace.visualstudio.com/items?itemName=Bokix.maven-pom-editor)!
