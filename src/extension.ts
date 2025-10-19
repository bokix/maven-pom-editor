import * as vscode from 'vscode';
import { PomEditorProvider } from './pomEditorProvider';
import { CacheManager } from './cacheManager';
import { MavenTaskProvider } from './mavenTaskProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Maven POM Editor extension is now active');

    // 创建缓存管理器实例
    const cacheManager = new CacheManager(context);

    // Register the custom editor provider
    const provider = new PomEditorProvider(context);
    const registration = vscode.window.registerCustomEditorProvider(
        'mavenPomEditor.editor',
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false
        }
    );

    context.subscriptions.push(registration);

    // 注册 Maven 任务提供者
    const taskProvider = new MavenTaskProvider();
    const taskProviderRegistration = vscode.tasks.registerTaskProvider(
        MavenTaskProvider.taskType,
        taskProvider
    );
    context.subscriptions.push(taskProviderRegistration);
    console.log('Maven Task Provider 已注册');

    // 监听 POM 文件保存事件，自动清除缓存
    const fileWatcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (document.fileName.endsWith('pom.xml')) {
            console.log(`[Extension] POM 文件已保存，清除缓存: ${document.fileName}`);
            await cacheManager.invalidate(document.uri.fsPath);
            vscode.window.showInformationMessage('POM 文件已更新，缓存已清除');
        }
    });
    context.subscriptions.push(fileWatcher);

    // 注册清除所有缓存的命令
    const clearCacheCommand = vscode.commands.registerCommand('mavenPomEditor.clearCache', async () => {
        await cacheManager.clearAll();
        vscode.window.showInformationMessage('已清除所有 Maven 依赖缓存');
    });
    context.subscriptions.push(clearCacheCommand);

    // 注册查看缓存统计信息的命令
    const showCacheStatsCommand = vscode.commands.registerCommand('mavenPomEditor.showCacheStats', async () => {
        const stats = await cacheManager.getStats();
        const message = `缓存统计:\n` +
            `• 内存缓存: ${stats.memoryCount} 项\n` +
            `• WorkspaceState: ${stats.workspaceStateCount} 项\n` +
            `• 文件缓存: ${stats.fileCount} 项`;
        vscode.window.showInformationMessage(message);
    });
    context.subscriptions.push(showCacheStatsCommand);

    console.log('Maven POM Editor 缓存管理已启用');
    
    // 启动后台预加载机制
    scheduleBackgroundPreload(context, cacheManager);
}

export function deactivate() {
    console.log('Maven POM Editor extension is now deactivated');
}

/**
 * 延迟启动后台预加载，避免阻塞扩展激活
 * @param context 扩展上下文
 * @param cacheManager 缓存管理器
 */
function scheduleBackgroundPreload(context: vscode.ExtensionContext, cacheManager: CacheManager): void {
    setTimeout(() => {
        preloadMavenData(context, cacheManager);
    }, 2000); // 延迟2秒，让 VS Code 完全启动
}

/**
 * 后台预加载 Maven 数据
 * @param context 扩展上下文
 * @param cacheManager 缓存管理器
 */
async function preloadMavenData(context: vscode.ExtensionContext, cacheManager: CacheManager): Promise<void> {
    try {
        console.log('[Extension] 开始后台预加载 Maven 数据...');
        
        // 检测工作区中的 POM 文件
        const pomFiles = await vscode.workspace.findFiles('**/pom.xml', '**/node_modules/**', 3);
        
        if (pomFiles.length === 0) {
            console.log('[Extension] 未找到 POM 文件，跳过预加载');
            return;
        }
        
        console.log(`[Extension] 找到 ${pomFiles.length} 个 POM 文件`);
        
        // 使用智能缓存预热
        await cacheManager.smartWarmup(context);
        
        console.log('[Extension] 后台预加载完成');
    } catch (error) {
        // 静默处理错误，不影响用户体验
        console.warn('[Extension] 后台预加载失败:', error);
    }
}
