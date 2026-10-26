/**
 * WorkspaceMixin — Showcase显隐+面板open/close+Selection/BrushManager初始化-19方法
 * 来源: app.js L7060-L7361
 */

const WorkspaceMixin = {
    hideShowcase() {
        if (this.showcaseSection) {
            this.showcaseSection.style.display = 'none';
        }
    },

    showShowcase() {
        if (this.showcaseSection) {
            this.showcaseSection.style.display = '';
        }
    },

    hideAllInitialSections() {
        if (this.uploadSection) {
            this.uploadSection.style.display = 'none';
        }
        if (this.showcaseSection) {
            this.showcaseSection.style.display = 'none';
        }
    },

    showAllInitialSections() {
        if (this.uploadSection) {
            this.uploadSection.style.display = '';
        }
        if (this.showcaseSection) {
            this.showcaseSection.style.display = '';
        }
    },

    setWorkspaceMode(mode) {
        this.isBlankCanvasMode = (mode === 'blank');

        if (this.isBlankCanvasMode) {
            if (this.originalSection) this.originalSection.style.display = 'none';
            if (this.pixelatedSection) this.pixelatedSection.style.display = 'none';
            if (this.modeSwitch) this.modeSwitch.style.display = 'none';
            if (this.perlerSection) this.perlerSection.style.display = '';
            if (this.customEditSection) this.customEditSection.style.display = '';
        } else {
            if (this.originalSection) this.originalSection.style.display = '';
            if (this.pixelatedSection) this.pixelatedSection.style.display = '';
            if (this.modeSwitch) this.modeSwitch.style.display = '';
            if (this.perlerSection) this.perlerSection.style.display = '';
            if (this.customEditSection) this.customEditSection.style.display = '';
        }
    },

    openBlankCanvasModal() {
        if (this.blankCanvasModal) {
            document.querySelectorAll('.blank-size-btn').forEach(b => b.classList.remove('active'));
            this.blankCanvasWidth.value = 52;
            this.blankCanvasHeight.value = 52;
            this.blankCanvasModal.style.display = 'flex';
        }
    },

    closeBlankCanvasModal() {
        if (this.blankCanvasModal) {
            this.blankCanvasModal.style.display = 'none';
        }
    },

    createBlankCanvas(width, height) {
        if (!width || !height || width < 8 || height < 8) {
            alert(getI18nText('alertCanvasTooSmall'));
            return;
        }
        if (width > 256 || height > 256) {
            alert(getI18nText('alertCanvasTooLarge'));
            return;
        }

        this.closeBlankCanvasModal();

        this.hideAllInitialSections();
        if (this.workspace) {
            this.workspace.style.display = 'block';
        }

        this.perlerWidth = width;
        this.perlerHeight = height;

        const transparentColor = {
            name: '',
            rgb: [255, 255, 255],
            isTransparent: true,
            displayName: ''
        };

        this.perlerColors = [];
        for (let y = 0; y < height; y++) {
            const row = [];
            for (let x = 0; x < width; x++) {
                row.push({ ...transparentColor });
            }
            this.perlerColors.push(row);
        }

        this.colorCounts = {};

        const colorSetName = this.colorSetSelect.value;
        this.drawPerlerChart(this.perlerColors, width, height, colorSetName);
        this.drawColorLegend();
        this.perlerSize.textContent = `${getI18nText('perlerSize')}: ${width} × ${height} ${getI18nText('beans')}`;
        this.initCustomEditData();

        this.setWorkspaceMode('blank');
    },

    openStrokePanel() {
        if (this.strokePanel) {
            document.querySelectorAll('input[name="strokeType"][value="outer"]').forEach(r => r.checked = true);
            this.strokeThickness.value = 1;
            this.strokeThicknessValue.textContent = '1';
            this.strokeColor.value = '#000000';
            this.strokeColorValue.textContent = '#000000';
            this.strokePanel.style.display = 'block';
        }
    },

    closeStrokePanel() {
        if (this.strokePanel) {
            this.strokePanel.style.display = 'none';
        }
    },

    openColorRemovePanel() {
        if (this.colorRemovePanel) {
            this.colorRemovePanel.style.display = 'block';
        }
    },

    closeColorRemovePanel() {
        if (this.colorRemovePanel) {
            this.colorRemovePanel.style.display = 'none';
            this.pickRemoveColorMode = false;
            this.pickRemoveColorBtn.classList.remove('color-pick-active');
        }
    },

    openColorConvertPanel() {
        if (this.colorConvertPanel) {
            this.colorConvertPanel.style.display = 'block';
        }
    },

    openNoiseFilterPanel() {
        if (this.noiseFilterPanel) {
            this.noiseFilterPanel.style.display = 'block';
        }
    },

    closeNoiseFilterPanel() {
        if (this.noiseFilterPanel) {
            this.noiseFilterPanel.style.display = 'none';
        }
    },

    initSelectionPanel() {
        if (this.selectionPanel) {
            this.selectionPanel.show();
            return;
        }

        if (typeof SelectionPanel === 'undefined') {
            console.error('SelectionPanel 模块未加载');
            return;
        }

        this.selectionPanel = new SelectionPanel(this);

        // 将自定义编辑器的选区管理器关联到面板
        if (this.customEditor && this.customEditor.selectionManager) {
            this.selectionPanel.setSelectionManager(this.customEditor.selectionManager);

            // 设置选区管理器回调
            this.customEditor.selectionManager.onChange = () => {
                this.selectionPanel.updateInfo();
                this.drawCustomEditCanvas();
            };
        }

        this.selectionPanel.show();
    },

    initBrushManager() {
        if (this.brushPanel) {
            this.brushPanel.show();
            return;
        }

        if (typeof BrushManager === 'undefined' || typeof BrushPanel === 'undefined') {
            console.error('BrushManager 或 BrushPanel 模块未加载');
            return;
        }

        // 创建画笔管理器
        this.brushManager = new BrushManager();

        // 设置画笔变更回调 - 触发画布重绘以显示预笔迹
        this.brushManager.onBrushChange = () => {
            // 如果当前使用的是 customBrush 工具，重绘画布
            if (this.currentEditTool === 'customBrush' && this.customEditCanvas) {
                // 触发一次重绘，让预笔迹显示
                if (this.lastCustomEditMouseEvent) {
                    this.drawCustomEditCanvas();
                }
            }
        };

        // 创建画笔面板
        this.brushPanel = new BrushPanel(this.brushManager);

        // 设置保存选区为画笔的事件监听
        document.addEventListener('saveSelectionAsBrush', (e) => {
            this.handleSaveSelectionAsBrush();
        });

        // 设置清除当前画笔按钮事件
        const clearBtn = document.getElementById('clearCurrentBrushBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (this.brushManager) {
                    this.brushManager.clearCurrentBrush();
                }
            });
        }

        // 设置画笔面板关闭按钮事件
        const closeBtn = document.getElementById('closeBrushBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (this.brushPanel) {
                    this.brushPanel.hide();
                }
                // 只关闭面板，不切换工具，让用户决定何时切回
            });
        }

        this.brushPanel.show();
    },

    handleSaveSelectionAsBrush() {
        if (!this.customEditor || !this.customEditor.selectionManager) {
            alert('请先创建选区');
            return;
        }

        const selectionManager = this.customEditor.selectionManager;
        if (!selectionManager.hasSelection()) {
            alert('请先在画布上创建选区');
            return;
        }

        // 获取选区数据 - 直接使用 customEditData
        if (!this.customEditData) {
            alert('没有画布数据');
            return;
        }

        const selectionData = selectionManager.exportSelectionData(this.customEditData);

        if (!selectionData) {
            alert('导出选区数据失败，请确认选区内容有效');
            return;
        }

        // 让用户输入画笔名称
        const defaultName = `画笔 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
        const brushName = prompt('输入画笔名称：', defaultName);

        if (!brushName) return;

        // 创建画笔
        const brush = this.brushManager.createBrushFromSelection(selectionData, brushName);

        if (brush) {
            // 选中新创建的画笔
            this.brushManager.selectBrush(brush.id);
            alert(`✓ 画笔 "${brushName}" 已保存！\n\n现在可以在画布上点击或拖动使用此画笔。`);
        } else {
            alert('创建画笔失败');
        }
    },

    refreshCustomEditCanvas() {
        this.drawCustomEditCanvas();
    },
};

if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, WorkspaceMixin);
}
if (typeof window !== 'undefined') {
    window.WorkspaceMixin = WorkspaceMixin;
}
