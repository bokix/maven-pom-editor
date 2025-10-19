import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Maven 任务提供者
 * 集成 VS Code 任务系统，提供常用 Maven 命令
 */
export class MavenTaskProvider implements vscode.TaskProvider {
    static readonly taskType = 'maven';
    
    private tasks: vscode.Task[] | undefined;

    constructor() {
        // 任务将在 provideTasks 中动态生成
    }

    /**
     * 提供可用的 Maven 任务列表
     */
    public async provideTasks(): Promise<vscode.Task[]> {
        return this.getTasks();
    }

    /**
     * 解析任务定义
     */
    public resolveTask(task: vscode.Task): vscode.Task | undefined {
        const definition: MavenTaskDefinition = task.definition as MavenTaskDefinition;
        
        if (definition.type === MavenTaskProvider.taskType) {
            // 返回完整配置的任务
            return this.createTask(definition.goal, definition);
        }
        
        return undefined;
    }

    /**
     * 获取所有预定义的 Maven 任务
     */
    private async getTasks(): Promise<vscode.Task[]> {
        if (this.tasks !== undefined) {
            return this.tasks;
        }

        this.tasks = [];
        
        // 查找工作区中的 POM 文件
        const pomFiles = await vscode.workspace.findFiles('**/pom.xml', '**/node_modules/**');
        
        if (pomFiles.length === 0) {
            return this.tasks;
        }

        // 为每个 POM 文件创建任务
        for (const pomFile of pomFiles) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(pomFile);
            if (!workspaceFolder) {
                continue;
            }

            // 常用 Maven 目标
            const goals = [
                { name: 'clean', description: '清理项目' },
                { name: 'compile', description: '编译项目' },
                { name: 'test', description: '运行测试' },
                { name: 'package', description: '打包项目' },
                { name: 'install', description: '安装到本地仓库' },
                { name: 'verify', description: '验证项目' },
                { name: 'clean install', description: '清理并安装' },
                { name: 'clean package', description: '清理并打包' },
                { name: 'dependency:tree', description: '显示依赖树' },
                { name: 'dependency:list', description: '列出依赖' }
            ];

            for (const goal of goals) {
                const task = this.createTask(goal.name, {
                    type: MavenTaskProvider.taskType,
                    goal: goal.name,
                    pomFile: pomFile.fsPath,
                    description: goal.description
                }, workspaceFolder);
                
                this.tasks.push(task);
            }
        }

        return this.tasks;
    }

    /**
     * 创建 Maven 任务
     */
    private createTask(
        goal: string, 
        definition: MavenTaskDefinition,
        workspaceFolder?: vscode.WorkspaceFolder
    ): vscode.Task {
        const scope = workspaceFolder || vscode.TaskScope.Workspace;
        
        // 构建任务名称
        const taskName = definition.pomFile 
            ? `Maven: ${goal} (${path.basename(path.dirname(definition.pomFile))})`
            : `Maven: ${goal}`;

        // 构建 Maven 命令
        const args = [goal];
        if (definition.pomFile) {
            args.push('-f', definition.pomFile);
        }

        // 创建 Shell 执行配置
        const execution = new vscode.ShellExecution('mvn', args, {
            cwd: definition.pomFile ? path.dirname(definition.pomFile) : undefined
        });

        // 创建任务
        const task = new vscode.Task(
            definition,
            scope,
            taskName,
            MavenTaskProvider.taskType,
            execution,
            ['$maven']  // 使用 Maven 问题匹配器
        );

        // 设置任务属性
        task.group = this.getTaskGroup(goal);
        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            panel: vscode.TaskPanelKind.Dedicated,
            clear: true
        };

        return task;
    }

    /**
     * 根据 Maven 目标确定任务组
     */
    private getTaskGroup(goal: string): vscode.TaskGroup | undefined {
        if (goal.includes('clean')) {
            return vscode.TaskGroup.Clean;
        } else if (goal.includes('compile')) {
            return vscode.TaskGroup.Build;
        } else if (goal.includes('test')) {
            return vscode.TaskGroup.Test;
        }
        return undefined;
    }
}

/**
 * Maven 任务定义接口
 */
interface MavenTaskDefinition extends vscode.TaskDefinition {
    type: 'maven';
    goal: string;
    pomFile?: string;
    description?: string;
}