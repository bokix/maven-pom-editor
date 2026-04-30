import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MavenUtils } from './mavenUtils';
import { CacheManager } from './cacheManager';
import { t, getLocale } from './i18n';

export class PomViewProvider {

    private panels: Map<string, vscode.WebviewPanel> = new Map();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly cacheManager: CacheManager
    ) { }

    public openPomView(uri: vscode.Uri): void {
        const pomPath = uri.fsPath;
        const panelKey = pomPath;

        // 如果已经打开了对应的面板，就显示它
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        // 读取 POM 文件内容
        let pomContent = '';
        try {
            pomContent = fs.readFileSync(pomPath, 'utf-8');
        } catch (error) {
            vscode.window.showErrorMessage(t('error.readPomFailed', pomPath));
            return;
        }

        // 创建 WebviewPanel
        const panel = vscode.window.createWebviewPanel(
            'mavenPomEditor.view',
            t('ui.panelTitle', path.basename(path.dirname(pomPath))),
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media')
                ]
            }
        );

        this.panels.set(panelKey, panel);

        // 面板关闭时清理
        panel.onDidDispose(() => {
            this.panels.delete(panelKey);
        });

        // 设置 Webview HTML
        panel.webview.html = this.getHtmlForWebview(panel.webview, pomContent);

        // 监听消息
        this.setupWebviewMessageListener(panel, uri);
    }

    private getHtmlForWebview(webview: vscode.Webview, pomContent: string): string {
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

        // Detect current theme
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'vscode-dark' : 'vscode-light';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; font-src ${webview.cspSource} https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Maven POM View</title>
</head>
<body class="${theme}">
    <div class="editor-container">
        <div class="tab-bar">
            <button class="tab-button active" data-tab="effective-pom">Effective POM</button>
            <button class="tab-button" data-tab="dependency-hierarchy">Dependency Hierarchy</button>
        </div>

        <div class="tab-content-container">
            <div id="effective-pom" class="tab-content active">
            </div>

            <div id="dependency-hierarchy" class="tab-content">
            </div>
        </div>
    </div>

    <div id="context-menu" class="context-menu">
        <div class="context-menu-item" id="context-menu-locate">${t('ui.locateInEditor')}</div>
    </div>

    <script nonce="${nonce}">
        const vscodeApi = acquireVsCodeApi();
        const initialContent = ${JSON.stringify(pomContent)};
        const locale = '${getLocale()}';
    </script>
    <script nonce="${nonce}" src="${monacoLoaderUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private setupWebviewMessageListener(
        panel: vscode.WebviewPanel,
        uri: vscode.Uri
    ): void {
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'log':
                        console.log('Webview:', message.content);
                        break;
                    case 'getEffectivePom':
                        await this.handleGetEffectivePom(panel, uri, message.forceRefresh);
                        break;
                    case 'getDependencyTree':
                        await this.handleGetDependencyTree(panel, uri, message.forceRefresh);
                        break;
                    case 'getResolvedDependencies':
                        await this.handleGetResolvedDependencies(panel, uri, message.forceRefresh);
                        break;
                    case 'locateInEditor':
                        await this.handleLocateInEditor(uri, message.groupId, message.artifactId);
                        break;
                    // source code generated by GenAI of Kiro starts
                    case 'openMvnRepository':
                        await this.handleOpenMvnRepository(
                            message.groupId,
                            message.artifactId
                        );
                        break;
                    // source code generated by GenAI of Kiro ends
                }
            }
        );
    }

    private async handleGetEffectivePom(
        panel: vscode.WebviewPanel,
        uri: vscode.Uri,
        forceRefresh: boolean = false
    ): Promise<void> {
        await this.executeWithProgress(
            panel,
            uri,
            'effectivePom',
            forceRefresh,
            async (pomPath: string) => {
                await this.reportProgress(panel, 'effectivePom', 1, t('progress.checkMaven'));
                const mavenAvailable = await MavenUtils.isMavenAvailable(pomPath);
                if (!mavenAvailable) {
                    throw new Error(t('error.mavenNotFoundWithWrapper'));
                }

                await this.reportProgress(panel, 'effectivePom', 2, t('progress.resolveDependencies'));
                await this.reportProgress(panel, 'effectivePom', 3, t('progress.generateEffectivePom'));
                const effectivePom = await MavenUtils.getEffectivePom(pomPath);

                await this.reportProgress(panel, 'effectivePom', 4, t('progress.processResult'));

                return effectivePom;
            }
        );
    }

    private async handleGetDependencyTree(
        panel: vscode.WebviewPanel,
        uri: vscode.Uri,
        forceRefresh: boolean = false
    ): Promise<void> {
        await this.executeWithProgress(
            panel,
            uri,
            'dependencyTree',
            forceRefresh,
            async (pomPath: string) => {
                await this.reportProgress(panel, 'dependencyTree', 1, t('progress.checkMaven'));
                const mavenAvailable = await MavenUtils.isMavenAvailable(pomPath);
                if (!mavenAvailable) {
                    throw new Error(t('error.mavenNotFoundWithWrapper'));
                }

                await this.reportProgress(panel, 'dependencyTree', 2, t('progress.resolveDependencies'));
                await this.reportProgress(panel, 'dependencyTree', 3, t('progress.generateDependencyTree'));
                const treeText = await MavenUtils.getDependencyTree(pomPath);

                await this.reportProgress(panel, 'dependencyTree', 4, t('progress.processResult'));
                const treeData = MavenUtils.parseDependencyTree(treeText);

                return treeData;
            }
        );
    }

    private async handleGetResolvedDependencies(
        panel: vscode.WebviewPanel,
        uri: vscode.Uri,
        forceRefresh: boolean = false
    ): Promise<void> {
        await this.executeWithProgress(
            panel,
            uri,
            'resolvedDependencies',
            forceRefresh,
            async (pomPath: string) => {
                await this.reportProgress(panel, 'resolvedDependencies', 1, t('progress.checkMaven'));
                const mavenAvailable = await MavenUtils.isMavenAvailable(pomPath);
                if (!mavenAvailable) {
                    throw new Error(t('error.mavenNotFoundWithWrapper'));
                }

                await this.reportProgress(panel, 'resolvedDependencies', 2, t('progress.resolveDependencies'));
                await this.reportProgress(panel, 'resolvedDependencies', 3, t('progress.generateDependencyList'));
                const listText = await MavenUtils.getResolvedDependencies(pomPath);

                await this.reportProgress(panel, 'resolvedDependencies', 4, t('progress.processResult'));
                const dependencies = MavenUtils.parseResolvedDependencies(listText);

                return dependencies;
            }
        );
    }

    private async executeWithProgress<T>(
        panel: vscode.WebviewPanel,
        uri: vscode.Uri,
        cacheKey: string,
        forceRefresh: boolean,
        executor: (pomPath: string) => Promise<T>
    ): Promise<void> {
        const messageType = this.getMessageType(cacheKey);

        try {
            this.showLoadingState(panel, cacheKey, true);

            const pomPath = uri.fsPath;

            const cachedData = await this.cacheManager.get(pomPath, cacheKey, forceRefresh);
            if (cachedData) {
                console.log(`[PomView] 使用缓存的 ${cacheKey} 数据`);
                this.showCachedResult(panel, cacheKey, cachedData);
                return;
            }

            console.log(`[PomView] 从 Maven 获取 ${cacheKey}...`);

            const result = await executor(pomPath);

            await this.cacheManager.set(pomPath, cacheKey, result);

            panel.webview.postMessage({
                type: `${messageType}Result`,
                [this.getResultKey(cacheKey)]: result,
                loading: false,
                fromCache: false
            });
        } catch (error: any) {
            console.error(`获取 ${cacheKey} 失败:`, error);
            const errorMessage = error.message || t('error.generic', cacheKey);
            this.showError(panel, cacheKey, errorMessage);

            // 如果是 Maven 未找到的错误，提供配置指引
            if (errorMessage.includes(t('error.mavenNotFoundWithWrapper'))) {
                const result = await vscode.window.showErrorMessage(
                    errorMessage,
                    t('msg.configureMavenPath')
                );
                if (result === t('msg.configureMavenPath')) {
                    vscode.commands.executeCommand(
                        'workbench.action.openSettings',
                        'mavenPomEditor.mavenPath'
                    );
                }
            }
        }
    }

    private showLoadingState(panel: vscode.WebviewPanel, cacheKey: string, loading: boolean): void {
        const messageType = this.getMessageType(cacheKey);
        panel.webview.postMessage({
            type: `${messageType}Loading`,
            loading
        });
    }

    private showCachedResult(panel: vscode.WebviewPanel, cacheKey: string, data: any): void {
        const messageType = this.getMessageType(cacheKey);
        panel.webview.postMessage({
            type: `${messageType}Result`,
            [this.getResultKey(cacheKey)]: data,
            loading: false,
            fromCache: true
        });
    }

    private showError(panel: vscode.WebviewPanel, cacheKey: string, error: string): void {
        const messageType = this.getMessageType(cacheKey);
        panel.webview.postMessage({
            type: `${messageType}Error`,
            error,
            loading: false
        });
    }

    private async reportProgress(
        panel: vscode.WebviewPanel,
        cacheKey: string,
        step: number,
        message: string
    ): Promise<void> {
        const messageType = this.getMessageType(cacheKey);
        panel.webview.postMessage({
            type: `${messageType}Progress`,
            step,
            message,
            progress: step * 25
        });

        await new Promise(resolve => setTimeout(resolve, 100));
    }

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

    private async handleLocateInEditor(
        uri: vscode.Uri,
        groupId: string,
        artifactId: string
    ): Promise<void> {
        try {
            // 打开或显示 pom.xml 文件
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

            const text = document.getText();
            const groupIdPattern = `<groupId>${this.escapeRegex(groupId)}</groupId>`;
            const artifactIdPattern = `<artifactId>${this.escapeRegex(artifactId)}</artifactId>`;

            // 查找所有 groupId 匹配位置
            let bestRange: vscode.Range | undefined;
            let searchIndex = 0;

            while (true) {
                const groupIdIndex = text.indexOf(groupIdPattern, searchIndex);
                if (groupIdIndex === -1) {
                    break;
                }

                // 在该 groupId 附近查找 artifactId
                const startSearch = Math.max(0, groupIdIndex - 500);
                const endSearch = Math.min(text.length, groupIdIndex + 500);
                const nearbyText = text.substring(startSearch, endSearch);

                if (nearbyText.includes(artifactIdPattern)) {
                    // 找到了匹配的 groupId + artifactId 组合
                    const position = document.positionAt(groupIdIndex);
                    bestRange = new vscode.Range(position, position);
                    break;
                }

                searchIndex = groupIdIndex + 1;
            }

            // 如果没找到组合，尝试单独查找 artifactId
            if (!bestRange) {
                const artifactIdIndex = text.indexOf(artifactIdPattern);
                if (artifactIdIndex !== -1) {
                    const position = document.positionAt(artifactIdIndex);
                    bestRange = new vscode.Range(position, position);
                }
            }

            if (bestRange) {
                editor.revealRange(bestRange, vscode.TextEditorRevealType.InCenter);
                editor.selection = new vscode.Selection(bestRange.start, bestRange.start);
            } else {
                vscode.window.showInformationMessage(t('error.notFoundInPom', groupId, artifactId));
            }
        } catch (error: any) {
            console.error('定位到编辑器失败:', error);
            vscode.window.showErrorMessage(t('error.locateFailed', error.message));
        }
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // source code generated by GenAI of Kiro starts
    /**
     * 从多个 Maven 仓库获取依赖版本列表并显示在 QuickPick 中
     */
    private async handleOpenMvnRepository(
        groupId: string,
        artifactId: string
    ): Promise<void> {
        // source code generated by GenAI of Kiro starts
        // Sanitize inputs - strip tree-drawing chars that may leak through
        groupId = (groupId || '').replace(/^[+\\\-| ]+/, '').trim();
        artifactId = (artifactId || '').replace(/^[+\\\-| ]+/, '').trim();
        // Validate Maven coordinate format to prevent path traversal
        const MAVEN_COORD_REGEX = /^[a-zA-Z0-9._-]+$/;
        if (!groupId || !artifactId || !MAVEN_COORD_REGEX.test(groupId) || !MAVEN_COORD_REGEX.test(artifactId)) {
            vscode.window.showWarningMessage('Invalid groupId or artifactId format');
            return;
        }
        // source code generated by GenAI of Kiro ends
        try {
            const versions = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Fetching versions for ${groupId}:${artifactId}...`,
                    cancellable: false
                },
                async () => {
                    return await this.fetchAllRepoVersions(
                        groupId, artifactId
                    );
                }
            );

            if (versions.length === 0) {
                vscode.window.showWarningMessage(
                    `No versions found for ${groupId}:${artifactId}`
                );
                return;
            }

            const items: vscode.QuickPickItem[] = versions.map(
                (v, index) => ({
                    label: v.version,
                    description:
                        (index === 0 ? '(latest) ' : '') +
                        `[${v.source}]`,
                    detail: `Updated: ${v.timestamp}`
                })
            );

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Select version for ${groupId}:${artifactId}`,
                title: `${artifactId} - Available Versions (${versions.length})`,
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                await vscode.env.clipboard.writeText(selected.label);
                vscode.window.showInformationMessage(
                    `Version ${selected.label} copied to clipboard`
                );
            }
        } catch (error: any) {
            console.error('Failed to fetch Maven versions:', error);
            vscode.window.showErrorMessage(
                `Failed to fetch versions: ${error.message}`
            );
        }
    }

    private async fetchAllRepoVersions(
        groupId: string,
        artifactId: string
    ): Promise<Array<{
        version: string; timestamp: string; source: string
    }>> {
        const groupPath = groupId.replace(/\./g, '/');
        const repos = [
            { name: 'Maven Central', hostname: 'repo1.maven.org', path: `/maven2/${groupPath}/${artifactId}/` },
            { name: 'Atlassian', hostname: 'maven.artifacts.atlassian.com', path: `/${groupPath}/${artifactId}/` }
        ];
        const allResults = await Promise.allSettled(
            repos.map(repo => this.fetchFromRepo(repo.hostname, repo.path, repo.name))
        );
        const versionMap = new Map<string, { version: string; timestamp: string; source: string; date: Date }>();
        const atlassianNoDates: Array<{ version: string; groupPath: string; artifactId: string }> = [];
        for (const result of allResults) {
            if (result.status === 'fulfilled') {
                for (const v of result.value) {
                    if (!versionMap.has(v.version)) {
                        versionMap.set(v.version, v);
                        if (v.source === 'Atlassian' && v.date.getTime() === 0) {
                            atlassianNoDates.push({ version: v.version, groupPath, artifactId });
                        }
                    } else {
                        const existing = versionMap.get(v.version)!;
                        if (!existing.source.includes(v.source)) {
                            existing.source += `, ${v.source}`;
                        }
                    }
                }
            } else {
                console.warn('Repo fetch failed:', result.reason?.message);
            }
        }
        if (atlassianNoDates.length > 0) {
            const toFetch = atlassianNoDates.slice(0, 30);
            const dateResults = await Promise.allSettled(
                toFetch.map(v => this.fetchAtlassianVersionDate(v.groupPath, v.artifactId, v.version))
            );
            for (let i = 0; i < dateResults.length; i++) {
                const dr = dateResults[i];
                if (dr.status === 'fulfilled' && dr.value) {
                    const entry = versionMap.get(toFetch[i].version);
                    if (entry) {
                        entry.date = dr.value;
                        entry.timestamp = dr.value.toISOString().replace('T', ' ').substring(0, 16);
                    }
                }
            }
        }
        const merged = Array.from(versionMap.values());
        merged.sort((a, b) => b.date.getTime() - a.date.getTime());
        return merged.map(({ version, timestamp, source }) => ({ version, timestamp, source }));
    }

    private async fetchAtlassianVersionDate(groupPath: string, artifactId: string, version: string): Promise<Date | null> {
        const https = await import('https');
        const pomPath = `/${groupPath}/${artifactId}/${version}/${artifactId}-${version}.pom`;
        return new Promise((resolve) => {
            const req = https.request({
                hostname: 'maven.artifacts.atlassian.com', path: pomPath, method: 'HEAD',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36' }
            }, (res) => {
                const lastMod = res.headers['last-modified'];
                resolve(lastMod ? new Date(lastMod) : null);
                res.resume();
            });
            req.on('error', () => resolve(null));
            req.setTimeout(5000, () => { req.destroy(); resolve(null); });
            req.end();
        });
    }

    private async fetchFromRepo(hostname: string, repoPath: string, repoName: string): Promise<Array<{ version: string; timestamp: string; source: string; date: Date }>> {
        const https = await import('https');
        const options = {
            hostname, path: repoPath, method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        };
        return new Promise((resolve, reject) => {
            const request = https.request(options, (res) => {
                if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                    // source code generated by GenAI of Kiro starts
                    res.resume(); // Drain original response to free socket
                    const redirectReq = https.get(res.headers.location, { headers: options.headers }, (rRes) => {
                        this.handleRepoResponse(rRes, repoName, resolve, reject);
                    });
                    redirectReq.on('error', reject);
                    redirectReq.setTimeout(15000, () => { redirectReq.destroy(); reject(new Error(`${repoName}: Redirect timeout`)); });
                    // source code generated by GenAI of Kiro ends
                    return;
                }
                this.handleRepoResponse(res, repoName, resolve, reject);
            });
            request.on('error', reject);
            request.setTimeout(15000, () => { request.destroy(); reject(new Error(`${repoName}: Request timeout`)); });
            request.end();
        });
    }

    private handleRepoResponse(res: any, repoName: string, resolve: (value: Array<{ version: string; timestamp: string; source: string; date: Date }>) => void, reject: (reason: Error) => void): void {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
            try {
                if (res.statusCode === 404) { resolve([]); return; }
                if (res.statusCode !== 200) { reject(new Error(`${repoName} HTTP ${res.statusCode}`)); return; }
                resolve(this.parseRepoHtml(data, repoName));
            } catch (e: any) { reject(new Error(`${repoName}: parse error: ${e.message}`)); }
        });
        res.on('error', (err: Error) => reject(err));
    }

    private parseRepoHtml(html: string, repoName: string): Array<{ version: string; timestamp: string; source: string; date: Date }> {
        const versions: Array<{ version: string; timestamp: string; source: string; date: Date }> = [];
        const htmlRegex = /<a\s+href="([^"]+\/)"\s*[^>]*>[^<]+<\/a>\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/g;
        let match;
        let foundHtmlDates = false;
        while ((match = htmlRegex.exec(html)) !== null) {
            const ver = match[1].replace(/\/$/, '');
            const dateStr = match[2];
            if (this.isVersionDir(ver)) {
                foundHtmlDates = true;
                versions.push({ version: ver, timestamp: dateStr, source: repoName, date: new Date(dateStr.replace(' ', 'T') + ':00Z') });
            }
        }
        if (!foundHtmlDates) {
            const linkRegex = /<a\s+href="([^"]+\/)"\s*[^>]*>[^<]+<\/a>/g;
            while ((match = linkRegex.exec(html)) !== null) {
                const ver = match[1].replace(/\/$/, '');
                if (this.isVersionDir(ver)) {
                    versions.push({ version: ver, timestamp: 'N/A', source: repoName, date: new Date(0) });
                }
            }
            if (versions.length === 0) {
                for (const line of html.split('\n')) {
                    const textMatch = line.match(/^\s*([^\s<>]+\/)\s+/);
                    if (textMatch) {
                        const ver = textMatch[1].replace(/\/$/, '');
                        if (this.isVersionDir(ver)) {
                            versions.push({ version: ver, timestamp: 'N/A', source: repoName, date: new Date(0) });
                        }
                    }
                }
            }
        }
        versions.sort((a, b) => b.date.getTime() - a.date.getTime());
        return versions;
    }

    private isVersionDir(name: string): boolean {
        if (!name || name === '..' || name === '.') { return false; }
        if (name.includes('.xml') || name.includes('.md5') || name.includes('.sha') || name.includes('.asc') || name.includes('.index') || name === 'maven-metadata') { return false; }
        return /^\d/.test(name);
    }
    // source code generated by GenAI of Kiro ends
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
