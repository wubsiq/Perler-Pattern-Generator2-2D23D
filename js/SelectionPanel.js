/**
 * SelectionPanel - 选区设置面板管理器
 * 负责与 UI 交互，更新 SelectionManager
 */
class SelectionPanel {
    constructor(app) {
        this.app = app;
        this.panel = null;
        this.selectionManager = null;
        this.currentType = 'rect';
        
        this.init();
    }
    
    init() {
        this.panel = document.getElementById('selectionPanel');
        if (!this.panel) return;
        
        // 绑定选区类型按钮
        const typeButtons = this.panel.querySelectorAll('.selection-type-btn');
        typeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                this.setSelectionType(type);
            });
        });
        
        // 绑定操作按钮
        document.getElementById('invertSelectionBtn').addEventListener('click', () => {
            this.invertSelection();
        });
        
        document.getElementById('clearSelectionBtn').addEventListener('click', () => {
            this.clearSelection();
        });
        
        document.getElementById('exportSelectionBtn').addEventListener('click', () => {
            this.exportSelection();
        });
        
        // 保存为画笔按钮
        const saveAsBrushBtn = document.getElementById('saveAsBrushBtn');
        if (saveAsBrushBtn) {
            saveAsBrushBtn.addEventListener('click', () => {
                this.saveAsBrush();
            });
        }
        
        // 从剪贴板粘贴画笔
        const pasteBrushBtn = document.getElementById('pasteBrushBtn');
        if (pasteBrushBtn) {
            pasteBrushBtn.addEventListener('click', () => {
                this.pasteBrush();
            });
        }
        
        // 从文件导入画笔
        const importBrushBtn = document.getElementById('importBrushBtn');
        const importBrushFile = document.getElementById('importBrushFile');
        importBrushBtn.addEventListener('click', () => {
            importBrushFile.click();
        });
        importBrushFile.addEventListener('change', (e) => {
            this.importBrush(e.target.files[0]);
        });
        
        // 关闭按钮
        document.getElementById('closeSelectionBtn').addEventListener('click', () => {
            this.hide();
        });
        
        // 透明色块选择开关
        const skipTransparentCheck = document.getElementById('skipTransparentCheck');
        if (skipTransparentCheck) {
            skipTransparentCheck.addEventListener('change', (e) => {
                if (this.selectionManager) {
                    this.selectionManager.skipTransparent = !e.target.checked;
                }
            });
        }
        
        // 头部拖拽
        const header = document.getElementById('selectionPanelHeader');
        this.makeDraggable(this.panel, header);
        
        // 涂抹笔刷大小滑块
        const smudgeBrushSlider = document.getElementById('smudgeBrushSizeSlider');
        const smudgeBrushValue = document.getElementById('smudgeBrushSizeValue');
        if (smudgeBrushSlider && smudgeBrushValue) {
            smudgeBrushSlider.addEventListener('input', (e) => {
                const size = parseInt(e.target.value);
                smudgeBrushValue.textContent = size;
                if (this.selectionManager) {
                    this.selectionManager.setSmudgeBrushSize(size);
                }
            });
        }
        
        // 选区颜色选择器
        const selectionColorPicker = document.getElementById('selectionColorPicker');
        if (selectionColorPicker) {
            selectionColorPicker.addEventListener('input', (e) => {
                if (this.selectionManager) {
                    this.selectionManager.setSelectionColor(e.target.value);
                }
            });
        }
        
        // 反转颜色选择器
        const inverseColorPicker = document.getElementById('inverseColorPicker');
        if (inverseColorPicker) {
            inverseColorPicker.addEventListener('input', (e) => {
                if (this.selectionManager) {
                    this.selectionManager.setInverseColor(e.target.value);
                }
            });
        }
        
        // 透明度滑块
        const opacitySlider = document.getElementById('selectionOpacitySlider');
        const opacityValue = document.getElementById('selectionOpacityValue');
        if (opacitySlider && opacityValue) {
            opacitySlider.addEventListener('input', (e) => {
                const opacity = parseInt(e.target.value) / 100;
                opacityValue.textContent = e.target.value + '%';
                if (this.selectionManager) {
                    this.selectionManager.setSelectionOpacity(opacity);
                }
            });
        }
        
        // 预设颜色按钮
        const presetButtons = this.panel.querySelectorAll('.color-preset-btn');
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                if (this.selectionManager) {
                    this.selectionManager.setSelectionColor(color);
                    const colorPicker = document.getElementById('selectionColorPicker');
                    if (colorPicker) {
                        colorPicker.value = color;
                    }
                }
            });
        });
    }
    
    /**
     * 设置选区管理器引用
     */
    setSelectionManager(manager) {
        this.selectionManager = manager;
        this.updateInfo();
        this.syncColorSettings();
        this.syncSkipTransparentCheck();
    }
    
    /**
     * 同步颜色设置到 UI
     */
    syncColorSettings() {
        if (!this.selectionManager) return;
        
        const colorPicker = document.getElementById('selectionColorPicker');
        const inverseColorPicker = document.getElementById('inverseColorPicker');
        const opacitySlider = document.getElementById('selectionOpacitySlider');
        const opacityValue = document.getElementById('selectionOpacityValue');
        
        if (colorPicker) {
            colorPicker.value = this.selectionManager.selectionColor;
        }
        if (inverseColorPicker) {
            inverseColorPicker.value = this.selectionManager.inverseColor;
        }
        if (opacitySlider && opacityValue) {
            const opacityPercent = Math.round(this.selectionManager.selectionOpacity * 100);
            opacitySlider.value = opacityPercent;
            opacityValue.textContent = opacityPercent + '%';
        }
    }
    
    /**
     * 同步透明色块选择开关状态
     */
    syncSkipTransparentCheck() {
        const check = document.getElementById('skipTransparentCheck');
        if (check && this.selectionManager) {
            // 勾选=选择透明色块，不勾选=跳过透明色块
            check.checked = !this.selectionManager.skipTransparent;
        }
    }
    
    /**
     * 显示面板
     */
    show() {
        if (this.panel) {
            this.panel.style.display = 'block';
            this.updateInfo();
            this.syncSkipTransparentCheck();
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
     * 设置选区类型
     */
    setSelectionType(type) {
        if (!this.selectionManager) return;
        
        this.currentType = type;
        this.selectionManager.setType(type);
        
        // 同步笔刷大小
        if (type === 'smudge') {
            const slider = document.getElementById('smudgeBrushSizeSlider');
            if (slider) {
                this.selectionManager.setSmudgeBrushSize(parseInt(slider.value));
            }
        }
        
        // 更新按钮样式
        const typeButtons = this.panel.querySelectorAll('.selection-type-btn');
        typeButtons.forEach(btn => {
            if (btn.dataset.type === type) {
                btn.style.border = '2px solid #667eea';
                btn.style.background = '#667eea';
                btn.style.color = 'white';
            } else {
                btn.style.border = '2px solid #e0e0e0';
                btn.style.background = 'white';
                btn.style.color = '#333';
            }
        });
        
        // 显示/隐藏涂抹笔刷大小控制
        const smudgeControl = document.getElementById('smudgeBrushSizeControl');
        if (smudgeControl) {
            smudgeControl.style.display = type === 'smudge' ? 'block' : 'none';
        }
        
        // 更新提示文字
        const hint = document.getElementById('selectionTypeHint');
        const hints = {
            rect: '拖动鼠标框选格子（矩形区域内的所有格子被选中）',
            lasso: '按住鼠标绘制路径，选中路径包围区域内的格子',
            polygon: '点击格子创建顶点：1点选中该格，2点连成线，3点形成面',
            smudge: '按住鼠标涂抹，光标经过的格子被选中，可调整笔刷大小'
        };
        hint.textContent = hints[type] || '';
        
        this.updateInfo();
    }
    
    /**
     * 获取当前选区类型
     */
    getSelectionType() {
        return this.currentType;
    }
    
    /**
     * 反转选区
     */
    invertSelection() {
        if (!this.selectionManager || !this.selectionManager.hasSelection()) {
            alert('请先创建选区');
            return;
        }
        this.selectionManager.toggleInverse();
        this.updateInfo();
        this.app.refreshCustomEditCanvas();
    }
    
    /**
     * 清除选区
     */
    clearSelection() {
        if (!this.selectionManager) return;
        this.selectionManager.clear();
        this.updateInfo();
        this.app.refreshCustomEditCanvas();
    }
    
    /**
     * 保存选区为自定义画笔
     */
    saveAsBrush() {
        if (!this.selectionManager || !this.selectionManager.hasSelection()) {
            alert('请先创建选区');
            return;
        }
        
        if (!this.app.customEditData) {
            alert('没有画布数据');
            return;
        }
        
        // 触发保存为画笔事件，由 app.js 处理
        const event = new CustomEvent('saveSelectionAsBrush', {
            detail: { source: 'selectionPanel' }
        });
        document.dispatchEvent(event);
    }
    
    /**
     * 安全地写入剪贴板
     */
    _safeWriteToClipboard(text) {
        // 尝试使用 Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).then(() => true).catch(() => {
                // 降级方案
                return this._fallbackCopyToClipboard(text);
            });
        }
        // 降级方案
        return this._fallbackCopyToClipboard(text);
    }
    
    /**
     * 降级复制方案
     */
    _fallbackCopyToClipboard(text) {
        return new Promise((resolve) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            textarea.style.left = '-9999px';
            textarea.style.top = '-9999px';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            
            try {
                const success = document.execCommand('copy');
                document.body.removeChild(textarea);
                resolve(success);
            } catch (e) {
                document.body.removeChild(textarea);
                resolve(false);
            }
        });
    }
    
    /**
     * 安全地读取剪贴板
     */
    _safeReadFromClipboard() {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.readText();
        }
        // 如果 Clipboard API 不可用，返回错误
        return Promise.reject(new Error('Clipboard API 不可用'));
    }
    
    /**
     * 导出选区数据（复制到剪贴板）
     */
    exportSelection() {
        if (!this.selectionManager || !this.selectionManager.hasSelection()) {
            alert('请先创建选区');
            return;
        }
        
        const json = this.selectionManager.exportToJSON(this.app.customEditData);
        if (!json) {
            alert('导出失败');
            return;
        }
        
        this._safeWriteToClipboard(json).then((success) => {
            if (success) {
                alert('✅ 画笔数据已复制到剪贴板！\n\n现在可以在画笔管理面板中点击"从剪贴板"导入。');
            } else {
                // 如果自动复制失败，显示数据让用户手动复制
                const textarea = document.createElement('textarea');
                textarea.value = json;
                textarea.style.cssText = 'position: fixed; top: 100px; left: 100px; width: 400px; height: 300px; z-index: 10000;';
                textarea.setAttribute('readonly', '');
                document.body.appendChild(textarea);
                alert('❌ 自动复制失败，请在弹出的文本框中手动选择并复制内容');
                textarea.select();
            }
        });
    }
    
    /**
     * 从剪贴板粘贴画笔数据
     */
    async pasteBrush() {
        try {
            const text = await this._safeReadFromClipboard();
            const data = SelectionManager.importFromJSON(text);
            if (data) {
                alert(`✅ 画笔数据导入成功！\n名称：${data.name}\n尺寸：${data.width} × ${data.height}\n\n现在可以在画笔工具中使用自定义画笔。`);
                // 存储到 app 中
                if (this.app && this.app.customBrushes) {
                    this.app.customBrushes.push(data);
                }
            } else {
                alert('❌ 剪贴板内容不是有效的画笔数据格式');
            }
        } catch (err) {
            alert('❌ 无法读取剪贴板。请使用"保存为画笔"按钮直接保存，或从文件导入。');
        }
    }
    
    /**
     * 导入画笔数据
     */
    importBrush(file) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = SelectionManager.importFromJSON(e.target.result);
                if (data) {
                    alert(`画笔数据导入成功！\n名称：${data.name}\n尺寸：${data.width} × ${data.height}\n\n现在可以在画笔工具中使用自定义画笔。`);
                    // 存储到 app 中
                    if (this.app && this.app.customBrushes) {
                        this.app.customBrushes.push(data);
                    }
                } else {
                    alert('导入失败：无效的画笔数据格式');
                }
            } catch (err) {
                alert('导入失败：' + err.message);
            }
        };
        reader.readAsText(file);
    }
    
    /**
     * 更新选区信息显示
     */
    updateInfo() {
        if (!this.selectionManager) return;
        
        const info = this.selectionManager.getInfo();
        const statusEl = document.getElementById('selectionStatus');
        const boundsEl = document.getElementById('selectionBounds');
        const boundsValueEl = document.getElementById('selectionBoundsValue');
        const countEl = document.getElementById('selectionCount');
        const countValueEl = document.getElementById('selectionCountValue');
        
        if (!info) {
            statusEl.textContent = '未创建';
            statusEl.style.color = '#999';
            boundsEl.style.display = 'none';
            countEl.style.display = 'none';
            return;
        }
        
        statusEl.textContent = info.inverse ? '已反转' : '已创建';
        statusEl.style.color = info.inverse ? '#e74c3c' : '#27ae60';
        
        if (info.bounds) {
            boundsEl.style.display = 'flex';
            boundsValueEl.textContent = `${info.bounds.width} × ${info.bounds.height}`;
        } else {
            boundsEl.style.display = 'none';
        }
        
        countEl.style.display = 'flex';
        countValueEl.textContent = `${info.selectedCount} 格 (${(info.selectedCount / info.totalCount * 100).toFixed(1)}%)`;
    }
    
    /**
     * 使面板可拖动
     */
    makeDraggable(element, handle) {
        let offsetX, offsetY, isDragging = false;
        
        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - element.offsetLeft;
            offsetY = e.clientY - element.offsetTop;
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            element.style.left = (e.clientX - offsetX) + 'px';
            element.style.top = (e.clientY - offsetY) + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
}

// 导出到全局
window.SelectionPanel = SelectionPanel;
