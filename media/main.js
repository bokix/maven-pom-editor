(function() {
    const vscode = vscodeApi;

    // Get references to DOM elements
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    let effectivePomEditor = null;
    let effectivePomLoaded = false;
    let dependencyTreeLoaded = false;
    let dependencyTreeData = null;
    let resolvedDependenciesLoaded = false;
    let resolvedDependenciesData = null;
    let expandedNodes = new Set();
    let searchQuery = '';
    let showGroupId = true;
    let selectedTreeNodeIds = new Set();
    let selectedResolvedItemId = null;
    let filteredArtifactId = null; // 用于右栏点击后过滤左栏树
    let isProcessingClick = false; // 防止快速连续点击
    let eventListenersAttached = false; // 防止重复绑定事件监听器
    let contextMenuTarget = null; // 右键菜单当前目标节点信息

    // i18n
    const userLocale = typeof locale !== 'undefined' ? locale : 'en';
    const isZh = userLocale.startsWith('zh');

    function i18n(key) {
        const dict = isZh ? zhDict : enDict;
        return dict[key] || key;
    }

    const enDict = {
        'loadingEffectivePom': 'Loading Effective POM...',
        'loadingHint': 'This may take a few seconds',
        'loadingDependencyInfo': 'Loading dependency information...',
        'loadingDependencyList': 'Loading dependency list...',
        'waitingForTree': 'Waiting for dependency tree...',
        'errorEffectivePom': 'Failed to get Effective POM',
        'errorDependencyTree': 'Failed to get dependency tree',
        'errorResolvedList': 'Failed to get dependency list',
        'retry': 'Retry',
        'searchPlaceholder': 'Search dependencies (groupId:artifactId or keyword)...',
        'clearSearch': 'Clear search',
        'hideGroupId': 'Hide GroupId',
        'showGroupId': 'Show GroupId',
        'expandAll': 'Expand All',
        'collapseAll': 'Collapse All',
        'refresh': 'Refresh',
        'loading': 'Loading...',
        'noDependencies': 'No dependencies found',
        'noMatches': 'No matching dependencies',
        'moreNodes': '... more nodes (click refresh to view all)',
        'locateInEditor': 'Locate in Editor',
        'omittedConflict': 'conflict',
        'omittedDuplicate': 'duplicate',
        'omittedCycle': 'cycle',
        'omittedManaged': 'managed',
        'panelDependencyHierarchy': 'Dependency Hierarchy',
        'panelResolvedDependencies': 'Resolved Dependencies',
    };

    const zhDict = {
        'loadingEffectivePom': '正在获取 Effective POM...',
        'loadingHint': '这可能需要几秒钟时间',
        'loadingDependencyInfo': '正在获取依赖信息...',
        'loadingDependencyList': '正在获取依赖列表...',
        'waitingForTree': '等待依赖树加载完成...',
        'errorEffectivePom': '无法获取 Effective POM',
        'errorDependencyTree': '无法获取依赖树',
        'errorResolvedList': '无法获取依赖列表',
        'retry': '重试',
        'searchPlaceholder': '搜索依赖 (groupId:artifactId 或关键字)...',
        'clearSearch': '清除搜索',
        'hideGroupId': '隐藏 GroupId',
        'showGroupId': '显示 GroupId',
        'expandAll': '展开所有',
        'collapseAll': '折叠所有',
        'refresh': '刷新',
        'loading': '加载中...',
        'noDependencies': '没有找到依赖',
        'noMatches': '没有匹配的依赖',
        'moreNodes': '... 更多节点 (点击刷新查看全部)',
        'locateInEditor': '在编辑器中定位',
        'omittedConflict': '冲突',
        'omittedDuplicate': '重复',
        'omittedCycle': '循环',
        'omittedManaged': '托管',
        'panelDependencyHierarchy': '依赖层级',
        'panelResolvedDependencies': '已解析依赖',
    };

    // Setup tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    function switchTab(tabId) {
        // Update button states
        tabButtons.forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update content visibility
        tabContents.forEach(content => {
            if (content.id === tabId) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        // Handle tab-specific logic
        if (tabId === 'effective-pom') {
            // Load effective POM if not already loaded
            if (!effectivePomLoaded) {
                loadEffectivePom();
            } else if (effectivePomEditor) {
                setTimeout(() => {
                    effectivePomEditor.layout();
                }, 0);
            }
        } else if (tabId === 'dependency-hierarchy') {
            // 先渲染左栏，再加载右栏
            if (!dependencyTreeLoaded) {
                loadDependencyTree();
            } else {
                // 如果左栏已加载，立即渲染左栏
                renderDependencyTree();
            }
            // 延迟加载右栏，确保左栏先显示
            if (!resolvedDependenciesLoaded) {
                setTimeout(() => {
                    loadResolvedDependencies();
                }, 100);
            }
        }
    }

    function loadEffectivePom() {
        const effectivePomContent = document.getElementById('effective-pom');

        // Show loading message
        effectivePomContent.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>${i18n('loadingEffectivePom')}</p>
                <p class="loading-hint">${i18n('loadingHint')}</p>
            </div>
        `;

        // Request effective POM from extension
        vscode.postMessage({
            type: 'getEffectivePom'
        });
    }

    function initializeEffectivePomEditor(content) {
        const effectivePomContent = document.getElementById('effective-pom');

        // Create editor container
        effectivePomContent.innerHTML = '<div id="effective-pom-editor-container"></div>';
        const effectivePomEditorContainer = document.getElementById('effective-pom-editor-container');

        if (!effectivePomEditorContainer) {
            console.error('Effective POM editor container not found');
            return;
        }

        // Detect VSCode theme
        const isDarkTheme = document.body.classList.contains('vscode-dark') ||
            document.body.classList.contains('vscode-high-contrast');

        // Create read-only Monaco Editor for effective POM
        effectivePomEditor = monaco.editor.create(effectivePomEditorContainer, {
            value: content,
            language: 'xml',
            theme: isDarkTheme ? 'vs-dark' : 'vs',
            automaticLayout: true,
            readOnly: true, // 只读模式
            minimap: {
                enabled: true
            },
            scrollBeyondLastLine: false,
            fontSize: 14,
            tabSize: 4,
            wordWrap: 'off',
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            folding: true,
            links: true,
            colorDecorators: true
        });

        effectivePomLoaded = true;

        vscode.postMessage({
            type: 'log',
            content: 'Effective POM Editor initialized successfully'
        });
    }

    function showEffectivePomError(errorMessage) {
        const effectivePomContent = document.getElementById('effective-pom');
        effectivePomContent.innerHTML = `
            <div class="error-container">
                <div class="error-icon">⚠️</div>
                <p class="error-title">${i18n('errorEffectivePom')}</p>
                <p class="error-message">${errorMessage}</p>
                <button class="retry-button" onclick="window.retryLoadEffectivePom()">${i18n('retry')}</button>
            </div>
        `;
    }

    // Expose retry function globally
    window.retryLoadEffectivePom = function () {
        effectivePomLoaded = false;
        loadEffectivePom();
    };

    function getToolbarHtml() {
        return `
            <div class="dependency-toolbar">
                <div class="search-container">
                    <input type="text" id="dependency-search" class="search-input" placeholder="${i18n('searchPlaceholder')}" value="${escapeHtml(searchQuery)}" />
                    <button class="clear-search-btn" id="clear-search" title="${i18n('clearSearch')}">✕</button>
                </div>
                <div class="toolbar-buttons">
                    <button class="toolbar-btn" id="toggle-groupid" title="${showGroupId ? i18n('hideGroupId') : i18n('showGroupId')}">
                        ${showGroupId ? i18n('hideGroupId') : i18n('showGroupId')}
                    </button>
                    <button class="toolbar-btn" id="expand-all" title="${i18n('expandAll')}">${i18n('expandAll')}</button>
                    <button class="toolbar-btn" id="collapse-all" title="${i18n('collapseAll')}">${i18n('collapseAll')}</button>
                    <button class="toolbar-btn" id="refresh-tree" title="${i18n('refresh')}">${i18n('refresh')}</button>
                </div>
            </div>
        `;
    }

    function getLeftPanelHtml() {
        return `
            <div class="left-panel">
                <div class="panel-header">
                    <span class="panel-title">${i18n('panelDependencyHierarchy')}</span>
                </div>
                <div id="dependency-tree-view">
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <p>${i18n('loadingDependencyInfo')}</p>
                        <p class="loading-hint">${i18n('loadingHint')}</p>
                    </div>
                </div>
            </div>
        `;
    }

    function getRightPanelHtml() {
        return `
            <div class="right-panel">
                <div class="panel-header">
                    <span class="panel-title">${i18n('panelResolvedDependencies')}</span>
                    ${resolvedDependenciesData ? `<span class="dependency-count">${getFilteredResolvedCount()} / ${resolvedDependenciesData.length}</span>` : ''}
                </div>
                <div id="resolved-dependencies-view">
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <p>${i18n('waitingForTree')}</p>
                    </div>
                </div>
            </div>
        `;
    }

    function getDualPanelHtml() {
        return `
            <div class="dual-panel-container">
                ${getLeftPanelHtml()}
                <div class="panel-divider"></div>
                ${getRightPanelHtml()}
            </div>
        `;
    }

    function loadDependencyTree(forceRefresh = false) {
        const dependencyHierarchyContent = document.getElementById('dependency-hierarchy');

        // 先渲染左栏的加载状态，右栏显示占位符
        dependencyHierarchyContent.innerHTML = `
            <div class="dependency-tree-container">
                ${getToolbarHtml()}
                ${getDualPanelHtml()}
            </div>
        `;

        // 先绑定事件监听器
        eventListenersAttached = false;
        attachDependencyTreeListeners();
        eventListenersAttached = true;

        // Request dependency tree from extension
        vscode.postMessage({
            type: 'getDependencyTree',
            forceRefresh: forceRefresh
        });
    }

    function loadResolvedDependencies(forceRefresh = false) {
        // 在右栏显示加载状态
        const resolvedView = document.getElementById('resolved-dependencies-view');
        if (resolvedView) {
            resolvedView.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <p>${i18n('loadingDependencyList')}</p>
                    <p class="loading-hint">${i18n('loadingHint')}</p>
                </div>
            `;
        }

        // Request resolved dependencies from extension
        vscode.postMessage({
            type: 'getResolvedDependencies',
            forceRefresh: forceRefresh
        });
    }

    function initializeDependencyTree(data) {
        dependencyTreeData = data;
        dependencyTreeLoaded = true;

        // 调试：检查数据中是否包含 omittedReason
        console.log('依赖树数据加载完成，检查 omittedReason 字段:', data);
        if (data && data.length > 0 && data[0].children) {
            const firstChild = data[0].children[0];
            if (firstChild) {
                console.log('第一个子节点示例:', firstChild);
                console.log('是否包含 omittedReason:', firstChild.omittedReason);
            }
        }

        // 只更新左栏，不等待右栏数据
        updateLeftPanel();

        // 如果右栏还没有加载，现在开始加载
        if (!resolvedDependenciesLoaded) {
            loadResolvedDependencies();
        }
    }

    function initializeResolvedDependencies(data) {
        resolvedDependenciesData = data;
        resolvedDependenciesLoaded = true;

        // 只更新右栏
        updateRightPanel();
    }

    function updateLeftPanel() {
        const leftPanelView = document.getElementById('dependency-tree-view');
        if (leftPanelView) {
            leftPanelView.innerHTML = dependencyTreeData ? renderTreeNodes(dependencyTreeData, searchQuery) : `<div class="loading-container"><div class="loading-spinner"></div><p>${i18n('loading')}</p></div>`;
        }
    }

    function updateRightPanel() {
        const rightPanelView = document.getElementById('resolved-dependencies-view');
        if (rightPanelView) {
            rightPanelView.innerHTML = resolvedDependenciesData ? renderResolvedList(resolvedDependenciesData, searchQuery) : `<div class="loading-container"><div class="loading-spinner"></div><p>${i18n('loading')}</p></div>`;
        }

        // 更新右栏标题中的依赖数量
        const rightPanelHeader = document.querySelector('.right-panel .panel-header');
        if (rightPanelHeader && resolvedDependenciesData) {
            const countSpan = rightPanelHeader.querySelector('.dependency-count');
            if (countSpan) {
                countSpan.textContent = `${getFilteredResolvedCount()} / ${resolvedDependenciesData.length}`;
            } else {
                const titleSpan = rightPanelHeader.querySelector('.panel-title');
                if (titleSpan) {
                    titleSpan.insertAdjacentHTML('afterend', ` <span class="dependency-count">${getFilteredResolvedCount()} / ${resolvedDependenciesData.length}</span>`);
                }
            }
        }
    }

    function renderDependencyTree() {
        const dependencyHierarchyContent = document.getElementById('dependency-hierarchy');

        // Create container with search and dual panel layout
        dependencyHierarchyContent.innerHTML = `
            <div class="dependency-tree-container">
                ${getToolbarHtml()}
                <div class="dual-panel-container">
                    <div class="left-panel">
                        <div class="panel-header">
                            <span class="panel-title">${i18n('panelDependencyHierarchy')}</span>
                        </div>
                        <div id="dependency-tree-view">
                            ${dependencyTreeData ? renderTreeNodes(dependencyTreeData, searchQuery) : `<div class="loading-container"><div class="loading-spinner"></div><p>${i18n('loading')}</p></div>`}
                        </div>
                    </div>
                    <div class="panel-divider"></div>
                    <div class="right-panel">
                        <div class="panel-header">
                            <span class="panel-title">${i18n('panelResolvedDependencies')}</span>
                            ${resolvedDependenciesData ? `<span class="dependency-count">${getFilteredResolvedCount()} / ${resolvedDependenciesData.length}</span>` : ''}
                        </div>
                        <div id="resolved-dependencies-view">
                            ${resolvedDependenciesData ? renderResolvedList(resolvedDependenciesData, searchQuery) : `<div class="loading-container"><div class="loading-spinner"></div><p>${i18n('loading')}</p></div>`}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Attach event listeners and reset flag
        eventListenersAttached = false;
        attachDependencyTreeListeners();
        eventListenersAttached = true;
    }

    function getFilteredResolvedCount() {
        if (!resolvedDependenciesData || !searchQuery) {
            return resolvedDependenciesData ? resolvedDependenciesData.length : 0;
        }
        return resolvedDependenciesData.filter(dep => dependencyMatchesSearch(dep, searchQuery)).length;
    }

    function renderTreeNodes(nodes, query) {
        if (!nodes || nodes.length === 0) {
            return `<div class="empty-tree">${i18n('noDependencies')}</div>`;
        }

        let html = '<ul class="tree-root">';
        let nodeCount = 0;
        const maxNodes = 1000; // 限制渲染的节点数量，防止性能问题

        for (const node of nodes) {
            const nodeHtml = renderTreeNode(node, query, 0);
            if (nodeHtml) {
                html += nodeHtml;
                nodeCount++;
                if (nodeCount >= maxNodes) {
                    html += `<li class="tree-node"><div class="node-content"><span class="node-info">${i18n('moreNodes')}</span></div></li>`;
                    break;
                }
            }
        }
        html += '</ul>';

        // 如果过滤后没有任何节点，显示提示
        if (html === '<ul class="tree-root"></ul>') {
            return `<div class="empty-tree">${i18n('noDependencies')}</div>`;
        }

        return html;
    }

    function renderTreeNode(node, query, level) {
        const nodeId = getNodeId(node);
        const isExpanded = expandedNodes.has(nodeId);
        const hasChildren = node.children && node.children.length > 0;
        const matchesSearch = nodeMatchesSearch(node, query);
        const childrenMatchSearch = hasChildren && childrenMatchQuery(node.children, query);
        const isSelected = selectedTreeNodeIds.has(nodeId);

        // 如果有 filteredArtifactId，只显示包含该 artifact 的路径
        if (filteredArtifactId) {
            const matchesFilter = node.artifactId === filteredArtifactId;
            const childrenMatchFilter = hasChildren && childrenContainArtifact(node.children, filteredArtifactId);

            if (!matchesFilter && !childrenMatchFilter) {
                return '';
            }
        }

        // Hide node if it doesn't match search and no children match
        if (query && !matchesSearch && !childrenMatchSearch) {
            return '';
        }

        const expandIcon = hasChildren ? (isExpanded ? '▼' : '▶') : '○';
        const scopeClass = node.scope ? `scope-${node.scope}` : '';
        const highlightClass = matchesSearch ? 'search-match' : '';
        const selectedClass = isSelected ? 'selected' : '';

        // 根据 omittedReason 添加特殊样式类
        let omittedClass = '';
        let omittedLabel = '';
        if (node.omittedReason) {
            omittedClass = `omitted-${node.omittedReason}`;
            omittedLabel = `<span class="omitted-label">${i18n('omitted' + node.omittedReason.charAt(0).toUpperCase() + node.omittedReason.slice(1)) || node.omittedReason}</span>`;
            // 调试输出
            if (level === 1) { // 只输出第一层子节点，避免日志过多
                console.log(`发现省略的依赖: ${node.artifactId}, 原因: ${node.omittedReason}, CSS类: ${omittedClass}`);
            }
        }

        let html = `
            <li class="tree-node ${highlightClass} ${selectedClass} ${omittedClass}" data-node-id="${nodeId}" data-level="${level}" data-artifact-id="${escapeHtml(node.artifactId)}" data-group-id="${escapeHtml(node.groupId)}">
                <div class="node-content">
                    <span class="expand-icon ${hasChildren ? 'has-children' : ''}" data-node-id="${nodeId}">
                        ${expandIcon}
                    </span>
                    <span class="node-info">
                        <span class="node-artifact">
                            ${showGroupId ? `${escapeHtml(node.groupId)}:` : ''}<strong>${escapeHtml(node.artifactId)}</strong>
                        </span>
                        <span class="node-version">${escapeHtml(node.version)}</span>
                        ${node.scope ? `<span class="node-scope ${scopeClass}">${escapeHtml(node.scope)}</span>` : ''}
                        <span class="node-type">${escapeHtml(node.type)}</span>
                        ${omittedLabel}
                        <button class="mvn-repo-btn" data-group-id="${escapeHtml(node.groupId)}" data-artifact-id="${escapeHtml(node.artifactId)}" title="View versions">📦</button>
                    </span>
                </div>
                ${hasChildren && isExpanded ? `<ul class="tree-children">${node.children.map(child => renderTreeNode(child, query, level + 1)).join('')}</ul>` : ''}
            </li>
        `;

        return html;
    }

    function renderResolvedList(dependencies, query) {
        if (!dependencies || dependencies.length === 0) {
            return `<div class="empty-resolved-list">${i18n('noDependencies')}</div>`;
        }

        // Filter dependencies based on search query
        const filteredDeps = query
            ? dependencies.filter(dep => dependencyMatchesSearch(dep, query))
            : dependencies;

        if (filteredDeps.length === 0) {
            return `<div class="empty-resolved-list">${i18n('noMatches')}</div>`;
        }

        let html = '<ul class="resolved-list">';
        for (const dep of filteredDeps) {
            html += renderResolvedItem(dep, query);
        }
        html += '</ul>';
        return html;
    }

    function renderResolvedItem(dep, query) {
        const itemId = `${dep.groupId}:${dep.artifactId}:${dep.version}`;
        const matchesSearch = dependencyMatchesSearch(dep, query);
        const scopeClass = dep.scope ? `scope-${dep.scope}` : '';
        const highlightClass = matchesSearch && query ? 'search-match' : '';
        const isSelected = selectedResolvedItemId === itemId;
        const selectedClass = isSelected ? 'selected' : '';

        return `
            <li class="resolved-item ${highlightClass} ${selectedClass}" data-item-id="${itemId}" data-artifact-id="${escapeHtml(dep.artifactId)}" data-group-id="${escapeHtml(dep.groupId)}">
                <div class="resolved-item-content">
                    <span class="resolved-artifact">
                        ${showGroupId ? `${escapeHtml(dep.groupId)}:` : ''}<strong>${escapeHtml(dep.artifactId)}</strong>
                    </span>
                    <span class="resolved-version">${escapeHtml(dep.version)}</span>
                    ${dep.scope ? `<span class="resolved-scope ${scopeClass}">${escapeHtml(dep.scope)}</span>` : ''}
                    <span class="resolved-type">${escapeHtml(dep.type)}</span>
                    <button class="mvn-repo-btn" data-group-id="${escapeHtml(dep.groupId)}" data-artifact-id="${escapeHtml(dep.artifactId)}" title="View versions">📦</button>
                </div>
            </li>
        `;
    }

    function nodeMatchesSearch(node, query) {
        if (!query) {
            return true;
        }

        const lowerQuery = query.toLowerCase();
        const searchText = `${node.groupId}:${node.artifactId} ${node.version}`.toLowerCase();
        return searchText.includes(lowerQuery);
    }

    function dependencyMatchesSearch(dep, query) {
        if (!query) {
            return true;
        }

        const lowerQuery = query.toLowerCase();
        const searchText = `${dep.groupId}:${dep.artifactId} ${dep.version}`.toLowerCase();
        return searchText.includes(lowerQuery);
    }

    function childrenMatchQuery(children, query) {
        if (!children || !query) {
            return false;
        }

        for (const child of children) {
            if (nodeMatchesSearch(child, query)) {
                return true;
            }
            if (child.children && childrenMatchQuery(child.children, query)) {
                return true;
            }
        }
        return false;
    }

    function childrenContainArtifact(children, artifactId) {
        if (!children || !artifactId) {
            return false;
        }

        for (const child of children) {
            if (child.artifactId === artifactId) {
                return true;
            }
            if (child.children && childrenContainArtifact(child.children, artifactId)) {
                return true;
            }
        }
        return false;
    }

    function getNodeId(node) {
        return `${node.groupId}:${node.artifactId}:${node.version}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function attachDependencyTreeListeners() {
        // source code generated by GenAI of Kiro starts
        // 使用事件委托处理 mvn-repo-btn 点击
        const dependencyContainer = document.querySelector('.dependency-tree-container');
        if (dependencyContainer) {
            dependencyContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.mvn-repo-btn');
                if (btn) {
                    e.stopPropagation();
                    const groupId = btn.getAttribute('data-group-id');
                    const artifactId = btn.getAttribute('data-artifact-id');
                    vscode.postMessage({
                        type: 'openMvnRepository',
                        groupId: groupId,
                        artifactId: artifactId
                    });
                }
            });
        } else {
            console.warn('[mvn-repo-btn] dependency-tree-container not found!');
        }        // source code generated by GenAI of Kiro ends

        // 使用事件委托处理树节点点击 - 解决动态节点的事件绑定问题
        const treeView = document.getElementById('dependency-tree-view');
        if (treeView) {
            treeView.addEventListener('click', (e) => {
                // 处理展开图标点击
                if (e.target.classList.contains('expand-icon') && e.target.classList.contains('has-children')) {
                    e.stopPropagation();
                    const nodeId = e.target.getAttribute('data-node-id');
                    toggleNode(nodeId);
                    return;
                }

                // 处理树节点点击
                const treeNode = e.target.closest('.tree-node');
                if (treeNode && !e.target.closest('.expand-icon')) {
                    handleTreeNodeClick({ currentTarget: treeNode });
                }
            });
        }

        // 使用事件委托处理已解析依赖项点击
        const resolvedView = document.getElementById('resolved-dependencies-view');
        if (resolvedView) {
            resolvedView.addEventListener('click', (e) => {
                const resolvedItem = e.target.closest('.resolved-item');
                if (resolvedItem) {
                    handleResolvedItemClick({ currentTarget: resolvedItem });
                }
            });
        }

        // Search input
        const searchInput = document.getElementById('dependency-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value;
                // Update both views
                updateBothViews();
            });
        }

        // Clear search button
        const clearSearchBtn = document.getElementById('clear-search');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchQuery = '';
                const searchInput = document.getElementById('dependency-search');
                if (searchInput) {
                    searchInput.value = '';
                }
                updateBothViews();
            });
        }

        // Expand all button
        const expandAllBtn = document.getElementById('expand-all');
        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => {
                expandAll(dependencyTreeData);
                updateLeftPanel();
            });
        }

        // Collapse all button
        const collapseAllBtn = document.getElementById('collapse-all');
        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => {
                expandedNodes.clear();
                clearAllSelections();
                updateLeftPanel();
            });
        }

        // Refresh button (强制刷新缓存)
        const refreshBtn = document.getElementById('refresh-tree');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                dependencyTreeLoaded = false;
                resolvedDependenciesLoaded = false;
                expandedNodes.clear();
                clearAllSelections();
                searchQuery = '';
                filteredArtifactId = null;
                isProcessingClick = false; // 重置处理状态
                eventListenersAttached = false; // 重置事件监听器状态
                loadDependencyTree(true); // 强制刷新
                loadResolvedDependencies(true); // 强制刷新
            });
        }

        // Toggle GroupId button
        const toggleGroupIdBtn = document.getElementById('toggle-groupid');
        if (toggleGroupIdBtn) {
            toggleGroupIdBtn.addEventListener('click', () => {
                showGroupId = !showGroupId;
                toggleGroupIdBtn.textContent = showGroupId ? i18n('hideGroupId') : i18n('showGroupId');
                toggleGroupIdBtn.title = showGroupId ? i18n('hideGroupId') : i18n('showGroupId');
                updateLeftPanel();
                updateRightPanel();
            });
        }

        // Context menu for tree nodes and resolved items
        setupContextMenu(treeView, 'tree');
        setupContextMenu(resolvedView, 'resolved');
    }

    function setupContextMenu(container, type) {
        if (!container) return;

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            let targetElement = null;
            if (type === 'tree') {
                targetElement = e.target.closest('.tree-node');
            } else {
                targetElement = e.target.closest('.resolved-item');
            }

            if (!targetElement) return;

            const groupId = targetElement.getAttribute('data-group-id');
            const artifactId = targetElement.getAttribute('data-artifact-id');
            if (!groupId || !artifactId) return;

            contextMenuTarget = { groupId, artifactId };
            showContextMenu(e.clientX, e.clientY);
        });
    }

    function showContextMenu(x, y) {
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        menu.style.display = 'block';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        // Ensure menu stays within viewport
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }
    }

    function hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) {
            menu.style.display = 'none';
        }
        contextMenuTarget = null;
    }

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('context-menu');
        if (menu && !menu.contains(e.target)) {
            hideContextMenu();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
        }
    });

    const contextMenuLocate = document.getElementById('context-menu-locate');
    if (contextMenuLocate) {
        contextMenuLocate.addEventListener('click', () => {
            if (contextMenuTarget) {
                vscode.postMessage({
                    type: 'locateInEditor',
                    groupId: contextMenuTarget.groupId,
                    artifactId: contextMenuTarget.artifactId
                });
            }
            hideContextMenu();
        });
    }

    function updateBothViews() {
        // Update tree view
        const treeView = document.getElementById('dependency-tree-view');
        if (treeView && dependencyTreeData) {
            treeView.innerHTML = renderTreeNodes(dependencyTreeData, searchQuery);
            // 只在首次渲染时绑定事件监听器
            if (!eventListenersAttached && treeView.firstChild?.nodeName === 'UL') {
                attachDependencyTreeListeners();
                eventListenersAttached = true;
            }
        }

        // Update resolved list view
        const resolvedView = document.getElementById('resolved-dependencies-view');
        if (resolvedView && resolvedDependenciesData) {
            resolvedView.innerHTML = renderResolvedList(resolvedDependenciesData, searchQuery);
        }

        // Update count
        const countElement = document.querySelector('.dependency-count');
        if (countElement && resolvedDependenciesData) {
            countElement.textContent = `${getFilteredResolvedCount()} / ${resolvedDependenciesData.length}`;
        }
    }

    function toggleNode(nodeId) {
        if (expandedNodes.has(nodeId)) {
            expandedNodes.delete(nodeId);
        } else {
            expandedNodes.add(nodeId);
            const node = dependencyTreeData.find(n => getNodeId(n) === nodeId);
            // 如果没有节点信息，尝试通过折叠路径节点找到可能的路径：((groupId:artifactId)*:artifactId
            if (nodeId && node == null) {
                const parts = nodeId.split(":");
                const possiblePath = parts.slice(0, parts.length - 1).join(":");
                const nodeGeneration = parts[parts.length - 1];

                // 尝试找到匹配的路径节点并toggle对应路径
                const findNodesByPath = (allNodes, currentPath) => {
                    if (currentPath.length > 1) {
                        //GM_log("正在搜索路径节点中包含: " + currentPath);
                        const currentRootArtifact = currentPath.pop();
                        const targetNodes = allNodes.filter(n => `${n.groupId}:${currentRootArtifact}` === currentPath.join(":"));
                        if (targetNodes.length > 0) {
                            //GM_log("找到路径节点: " + currentPath.join(":"));
                            targetNodes.forEach(tn => {
                                const pathId = getNodeId(tn);
                                expandedNodes.add(pathId);
                                const generationNodes = tn.children?.filter(gn => `${possiblePath}:${gn.artifactId}` === getNodeId(gn));
                                if (generationNodes) {
                                    findNodesByPath(generationNodes, currentPath);
                                }
                            });
                            return;
                        }
                    }
                    //GM_log("未找到包含 " + currentPath.join(":") + " 的节点。");
                }

                // 从上到下尝试查找匹配路径，再展开对应路径下的相关节点
                findNodesByPath(dependencyTreeData, [...parts]);
            }
        }
        updateBothViews();
    }

    function expandAll(nodes) {
        if (!nodes) {
            return;
        }

        for (const node of nodes) {
            const nodeId = getNodeId(node);
            expandedNodes.add(nodeId);
            if (node.children) {
                expandAll(node.children);
            }
        }
    }

    function clearAllSelections() {
        selectedTreeNodeIds.clear();
        selectedResolvedItemId = null;
        filteredArtifactId = null;
    }

    function findMatchingResolvedItem(artifactId) {
        if (!resolvedDependenciesData) {
            return null;
        }

        for (const dep of resolvedDependenciesData) {
            if (dep.artifactId === artifactId) {
                return `${dep.groupId}:${dep.artifactId}:${dep.version}`;
            }
        }
        return null;
    }

    function findMatchingTreeNodes(nodes, artifactId, results = []) {
        if (!nodes) {
            return results;
        }

        for (const node of nodes) {
            if (node.artifactId === artifactId) {
                const nodeId = getNodeId(node);
                results.push(nodeId);
            }
            if (node.children) {
                findMatchingTreeNodes(node.children, artifactId, results);
            }
        }
        return results;
    }

    /**
     * 展开从根节点到目标节点的完整路径（优化版本）
     * @param {Array} nodes - 树节点数组
     * @param {string} targetArtifactId - 目标 artifactId
     * @param {Array} pathNodeIds - 累积的路径节点 ID
     * @param {number} maxDepth - 最大搜索深度，防止过度展开
     * @returns {boolean} 是否找到目标节点
     */
    function expandPathToNode(nodes, targetArtifactId, pathNodeIds = [], maxDepth = 10) {
        if (!nodes || pathNodeIds.length >= maxDepth) return false;

        for (const node of nodes) {
            const nodeId = getNodeId(node);
            const currentPath = [...pathNodeIds, nodeId];

            // 如果当前节点匹配
            if (node.artifactId === targetArtifactId) {
                // 展开路径上的所有父节点（不包括当前节点本身）
                pathNodeIds.forEach(id => expandedNodes.add(id));
                //GM_log("找到目标节点，已展开路径中不包括当前节点：" + targetArtifactId);
                //GM_log("找到的目标节点ID: " + nodeId);
                return true;
            }

            // 递归搜索子节点
            if (node.children && node.children.length > 0) {
                if (expandPathToNode(node.children, targetArtifactId, currentPath, maxDepth)) {
                    // 子树中找到了，展开当前节点
                    expandedNodes.add(nodeId);
                    //GM_log("子树中找到目标节点，已展开路径：" + node.artifactId + " -> " + targetArtifactId);
                    return true;
                }
            }
        }

        // 未找到匹配的节点
        //GM_log("未找到匹配的节点.");
        return false;
    }

    function showDependencyTreeError(errorMessage) {
        const dependencyHierarchyContent = document.getElementById('dependency-hierarchy');
        dependencyHierarchyContent.innerHTML = `
            <div class="error-container">
                <div class="error-icon">⚠️</div>
                <p class="error-title">${i18n('errorDependencyTree')}</p>
                <p class="error-message">${errorMessage}</p>
                <button class="retry-button" onclick="window.retryLoadDependencyTree()">${i18n('retry')}</button>
            </div>
        `;
    }

    function scrollToElement(element) {
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    function handleTreeNodeClick(event) {
        const nodeElement = event.currentTarget;
        const nodeId = nodeElement.getAttribute('data-node-id');
        const artifactId = nodeElement.getAttribute('data-artifact-id');

        // 清除所有选中状态和过滤
        selectedTreeNodeIds.clear();
        selectedResolvedItemId = null;
        filteredArtifactId = null; // 点击左栏时取消过滤

        // 选中当前节点
        selectedTreeNodeIds.add(nodeId);

        // 查找右侧匹配的依赖项
        const matchingResolvedItemId = findMatchingResolvedItem(artifactId);
        if (matchingResolvedItemId) {
            selectedResolvedItemId = matchingResolvedItemId;
        }

        // 重新渲染以更新选中状态
        updateBothViews();

        // 滚动到右侧匹配的项
        if (matchingResolvedItemId) {
            setTimeout(() => {
                const resolvedElement = document.querySelector(`.resolved-item[data-item-id="${matchingResolvedItemId}"]`);
                scrollToElement(resolvedElement);
            }, 100);
        }
    }

    function handleResolvedItemClick(event) {
        // 防止快速连续点击
        if (isProcessingClick) {
            return;
        }
        isProcessingClick = true;

        const itemElement = event.currentTarget;
        const itemId = itemElement.getAttribute('data-item-id');
        const artifactId = itemElement.getAttribute('data-artifact-id');

        // 如果点击的是同一个项，取消选中
        if (selectedResolvedItemId === itemId) {
            // 清除所有选中状态和过滤
            selectedTreeNodeIds.clear();
            selectedResolvedItemId = null;
            filteredArtifactId = null;

            // 重新渲染以恢复原状
            updateBothViews();

            // 重置处理状态
            setTimeout(() => {
                isProcessingClick = false;
            }, 100);
            return;
        }

        // 清除所有选中状态
        selectedTreeNodeIds.clear();
        selectedResolvedItemId = null;

        // 选中当前项
        selectedResolvedItemId = itemId;

        // 设置过滤，左栏只显示包含此 artifactId 的路径
        filteredArtifactId = artifactId;

        // 使用 requestAnimationFrame 优化渲染性能
        requestAnimationFrame(() => {
            // 自动展开路径到所有匹配节点
            expandPathToNode(dependencyTreeData, artifactId);

            // 查找左侧所有匹配的树节点（支持多版本）
            const matchingNodeIds = findMatchingTreeNodes(dependencyTreeData, artifactId);
            matchingNodeIds.forEach(nodeId => selectedTreeNodeIds.add(nodeId));

            // 重新渲染以更新选中状态和过滤
            updateBothViews();

            // 滚动到左侧第一个匹配的节点
            if (matchingNodeIds.length > 0) {
                setTimeout(() => {
                    const firstNodeElement = document.querySelector(`.tree-node[data-node-id="${matchingNodeIds[0]}"]`);
                    scrollToElement(firstNodeElement);
                }, 100);
            }

            // 重置处理状态
            setTimeout(() => {
                isProcessingClick = false;
            }, 200);
        });
    }

    function showResolvedDependenciesError(errorMessage) {
        // 始终在右栏显示错误，即使左栏未加载
        const resolvedView = document.getElementById('resolved-dependencies-view');
        if (resolvedView) {
            resolvedView.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">⚠️</div>
                    <p class="error-title">${i18n('errorResolvedList')}</p>
                    <p class="error-message">${errorMessage}</p>
                    <button class="retry-button" onclick="window.retryLoadResolvedDependencies()">${i18n('retry')}</button>
                </div>
            `;
        }
    }

    // Expose retry function globally
    window.retryLoadDependencyTree = function () {
        dependencyTreeLoaded = false;
        resolvedDependenciesLoaded = false;
        loadDependencyTree();
        loadResolvedDependencies();
    };

    window.retryLoadResolvedDependencies = function () {
        resolvedDependenciesLoaded = false;
        loadResolvedDependencies();
    };

    // Listen for messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'effectivePomResult':
                initializeEffectivePomEditor(message.content);
                break;

            case 'effectivePomError':
                showEffectivePomError(message.error);
                break;

            case 'effectivePomLoading':
                // Loading state is already handled in loadEffectivePom()
                break;

            case 'dependencyTreeResult':
                initializeDependencyTree(message.data);
                break;

            case 'dependencyTreeError':
                showDependencyTreeError(message.error);
                break;

            case 'dependencyTreeLoading':
                // Loading state is already handled in loadDependencyTree()
                break;

            case 'resolvedDependenciesResult':
                initializeResolvedDependencies(message.data);
                break;

            case 'resolvedDependenciesError':
                showResolvedDependenciesError(message.error);
                break;

            case 'resolvedDependenciesLoading':
                // Loading state is already handled
                break;
        }
    });

    // Log that the webview is ready
    vscode.postMessage({
        type: 'log',
        content: 'Maven POM Editor webview is ready'
    });
})();
