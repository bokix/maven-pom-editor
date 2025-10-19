import * as vscode from 'vscode';
import * as path from 'path';
import { MavenUtils } from './mavenUtils';
import { CacheManager } from './cacheManager';

export class PomEditorProvider implements vscode.CustomTextEditorProvider {
    
    // 使用统一的缓存管理器
    private cacheManager: CacheManager;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.cacheManager = new CacheManager(context);
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

        // Hook up event listeners
        this.setupWebviewMessageListener(webviewPanel, document);
        this.setupDocumentChangeListener(document, webviewPanel);
    }

    private getHtmlForWebview(webview: vscode.Webview, document: vscode.TextDocument): string {
        // Get the CSS and JS URIs
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js')
        );

        // Monaco Editor loader
        const monacoLoaderUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'monaco-loader.js')
        );

        // Use a nonce to only allow specific scripts to run
        const nonce = getNonce();

        const pomContent = document.getText();

        // Detect current theme
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'vscode-dark' : 'vscode-light';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; font-src ${webview.cspSource} https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Maven POM Editor</title>
</head>
<body class="${theme}">
    <div class="editor-container">
        <div class="tab-bar">
            <button class="tab-button active" data-tab="raw-pom">Raw POM</button>
            <button class="tab-button" data-tab="effective-pom">Effective POM</button>
            <button class="tab-button" data-tab="dependency-hierarchy">Dependency Hierarchy</button>
        </div>
        
        <div class="tab-content-container">
            <div id="raw-pom" class="tab-content active">
                <div id="monaco-editor-container"></div>
            </div>
            
            <div id="effective-pom" class="tab-content">
            </div>
            
            <div id="dependency-hierarchy" class="tab-content">
            </div>
        </div>
    </div>
    
    <script nonce="${nonce}">
        const vscodeApi = acquireVsCodeApi();
        const initialContent = ${JSON.stringify(pomContent)};
    </script>
    <script nonce="${nonce}" src="${monacoLoaderUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private setupWebviewMessageListener(
        webviewPanel: vscode.WebviewPanel,
        document: vscode.TextDocument
    ): void {
        webviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'update':
                        await this.updateTextDocument(document, message.content);
                        break;
                    case 'log':
                        console.log('Webview:', message.content);
                        break;
                    case 'getEffectivePom':
                        await this.handleGetEffectivePom(webviewPanel, document, message.forceRefresh);
                        break;
                    case 'getDependencyTree':
                        await this.handleGetDependencyTree(webviewPanel, document, message.forceRefresh);
                        break;
                    case 'getResolvedDependencies':
                        await this.handleGetResolvedDependencies(webviewPanel, document, message.forceRefresh);
                        break;
                }
            }
        );
    }

    private async handleGetEffectivePom(
        webviewPanel: vscode.WebviewPanel,
        document: vscode.TextDocument,
        forceRefresh: boolean = false
    ): Promise<void> {
        await this.executeWithProgress(
            webviewPanel,
            document,
            'effectivePom',
            forceRefresh,
            async (pomPath: string) => {
                // 步骤 1: 检查 Maven 环境 (10%)
                await this.reportProgress(webviewPanel, 'effectivePom', 1, '检查 Maven 环境');
                const mavenAvailable = await MavenUtils.isMavenAvailable();
                if (!mavenAvailable) {
                    throw new Error('Maven 未安装或未添加到 PATH 中。请安装 Maven 后重试。');
                }

                // 步骤 2: 解析依赖关系 (30%)
                await this.reportProgress(webviewPanel, 'effectivePom', 2, '解析依赖关系');
                
                // 步骤 3: 生成 Effective POM (60%)
                await this.reportProgress(webviewPanel, 'effectivePom', 3, '生成 Effective POM');
                const effectivePom = await MavenUtils.getEffectivePom(pomPath);

                // 步骤 4: 处理结果 (90%)
                await this.reportProgress(webviewPanel, 'effectivePom', 4, '处理结果');
                
                return effectivePom;
            }
        );
    }

    private async handleGetDependencyTree(
        webviewPanel: vscode.WebviewPanel,
        document: vscode.TextDocument,
        forceRefresh: boolean = false
    ): Promise<void> {
        await this.executeWithProgress(
            webviewPanel,
            document,
            'dependencyTree',
            forceRefresh,
            async (pomPath: string) => {
                // 步骤 1: 检查 Maven 环境 (10%)
                await this.reportProgress(webviewPanel, 'dependencyTree', 1, '检查 Maven 环境');
                const mavenAvailable = await MavenUtils.isMavenAvailable();
                if (!mavenAvailable) {
                    throw new Error('Maven 未安装或未添加到 PATH 中。请安装 Maven 后重试。');
                }

                // 步骤 2: 解析依赖关系 (30%)
                await this.reportProgress(webviewPanel, 'dependencyTree', 2, '解析依赖关系');
                
                // 步骤 3: 生成依赖树 (60%)
                await this.reportProgress(webviewPanel, 'dependencyTree', 3, '生成依赖树');
                const treeText = await MavenUtils.getDependencyTree(pomPath);

                // 步骤 4: 处理结果 (90%)
                await this.reportProgress(webviewPanel, 'dependencyTree', 4, '处理结果');
                const treeData = MavenUtils.parseDependencyTree(treeText);
                
                return treeData;
            }
        );
    }

    private async handleGetResolvedDependencies(
        webviewPanel: vscode.WebviewPanel,
        document: vscode.TextDocument,
        forceRefresh: boolean = false
    ): Promise<void> {
        await this.executeWithProgress(
            webviewPanel,
            document,
            'resolvedDependencies',
            forceRefresh,
            async (pomPath: string) => {
                // 步骤 1: 检查 Maven 环境 (10%)
                await this.reportProgress(webviewPanel, 'resolvedDependencies', 1, '检查 Maven 环境');
                const mavenAvailable = await MavenUtils.isMavenAvailable();
                if (!mavenAvailable) {
                    throw new Error('Maven 未安装或未添加到 PATH 中。请安装 Maven 后重试。');
                }

                // 步骤 2: 解析依赖关系 (30%)
                await this.reportProgress(webviewPanel, 'resolvedDependencies', 2, '解析依赖关系');
                
                // 步骤 3: 生成依赖列表 (60%)
                await this.reportProgress(webviewPanel, 'resolvedDependencies', 3, '生成依赖列表');
                const listText = await MavenUtils.getResolvedDependencies(pomPath);

                // 步骤 4: 处理结果 (90%)
                await this.reportProgress(webviewPanel, 'resolvedDependencies', 4, '处理结果');
                const dependencies = MavenUtils.parseResolvedDependencies(listText);
                
                return dependencies;
            }
        );
    }

    private setupDocumentChangeListener(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel
    ): void {
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                // Document was changed externally, update the webview
                webviewPanel.webview.postMessage({
                    type: 'update',
                    content: document.getText()
                });
            }
        });

        // Clean up when webview is closed
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    private async updateTextDocument(document: vscode.TextDocument, content: string): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        
        // Replace the entire document
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            content
        );

        await vscode.workspace.applyEdit(edit);
    }

    /**
     * 执行带进度的操作
     * @param webviewPanel Webview 面板
     * @param document 文档
     * @param cacheKey 缓存键
     * @param forceRefresh 是否强制刷新
     * @param executor 执行函数
     */
    private async executeWithProgress<T>(
        webviewPanel: vscode.WebviewPanel,
        document: vscode.TextDocument,
        cacheKey: string,
        forceRefresh: boolean,
        executor: (pomPath: string) => Promise<T>
    ): Promise<void> {
        const messageType = this.getMessageType(cacheKey);
        
        try {
            // 显示加载状态
            this.showLoadingState(webviewPanel, cacheKey, true);

            const pomPath = document.uri.fsPath;

            // 检查缓存
            const cachedData = await this.cacheManager.get(pomPath, cacheKey, forceRefresh);
            if (cachedData) {
                console.log(`[PomEditor] 使用缓存的 ${cacheKey} 数据`);
                this.showCachedResult(webviewPanel, cacheKey, cachedData);
                return;
            }

            console.log(`[PomEditor] 从 Maven 获取 ${cacheKey}...`);

            // 执行操作
            const result = await executor(pomPath);

            // 缓存结果
            await this.cacheManager.set(pomPath, cacheKey, result);

            // 发送结果到 webview
            webviewPanel.webview.postMessage({
                type: `${messageType}Result`,
                [this.getResultKey(cacheKey)]: result,
                loading: false,
                fromCache: false
            });
        } catch (error: any) {
            console.error(`获取 ${cacheKey} 失败:`, error);
            this.showError(webviewPanel, cacheKey, error.message || `获取 ${cacheKey} 失败`);
        }
    }

    /**
     * 显示加载状态
     */
    private showLoadingState(webviewPanel: vscode.WebviewPanel, cacheKey: string, loading: boolean): void {
        const messageType = this.getMessageType(cacheKey);
        webviewPanel.webview.postMessage({
            type: `${messageType}Loading`,
            loading
        });
    }

    /**
     * 显示缓存结果
     */
    private showCachedResult(webviewPanel: vscode.WebviewPanel, cacheKey: string, data: any): void {
        const messageType = this.getMessageType(cacheKey);
        webviewPanel.webview.postMessage({
            type: `${messageType}Result`,
            [this.getResultKey(cacheKey)]: data,
            loading: false,
            fromCache: true
        });
    }

    /**
     * 显示错误
     */
    private showError(webviewPanel: vscode.WebviewPanel, cacheKey: string, error: string): void {
        const messageType = this.getMessageType(cacheKey);
        webviewPanel.webview.postMessage({
            type: `${messageType}Error`,
            error,
            loading: false
        });
    }

    /**
     * 报告进度
     */
    private async reportProgress(
        webviewPanel: vscode.WebviewPanel,
        cacheKey: string,
        step: number,
        message: string
    ): Promise<void> {
        const messageType = this.getMessageType(cacheKey);
        webviewPanel.webview.postMessage({
            type: `${messageType}Progress`,
            step,
            message,
            progress: step * 25 // 每步25%
        });
        
        // 短暂延迟，让UI有时间更新
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * 获取消息类型前缀
     */
    private getMessageType(cacheKey: string): string {
        switch (cacheKey) {
            case 'effectivePom':
                return 'effectivePom';
            case 'dependencyTree':
                return 'dependencyTree';
            case 'resolvedDependencies':
                return 'resolvedDependencies';
            default:
                return cacheKey;
        }
    }

    /**
     * 获取结果键名
     */
    private getResultKey(cacheKey: string): string {
        switch (cacheKey) {
            case 'effectivePom':
                return 'content';
            case 'dependencyTree':
            case 'resolvedDependencies':
                return 'data';
            default:
                return 'data';
        }
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

