import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { t } from './i18n';

const execAsync = promisify(exec);

/**
 * Maven 命令执行工具类
 */
export class MavenUtils {
    /**
     * 获取 Effective POM
     * @param pomFilePath POM 文件路径
     * @returns Effective POM 的 XML 内容
     */
    static async getEffectivePom(pomFilePath: string): Promise<string> {
        let effectivePomPath: string;

        try {
            const multiModuleInfo = this.getMultiModuleInfo(pomFilePath);
            const mvn = this.getMvnCommand(pomFilePath);

            let workingDir: string;
            let command: string;
            let useMultiModule = false;

            if (multiModuleInfo) {
                useMultiModule = true;
                workingDir = multiModuleInfo.root;
                effectivePomPath = path.join(os.tmpdir(), `effective-pom-${Date.now()}.xml`);
                command = `"${mvn}" help:effective-pom -pl ":${multiModuleInfo.moduleName}" -am -Doutput="${effectivePomPath}"`;
                console.log(`多模块模式执行 Maven 命令: ${command}`);
                console.log(`工作目录: ${workingDir}`);
            } else {
                workingDir = path.dirname(pomFilePath);
                const pomFileName = path.basename(pomFilePath);
                effectivePomPath = path.join(workingDir, 'effective-pom.xml');
                command = `"${mvn}" help:effective-pom -f "${pomFileName}" -Doutput=effective-pom.xml`;
                console.log(`执行 Maven 命令: ${command}`);
                console.log(`工作目录: ${workingDir}`);
            }

            // 执行命令，多模块失败时回退到单模块方式
            try {
                await this.executeWithRetry(command, {
                    cwd: workingDir,
                    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
                });
            } catch (primaryError: any) {
                if (useMultiModule) {
                    console.log('多模块方式执行失败，回退到单模块方式...');
                    const fallbackWorkingDir = path.dirname(pomFilePath);
                    const pomFileName = path.basename(pomFilePath);
                    effectivePomPath = path.join(fallbackWorkingDir, 'effective-pom.xml');
                    const fallbackCommand = `"${mvn}" help:effective-pom -f "${pomFileName}" -Doutput=effective-pom.xml`;

                    await this.executeWithRetry(fallbackCommand, {
                        cwd: fallbackWorkingDir,
                        maxBuffer: 10 * 1024 * 1024
                    });
                } else {
                    throw primaryError;
                }
            }

            // 读取生成的 effective-pom.xml 文件
            const uri = vscode.Uri.file(effectivePomPath);
            const content = await vscode.workspace.fs.readFile(uri);
            const effectivePom = Buffer.from(content).toString('utf-8');

            // 删除临时文件
            try {
                await vscode.workspace.fs.delete(uri);
            } catch (error) {
                console.warn('无法删除临时文件:', effectivePomPath);
            }

            return effectivePom;
        } catch (error: any) {
            console.error('获取 Effective POM 失败:', error);
            throw new Error(this.analyzeError(error, t('progress.generateEffectivePom'), true));
        }
    }

