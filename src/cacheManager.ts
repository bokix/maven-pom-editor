import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * 缓存管理器 - 基于 VS Code 官方扩展开发指南
 * 
 * 实现三层缓存策略：
 * 1. 内存缓存（L1）：最快，但会在扩展重启后丢失
 * 2. workspaceState（L2）：持久化，适合小数据（< 100KB）
 * 3. storageUri 文件系统（L3）：适合大数据（> 100KB）
 * 
 * 参考文档：https://code.visualstudio.com/api/references/vscode-api#ExtensionContext
 */
export class CacheManager {
    private context: vscode.ExtensionContext;
    private memoryCache: Map<string, CacheData>;
    
    // 缓存配置常量
    static readonly CACHE_VERSION = '1.0.0';
    static readonly MAX_CACHE_AGE_MS = 60 * 60 * 1000; // 1小时
    static readonly SMALL_DATA_THRESHOLD = 50 * 1024; // 50KB

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // L1: 内存缓存
        this.memoryCache = new Map();
    }

    /**
     * 获取缓存数据（自动选择最优的缓存层）
     * @param pomPath POM 文件路径
     * @param cacheKey 缓存键名（如 'dependencyTree' 或 'resolvedDependencies'）
     * @param forceRefresh 是否强制刷新
     * @returns 缓存的数据，如果不存在或已过期则返回 null
     */
    async get(pomPath: string, cacheKey: string, forceRefresh: boolean = false): Promise<any> {
        if (forceRefresh) {
            console.log(`[CacheManager] 强制刷新缓存: ${cacheKey} for ${pomPath}`);
            return null;
        }

        const key = this.generateCacheKey(pomPath, cacheKey);

        // L1: 检查内存缓存
        const memCached = this.memoryCache.get(key);
        if (memCached && await this.isCacheValid(memCached, pomPath)) {
            console.log(`[CacheManager] ✓ 从内存缓存获取: ${cacheKey}`);
            return memCached.data;
        }

        // L2: 检查 workspaceState（优先小数据）
        const wsKey = this.getWorkspaceStateKey(pomPath, cacheKey);
        const wsCached = this.context.workspaceState.get(wsKey) as CacheData | undefined;
        if (wsCached && await this.isCacheValid(wsCached, pomPath)) {
            console.log(`[CacheManager] ✓ 从 workspaceState 获取: ${cacheKey}`);
            // 回填到内存缓存
            this.memoryCache.set(key, wsCached);
            return wsCached.data;
        }

        // L3: 检查文件系统缓存（大数据）
        const fileCached = await this.getFromFileCache(pomPath, cacheKey);
        if (fileCached && await this.isCacheValid(fileCached, pomPath)) {
            console.log(`[CacheManager] ✓ 从文件缓存获取: ${cacheKey}`);
            // 回填到内存缓存
            this.memoryCache.set(key, fileCached);
            return fileCached.data;
        }

        console.log(`[CacheManager] ✗ 缓存未命中: ${cacheKey}`);
        return null;
    }

    /**
     * 设置缓存数据（自动选择最优的存储层）
     * @param pomPath POM 文件路径
     * @param cacheKey 缓存键名
     * @param data 要缓存的数据
     */
    async set(pomPath: string, cacheKey: string, data: any): Promise<void> {
        const key = this.generateCacheKey(pomPath, cacheKey);
        
        try {
            // 获取 POM 文件的修改时间
            const pomUri = vscode.Uri.file(pomPath);
            const pomStat = await vscode.workspace.fs.stat(pomUri);
            
            const cacheData: CacheData = {
                data,
                timestamp: Date.now(),
                pomMtime: pomStat.mtime,
                version: CacheManager.CACHE_VERSION
            };

            // L1: 始终写入内存缓存
            this.memoryCache.set(key, cacheData);
            console.log(`[CacheManager] ✓ 写入内存缓存: ${cacheKey}`);

            // 判断数据大小
            const dataSize = this.estimateDataSize(data);
            console.log(`[CacheManager] 数据大小: ${(dataSize / 1024).toFixed(2)} KB`);

            if (dataSize < CacheManager.SMALL_DATA_THRESHOLD) {
                // L2: 小数据写入 workspaceState
                const wsKey = this.getWorkspaceStateKey(pomPath, cacheKey);
                await this.context.workspaceState.update(wsKey, cacheData);
                console.log(`[CacheManager] ✓ 写入 workspaceState: ${cacheKey}`);
            } else {
                // L3: 大数据写入文件系统
                await this.setToFileCache(pomPath, cacheKey, cacheData);
                console.log(`[CacheManager] ✓ 写入文件缓存: ${cacheKey} (数据较大)`);
            }
        } catch (error) {
            console.error(`[CacheManager] ✗ 缓存写入失败: ${cacheKey}`, error);
            // 写入失败不影响正常功能，只记录错误
        }
    }

    /**
     * 清除指定 POM 文件的所有缓存
     * @param pomPath POM 文件路径
     */
    async invalidate(pomPath: string): Promise<void> {
        console.log(`[CacheManager] 清除缓存: ${pomPath}`);
        
        // 清除所有相关的缓存键
        const cacheKeys = ['dependencyTree', 'resolvedDependencies', 'effectivePom'];
        
        for (const cacheKey of cacheKeys) {
            // L1: 清除内存缓存
            const key = this.generateCacheKey(pomPath, cacheKey);
            this.memoryCache.delete(key);
            
            // L2: 清除 workspaceState
            const wsKey = this.getWorkspaceStateKey(pomPath, cacheKey);
            await this.context.workspaceState.update(wsKey, undefined);
            
            // L3: 清除文件缓存
            await this.deleteFileCache(pomPath, cacheKey);
        }
        
        console.log(`[CacheManager] ✓ 缓存已清除: ${pomPath}`);
    }

    /**
     * 清除所有缓存（用于手动清理）
     */
    async clearAll(): Promise<void> {
        console.log(`[CacheManager] 清除所有缓存`);
        
        // L1: 清除内存缓存
        this.memoryCache.clear();
        
        // L2: 清除 workspaceState（只能清除已知的键）
        const keys = this.context.workspaceState.keys();
        for (const key of keys) {
            if (key.startsWith('maven-cache-')) {
                await this.context.workspaceState.update(key, undefined);
            }
        }
        
        // L3: 清除文件缓存目录
        if (this.context.storageUri) {
            try {
                const files = await vscode.workspace.fs.readDirectory(this.context.storageUri);
                for (const [fileName] of files) {
                    if (fileName.startsWith('cache-')) {
                        const fileUri = vscode.Uri.joinPath(this.context.storageUri, fileName);
                        await vscode.workspace.fs.delete(fileUri);
                    }
                }
            } catch (error) {
                console.warn('[CacheManager] 清除文件缓存失败:', error);
            }
        }
        
        console.log(`[CacheManager] ✓ 所有缓存已清除`);
    }

    /**
     * 验证缓存是否有效
     */
    async isCacheValid(cached: CacheData, pomPath: string): Promise<boolean> {
        // 检查缓存版本
        if (cached.version !== CacheManager.CACHE_VERSION) {
            console.log(`[CacheManager] 缓存版本不匹配: ${cached.version} !== ${CacheManager.CACHE_VERSION}`);
            return false;
        }

        // 检查缓存是否过期
        const now = Date.now();
        if (now - cached.timestamp > CacheManager.MAX_CACHE_AGE_MS) {
            console.log(`[CacheManager] 缓存已过期: ${((now - cached.timestamp) / 1000 / 60).toFixed(1)} 分钟前`);
            return false;
        }

        // 检查 POM 文件是否被修改
        try {
            const pomUri = vscode.Uri.file(pomPath);
            const pomStat = await vscode.workspace.fs.stat(pomUri);
            if (pomStat.mtime > cached.pomMtime) {
                console.log(`[CacheManager] POM 文件已被修改`);
                return false;
            }
        } catch (error) {
            console.warn(`[CacheManager] 无法检查 POM 文件状态:`, error);
            return false;
        }

        return true;
    }

    /**
     * 生成缓存键（用于内存缓存）
     */
    generateCacheKey(pomPath: string, cacheKey: string): string {
        return `${pomPath}:${cacheKey}`;
    }

    /**
     * 生成 workspaceState 键（需要较短的键名）
     */
    getWorkspaceStateKey(pomPath: string, cacheKey: string): string {
        // 使用 MD5 哈希来缩短路径，避免键名过长
        const hash = crypto.createHash('md5').update(pomPath).digest('hex');
        return `maven-cache-${cacheKey}-${hash}`;
    }

    /**
     * 从文件系统缓存读取
     */
    async getFromFileCache(pomPath: string, cacheKey: string): Promise<CacheData | null> {
        if (!this.context.storageUri) {
            return null;
        }

        try {
            const cacheFilePath = await this.getCacheFilePath(pomPath, cacheKey);
            const content = await vscode.workspace.fs.readFile(cacheFilePath);
            const cached = JSON.parse(Buffer.from(content).toString('utf-8'));
            return cached;
        } catch (error) {
            // 文件不存在或读取失败
            return null;
        }
    }

    /**
     * 写入文件系统缓存
     */
    async setToFileCache(pomPath: string, cacheKey: string, cacheData: CacheData): Promise<void> {
        if (!this.context.storageUri) {
            console.warn('[CacheManager] storageUri 不可用，无法写入文件缓存');
            return;
        }

        try {
            // 确保存储目录存在
            await this.ensureStorageDirectory();
            const cacheFilePath = await this.getCacheFilePath(pomPath, cacheKey);
            const content = Buffer.from(JSON.stringify(cacheData), 'utf-8');
            await vscode.workspace.fs.writeFile(cacheFilePath, content);
        } catch (error) {
            console.error('[CacheManager] 写入文件缓存失败:', error);
            throw error;
        }
    }

    /**
     * 删除文件系统缓存
     */
    async deleteFileCache(pomPath: string, cacheKey: string): Promise<void> {
        if (!this.context.storageUri) {
            return;
        }

        try {
            const cacheFilePath = await this.getCacheFilePath(pomPath, cacheKey);
            await vscode.workspace.fs.delete(cacheFilePath);
        } catch (error) {
            // 文件可能不存在，忽略错误
        }
    }

    /**
     * 获取缓存文件路径
     */
    async getCacheFilePath(pomPath: string, cacheKey: string): Promise<vscode.Uri> {
        const hash = crypto.createHash('md5').update(pomPath).digest('hex');
        const fileName = `cache-${cacheKey}-${hash}.json`;
        return vscode.Uri.joinPath(this.context.storageUri!, fileName);
    }

    /**
     * 确保存储目录存在
     */
    async ensureStorageDirectory(): Promise<void> {
        if (!this.context.storageUri) {
            return;
        }

        try {
            await vscode.workspace.fs.stat(this.context.storageUri);
        } catch {
            // 目录不存在，创建它
            await vscode.workspace.fs.createDirectory(this.context.storageUri);
        }
    }

    /**
     * 估算数据大小（字节）
     */
    estimateDataSize(data: any): number {
        try {
            return JSON.stringify(data).length;
        } catch {
            return 0;
        }
    }

    /**
     * 缓存预热 - 预加载指定 POM 文件的数据
     * @param pomPath POM 文件路径
     */
    async warmupCache(pomPath: string): Promise<void> {
        console.log(`[CacheManager] 开始预热缓存: ${pomPath}`);
        
        const cacheKeys = ['effectivePom', 'dependencyTree', 'resolvedDependencies'];
        const warmupPromises = cacheKeys.map(async (key) => {
            try {
                const cached = await this.get(pomPath, key);
                if (!cached) {
                    console.log(`[CacheManager] 预热缓存: ${key}`);
                    // 这里可以触发后台数据获取
                    await this.preloadData(pomPath, key);
                }
            } catch (error) {
                console.warn(`[CacheManager] 预热缓存失败 ${key}:`, error);
            }
        });

        await Promise.allSettled(warmupPromises);
        console.log(`[CacheManager] 缓存预热完成: ${pomPath}`);
    }

    /**
     * 后台预加载数据
     * @param pomPath POM 文件路径
     * @param cacheKey 缓存键名
     */
    async preloadData(pomPath: string, cacheKey: string): Promise<void> {
        try {
            // 动态导入 MavenUtils 避免循环依赖
            const { MavenUtils } = await import('./mavenUtils');
            let data: any;

            switch (cacheKey) {
                case 'effectivePom':
                    data = await MavenUtils.getEffectivePom(pomPath);
                    break;
                case 'dependencyTree':
                    const treeText = await MavenUtils.getDependencyTree(pomPath);
                    data = MavenUtils.parseDependencyTree(treeText);
                    break;
                case 'resolvedDependencies':
                    const listText = await MavenUtils.getResolvedDependencies(pomPath);
                    data = MavenUtils.parseResolvedDependencies(listText);
                    break;
                default:
                    console.warn(`[CacheManager] 未知的缓存键: ${cacheKey}`);
                    return;
            }

            if (data) {
                await this.set(pomPath, cacheKey, data);
                console.log(`[CacheManager] 预加载完成: ${cacheKey}`);
            }
        } catch (error) {
            console.warn(`[CacheManager] 预加载失败 ${cacheKey}:`, error);
        }
    }

    /**
     * 智能缓存预热 - 根据工作区情况智能预加载
     * @param context 扩展上下文
     */
    async smartWarmup(context: vscode.ExtensionContext): Promise<void> {
        try {
            console.log('[CacheManager] 开始智能缓存预热...');
            
            // 查找工作区中的 POM 文件
            const pomFiles = await vscode.workspace.findFiles('**/pom.xml', null, 3);
            
            if (pomFiles.length > 0) {
                // 预热第一个 POM 文件
                const pomPath = pomFiles[0].fsPath;
                await this.warmupCache(pomPath);
                
                // 如果有多个 POM 文件，预热其他文件（延迟执行）
                if (pomFiles.length > 1) {
                    setTimeout(async () => {
                        for (let i = 1; i < Math.min(pomFiles.length, 3); i++) {
                            try {
                                await this.warmupCache(pomFiles[i].fsPath);
                            } catch (error) {
                                console.warn(`[CacheManager] 预热 POM 文件失败: ${pomFiles[i].fsPath}`, error);
                            }
                        }
                    }, 5000); // 延迟5秒执行其他文件的预热
                }
            }
            
            console.log('[CacheManager] 智能缓存预热完成');
        } catch (error) {
            console.warn('[CacheManager] 智能缓存预热失败:', error);
        }
    }

    /**
     * 获取缓存统计信息
     */
    async getStats(): Promise<CacheStats> {
        const stats: CacheStats = {
            memoryCount: this.memoryCache.size,
            workspaceStateCount: 0,
            fileCount: 0
        };

        // 统计 workspaceState
        const keys = this.context.workspaceState.keys();
        stats.workspaceStateCount = keys.filter(k => k.startsWith('maven-cache-')).length;

        // 统计文件缓存
        if (this.context.storageUri) {
            try {
                const files = await vscode.workspace.fs.readDirectory(this.context.storageUri);
                stats.fileCount = files.filter(([name]) => name.startsWith('cache-')).length;
            } catch {
                // 目录不存在
            }
        }

        return stats;
    }
}

/**
 * 缓存数据接口
 */
interface CacheData {
    data: any;
    timestamp: number;
    pomMtime: number;
    version: string;
}

/**
 * 缓存统计信息接口
 */
export interface CacheStats {
    memoryCount: number;
    workspaceStateCount: number;
    fileCount: number;
}
