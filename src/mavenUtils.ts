import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

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
        try {
            const workingDir = path.dirname(pomFilePath);
            const pomFileName = path.basename(pomFilePath);
            
            // 构建 Maven 命令
            const command = `mvn help:effective-pom -f "${pomFileName}" -Doutput=effective-pom.xml`;
            console.log(`执行 Maven 命令: ${command}`);
            console.log(`工作目录: ${workingDir}`);
            
            // 执行命令
            await this.executeWithRetry(command, {
                cwd: workingDir,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });
            
            // 读取生成的 effective-pom.xml 文件
            const effectivePomPath = path.join(workingDir, 'effective-pom.xml');
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
            throw new Error(this.analyzeError(error, '获取 Effective POM', true));
        }
    }

    /**
     * 获取依赖树
     * @param pomFilePath POM 文件路径
     * @returns 依赖树的文本内容
     */
    static async getDependencyTree(pomFilePath: string): Promise<string> {
        try {
            const workingDir = path.dirname(pomFilePath);
            const pomFileName = path.basename(pomFilePath);
            
            // 构建 Maven 命令
            const command = `mvn dependency:tree -Dverbose -f "${pomFileName}"`;
            console.log(`执行 Maven 命令: ${command}`);
            console.log(`工作目录: ${workingDir}`);
            
            // 执行命令
            const { stdout, stderr } = await this.executeWithRetry(command, {
                cwd: workingDir,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });
            
            return stdout;
        } catch (error: any) {
            console.error('获取依赖树失败:', error);
            throw new Error(this.analyzeError(error, '获取依赖树', true));
        }
    }

    /**
     * 获取扁平化的已解析依赖列表
     * @param pomFilePath POM 文件路径
     * @returns 依赖列表的文本内容
     */
    static async getResolvedDependencies(pomFilePath: string): Promise<string> {
        try {
            const workingDir = path.dirname(pomFilePath);
            const pomFileName = path.basename(pomFilePath);
            
            // 构建 Maven 命令
            const command = `mvn dependency:list -f "${pomFileName}"`;
            console.log(`执行 Maven 命令: ${command}`);
            console.log(`工作目录: ${workingDir}`);
            
            // 执行命令
            const { stdout, stderr } = await this.executeWithRetry(command, {
                cwd: workingDir,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });
            
            return stdout;
        } catch (error: any) {
            console.error('获取已解析依赖列表失败:', error);
            throw new Error(this.analyzeError(error, '获取已解析依赖列表', true));
        }
    }

    /**
     * 检查 Maven 是否可用
     * @returns 如果 Maven 可用返回 true，否则返回 false
     */
    static async isMavenAvailable(): Promise<boolean> {
        try {
            await execAsync('mvn --version', { timeout: 5000 });
            return true;
        } catch (error: any) {
            return false;
        }
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
            errorMessage.includes('mvn: 不是内部或外部命令')) {
            return '无法执行 Maven 命令。请确保已安装 Maven 并已添加到系统 PATH 中。';
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
            return `${operation}失败：网络连接问题。这可能是由于网络不稳定或Maven中央仓库访问受限导致的。请检查网络连接或稍后重试。如果问题持续存在，请考虑配置Maven镜像源。`;
        }
        
        // 检查是否是依赖解析错误
        if (errorMessage.includes('Could not resolve dependencies') ||
            errorMessage.includes('DependencyResolutionException') ||
            errorMessage.includes('BUILD FAILURE')) {
            return `${operation}失败：依赖解析错误。请检查 POM 文件中的依赖配置是否正确，或尝试清理本地Maven仓库缓存。`;
        }
        
        // 检查是否是权限错误
        if (errorMessage.includes('Permission denied') ||
            errorMessage.includes('Access denied') ||
            errorMessage.includes('权限不足')) {
            return `${operation}失败：权限不足。请检查文件访问权限。`;
        }
        
        // 默认错误信息
        return `${operation}失败：${errorMessage}`;
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
            
            // 清理树形字符，提取依赖信息
            content = content.replace(/^[+\-\\| ]+/, '').trim();
            
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
        const wrappedMatch = content.match(/^\((.+)\)$/);
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