    /**
     * 获取依赖树
     * @param pomFilePath POM 文件路径
     * @returns 依赖树的文本内容
     */
    static async getDependencyTree(pomFilePath: string): Promise<string> {
        try {
            const multiModuleInfo = this.getMultiModuleInfo(pomFilePath);
            const mvn = this.getMvnCommand(pomFilePath);

            let workingDir: string;
            let command: string;
            let useMultiModule = false;

            if (multiModuleInfo) {
                useMultiModule = true;
                workingDir = multiModuleInfo.root;
                command = `"${mvn}" dependency:tree -Dverbose -pl ":${multiModuleInfo.moduleName}" -am`;
                console.log(`多模块模式执行 Maven 命令: ${command}`);
                console.log(`工作目录: ${workingDir}`);
            } else {
                workingDir = path.dirname(pomFilePath);
                const pomFileName = path.basename(pomFilePath);
                command = `"${mvn}" dependency:tree -Dverbose -f "${pomFileName}"`;
                console.log(`执行 Maven 命令: ${command}`);
                console.log(`工作目录: ${workingDir}`);
            }

            // 执行命令，多模块失败时回退到单模块方式
            try {
                const { stdout } = await this.executeWithRetry(command, {
                    cwd: workingDir,
                    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
                });
                return stdout;
            } catch (primaryError: any) {
                if (useMultiModule) {
                    console.log('多模块方式执行失败，回退到单模块方式...');
                    const fallbackWorkingDir = path.dirname(pomFilePath);
                    const pomFileName = path.basename(pomFilePath);
                    const fallbackCommand = `"${mvn}" dependency:tree -Dverbose -f "${pomFileName}"`;
                    const { stdout } = await this.executeWithRetry(fallbackCommand, {
                        cwd: fallbackWorkingDir,
                        maxBuffer: 10 * 1024 * 1024
                    });
                    return stdout;
                } else {
                    throw primaryError;
                }
            }
        } catch (error: any) {
            console.error('获取依赖树失败:', error);
            throw new Error(this.analyzeError(error, t('progress.generateDependencyTree'), true));
        }
    }

    /**
     * 获取扁平化的已解析依赖列表
     * @param pomFilePath POM 文件路径
     * @returns 依赖列表的文本内容
     */
    static async getResolvedDependencies(pomFilePath: string): Promise<string> {
        try {
            const multiModuleInfo = this.getMultiModuleInfo(pomFilePath);
            const mvn = this.getMvnCommand(pomFilePath);

            let workingDir: string;
            let command: string;
            let useMultiModule = false;

            if (multiModuleInfo) {
                useMultiModule = true;
                workingDir = multiModuleInfo.root;
                command = `"${mvn}" dependency:list -pl ":${multiModuleInfo.moduleName}" -am`;
                console.log(`多模块模式执行 Maven 命令: ${command}`);
                console.log(`工作目录: ${workingDir}`);
            } else {
                workingDir = path.dirname(pomFilePath);
                const pomFileName = path.basename(pomFilePath);
                command = `"${mvn}" dependency:list -f "${pomFileName}"`;
                console.log(`执行 Maven 命令: ${command}`);
                console.log(`工作目录: ${workingDir}`);
            }

            // 执行命令，多模块失败时回退到单模块方式
            try {
                const { stdout } = await this.executeWithRetry(command, {
                    cwd: workingDir,
                    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
                });
                return stdout;
            } catch (primaryError: any) {
                if (useMultiModule) {
                    console.log('多模块方式执行失败，回退到单模块方式...');
                    const fallbackWorkingDir = path.dirname(pomFilePath);
                    const pomFileName = path.basename(pomFilePath);
                    const fallbackCommand = `"${mvn}" dependency:list -f "${pomFileName}"`;
                    const { stdout } = await this.executeWithRetry(fallbackCommand, {
                        cwd: fallbackWorkingDir,
                        maxBuffer: 10 * 1024 * 1024
                    });
                    return stdout;
                } else {
                    throw primaryError;
                }
            }
        } catch (error: any) {
            console.error('dependency:list 失败，尝试使用 dependency:tree 作为回退...');
            try {
                const treeText = await this.getDependencyTree(pomFilePath);
                const treeData = this.parseDependencyTree(treeText);
                const flatDeps = this.flattenDependencyTree(treeData);
                return this.formatDependencyListOutput(flatDeps);
            } catch (treeError: any) {
                console.error('获取已解析依赖列表失败:', error);
                throw new Error(this.analyzeError(error, t('progress.generateDependencyList'), true));
            }
        }
    }

