/**
 * BrushPanel - 画笔管理面板
 * 提供画笔的保存、导入、管理和使用功能
 */
class BrushPanel {
    constructor(brushManager) {
        this.brushManager = brushManager;
        this.panel = null;
        this.brushLibraryManager = null;
        this.brushLibraryWindow = null;
        this.currentGroupFilter = '';
        
        this.init();
    }
    
    /**
     * 初始化面板
     */
    init() {
        this.panel = document.getElementById('brushPanel');
        if (!this.panel) return;
        
        // 初始化画笔库管理器
        if (typeof BrushLibraryManager !== 'undefined') {
            this.brushLibraryManager = new BrushLibraryManager();
        }
        
        // 设置面板为自由窗口（可拖拽）
        this._setupFreeWindow();
        
        // 设置事件监听
        this._setupEventListeners();
        
        // 保存之前的回调（由 app.js 设置的画布重绘回调）
        const previousBrushChangeCallback = this.brushManager.onBrushChange;
        
        // 监听画笔变更 - 合并前后两个回调
        this.brushManager.onBrushChange = (brushes, currentBrush) => {
            // 执行之前设置的回调（如画布重绘）
            if (previousBrushChangeCallback && typeof previousBrushChangeCallback === 'function') {
                previousBrushChangeCallback(brushes, currentBrush);
            }
            // 执行面板自身的回调
            this.renderBrushList();
            this.updateCurrentBrushDisplay();
        };
        
        this.brushManager.onModeChange = (mode) => {
            this.updateModeDisplay();
        };
        
        // 初始渲染
        this.renderBrushList();
        this.updateModeDisplay();
        
        // 创建画笔库窗口
        this._createBrushLibraryWindow();
    }
    