    /**
     * 检查 Maven 是否可用
     * @param pomFilePath POM 文件路径（用于查找 Maven Wrapper）
     * @returns 如果 Maven 可用返回 true，否则返回 false
     */
    static async isMavenAvailable(pomFilePath: string): Promise<boolean> {
        try {
            const mvn = this.getMvnCommand(pomFilePath);
            await execAsync(`"${mvn}" --version`, { timeout: 5000 });
            return true;
        } catch (error: any) {
            return false;
        }
    }

    /**
     * 获取 Maven 命令（支持 Wrapper、配置项、系统 PATH、常见路径）
     * @param pomFilePath POM 文件路径
     * @returns Maven 可执行文件路径或命令名
     */
    static getMvnCommand(pomFilePath: string): string { // source code generated by GenAI of Kiro
        // 1. 用户配置优先
        const config = vscode.workspace.getConfiguration('mavenPomEditor');
        const configPath = config.get<string>('mavenPath')?.trim();
        if (configPath) {
            console.log(t('msg.usingConfigPath', configPath));
            return configPath;
        }

        // 2. 查找 Maven Wrapper
        const wrapperPath = this.findMavenWrapper(pomFilePath);
        if (wrapperPath) {
            console.log(t('msg.usingWrapper', wrapperPath));
            return wrapperPath;
        }

        // 3. 自动探测常见路径
        const commonPath = this.findCommonMavenPath();
        if (commonPath) {
            console.log(t('msg.usingSystemMaven', commonPath));
            return commonPath;
        }

        // 4. 回退到系统 PATH 中的 mvn
        return 'mvn';
    }

    /**
     * 在项目目录及父目录中查找 Maven Wrapper
     * @param pomFilePath POM 文件路径
     * @returns Wrapper 完整路径，未找到返回 null
     */
    private static findMavenWrapper(pomFilePath: string): string | null {
        const isWindows = process.platform === 'win32';
        const wrapperName = isWindows ? 'mvnw.cmd' : 'mvnw';

        let currentDir = path.dirname(pomFilePath);
        const root = path.parse(currentDir).root;

        while (currentDir !== root) {
            const wrapperPath = path.join(currentDir, wrapperName);
            if (fs.existsSync(wrapperPath)) {
                // Unix 下检查执行权限
                if (!isWindows) {
                    try {
                        fs.accessSync(wrapperPath, fs.constants.X_OK);
                    } catch {
                        // 没有执行权限，尝试添加
                        try {
                            fs.chmodSync(wrapperPath, 0o755);
                        } catch (chmodError) {
                            console.warn(t('error.wrapperNotExecutable', wrapperPath));
                            return null;
                        }
                    }
                }
                return wrapperPath;
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) { break; }
            currentDir = parentDir;
        }

        return null;
    }