    /**
     * 设置自由窗口（可拖拽移动）
     */
    _setupFreeWindow() {
        const header = document.getElementById('brushPanelHeader');
        if (!header) return;
        
        // 添加自由窗口类
        this.panel.classList.add('free-window');
        
        // 初始位置：如果没有设置过，放在默认位置
        if (!this.panel.style.left) {
            this.panel.style.left = '400px';
            this.panel.style.top = '120px';
        }
        this.panel.style.right = 'auto';
        
        let offsetX, offsetY, isDragging = false;
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - this.panel.offsetLeft;
            offsetY = e.clientY - this.panel.offsetTop;
            e.preventDefault();
            e.stopPropagation();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.panel.style.left = (e.clientX - offsetX) + 'px';
            this.panel.style.top = (e.clientY - offsetY) + 'px';
            this.panel.style.right = 'auto';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    
    /**
     * 设置事件监听
     */
    _setupEventListeners() {
        console.log('[BrushPanel] 设置事件监听...');
        
        // 更多按钮 - 打开画笔库
        const moreBtn = document.getElementById('brushLibraryMoreBtn');
        if (moreBtn) {
            moreBtn.addEventListener('click', () => {
                console.log('[BrushPanel] 点击了更多按钮');
                this._showBrushLibrary();
            });
        }
        
        // 从剪贴板导入（使用新的唯一 ID）
        const pasteBtn = document.getElementById('pasteBrushFromClipboardBtn');
        console.log('[BrushPanel] pasteBrushFromClipboardBtn:', pasteBtn ? '找到' : '未找到');
        if (pasteBtn) {
            pasteBtn.addEventListener('click', () => {
                console.log('[BrushPanel] 点击了从剪贴板导入按钮');
                this._handlePasteFromClipboard();
            });
        } else {
            // 兼容旧 ID
            const oldPasteBtn = document.getElementById('pasteBrushBtn');
            console.log('[BrushPanel] pasteBrushBtn (旧):', oldPasteBtn ? '找到（兼容）' : '未找到');
            if (oldPasteBtn) {
                oldPasteBtn.addEventListener('click', () => {
                    console.log('[BrushPanel] 点击了从剪贴板导入按钮（旧ID）');
                    this._handlePasteFromClipboard();
                });
            }
        }
        
        // 从文件导入（使用新的唯一 ID）
        const importBtn = document.getElementById('importBrushFromFileBtn');
        const importFile = document.getElementById('importBrushFile');
        console.log('[BrushPanel] importBrushFromFileBtn:', importBtn ? '找到' : '未找到');
        console.log('[BrushPanel] importBrushFile:', importFile ? '找到' : '未找到');
        if (importBtn && importFile) {
            importBtn.addEventListener('click', () => importFile.click());
            importFile.addEventListener('change', (e) => this._handleImportFromFile(e));
        } else {
            // 兼容旧 ID
            const oldImportBtn = document.getElementById('importBrushBtn');
            if (oldImportBtn && importFile) {
                oldImportBtn.addEventListener('click', () => importFile.click());
                importFile.addEventListener('change', (e) => this._handleImportFromFile(e));
            }
        }
        
        // 保存当前选区为画笔
        const saveBtn = document.getElementById('saveSelectionAsBrushBtn');
        console.log('[BrushPanel] saveSelectionAsBrushBtn:', saveBtn ? '找到' : '未找到');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                console.log('[BrushPanel] 点击了保存选区为画笔按钮');
                this._handleSaveSelectionAsBrush();
            });
        }
        
        // 清除当前画笔按钮
        const clearBrushBtn = document.getElementById('clearCurrentBrushBtn');
        if (clearBrushBtn) {
            clearBrushBtn.addEventListener('click', () => {
                this.brushManager.clearCurrentBrush();
                this._showNotification('已取消当前画笔');
            });
        }
        
        // 绘制模式切换
        const modeButtons = document.querySelectorAll('.brush-mode-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.brushManager.setDrawMode(mode);
            });
        });
        
        // 画笔列表事件委托
        const brushList = document.getElementById('brushList');
        if (brushList) {
            brushList.addEventListener('click', (e) => {
                const brushItem = e.target.closest('.brush-item');
                if (!brushItem) return;
                
                const brushId = brushItem.dataset.brushId;
                const action = e.target.dataset.action;
                
                if (action === 'select') {
                    this.brushManager.selectBrush(brushId);
                    this._showNotification('已选中画笔，可在画布上点击或拖动绘制');
                } else if (action === 'rename') {
                    this._handleRenameBrush(brushId);
                } else if (action === 'delete') {
                    this._handleDeleteBrush(brushId);
                } else if (action === 'export') {
                    this._handleExportBrush(brushId);
                }
            });
        }
        
        // 画笔变换按钮事件委托（旋转/翻转）
        const brushInfo = document.getElementById('currentBrushInfo');
        if (brushInfo) {
            brushInfo.addEventListener('click', (e) => {
                const btn = e.target.closest('.brush-transform-btn');
                if (!btn) return;
                
                const transform = btn.dataset.transform;
                const current = this.brushManager.getCurrentBrush();
                if (!current) return;
                
                switch (transform) {
                    case 'rotateLeft':
                        this.brushManager.rotateBrush(current, 'left');
                        this._showNotification('画笔已向左旋转90度');
                        break;
                    case 'rotateRight':
                        this.brushManager.rotateBrush(current, 'right');
                        this._showNotification('画笔已向右旋转90度');
                        break;
                    case 'flipH':
                        this.brushManager.flipBrushHorizontal(current);
                        this._showNotification('画笔已左右翻转');
                        break;
                    case 'flipV':
                        this.brushManager.flipBrushVertical(current);
                        this._showNotification('画笔已上下翻转');
                        break;
                }
            });
        }
    }
    
    /**
     * 处理从剪贴板粘贴
     */
    async _handlePasteFromClipboard() {
        console.log('[BrushPanel] _handlePasteFromClipboard 被调用');
        console.log('[BrushPanel] brushManager:', this.brushManager ? '存在' : '不存在');
        
        // 显示中间粘贴对话框
        this._showPasteDialog();
    }
    
    /**
     * 显示粘贴对话框（用于手动粘贴剪贴板内容）
     */
    _showPasteDialog() {
        console.log('[BrushPanel] _showPasteDialog 被调用');
        
        // 先尝试使用浏览器 Clipboard API 自动读取
        const tryAutoPaste = async () => {
            console.log('[BrushPanel] 尝试自动读取剪贴板...');
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    console.log('[BrushPanel] Clipboard API 可用');
                    const text = await navigator.clipboard.readText();
                    console.log('[BrushPanel] 读取到剪贴板内容:', text ? text.substring(0, 100) + '...' : '(空)');
                    if (text && text.trim()) {
                        // 成功读取剪贴板，直接解析
                        console.log('[BrushPanel] 尝试解析剪贴板数据...');
                        const brush = this.brushManager.createBrushFromClipboard(text.trim());
                        console.log('[BrushPanel] createBrushFromClipboard 结果:', brush ? '成功' : '失败');
                        if (brush) {
                            this._showNotification(`✓ 已从剪贴板导入画笔：${brush.name}`);
                            return true;
                        }
                    }
                } else {
                    console.log('[BrushPanel] Clipboard API 不可用');
                }
            } catch (e) {
                console.log('[BrushPanel] Clipboard API 错误:', e.message);
            }
            console.log('[BrushPanel] 自动读取失败，将显示手动粘贴对话框');
            return false;
        };
        
        // 尝试自动读取，失败则显示手动对话框
        tryAutoPaste().then(success => {
            console.log('[BrushPanel] tryAutoPaste 结果:', success ? '成功' : '失败');
            if (success) return;
            
            console.log('[BrushPanel] 创建手动粘贴对话框...');
            
            // 创建对话框
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                z-index: 10001;
                width: 450px;
                max-width: 90vw;
                display: block;
            `;
            
            dialog.innerHTML = `
                <div style="font-weight: 600; font-size: 1.1em; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <span>📋 从剪贴板导入</span>
                    <button id="closePasteDialog" style="background: none; border: none; font-size: 1.2em; cursor: pointer; color: #666;">×</button>
                </div>
                <p style="font-size: 0.85em; color: #666; margin-bottom: 12px;">
                    请在下面的文本框中粘贴 (Ctrl+V) 你的画笔 JSON 数据。<br>
                    <span style="color: #999; font-size: 0.8em;">提示：数据来自"导出选区为画笔"功能或画笔导出功能。</span>
                </p>
                <textarea id="pasteTextarea" style="width: 100%; height: 150px; padding: 10px; border: 2px solid #e0e0e0; 
                                                         border-radius: 6px; font-family: monospace; font-size: 0.85em; resize: vertical;
                                                         box-sizing: border-box;" 
                          placeholder='在这里粘贴画笔数据，例如：{"type":"brush","shape":[[true,false],[false,true]],...}'></textarea>
                <div id="pasteStatus" style="font-size: 0.8em; margin-top: 8px; min-height: 20px;"></div>
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                    <button id="cancelPasteBtn" style="flex: 1; padding: 10px; border: 1px solid #e0e0e0; background: white; 
                                                              border-radius: 6px; cursor: pointer; font-size: 0.9em;">
                        取消
                    </button>
                    <button id="confirmPasteBtn" style="flex: 1; padding: 10px; border: none; 
                                                               background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                                               color: white; border-radius: 6px; cursor: pointer; font-size: 0.9em;">
                        导入
                    </button>
                </div>
            `;
            
            document.body.appendChild(dialog);
            console.log('[BrushPanel] 对话框已添加到 DOM');
            
            // 自动聚焦到文本框并等待粘贴
            requestAnimationFrame(() => {
                const textarea = dialog.querySelector('#pasteTextarea');
                if (textarea) {
                    textarea.focus();
                    textarea.select();
                    console.log('[BrushPanel] 文本框已聚焦');
                }
            });
            
            // 绑定事件
            const closeDialog = () => {
                console.log('[BrushPanel] 关闭对话框');
                dialog.remove();
            };
            dialog.querySelector('#closePasteDialog').onclick = closeDialog;
            dialog.querySelector('#cancelPasteBtn').onclick = closeDialog;
            
            dialog.querySelector('#confirmPasteBtn').onclick = () => {
                console.log('[BrushPanel] 点击了导入按钮');
                const textarea = dialog.querySelector('#pasteTextarea');
                const statusEl = dialog.querySelector('#pasteStatus');
                const text = textarea.value.trim();
                
                console.log('[BrushPanel] 文本框内容长度:', text.length);
                console.log('[BrushPanel] 文本框内容预览:', text.substring(0, 100) + '...');
                
                if (!text) {
                    statusEl.style.color = '#e74c3c';
                    statusEl.textContent = '⚠️ 请先粘贴画笔数据';
                    console.log('[BrushPanel] 文本框为空');
                    return;
                }
                
                // 尝试解析和导入
                console.log('[BrushPanel] 调用 _tryImportBrushData...');
                const result = this._tryImportBrushData(text);
                console.log('[BrushPanel] _tryImportBrushData 结果:', result);
                
                if (result.success) {
                    console.log('[BrushPanel] 导入成功，画笔名称:', result.brush.name);
                    dialog.remove();
                    this._showNotification(`✓ 已导入画笔：${result.brush.name}`);
                } else {
                    console.log('[BrushPanel] 导入失败:', result.error);
                    statusEl.style.color = '#e74c3c';
                    statusEl.textContent = '❌ ' + result.error;
                }
            };
            
            // 支持 Ctrl+Enter 快速导入
            const textarea = dialog.querySelector('#pasteTextarea');
            textarea.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    console.log('[BrushPanel] Ctrl+Enter 触发导入');
                    dialog.querySelector('#confirmPasteBtn').click();
                }
            });
            
            // 支持 Ctrl+V 后自动尝试导入
            textarea.addEventListener('paste', (e) => {
                console.log('[BrushPanel] 检测到粘贴事件');
                // 延迟处理，等待粘贴完成
                setTimeout(() => {
                    const textarea = dialog.querySelector('#pasteTextarea');
                    if (textarea && textarea.value.trim()) {
                        console.log('[BrushPanel] 粘贴完成，内容长度:', textarea.value.trim().length);
                        // 不自动导入，让用户确认后点击按钮
                    }
                }, 100);
            });
        });
    }
    
    /**
     * 尝试导入画笔数据（带详细错误信息）
     */
    _tryImportBrushData(text) {
        console.log('[BrushPanel] _tryImportBrushData 被调用');
        console.log('[BrushPanel] 输入文本长度:', text.length);
        console.log('[BrushPanel] 输入文本内容:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
        
        try {
            console.log('[BrushPanel] 尝试 JSON.parse...');
            const data = JSON.parse(text);
            console.log('[BrushPanel] JSON 解析成功:', Object.keys(data));
            
            // 验证数据结构
            if (!data) {
                console.log('[BrushPanel] 数据为空');
                return { success: false, error: '数据为空' };
            }
            
            console.log('[BrushPanel] 数据类型检查 - type:', data.type, 'shape:', !!data.shape);
            
            if (data.type !== 'brush' && !data.shape) {
                console.log('[BrushPanel] 类型检查失败');
                return { success: false, error: '无效的画笔数据格式：缺少 type 或 shape 字段' };
            }
            
            if (!data.shape || !Array.isArray(data.shape)) {
                console.log('[BrushPanel] shape 检查失败');
                return { success: false, error: '无效的形状数据：shape 必须是二维数组' };
            }
            
            console.log('[BrushPanel] shape 尺寸:', data.shape.length, 'x', data.shape[0]?.length);
            
            if (!data.width || !data.height) {
                // 自动计算尺寸
                data.width = data.shape[0]?.length || 0;
                data.height = data.shape.length;
                console.log('[BrushPanel] 自动计算尺寸:', data.width, 'x', data.height);
            }
            
            console.log('[BrushPanel] 调用 createBrushFromSelection...');
            const brush = this.brushManager.createBrushFromSelection(data);
            console.log('[BrushPanel] createBrushFromSelection 返回:', brush ? { id: brush.id, name: brush.name } : null);
            
            if (!brush) {
                console.log('[BrushPanel] 创建画笔失败');
                return { success: false, error: '创建画笔失败，请检查数据完整性' };
            }
            
            console.log('[BrushPanel] 导入成功！');
            return { success: true, brush };
        } catch (e) {
            console.error('[BrushPanel] 解析失败:', e);
            return { success: false, error: 'JSON 解析失败：' + e.message };
        }
    }
    
    /**
     * 处理从文件导入
     */
    _handleImportFromFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            const brush = this.brushManager.importFromJSON(content);
            
            if (brush) {
                this._showNotification(`✓ 已导入画笔：${brush.name}`);
            } else {
                this._showNotification('✗ 文件格式无效', 'error');
            }
        };
        reader.readAsText(file);
        
        // 重置 input
        e.target.value = '';
    }
    
    /**
     * 处理保存选区为画笔
     */
    _handleSaveSelectionAsBrush() {
        // 触发保存事件，由 app.js 处理
        const event = new CustomEvent('saveSelectionAsBrush', {
            detail: { brushManager: this.brushManager }
        });
        document.dispatchEvent(event);
    }
    
    /**
     * 处理重命名画笔
     */
    _handleRenameBrush(brushId) {
        const brush = this.brushManager.getBrushById(brushId);
        if (!brush) return;
        
        const newName = prompt('输入画笔名称：', brush.name);
        if (newName && newName.trim()) {
            this.brushManager.renameBrush(brushId, newName.trim());
            this._showNotification('✓ 画笔已重命名');
        }
    }
    
    /**
     * 处理删除画笔
     */
    _handleDeleteBrush(brushId) {
        const brush = this.brushManager.getBrushById(brushId);
        if (!brush) return;
        
        if (confirm(`确定删除画笔"${brush.name}"吗？`)) {
            this.brushManager.deleteBrush(brushId);
            this._showNotification('✓ 画笔已删除');
        }
    }
    
    /**
     * 处理导出画笔
     */
    _handleExportBrush(brushId) {
        const brush = this.brushManager.getBrushById(brushId);
        if (!brush) return;
        
        const json = this.brushManager.exportBrush(brush);
        
        // 下载为文件
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${brush.name}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this._showNotification('✓ 画笔已导出');
    }
    
    /**
     * 渲染画笔列表
     */
    renderBrushList() {
        const brushList = document.getElementById('brushList');
        const brushCountEl = document.getElementById('brushCount');
        if (!brushList) return;
        
        const brushes = this.brushManager.getAllBrushes();
        
        // 更新画笔数量显示
        if (brushCountEl) {
            brushCountEl.textContent = `${brushes.length} 个画笔`;
        }
        
        if (brushes.length === 0) {
            brushList.innerHTML = `
                <div class="brush-empty" style="text-align: center; padding: 20px; color: #999; font-size: 0.85em;">
                    <div style="font-size: 2em; margin-bottom: 8px;">🖌️</div>
                    <p>还没有自定义画笔</p>
                    <p style="font-size: 0.8em; color: #aaa;">创建选区后保存为画笔</p>
                </div>
            `;
            return;
        }
        
        brushList.innerHTML = brushes.map(brush => {
            const isSelected = this.brushManager.currentBrush && this.brushManager.currentBrush.id === brush.id;
            const preview = this.brushManager.getBrushPreview(brush);
            
            return `
                <div class="brush-item ${isSelected ? 'selected' : ''}" 
                     data-brush-id="${brush.id}"
                     style="padding: 8px; margin-bottom: 8px; border: 2px solid ${isSelected ? '#667eea' : '#e0e0e0'}; 
                            border-radius: 8px; cursor: pointer; background: ${isSelected ? '#f0f4ff' : 'white'};">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <!-- 画笔预览 -->
                        <div class="brush-preview" style="width: 40px; height: 40px; background: #f5f5f5; 
                                                     border-radius: 4px; display: flex; align-items: center; justify-content: center;
                                                     overflow: hidden; flex-shrink: 0;">
                            ${this._renderPreviewCanvas(preview)}
                        </div>
                        <!-- 画笔信息 -->
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 600; font-size: 0.85em; margin-bottom: 4px; 
                                       overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${brush.name}
                            </div>
                            <div style="font-size: 0.75em; color: #666;">
                                ${brush.width}×${brush.height} · ${this._countShapeCells(brush)}格
                            </div>
                        </div>
                    </div>
                    <!-- 操作按钮 -->
                    <div style="display: flex; gap: 4px; margin-top: 6px;">
                        <button data-action="select" style="flex: 1; padding: 4px; font-size: 0.75em; 
                                                           background: ${isSelected ? '#667eea' : '#f0f0f0'}; 
                                                           color: ${isSelected ? 'white' : '#333'}; 
                                                           border: none; border-radius: 4px; cursor: pointer;">
                            ${isSelected ? '✓ 已选中' : '🎨 使用'}
                        </button>
                        <button data-action="rename" style="padding: 4px 8px; font-size: 0.75em; background: #f0f0f0; 
                                                            border: none; border-radius: 4px; cursor: pointer;" title="重命名">
                            ✏️
                        </button>
                        <button data-action="export" style="padding: 4px 8px; font-size: 0.75em; background: #f0f0f0; 
                                                            border: none; border-radius: 4px; cursor: pointer;" title="导出">
                            📤
                        </button>
                        <button data-action="delete" style="padding: 4px 8px; font-size: 0.75em; background: #ffeaea; 
                                                            border: none; border-radius: 4px; cursor: pointer;" title="删除">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * 渲染预览小画布
     */
    _renderPreviewCanvas(preview) {
        if (!preview || preview.cells.length === 0) {
            return '<span style="font-size: 1.2em;">⬜</span>';
        }
        
        const cellSize = Math.min(40 / Math.max(preview.width, preview.height), 6);
        
        // 构建完整的网格（包括空格子），确保布局正确
        const cells = [];
        for (let y = 0; y < preview.height; y++) {
            for (let x = 0; x < preview.width; x++) {
                const cell = preview.cells.find(c => c.x === x && c.y === y);
                if (cell && cell.color) {
                    // 处理不同颜色格式
                    let bgColor = '#333'; // 默认深色（对于单色画笔）
                    if (cell.color.rgb && Array.isArray(cell.color.rgb)) {
                        bgColor = `rgb(${cell.color.rgb[0]}, ${cell.color.rgb[1]}, ${cell.color.rgb[2]})`;
                    } else if (cell.color.hex) {
                        bgColor = cell.color.hex;
                    } else if (typeof cell.color === 'string') {
                        bgColor = cell.color;
                    } else if (cell.color.r !== undefined && cell.color.g !== undefined && cell.color.b !== undefined) {
                        // { r, g, b } 格式
                        bgColor = `rgb(${cell.color.r}, ${cell.color.g}, ${cell.color.b})`;
                    }
                    cells.push(`<div style="width: ${cellSize}px; height: ${cellSize}px; background: ${bgColor}; 
                                        border-radius: 1px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);"></div>`);
                } else {
                    // 空格子用透明背景
                    cells.push(`<div style="width: ${cellSize}px; height: ${cellSize}px; background: transparent;"></div>`);
                }
            }
        }
        
        return `<div style="display: grid; grid-template-columns: repeat(${preview.width}, ${cellSize}px); 
                          gap: 0; padding: 2px;">
            ${cells.join('')}
        </div>`;
    }
    
    /**
     * 计算画笔形状中的格子数
     */
    _countShapeCells(brush) {
        let count = 0;
        if (brush.shape) {
            for (let y = 0; y < brush.shape.length; y++) {
                for (let x = 0; x < brush.shape[y].length; x++) {
                    if (brush.shape[y][x]) count++;
                }
            }
        }
        return count;
    }
    
    /**
     * 更新当前画笔显示
     */
    updateCurrentBrushDisplay() {
        const currentBrushInfo = document.getElementById('currentBrushInfo');
        const clearBtn = document.getElementById('clearCurrentBrushBtn');
        
        if (!currentBrushInfo) return;
        
        const current = this.brushManager.getCurrentBrush();
        if (current) {
            currentBrushInfo.style.display = 'block';
            currentBrushInfo.innerHTML = `
                <div style="font-size: 0.8em; margin-bottom: 4px;">
                    <strong>当前画笔：</strong>${current.name}
                </div>
                <div style="font-size: 0.75em; color: rgba(255,255,255,0.7); margin-bottom: 8px;">
                    ${current.width}×${current.height} · 点击或拖动使用
                </div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <button class="brush-transform-btn" data-transform="rotateLeft" style="padding: 3px 6px; font-size: 0.7em; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer;" title="向左旋转90度">↺ 左转</button>
                    <button class="brush-transform-btn" data-transform="rotateRight" style="padding: 3px 6px; font-size: 0.7em; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer;" title="向右旋转90度">↻ 右转</button>
                    <button class="brush-transform-btn" data-transform="flipH" style="padding: 3px 6px; font-size: 0.7em; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer;" title="左右翻转">↔ 左右翻转</button>
                    <button class="brush-transform-btn" data-transform="flipV" style="padding: 3px 6px; font-size: 0.7em; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer;" title="上下翻转">↕ 上下翻转</button>
                </div>
            `;
            if (clearBtn) {
                clearBtn.style.display = 'block';
            }
        } else {
            currentBrushInfo.style.display = 'none';
            if (clearBtn) {
                clearBtn.style.display = 'none';
            }
        }
    }
    
    /**
     * 更新模式显示
     */
    updateModeDisplay() {
        const mode = this.brushManager.getDrawMode();
        const modeButtons = document.querySelectorAll('.brush-mode-btn');
        
        modeButtons.forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.style.background = '#667eea';
                btn.style.color = 'white';
                btn.style.borderColor = '#667eea';
            } else {
                btn.style.background = 'white';
                btn.style.color = '#333';
                btn.style.borderColor = '#e0e0e0';
            }
        });
    }
    
    /**
     * 显示通知
     */
    _showNotification(message, type = 'success') {
        // 创建临时通知
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#e74c3c' : '#2ecc71'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 0.9em;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2500);
    }
    
    /**
     * 显示面板
     */
    show() {
        if (this.panel) {
            this.panel.style.display = 'block';
            // 确保面板是自由窗口模式
            if (!this.panel.style.left) {
                this.panel.style.left = '400px';
                this.panel.style.top = '120px';
                this.panel.style.right = 'auto';
            }
            this.renderBrushList();
            this.updateCurrentBrushDisplay();
        }
    }
    
    /**
     * 隐藏面板
     */
    hide() {
        if (this.panel) {
            this.panel.style.display = 'none';
        }
    }
    
    /**
     * 切换显示
     */
    toggle() {
        if (this.panel) {
            if (this.panel.style.display === 'none') {
                this.show();
            } else {
                this.hide();
            }
        }
    }
    
    /**
     * 创建画笔库窗口
     */
    _createBrushLibraryWindow() {
        if (this.brushLibraryWindow) return;
        
        this.brushLibraryWindow = document.createElement('div');
        this.brushLibraryWindow.id = 'brushLibraryWindow';
        this.brushLibraryWindow.className = 'brush-library-window';
        this.brushLibraryWindow.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 900px;
            height: 660px;
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 6px 24px rgba(0,0,0,0.15);
            z-index: 10001;
            display: none;
            flex-direction: column;
            overflow: hidden;
            border: 3px solid #000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        this.brushLibraryWindow.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 2px solid #000; background: #fff; color: #000; flex-shrink: 0;">
                <h3 style="margin: 0; font-size: 1.05em; font-weight: 700;">画笔库</h3>
                <button id="closeBrushLibraryBtn" style="background: #fff; border: 2px solid #000; color: #000; font-size: 1em; cursor: pointer; padding: 2px 10px; border-radius: 4px; transition: all 0.2s; line-height: 1; font-weight: 600;">✕</button>
            </div>
            <div style="display: flex; flex: 1; min-height: 0; overflow: hidden; background: #fff;">
                <!-- 左侧：分组侧栏 -->
                <div id="groupSidebar" style="width: 160px; flex-shrink: 0; border-right: 2px solid #000; padding: 12px 10px; overflow-y: auto; background: #fff;">
                    <div style="font-size: 0.82em; font-weight: 700; color: #000; margin-bottom: 10px; padding-left: 6px;">分组</div>
                    <div id="groupListSidebar" style="display: flex; flex-direction: column; gap: 3px;"></div>
                </div>
                <!-- 右侧：画笔列表 -->
                <div style="flex: 1; display: flex; min-width: 0; overflow: hidden;">
                    <!-- 我的画笔 -->
                    <div style="flex: 1; min-width: 0; padding: 12px 14px; overflow-y: auto; border-right: 2px solid #000; background: #fff;">
                        <h4 style="margin: 0 0 12px; font-size: 0.92em; color: #000; font-weight: 700;">我的画笔 <span id="myBrushesCount" style="color: #666; font-weight: 400; font-size: 0.82em; margin-left: 4px;"></span></h4>
                        <div id="myBrushesList" style="display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start;"></div>
                        <div id="myBrushesEmpty" style="text-align: center; padding: 40px 20px; color: #999; font-size: 0.85em; display: none;">
                            <div style="font-size: 2.5em; margin-bottom: 10px;">📝</div>
                            <p style="margin: 0; color: #666;">暂无自定义画笔</p>
                        </div>
                    </div>
                    <!-- 系统预设 -->
                    <div style="flex: 1; min-width: 0; padding: 12px 14px; overflow-y: auto; background: #fff;">
                        <h4 style="margin: 0 0 12px; font-size: 0.92em; color: #000; font-weight: 700;">系统预设 <span id="presetBrushesCount" style="color: #666; font-weight: 400; font-size: 0.82em; margin-left: 4px;"></span></h4>
                        <div id="presetBrushesList" style="display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start;"></div>
                        <div id="presetBrushesEmpty" style="text-align: center; padding: 40px 20px; color: #999; font-size: 0.85em; display: none;">
                            <div style="font-size: 2.5em; margin-bottom: 10px;">🗂️</div>
                            <p style="margin: 0; color: #666;">加载中...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.brushLibraryWindow);
        
        // 添加事件监听
        document.getElementById('closeBrushLibraryBtn').addEventListener('click', () => {
            this._hideBrushLibrary();
        });
        
        // 点击背景关闭
        this.brushLibraryWindow.addEventListener('click', (e) => {
            if (e.target === this.brushLibraryWindow) {
                this._hideBrushLibrary();
            }
        });
    }
    
    /**
     * 显示画笔库
     */
    async _showBrushLibrary() {
        if (!this.brushLibraryWindow) this._createBrushLibraryWindow();
        
        this.brushLibraryWindow.style.display = 'flex';
        this.currentGroupFilter = ''; // 重置分组筛选
        
        // 加载预设画笔
        if (this.brushLibraryManager) {
            const presetBrushes = await this.brushLibraryManager.loadPresetBrushes();
            this._renderGroupSidebar();
            this._renderPresetBrushes(presetBrushes);
            this._renderMyBrushes();
        }
    }
    
    /**
     * 渲染分组侧栏
     */
    _renderGroupSidebar() {
        const sidebar = document.getElementById('groupListSidebar');
        if (!sidebar || !this.brushLibraryManager) return;
        
        const stats = this.brushLibraryManager.getGroupStats();
        const groups = this.brushLibraryManager.getGroups();
        
        let html = '';
        // "全部" 选项
        html += `
            <div class="group-sidebar-item" data-group="" style="padding: 8px 10px; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 0.85em; transition: all 0.2s; color: ${!this.currentGroupFilter ? '#000' : '#333'}; background: ${!this.currentGroupFilter ? '#e8e8e8' : 'transparent'}; border: ${!this.currentGroupFilter ? '2px solid #000' : '2px solid transparent'}; font-weight: ${!this.currentGroupFilter ? '700' : '400'};">
                <span>全部</span>
                <span style="color: #666; font-size: 0.85em;">${stats.total}</span>
            </div>
        `;
        
        // "未分组" 选项
        const ungroupedCount = stats.groups['__ungrouped__']?.count || 0;
        const isUngroupedActive = this.currentGroupFilter === '__ungrouped__';
        html += `
            <div class="group-sidebar-item" data-group="__ungrouped__" style="padding: 8px 10px; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 0.85em; transition: all 0.2s; color: ${isUngroupedActive ? '#000' : '#333'}; background: ${isUngroupedActive ? '#e8e8e8' : 'transparent'}; border: ${isUngroupedActive ? '2px solid #000' : '2px solid transparent'}; font-weight: ${isUngroupedActive ? '700' : '400'};">
                <span>未分组</span>
                <span style="color: #666; font-size: 0.85em;">${ungroupedCount}</span>
            </div>
        `;
        
        // 分隔线
        if (groups.length > 0) {
            html += '<div style="height: 1px; background: #ddd; margin: 8px 6px;"></div>';
        }
        
        // 各分组
        groups.forEach(group => {
            const count = stats.groups[group]?.count || 0;
            const isActive = this.currentGroupFilter === group;
            html += `
                <div class="group-sidebar-item" data-group="${group}" style="padding: 8px 10px; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 0.85em; transition: all 0.2s; color: ${isActive ? '#000' : '#333'}; background: ${isActive ? '#e8e8e8' : 'transparent'}; border: ${isActive ? '2px solid #000' : '2px solid transparent'}; font-weight: ${isActive ? '700' : '400'};">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;">${group}</span>
                    <span style="color: #666; font-size: 0.85em; flex-shrink: 0; margin-left: 6px;">${count}</span>
                </div>
            `;
        });
        
        sidebar.innerHTML = html;
        
        // 添加点击事件
        sidebar.querySelectorAll('.group-sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const group = item.dataset.group;
                this.currentGroupFilter = group;
                this._renderGroupSidebar(); // 更新选中状态
                
                // 按分组筛选画笔
                if (this.brushLibraryManager) {
                    const filteredPresets = this.brushLibraryManager.filterPresetByGroup(group);
                    this._renderPresetBrushes(filteredPresets);
                    const filteredMy = this.brushLibraryManager.filterMyByGroup(group);
                    this._renderMyBrushesWithData(filteredMy);
                }
            });
            
            // 悬停效果
            item.addEventListener('mouseenter', () => {
                if (item.dataset.group !== this.currentGroupFilter) {
                    item.style.background = '#f0f0f0';
                    item.style.color = '#000';
                }
            });
            item.addEventListener('mouseleave', () => {
                if (item.dataset.group !== this.currentGroupFilter) {
                    item.style.background = 'transparent';
                    item.style.color = '#333';
                }
            });
        });
    }
    
    /**
     * 渲染我的画笔列表（使用指定数据）
     */
    _renderMyBrushesWithData(brushes) {
        const listEl = document.getElementById('myBrushesList');
        const emptyEl = document.getElementById('myBrushesEmpty');
        const countEl = document.getElementById('myBrushesCount');
        
        if (!listEl) return;
        
        if (countEl) {
            countEl.textContent = `(${brushes.length})`;
        }
        
        if (!brushes || brushes.length === 0) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'block';
            return;
        }
        
        emptyEl.style.display = 'none';
        listEl.innerHTML = brushes.map(brush => this._createBrushCard(brush, 'my')).join('');
        
        // 添加交互事件
        this._setupCardInteractions(listEl, 'my');
        
        // 初始化预览画布
        this._initBrushPreviews();
    }
    
    /**
     * 隐藏画笔库
     */
    _hideBrushLibrary() {
        if (this.brushLibraryWindow) {
            this.brushLibraryWindow.style.display = 'none';
        }
    }
    
    /**
     * 渲染预设画笔列表
     */
    _renderPresetBrushes(brushes) {
        const listEl = document.getElementById('presetBrushesList');
        const emptyEl = document.getElementById('presetBrushesEmpty');
        const countEl = document.getElementById('presetBrushesCount');
        
        if (!listEl) return;
        
        if (countEl) {
            countEl.textContent = `(${brushes.length})`;
        }
        
        if (!brushes || brushes.length === 0) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'block';
            emptyEl.querySelector('p').textContent = '暂无预设画笔';
            return;
        }
        
        emptyEl.style.display = 'none';
        listEl.innerHTML = brushes.map(brush => this._createBrushCard(brush, 'preset')).join('');
        
        // 添加交互事件
        this._setupCardInteractions(listEl, 'preset');
        
        // 初始化预览画布
        this._initBrushPreviews();
    }
    
    /**
     * 渲染我的画笔列表
     */
    _renderMyBrushes() {
        const listEl = document.getElementById('myBrushesList');
        const emptyEl = document.getElementById('myBrushesEmpty');
        const countEl = document.getElementById('myBrushesCount');
        
        if (!listEl || !this.brushLibraryManager) return;
        
        const myBrushes = this.brushLibraryManager.myBrushes;
        
        if (countEl) {
            countEl.textContent = `(${myBrushes.length})`;
        }
        
        if (!myBrushes || myBrushes.length === 0) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'block';
            return;
        }
        
        emptyEl.style.display = 'none';
        listEl.innerHTML = myBrushes.map(brush => this._createBrushCard(brush, 'my')).join('');
        
        // 添加交互事件
        this._setupCardInteractions(listEl, 'my');
        
        // 初始化预览画布
        this._initBrushPreviews();
    }
    
    /**
     * 设置画笔卡片的交互事件
     */
    _setupCardInteractions(listEl, type) {
        listEl.querySelectorAll('.brush-card').forEach(card => {
            const deleteBtn = card.querySelector('.delete-brush-btn');
            
            // 悬停效果
            card.addEventListener('mouseenter', () => {
                if (!card.classList.contains('selected')) {
                    card.style.borderColor = '#000';
                    card.style.transform = 'translateY(-2px)';
                    card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                    card.style.background = '#fafafa';
                }
                // 显示删除按钮（仅我的画笔）
                if (deleteBtn) {
                    deleteBtn.style.display = 'block';
                }
            });
            
            card.addEventListener('mouseleave', () => {
                if (!card.classList.contains('selected')) {
                    card.style.borderColor = '#000';
                    card.style.transform = 'translateY(0)';
                    card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    card.style.background = '#fff';
                }
                // 隐藏删除按钮
                if (deleteBtn) {
                    deleteBtn.style.display = 'none';
                }
            });
            
            // 删除按钮点击事件
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const brushId = deleteBtn.dataset.brushId;
                    if (confirm('确定删除此画笔吗？')) {
                        this.brushLibraryManager.removeFromMyBrushes(brushId);
                        // 同时从 BrushManager 中删除
                        this.brushManager.deleteBrush(brushId);
                        this._renderMyBrushes();
                        this._renderPresetBrushes(this.brushLibraryManager.presetBrushes);
                    }
                });
            }
            
            // 点击事件 - 点击直接使用画笔
            card.addEventListener('click', () => {
                const brushId = card.dataset.brushId;
                const brushList = type === 'preset' ? this.brushLibraryManager.presetBrushes : this.brushLibraryManager.myBrushes;
                const brush = brushList.find(b => b.id === brushId);
                if (brush) {
                    this._selectAndUseBrush(brush, type);
                }
            });
        });
    }
    
    /**
     * 选中并使用画笔
     */
    _selectAndUseBrush(brush, type) {
        // 更新选中视觉状态 - 先清除同类型所有卡片的选中状态
        const cardSelector = type === 'preset' ? '#presetBrushesList .brush-card' : '#myBrushesList .brush-card';
        document.querySelectorAll(cardSelector).forEach(c => {
            c.classList.remove('selected');
            c.style.borderColor = '#000';
            c.style.background = '#fff';
            c.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            c.style.transform = 'scale(1)';
        });
        
        // 设置选中卡片的高亮效果
        const card = document.querySelector(`${cardSelector}[data-brush-id="${brush.id}"]`);
        if (card) {
            card.classList.add('selected');
            card.style.borderColor = '#000';
            card.style.background = '#e8e8e8';
            card.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25), inset 0 0 0 2px #000';
            card.style.transform = 'scale(1.05)';
        }
        
        // 直接使用画笔
        this._applyBrush(brush);
        
        // 延迟后自动关闭窗口，让用户看到选中效果
        setTimeout(() => {
            this._hideBrushLibrary();
        }, 500);
    }
    
    /**
     * 应用画笔到 BrushManager
     */
    _applyBrush(brush) {
        const brushData = {
            id: brush.id,
            name: brush.name,
            width: brush.w || brush.width,
            height: brush.h || brush.height,
            shape: (brush.mask || brush.shape).map(row => typeof row === 'string' 
                ? row.split('').map(c => c === '1')
                : row),
            colors: [{ r: 0, g: 0, b: 0 }]
        };
        
        // 添加到 BrushManager（主画笔列表）
        this.brushManager.addBrush(brushData);
        this.brushManager.selectBrush(brush.id);
        
        // 同时添加到 BrushLibraryManager 的我的画笔（如果是预设画笔）
        if (this.brushLibraryManager && !this.brushLibraryManager.myBrushes.find(b => b.id === brush.id)) {
            const brushCopy = {
                ...brush,
                id: brush.id
            };
            this.brushLibraryManager.myBrushes.push(brushCopy);
            this.brushLibraryManager.saveMyBrushes();
        }
        
        this._showNotification(`✓ 已选择画笔：${brush.name}`);
    }
    
    /**
     * 创建画笔卡片
     */
    _createBrushCard(brush, type) {
        const canvasId = `preview_${type}_${brush.id}`;
        const brushW = brush.w || brush.width || 1;
        const brushH = brush.h || brush.height || 1;
        const maxPreviewSize = 50;
        
        return `
            <div class="brush-card" data-brush-id="${brush.id}" data-type="${type}"
                 style="width: 84px; padding: 8px 6px; border: 2px solid #000; border-radius: 6px; 
                        cursor: pointer; background: #fff; text-align: center; transition: all 0.2s;
                        position: relative;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="width: 100%; height: 52px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px; overflow: hidden; background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px;">
                    <canvas id="${canvasId}" style="display: block; max-width: ${maxPreviewSize}px; max-height: ${maxPreviewSize}px;"></canvas>
                </div>
                <div style="font-size: 0.75em; font-weight: 600; color: #000; 
                            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.3;">
                    ${brush.name}
                </div>
                <div style="font-size: 0.68em; color: #666; margin-top: 3px;">
                    ${brushW}×${brushH}
                </div>
                ${type === 'my' ? '<button class="delete-brush-btn" data-brush-id="' + brush.id + '" style="position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; background: #fff; color: #ff4444; border: 1.5px solid #ff4444; border-radius: 50%; cursor: pointer; font-size: 0.6em; display: none; z-index: 10; padding: 0; line-height: 1; font-weight: 700;">✕</button>' : ''}
            </div>
        `;
    }
    
    /**
     * 初始化画笔卡片的预览画布
     */
    _initBrushPreviews() {
        if (!this.brushLibraryManager) return;
        
        document.querySelectorAll('#myBrushesList canvas, #presetBrushesList canvas').forEach(canvas => {
            const brushId = canvas.id.replace('preview_preset_', '').replace('preview_my_', '');
            const allBrushes = [...this.brushLibraryManager.myBrushes, ...this.brushLibraryManager.presetBrushes];
            const brush = allBrushes.find(b => b.id === brushId);
            
            if (brush) {
                const brushW = brush.w || brush.width || 1;
                const brushH = brush.h || brush.height || 1;
                const maxSize = 50;
                
                // 计算自适应的 cellSize，确保画笔不超出 50x50 的预览框
                const cellSize = Math.max(1, Math.floor(maxSize / Math.max(brushW, brushH)));
                
                // 计算实际渲染尺寸
                const actualW = brushW * cellSize;
                const actualH = brushH * cellSize;
                
                // 设置 canvas 的实际尺寸
                canvas.width = actualW;
                canvas.height = actualH;
                canvas.style.width = actualW + 'px';
                canvas.style.height = actualH + 'px';
                
                // 白色背景风格的预览渲染，画笔形状用深灰色显示
                this.brushLibraryManager.renderPreview(canvas, brush, cellSize, '#333', {
                    bgColor: '#f8f8f8',
                    gridColor: '#ddd',
                    showGrid: cellSize >= 4
                });
            }
        });
    }
    
}

// 导出到全局
window.BrushPanel = BrushPanel;