    /**
     * 自动探测常见 Maven 安装路径
     * @returns 找到的 Maven 路径，未找到返回 null
     */
    private static findCommonMavenPath(): string | null {
        const isWindows = process.platform === 'win32';
        const candidates = isWindows
            ? [
                'C:\\Program Files\\Maven\\bin\\mvn.cmd',
                'C:\\apache-maven\\bin\\mvn.cmd',
            ]
            : [
                '/opt/homebrew/bin/mvn',
                '/usr/local/bin/mvn',
                '/usr/bin/mvn',
                `${process.env.HOME}/.sdkman/candidates/maven/current/bin/mvn`,
            ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    /**
     * 查找多模块项目的根目录
     * 从 POM 文件所在目录向上遍历，查找声明当前目录为子模块的最顶层父 POM
     * @param pomFilePath POM 文件路径
     * @returns 项目根目录路径，如果不是多模块项目则返回 null
     */
    static findProjectRoot(pomFilePath: string): string | null {
        let currentDir = path.dirname(pomFilePath);
        const root = path.parse(currentDir).root;
        let projectRoot: string | null = null;

        while (currentDir !== root) {
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) { break; }

            const parentPomPath = path.join(parentDir, 'pom.xml');
            if (fs.existsSync(parentPomPath)) {
                try {
                    const parentPomContent = fs.readFileSync(parentPomPath, 'utf-8');
                    const moduleName = path.basename(currentDir);
                    const moduleRegex = new RegExp(`<module>\\s*${this.escapeRegexForModule(moduleName)}\\s*</module>`);
                    if (moduleRegex.test(parentPomContent)) {
                        projectRoot = parentDir;
                        currentDir = parentDir;
                        continue;
                    }
                } catch (error) {
                    console.warn(`读取父 POM 失败: ${parentPomPath}`, error);
                }
            }
            break;
        }

        return projectRoot;
    }

    /**
     * 获取模块名称（artifactId）
     * @param pomFilePath POM 文件路径
     * @returns artifactId，解析失败返回 null
     */
    static getModuleName(pomFilePath: string): string | null {
        try {
            const pomContent = fs.readFileSync(pomFilePath, 'utf-8');
            // 先移除 <parent> 段，避免匹配到父项目的 artifactId
            const withoutParent = pomContent.replace(/<parent>[\s\S]*?<\/parent>/, '');
            const match = withoutParent.match(/<artifactId>([^<]+)<\/artifactId>/);
            return match ? match[1].trim() : null;
        } catch (error) {
            console.warn(`读取 POM 失败: ${pomFilePath}`, error);
            return null;
        }
    }

    /**
     * 获取多模块项目信息
     * @param pomFilePath POM 文件路径
     * @returns 包含 root 和 moduleName 的对象，如果不是多模块项目返回 null
     */
    static getMultiModuleInfo(pomFilePath: string): { root: string; moduleName: string } | null {
        const root = this.findProjectRoot(pomFilePath);
        if (!root) {
            return null;
        }
        const moduleName = this.getModuleName(pomFilePath);
        if (!moduleName) {
            return null;
        }
        return { root, moduleName };
    }

    private static escapeRegexForModule(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 执行带重试的 Maven 命令
     * @param command Maven 命令
     * @param options 执行选项
     * @param maxRetries 最大重试次数
     * @returns 命令执行结果
     */
    static async executeWithRetry(
        command: string,
        options: any,
        maxRetries: number = 3
    ): Promise<{ stdout: string; stderr: string }> {
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`执行 Maven 命令 (尝试 ${attempt}/${maxRetries}): ${command}`);
                const result = await execAsync(command, options);
                return {
                    stdout: result.stdout.toString(),
                    stderr: result.stderr.toString()
                };
            } catch (error: any) {
                lastError = error;
                const errorMessage = error.message || error.toString();

                // 检查是否是网络相关错误，如果是则重试
                const isNetworkError = errorMessage.includes('Remote host closed connection') ||
                    errorMessage.includes('Connection refused') ||
                    errorMessage.includes('timeout') ||
                    errorMessage.includes('Connection timed out') ||
                    errorMessage.includes('Could not transfer artifact') ||
                    errorMessage.includes('网络连接');

                if (isNetworkError && attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避，最大5秒
                    console.log(`网络错误，${delay}ms 后重试...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // 如果不是网络错误或已达到最大重试次数，直接抛出错误
                throw error;
            }
        }

        throw lastError;
    }

    /**
     * 分析错误类型并提供相应的错误信息
     * @param error 错误对象
     * @param operation 操作名称
     * @param showDetailedError 是否显示详细错误信息
     * @returns 格式化的错误信息
     */
    static analyzeError(error: any, operation: string, showDetailedError: boolean = true): string {
        const errorMessage = error.message || error.toString();

        // 检查是否是 Maven 未安装的错误
        if (errorMessage.includes('mvn: command not found') ||
            errorMessage.includes('mvn: not found') ||
            errorMessage.includes('mvn: 未找到命令') ||
            errorMessage.includes('mvn: 不是内部或外部命令') ||
            errorMessage.includes('No such file or directory') ||
            errorMessage.includes('Cannot find')) {
            return t('error.mavenNotFoundWithWrapper');
        }

        // 如果用户要求显示详细错误信息，则直接返回原始错误信息
        if (showDetailedError) {
            // 尝试提取更详细的错误信息
            let detailedMessage = errorMessage;

            // 如果错误对象包含stderr，优先显示stderr内容
            if (error.stderr && typeof error.stderr === 'string' && error.stderr.trim()) {
                detailedMessage = error.stderr.trim();
            }
            // 如果错误对象包含stdout，也包含进来
            else if (error.stdout && typeof error.stdout === 'string' && error.stdout.trim()) {
                detailedMessage = error.stdout.trim();
            }

            return `${operation}失败：\n\n${detailedMessage}`;
        }

        // 检查是否是网络连接错误
        if (errorMessage.includes('Remote host closed connection') ||
            errorMessage.includes('Connection refused') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('网络连接') ||
            errorMessage.includes('Connection timed out') ||
            errorMessage.includes('Could not transfer artifact')) {
            return t('error.network', operation);
        }

        // 检查是否是依赖解析错误
        if (errorMessage.includes('Could not resolve dependencies') ||
            errorMessage.includes('DependencyResolutionException') ||
            errorMessage.includes('BUILD FAILURE')) {
            return t('error.dependencyResolve', operation);
        }

        // 检查是否是权限错误
        if (errorMessage.includes('Permission denied') ||
            errorMessage.includes('Access denied') ||
            errorMessage.includes('权限不足')) {
            return t('error.permission', operation);
        }

        // 默认错误信息
        return t('error.generic', operation, errorMessage);
    }

    /**
     * 解析依赖树文本为结构化数据
     * @param treeText 依赖树文本
     * @returns 依赖树节点数组
     */
    static parseDependencyTree(treeText: string): DependencyNode[] {
        const lines = treeText.split('\n');
        const rootNodes: DependencyNode[] = [];
        const stack: { node: DependencyNode; indent: number }[] = [];

        for (const line of lines) {
            // 跳过非依赖行（[INFO]、空行等）
            if (!line.includes('[INFO]') || line.trim().length === 0) {
                continue;
            }

            // 移除 [INFO] 前缀
            let content = line.substring(line.indexOf('[INFO]') + 6).trimStart();

            // 跳过 Maven 插件信息行
            if (content.includes('---') || content.includes('maven-dependency-plugin') ||
                content.startsWith('Downloading') || content.startsWith('Downloaded')) {
                continue;
            }

            // 计算缩进级别（根据树形字符）
            const indent = this.calculateIndent(content);

            // source code generated by GenAI of Kiro starts
            // 清理树形字符，提取依赖信息
            // Maven tree chars: +- \- |  (plus, backslash, pipe, dash, space)
            content = content.replace(/^[+\\\-| ]+/, '').trim();
            // source code generated by GenAI of Kiro ends

            // 跳过空内容
            if (!content || content.length === 0) {
                continue;
            }

            // 解析依赖信息
            const node = this.parseDependencyNode(content);
            if (!node) {
                continue;
            }

            // 根节点
            if (indent === 0) {
                rootNodes.push(node);
                stack.length = 0;
                stack.push({ node, indent });
            } else {
                // 找到父节点
                while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
                    stack.pop();
                }

                if (stack.length > 0) {
                    const parent = stack[stack.length - 1].node;
                    if (!parent.children) {
                        parent.children = [];
                    }
                    parent.children.push(node);
                }

                stack.push({ node, indent });
            }
        }

        return rootNodes;
    }

    /**
     * 解析扁平化依赖列表文本为结构化数据
     * @param listText 依赖列表文本
     * @returns 依赖数组
     */
    static parseResolvedDependencies(listText: string): ResolvedDependency[] {
        const lines = listText.split('\n');
        const dependencies: ResolvedDependency[] = [];
        const seenDependencies = new Set<string>();

        for (const line of lines) {
            // 只处理包含 [INFO] 的行
            if (!line.includes('[INFO]')) {
                continue;
            }

            // 移除 [INFO] 前缀
            let content = line.substring(line.indexOf('[INFO]') + 6).trim();

            // 跳过非依赖行
            if (!content ||
                content.includes('---') ||
                content.includes('maven-dependency-plugin') ||
                content.startsWith('The following') ||
                content.startsWith('Downloading') ||
                content.startsWith('Downloaded') ||
                !content.includes(':')) {
                continue;
            }

            // 解析依赖信息
            const dependency = this.parseResolvedDependencyNode(content);
            if (!dependency) {
                continue;
            }

            // 去重：使用 groupId:artifactId 作为唯一标识
            const key = `${dependency.groupId}:${dependency.artifactId}`;
            if (!seenDependencies.has(key)) {
                seenDependencies.add(key);
                dependencies.push(dependency);
            }
        }

        return dependencies;
    }

    /**
     * 将依赖树扁平化为唯一依赖列表
     * @param nodes 依赖树节点数组
     * @returns 扁平化的唯一依赖数组
     */
    static flattenDependencyTree(nodes: DependencyNode[]): ResolvedDependency[] {
        const dependencies: ResolvedDependency[] = [];
        const seen = new Set<string>();

        const traverse = (node: DependencyNode) => {
            const key = `${node.groupId}:${node.artifactId}`;
            if (!seen.has(key)) {
                seen.add(key);
                dependencies.push({
                    groupId: node.groupId,
                    artifactId: node.artifactId,
                    type: node.type,
                    version: node.version,
                    scope: node.scope,
                    classifier: node.classifier
                });
            }
            if (node.children) {
                for (const child of node.children) {
                    traverse(child);
                }
            }
        };

        for (const node of nodes) {
            traverse(node);
        }

        return dependencies;
    }

    /**
     * 将依赖数组格式化为 dependency:list 输出格式
     * @param dependencies 依赖数组
     * @returns 模拟的 dependency:list 输出文本
     */
    static formatDependencyListOutput(dependencies: ResolvedDependency[]): string {
        const lines: string[] = [
            '[INFO] --- maven-dependency-plugin:3.6.0:list (default-cli) @ project ---',
            '[INFO] ',
            '[INFO] The following files have been resolved:',
            '[INFO] '
        ];

        for (const dep of dependencies) {
            let line = `[INFO]    ${dep.groupId}:${dep.artifactId}:${dep.type}`;
            if (dep.classifier) {
                line += `:${dep.classifier}`;
            }
            line += `:${dep.version}`;
            if (dep.scope) {
                line += `:${dep.scope}`;
            }
            lines.push(line);
        }

        lines.push('[INFO] ');
        lines.push('[INFO] ------------------------------------------------------------------------');
        lines.push('[INFO] BUILD SUCCESS');
        lines.push('[INFO] ------------------------------------------------------------------------');

        return lines.join('\n');
    }

    /**
     * 计算依赖树行的缩进级别
     * @param line 依赖树行
     * @returns 缩进级别
     */
    static calculateIndent(line: string): number {
        let indent = 0;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === ' ') {
                indent++;
            } else if (char === '|' || char === '+' || char === '\\' || char === '-') {
                // 树形字符
                continue;
            } else {
                break;
            }
        }

        // 每3个字符算一级缩进
        return Math.floor(indent / 3);
    }

    /**
     * 解析单个依赖节点
     * @param content 依赖信息文本
     * @returns 依赖节点或 null
     */
    static parseDependencyNode(content: string): DependencyNode | null {
        // 检查是否包含省略信息（如 "- omitted for conflict with 1.2"）
        let omittedReason: string | undefined;
        let cleanContent = content;

        // Maven verbose 模式下，被省略的依赖会被括号包裹，格式如：
        // (groupId:artifactId:type:version:scope - omitted for duplicate)
        // (groupId:artifactId:type:version:scope - omitted for conflict with X.X)
        // 先检查是否整体被括号包裹
        const wrappedMatch = content.match(/^\\((.+)\\)$/);
        if (wrappedMatch) {
            content = wrappedMatch[1]; // 移除外层括号
        }

        // 匹配各种省略原因
        const omittedPatterns = [
            { pattern: / - omitted for conflict with ([^)]+)$/, reason: 'conflict' },
            { pattern: / - omitted for duplicate$/, reason: 'duplicate' },
            { pattern: / - omitted for cycle$/, reason: 'cycle' },
            { pattern: / - version managed from ([^)]+)$/, reason: 'managed' }
        ];

        for (const { pattern, reason } of omittedPatterns) {
            const match = content.match(pattern);
            if (match) {
                omittedReason = reason;
                // 移除省略信息，保留依赖坐标
                cleanContent = content.replace(pattern, '').trim();
                break;
            }
        }

        // 如果没有匹配到省略信息，使用原始内容
        if (!omittedReason) {
            cleanContent = content;
        }

        // 依赖格式：groupId:artifactId:type:version:scope
        // 或者：groupId:artifactId:type:classifier:version:scope
        const parts = cleanContent.split(':');
        if (parts.length < 4) {
            return null;
        }

        let groupId: string;
        let artifactId: string;
        let type: string;
        let version: string;
        let scope: string | undefined;
        let classifier: string | undefined;

        if (parts.length === 4) {
            // groupId:artifactId:type:version
            [groupId, artifactId, type, version] = parts;
        } else if (parts.length === 5) {
            // groupId:artifactId:type:version:scope
            [groupId, artifactId, type, version, scope] = parts;
        } else {
            // groupId:artifactId:type:classifier:version:scope
            [groupId, artifactId, type, classifier, version, scope] = parts;
        }

        return {
            groupId: groupId.trim(),
            artifactId: artifactId.trim(),
            type: type.trim(),
            version: version.trim(),
            scope: scope?.trim(),
            classifier: classifier?.trim(),
            children: [],
            omittedReason
        };
    }

    /**
     * 解析单个扁平化依赖节点
     * @param content 依赖信息文本
     * @returns 依赖节点或 null
     */
    static parseResolvedDependencyNode(content: string): ResolvedDependency | null {
        // 依赖格式：groupId:artifactId:type:version:scope
        // 或者：groupId:artifactId:type:classifier:version:scope
        const parts = content.split(':');
        if (parts.length < 4) {
            return null;
        }

        let groupId: string;
        let artifactId: string;
        let type: string;
        let version: string;
        let scope: string | undefined;
        let classifier: string | undefined;

        if (parts.length === 4) {
            // groupId:artifactId:type:version
            [groupId, artifactId, type, version] = parts;
        } else if (parts.length === 5) {
            // groupId:artifactId:type:version:scope
            [groupId, artifactId, type, version, scope] = parts;
        } else {
            // groupId:artifactId:type:classifier:version:scope
            [groupId, artifactId, type, classifier, version, scope] = parts;
        }

        return {
            groupId: groupId.trim(),
            artifactId: artifactId.trim(),
            type: type.trim(),
            version: version.trim(),
            scope: scope?.trim(),
            classifier: classifier?.trim()
        };
    }
}

/**
 * 依赖树节点接口
 */
export interface DependencyNode {
    groupId: string;
    artifactId: string;
    type: string;
    version: string;
    scope?: string;
    classifier?: string;
    children: DependencyNode[];
    omittedReason?: string;
}

/**
 * 已解析依赖接口
 */
export interface ResolvedDependency {
    groupId: string;
    artifactId: string;
    type: string;
    version: string;
    scope?: string;
    classifier?: string;
}
