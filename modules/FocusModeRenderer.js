class FocusModeRenderer {
    constructor() {
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.controlsPanel = null;
        this.fab = null;
        this.colorPickerPanel = null;
        this.perlerColors = null;
        this.width = 0;
        this.height = 0;
        this.colorSet = null;
        this.cellSize = 20;
        this.zoomLevel = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.highlightColor = null;
        this.placedBeans = new Set();
        this.panelMode = 'minimized';
        this.isActive = false;
        this.originalBodyOverflow = '';
        this.showCoords = true;
        this.showColorCodes = false;
        this.showGrid = true;
        this.gridColor = '#ffffff';
        this.showSingleHighlight = false;
        this.highlightedColorName = null;
        this.colorStats = [];
        this.lockedColors = new Set();
        this.lastTouchDistance = 0;
        this.flipHorizontal = false;
        this.materialListModal = null;
        this.showMaterialListOnStart = true;
    }

    init(containerSelector, perlerColors, width, height, colorSet, onExitCallback) {
        // 重置所有状态，避免残留导致的 bug
        this.zoomLevel = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.showCoords = true;
        this.showColorCodes = false;
        this.showGrid = true;
        this.gridColor = '#ffffff';
        this.showSingleHighlight = false;
        this.highlightedColorName = null;
        this.lockedColors.clear();
        this.placedBeans.clear();
        this.colorStats = [];
        this.lastTouchDistance = 0;
        this.flipHorizontal = false;

        this.perlerColors = perlerColors;
        this.width = width;
        this.height = height;
        this.colorSet = colorSet;
        this.onExitCallback = onExitCallback || null;
        this.container = document.querySelector(containerSelector);

        if (!this.container) {
            console.error('容器未找到:', containerSelector);
            return;
        }

        this.calculateColorStats();
        this.render();
        this.attachEvents();
        this.isActive = true;

        if (this.showMaterialListOnStart) {
            this.showMaterialListModal();
        }
    }

    calculateColorStats() {
        const colorMap = new Map();
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const color = this.perlerColors[y][x];
                if (!color.isTransparent) {
                    const key = color.name;
                    if (!colorMap.has(key)) {
                        colorMap.set(key, {
                            name: color.name,
                            rgb: [Math.round(color.rgb[0]), Math.round(color.rgb[1]), Math.round(color.rgb[2])],
                            count: 0
                        });
                    }
                    colorMap.get(key).count++;
                }
            }
        }
        this.colorStats = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);
    }

    render() {
        this.container.innerHTML = '';
        this.originalBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #1a1a2e;
            z-index: 10000;
            overflow: hidden;
        `;

        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            cursor: grab;
        `;
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.createControlsPanel();
        this.resizeCanvas();
        this.drawChart();
    }

    createControlsPanel() {
        this.topBar = document.createElement('div');
        this.topBar.style.cssText = `
            position: absolute;
            top: 20px;
            left: 20px;
            right: 20px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            z-index: 10001;
        `;

        this.controlsPanel = document.createElement('div');
        this.controlsPanel.style.cssText = `
            position: absolute;
            top: 0;
            right: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            padding: 18px;
            border-radius: 18px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            width: 280px;
            transition: opacity 0.3s, transform 0.3s;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;

        this.controlsPanel.innerHTML = `
            <div style="margin-bottom: 15px;">
                <button id="focus-exit-btn" style="width: 100%; padding: 12px; background: rgba(255, 59, 48, 0.9); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    🏠 退出专注模式
                </button>
            </div>
            <div style="margin-bottom: 15px;">
                <button id="focus-material-list-btn" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #ff9500, #ff6b00); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    📋 材料清单
                </button>
            </div>
            <div style="margin-bottom: 18px;">
                <div style="margin-bottom: 10px; font-weight: 600; color: #fff; font-size: 13px;">🔍 缩放控制</div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button id="zoom-out-btn" style="flex: 1; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.1); color: #fff; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600;">-</button>
                    <span id="zoom-level" style="font-size: 13px; color: rgba(255, 255, 255, 0.7); min-width: 50px; text-align: center;">100%</span>
                    <button id="zoom-in-btn" style="flex: 1; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.1); color: #fff; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600;">+</button>
                </div>
                <button id="zoom-reset-btn" style="width: 100%; margin-top: 10px; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.1); color: #fff; border-radius: 10px; cursor: pointer; font-size: 13px;">
                    重置缩放
                </button>
            </div>
            <div style="margin-bottom: 18px;">
                <div style="margin-bottom: 10px; font-weight: 600; color: #fff; font-size: 13px;">📋 显示设置</div>
                <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; font-size: 14px; color: rgba(255, 255, 255, 0.85);">
                    <input type="checkbox" id="show-coords-checkbox" ${this.showCoords ? 'checked' : ''} style="margin-right: 10px; width: 18px; height: 18px; accent-color: #007aff; cursor: pointer;">
                    显示坐标编号
                </label>
                <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; font-size: 14px; color: rgba(255, 255, 255, 0.85);">
                    <input type="checkbox" id="show-color-codes-checkbox" ${this.showColorCodes ? 'checked' : ''} style="margin-right: 10px; width: 18px; height: 18px; accent-color: #007aff; cursor: pointer;">
                    显示颜色编号
                </label>
                <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; font-size: 14px; color: rgba(255, 255, 255, 0.85);">
                    <input type="checkbox" id="show-grid-checkbox" ${this.showGrid ? 'checked' : ''} style="margin-right: 10px; width: 18px; height: 18px; accent-color: #007aff; cursor: pointer;">
                    显示网格线
                </label>
                <label style="display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; font-size: 14px; color: rgba(255, 255, 255, 0.85);">
                    <input type="checkbox" id="show-single-highlight-checkbox" ${this.showSingleHighlight ? 'checked' : ''} style="margin-right: 10px; width: 18px; height: 18px; accent-color: #007aff; cursor: pointer;">
                    单色提亮
                </label>
                <div style="display: flex; align-items: center; margin-top: 10px; font-size: 14px; color: rgba(255, 255, 255, 0.85);">
                    <span style="margin-right: 12px;">网格线颜色:</span>
                    <input type="color" id="grid-color-picker" value="${this.gridColor}" style="width: 38px; height: 28px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; cursor: pointer; background: transparent;">
                </div>
            </div>
            <div style="margin-bottom: 18px;">
                <div style="margin-bottom: 10px; font-weight: 600; color: #fff; font-size: 13px;">🔄 变换控制</div>
                <button id="flip-horizontal-btn" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.1); color: #fff; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    ↔️ 左右反转
                </button>
            </div>
            <div>
                <div style="margin-bottom: 10px; font-weight: 600; color: #fff; font-size: 13px;">📐 图纸信息</div>
                <div style="font-size: 13px; color: rgba(255, 255, 255, 0.6); line-height: 1.6;">
                    尺寸: ${this.width} × ${this.height} 颗<br>
                    色系: ${this.colorSet}<br>
                    点击空白区域缩小为悬浮按钮
                </div>
            </div>
        `;

        this.controlsPanel.addEventListener('mousedown', (e) => e.stopPropagation());
        this.controlsPanel.addEventListener('wheel', (e) => e.stopPropagation());
        this.controlsPanel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        this.controlsPanel.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
        this.controlsPanel.addEventListener('click', (e) => e.stopPropagation());

        this.topBar.appendChild(this.controlsPanel);
        this.container.appendChild(this.topBar);
        this.createFAB();
        this.attachControlsEvents();
        this.applyPanelMode();
    }

    createFAB() {
        if (this.fab && this.fab.parentNode) {
            this.fab.parentNode.removeChild(this.fab);
        }

        this.fab = document.createElement('div');
        this.fab.style.cssText = `
            position: absolute;
            top: 0;
            right: 0;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: rgba(0, 122, 255, 0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
            cursor: pointer;
            transition: opacity 0.3s, transform 0.3s;
            border: 1px solid rgba(255, 255, 255, 0.2);
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
        `;
        this.fab.textContent = '⚙️';

        this.fab.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanelMode();
        });
        this.fab.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        this.topBar.appendChild(this.fab);
    }

    applyPanelMode() {
        if (this.panelMode === 'full') {
            this.controlsPanel.style.visibility = 'visible';
            setTimeout(() => {
                this.controlsPanel.style.opacity = '1';
                this.controlsPanel.style.pointerEvents = 'auto';
            }, 10);
            if (this.fab) {
                this.fab.style.opacity = '0';
                this.fab.style.pointerEvents = 'none';
                setTimeout(() => {
                    this.fab.style.visibility = 'hidden';
                }, 300);
            }
            if (this.colorPickerPanel) {
                this.colorPickerPanel.style.maxWidth = 'calc(100% - 300px)';
            }
        } else {
            this.controlsPanel.style.opacity = '0';
            this.controlsPanel.style.pointerEvents = 'none';
            setTimeout(() => {
                this.controlsPanel.style.visibility = 'hidden';
            }, 300);
            if (this.fab) {
                this.fab.style.visibility = 'visible';
                setTimeout(() => {
                    this.fab.style.opacity = '1';
                    this.fab.style.pointerEvents = 'auto';
                }, 10);
            }
            if (this.colorPickerPanel) {
                this.colorPickerPanel.style.maxWidth = 'calc(100% - 70px)';
            }
        }
    }

    togglePanelMode() {
        this.panelMode = this.panelMode === 'full' ? 'minimized' : 'full';
        this.applyPanelMode();
    }

    attachControlsEvents() {
        const exitBtn = this.controlsPanel.querySelector('#focus-exit-btn');
        const zoomInBtn = this.controlsPanel.querySelector('#zoom-in-btn');
        const zoomOutBtn = this.controlsPanel.querySelector('#zoom-out-btn');
        const zoomResetBtn = this.controlsPanel.querySelector('#zoom-reset-btn');
        const showCoordsCheckbox = this.controlsPanel.querySelector('#show-coords-checkbox');
        const showColorCodesCheckbox = this.controlsPanel.querySelector('#show-color-codes-checkbox');
        const showGridCheckbox = this.controlsPanel.querySelector('#show-grid-checkbox');
        const gridColorPicker = this.controlsPanel.querySelector('#grid-color-picker');
        const showSingleHighlightCheckbox = this.controlsPanel.querySelector('#show-single-highlight-checkbox');
        const flipHorizontalBtn = this.controlsPanel.querySelector('#flip-horizontal-btn');

        exitBtn.addEventListener('click', () => this.exit());
        zoomInBtn.addEventListener('click', () => this.zoomIn());
        zoomOutBtn.addEventListener('click', () => this.zoomOut());
        zoomResetBtn.addEventListener('click', () => this.resetZoom());
        showCoordsCheckbox.addEventListener('change', (e) => {
            this.showCoords = e.target.checked;
            this.drawChart();
        });
        showColorCodesCheckbox.addEventListener('change', (e) => {
            this.showColorCodes = e.target.checked;
            this.drawChart();
        });
        showGridCheckbox.addEventListener('change', (e) => {
            this.showGrid = e.target.checked;
            this.drawChart();
        });
        gridColorPicker.addEventListener('input', (e) => {
            this.gridColor = e.target.value;
            this.drawChart();
        });
        showSingleHighlightCheckbox.addEventListener('change', (e) => {
            this.showSingleHighlight = e.target.checked;
            if (this.showSingleHighlight) {
                this.createColorPickerPanel();
            } else {
                this.removeColorPickerPanel();
                this.highlightedColorName = null;
            }
            this.drawChart();
        });
        flipHorizontalBtn.addEventListener('click', () => {
            this.flipHorizontal = !this.flipHorizontal;
            this.drawChart();
        });

        const materialListBtn = this.controlsPanel.querySelector('#focus-material-list-btn');
        if (materialListBtn) {
            materialListBtn.addEventListener('click', () => {
                this.toggleMaterialListModal();
            });
        }
    }

    createColorPickerPanel() {
        if (this.colorPickerPanel) return;
        
        const maxWidth = this.panelMode === 'full' ? 'calc(100% - 300px)' : 'calc(100% - 70px)';
        this.colorPickerPanel = document.createElement('div');
        this.colorPickerPanel.style.cssText = `
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            padding: 12px 16px;
            border-radius: 18px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            gap: 8px;
            align-items: center;
            overflow-x: auto;
            overflow-y: hidden;
            max-width: ${maxWidth};
            max-height: 70px;
            scrollbar-width: none;
            -ms-overflow-style: none;
            touch-action: pan-x;
            -webkit-user-select: none;
            user-select: none;
            margin-right: auto;
            transition: max-width 0.5s ease;
        `;

        this.colorPickerPanel.classList.add('focus-mode-color-picker');
        const existingStyle = document.getElementById('focus-mode-picker-style');
        if (!existingStyle) {
            const hideScrollbarStyle = document.createElement('style');
            hideScrollbarStyle.id = 'focus-mode-picker-style';
            hideScrollbarStyle.textContent = `
                .focus-mode-color-picker::-webkit-scrollbar { display: none; width: 0; height: 0; }
            `;
            document.head.appendChild(hideScrollbarStyle);
        }

        const items = this.colorStats.map((color) => {
            const r = Math.round(color.rgb[0]);
            const g = Math.round(color.rgb[1]);
            const b = Math.round(color.rgb[2]);
            const rgb = `rgb(${r}, ${g}, ${b})`;
            const borderRgb = `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)})`;
            const isSelected = this.highlightedColorName === color.name;
            const isLocked = this.lockedColors.has(color.name);
            let borderStyle = '2px solid transparent';
            if (isLocked) {
                borderStyle = '3px solid #34c759';
            } else if (isSelected) {
                borderStyle = '2px solid #007aff';
            }
            let bgStyle = isSelected ? 'rgba(0, 122, 255, 0.3)' : 'transparent';
            if (isLocked) {
                bgStyle = 'rgba(52, 199, 89, 0.2)';
            }
            return `
                <div class="color-swatch-item" data-color="${color.name}" style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 6px 10px;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: ${bgStyle};
                    border: ${borderStyle};
                    flex-shrink: 0;
                    min-width: 60px;
                    -webkit-user-select: none;
                    user-select: none;
                    -webkit-tap-highlight-color: transparent;
                ">
                    <div style="
                        width: 28px;
                        height: 28px;
                        border-radius: 6px;
                        background: ${rgb};
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
                        border: 1px solid ${borderRgb};
                        pointer-events: none;
                        position: relative;
                    ">${isLocked ? '<div style=\"position:absolute;top:-6px;right:-6px;width:14px;height:14px;border-radius:50%;background:#34c759;color:white;font-size:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.4);\">✓</div>' : ''}</div>
                    <div style="
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.9);
                        margin-top: 4px;
                        font-weight: 500;
                        pointer-events: none;
                    ">${color.name}</div>
                    <div style="
                        font-size: 10px;
                        color: rgba(255, 255, 255, 0.6);
                        pointer-events: none;
                    ">×${color.count}</div>
                </div>
            `;
        }).join('');

        this.colorPickerPanel.innerHTML = items;
        if (this.topBar && this.controlsPanel) {
            this.topBar.insertBefore(this.colorPickerPanel, this.controlsPanel);
        } else {
            this.container.appendChild(this.colorPickerPanel);
        }

        this.colorPickerPanel.addEventListener('wheel', (e) => {
            e.stopPropagation();
        }, { passive: true });

        this.colorPickerPanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        this.colorPickerPanel.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        const swatches = this.colorPickerPanel.querySelectorAll('.color-swatch-item');
        swatches.forEach((swatch) => {
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                const colorName = swatch.dataset.color;

                const isHighlighted = this.highlightedColorName === colorName;
                const isLocked = this.lockedColors.has(colorName);

                if (!isHighlighted && !isLocked) {
                    this.highlightedColorName = colorName;
                } else if (isHighlighted && !isLocked) {
                    this.highlightedColorName = null;
                    this.lockedColors.add(colorName);
                } else if (!isHighlighted && isLocked) {
                    this.lockedColors.delete(colorName);
                }

                const currentScroll = this.colorPickerPanel.scrollLeft;
                this.removeColorPickerPanel();
                this.createColorPickerPanel();
                if (this.colorPickerPanel) {
                    this.colorPickerPanel.scrollLeft = currentScroll;
                }
                this.drawChart();
            });
        });
    }

    removeColorPickerPanel() {
        if (this.colorPickerPanel && this.colorPickerPanel.parentNode) {
            this.colorPickerPanel.parentNode.removeChild(this.colorPickerPanel);
        }
        this.colorPickerPanel = null;
    }

    showMaterialListModal() {
        if (this.materialListModal) {
            this.materialListModal.style.display = 'flex';
            return;
        }

        const totalBeans = this.colorStats.reduce((sum, c) => sum + c.count, 0);
        const colorCount = this.colorStats.length;

        const items = this.colorStats.map((color, idx) => {
            const r = Math.round(color.rgb[0]);
            const g = Math.round(color.rgb[1]);
            const b = Math.round(color.rgb[2]);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const textColor = luminance > 0.5 ? '#000' : '#fff';
            const borderRgb = `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)})`;
            return `
                <div style="display: flex; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.08);">
                    <div style="width: 22px; height: 22px; background: ${idx < 3 ? '#ff9500' : 'transparent'}; color: white; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; border-radius: 6px; margin-right: 10px; flex-shrink: 0;">${idx + 1}</div>
                    <div style="width: 32px; height: 32px; background: rgb(${r},${g},${b}); border: 1px solid ${borderRgb}; border-radius: 8px; margin-right: 12px; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
                    <div style="flex: 1; display: flex; align-items: center; min-width: 0;">
                        <span style="color: white; font-size: 14px; font-weight: 600; flex-shrink: 0;">${color.name}</span>
                        <span style="color: rgba(255,255,255,0.5); font-size: 12px; margin-left: auto; flex-shrink: 0;">${color.count} 颗</span>
                    </div>
                </div>
            `;
        }).join('');

        this.materialListModal = document.createElement('div');
        this.materialListModal.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 10002;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        `;

        const top3Colors = this.colorStats.slice(0, 3).map(c => c.name).join('、');

        this.materialListModal.innerHTML = `
            <div style="
                background: #1a1a2e;
                border-radius: 20px;
                padding: 24px;
                width: 100%;
                max-width: 420px;
                max-height: 85vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            ">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-shrink: 0;">
                    <h3 style="color: white; margin: 0; font-size: 18px; font-weight: 700;">📋 材料清单</h3>
                    <button id="material-list-close" style="background: none; border: none; color: rgba(255,255,255,0.5); font-size: 20px; cursor: pointer; padding: 4px 8px; line-height: 1;">✕</button>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 16px; flex-shrink: 0;">
                    <div style="flex: 1; background: rgba(255,149,0,0.15); border-radius: 12px; padding: 12px; text-align: center; border: 1px solid rgba(255,149,0,0.2);">
                        <div style="color: rgba(255,149,0,0.7); font-size: 11px; margin-bottom: 4px;">总豆数</div>
                        <div style="color: #ff9500; font-size: 20px; font-weight: 700;">${totalBeans}</div>
                    </div>
                    <div style="flex: 1; background: rgba(0,122,255,0.15); border-radius: 12px; padding: 12px; text-align: center; border: 1px solid rgba(0,122,255,0.2);">
                        <div style="color: rgba(0,122,255,0.7); font-size: 11px; margin-bottom: 4px;">色号数</div>
                        <div style="color: #007aff; font-size: 20px; font-weight: 700;">${colorCount}</div>
                    </div>
                    <div style="flex: 1; background: rgba(52,199,89,0.15); border-radius: 12px; padding: 12px; text-align: center; border: 1px solid rgba(52,199,89,0.2);">
                        <div style="color: rgba(52,199,89,0.7); font-size: 11px; margin-bottom: 4px;">Top 3</div>
                        <div style="color: #34c759; font-size: 12px; font-weight: 600; line-height: 1.5; padding-top: 2px;">${top3Colors}</div>
                    </div>
                </div>
                <div style="flex: 1; overflow-y: auto; padding-right: 4px; margin-bottom: 16px;">
                    ${items}
                </div>
                <button id="material-list-start" style="
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    border-radius: 14px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                    flex-shrink: 0;
                ">
                    🎯 开始专注
                </button>
            </div>
        `;

        this.materialListModal.querySelector('#material-list-start').addEventListener('click', () => {
            this.hideMaterialListModal();
        });
        this.materialListModal.querySelector('#material-list-close').addEventListener('click', () => {
            this.hideMaterialListModal();
        });
        this.materialListModal.addEventListener('click', (e) => {
            if (e.target === this.materialListModal) {
                this.hideMaterialListModal();
            }
        });

        this.container.appendChild(this.materialListModal);
    }

    hideMaterialListModal() {
        if (this.materialListModal) {
            this.materialListModal.style.display = 'none';
        }
    }

    toggleMaterialListModal() {
        if (!this.materialListModal || this.materialListModal.style.display === 'none') {
            this.showMaterialListModal();
        } else {
            this.hideMaterialListModal();
        }
    }

    attachEvents() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('dblclick', () => this.resetZoom());

        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.drawChart();
        });

        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            this.lastTouchDistance = this.getTouchDistance(e.touches);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (this.isDragging && e.touches.length === 1) {
            const deltaX = e.touches[0].clientX - this.lastMouseX;
            const deltaY = e.touches[0].clientY - this.lastMouseY;
            this.offsetX += deltaX;
            this.offsetY += deltaY;
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
            this.drawChart();
        } else if (e.touches.length === 2) {
            const currentDistance = this.getTouchDistance(e.touches);
            if (this.lastTouchDistance > 0) {
                const delta = currentDistance / this.lastTouchDistance;
                this.zoomLevel = Math.max(0.1, Math.min(5, this.zoomLevel * delta));
                this.updateZoomDisplay();
                this.drawChart();
            }
            this.lastTouchDistance = currentDistance;
        }
    }

    handleTouchEnd(e) {
        if (e.touches.length === 0) {
            if (this.isDragging) {
                const dx = Math.abs((this.lastMouseX || 0) - (this.touchStartX || 0));
                const dy = Math.abs((this.lastMouseY || 0) - (this.touchStartY || 0));
                if (dx < 10 && dy < 10) {
                    const touch = e.changedTouches[0];
                    if (this.isClickInsideTopBar(touch.clientX, touch.clientY)) {
                        this.isDragging = false;
                        this.lastTouchDistance = 0;
                        return;
                    }
                    if (this.panelMode === 'full') {
                        this.togglePanelMode();
                    }
                }
            }
            this.isDragging = false;
            this.lastTouchDistance = 0;
        }
    }

    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }

    handleMouseMove(e) {
        if (this.isDragging) {
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;
            this.offsetX += deltaX;
            this.offsetY += deltaY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.drawChart();
        }
    }

    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }

    handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoomLevel = Math.max(0.1, Math.min(5, this.zoomLevel * delta));
        this.updateZoomDisplay();
        this.drawChart();
    }

    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.isClickInsideTopBar(e.clientX, e.clientY)) {
            return;
        }

        if (this.panelMode === 'full') {
            this.togglePanelMode();
        }
    }

    isClickInsideControls(x, y) {
        const rect = this.controlsPanel.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    isClickInsideTopBar(x, y) {
        if (!this.topBar) return false;
        const rect = this.topBar.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    handleKeyDown(e) {
        if (!this.isActive) return;

        switch (e.key) {
            case 'Escape':
                if (this.materialListModal && this.materialListModal.style.display !== 'none') {
                    this.hideMaterialListModal();
                } else {
                    this.exit();
                }
                break;
            case '+':
            case '=':
                this.zoomIn();
                break;
            case '-':
                this.zoomOut();
                break;
            case '0':
                this.resetZoom();
                break;
        }
    }

    zoomIn() {
        this.zoomLevel = Math.min(5, this.zoomLevel * 1.2);
        this.updateZoomDisplay();
        this.drawChart();
    }

    zoomOut() {
        this.zoomLevel = Math.max(0.1, this.zoomLevel / 1.2);
        this.updateZoomDisplay();
        this.drawChart();
    }

    resetZoom() {
        this.zoomLevel = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.updateZoomDisplay();
        this.drawChart();
    }

    updateZoomDisplay() {
        const zoomDisplay = this.controlsPanel.querySelector('#zoom-level');
        if (zoomDisplay) {
            zoomDisplay.textContent = Math.round(this.zoomLevel * 100) + '%';
        }
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    calculateOptimalCellSize() {
        const padding = 100;
        const maxWidth = window.innerWidth - padding * 2;
        const maxHeight = window.innerHeight - padding * 2;

        const cellSizeByWidth = Math.floor(maxWidth / this.width);
        const cellSizeByHeight = Math.floor(maxHeight / this.height);

        return Math.max(10, Math.min(50, Math.min(cellSizeByWidth, cellSizeByHeight)));
    }

    drawChart() {
        if (!this.ctx || !this.perlerColors) return;

        const optimalCellSize = this.calculateOptimalCellSize();
        this.cellSize = Math.max(5, Math.floor(optimalCellSize * this.zoomLevel));

        const chartWidth = this.width * this.cellSize;
        const chartHeight = this.height * this.cellSize;

        const coordSize = this.showCoords ? Math.max(30, Math.floor(this.cellSize * 1.4)) : 0;
        const totalWidth = coordSize * 2 + chartWidth;
        const totalHeight = coordSize * 2 + chartHeight;

        const centerX = (window.innerWidth - totalWidth) / 2 + this.offsetX;
        const centerY = (window.innerHeight - totalHeight) / 2 + this.offsetY;

        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#16213e';
        this.ctx.fillRect(centerX - 10, centerY - 10, totalWidth + 20, totalHeight + 20);

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const sourceX = this.flipHorizontal ? (this.width - 1 - x) : x;
                const color = this.perlerColors[y][sourceX];
                const px = centerX + coordSize + x * this.cellSize;
                const py = centerY + coordSize + y * this.cellSize;

                const isHighlighted = this.showSingleHighlight && this.highlightedColorName && color.name === this.highlightedColorName && !color.isTransparent;

                if (color.isTransparent) {
                    this.ctx.fillStyle = '#16213e';
                } else {
                    const cr = Math.round(color.rgb[0]);
                    const cg = Math.round(color.rgb[1]);
                    const cb = Math.round(color.rgb[2]);
                    if (this.showSingleHighlight && this.highlightedColorName) {
                        if (color.name === this.highlightedColorName) {
                            this.ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
                        } else {
                            this.ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.15)`;
                        }
                    } else {
                        this.ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
                    }
                }

                this.ctx.fillRect(px, py, this.cellSize - 1, this.cellSize - 1);

                if (isHighlighted) {
                    const topSourceX = this.flipHorizontal ? (this.width - 1 - x) : x;
                    const bottomSourceX = this.flipHorizontal ? (this.width - 1 - x) : x;
                    const leftSourceX = this.flipHorizontal ? (this.width - 1 - (x - 1)) : (x - 1);
                    const rightSourceX = this.flipHorizontal ? (this.width - 1 - (x + 1)) : (x + 1);
                    
                    const isTopHighlight = y === 0 || this.perlerColors[y - 1][topSourceX].name !== this.highlightedColorName || this.perlerColors[y - 1][topSourceX].isTransparent;
                    const isBottomHighlight = y === this.height - 1 || this.perlerColors[y + 1][bottomSourceX].name !== this.highlightedColorName || this.perlerColors[y + 1][bottomSourceX].isTransparent;
                    const isLeftHighlight = x === 0 || this.perlerColors[y][leftSourceX].name !== this.highlightedColorName || this.perlerColors[y][leftSourceX].isTransparent;
                    const isRightHighlight = x === this.width - 1 || this.perlerColors[y][rightSourceX].name !== this.highlightedColorName || this.perlerColors[y][rightSourceX].isTransparent;

                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                    this.ctx.lineWidth = 2;

                    if (isTopHighlight) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(px, py);
                        this.ctx.lineTo(px + this.cellSize - 1, py);
                        this.ctx.stroke();
                    }
                    if (isBottomHighlight) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(px, py + this.cellSize - 1);
                        this.ctx.lineTo(px + this.cellSize - 1, py + this.cellSize - 1);
                        this.ctx.stroke();
                    }
                    if (isLeftHighlight) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(px, py);
                        this.ctx.lineTo(px, py + this.cellSize - 1);
                        this.ctx.stroke();
                    }
                    if (isRightHighlight) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(px + this.cellSize - 1, py);
                        this.ctx.lineTo(px + this.cellSize - 1, py + this.cellSize - 1);
                        this.ctx.stroke();
                    }
                }

                if (this.showColorCodes && !color.isTransparent && this.cellSize >= 12) {
                    const shouldShowCode = !this.showSingleHighlight || !this.highlightedColorName || color.name === this.highlightedColorName;
                    if (shouldShowCode) {
                        const fontSize = Math.max(6, Math.floor(this.cellSize * 0.4));
                        this.ctx.fillStyle = this.getContrastTextColor(color.rgb);
                        this.ctx.font = `bold ${fontSize}px sans-serif`;
                        this.ctx.textAlign = 'center';
                        this.ctx.textBaseline = 'middle';
                        this.ctx.fillText(color.name, px + this.cellSize / 2, py + this.cellSize / 2);
                    }
                }
            }
        }

        if (this.showGrid) {
            this.ctx.strokeStyle = this.hexToRgba(this.gridColor, 0.15);
            this.ctx.lineWidth = 1;
            for (let x = 0; x <= this.width; x++) {
                const px = centerX + coordSize + x * this.cellSize;
                this.ctx.beginPath();
                this.ctx.moveTo(px, centerY + coordSize);
                this.ctx.lineTo(px, centerY + coordSize + chartHeight);
                this.ctx.stroke();
            }
            for (let y = 0; y <= this.height; y++) {
                const py = centerY + coordSize + y * this.cellSize;
                this.ctx.beginPath();
                this.ctx.moveTo(centerX + coordSize, py);
                this.ctx.lineTo(centerX + coordSize + chartWidth, py);
                this.ctx.stroke();
            }

            this.ctx.strokeStyle = this.hexToRgba(this.gridColor, 0.7);
            this.ctx.lineWidth = 2;
            for (let i = 0; i <= this.width; i += 10) {
                const px = centerX + coordSize + i * this.cellSize;
                this.ctx.beginPath();
                this.ctx.moveTo(px, centerY + coordSize);
                this.ctx.lineTo(px, centerY + coordSize + chartHeight);
                this.ctx.stroke();
            }
            for (let i = 0; i <= this.height; i += 10) {
                const py = centerY + coordSize + i * this.cellSize;
                this.ctx.beginPath();
                this.ctx.moveTo(centerX + coordSize, py);
                this.ctx.lineTo(centerX + coordSize + chartWidth, py);
                this.ctx.stroke();
            }
        }

        if (this.showCoords && this.cellSize >= 10) {
            const fontSizeCoord = Math.max(9, Math.floor(this.cellSize * 0.45));
            this.ctx.font = `${fontSizeCoord}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1;
            this.ctx.fillStyle = '#ffffff';

            for (let x = 0; x < this.width; x++) {
                const boxX = centerX + coordSize + x * this.cellSize;
                const boxYTop = centerY + coordSize - this.cellSize;
                const boxYBottom = centerY + coordSize + chartHeight;
                this.ctx.strokeRect(boxX, boxYTop, this.cellSize, this.cellSize);
                this.ctx.strokeRect(boxX, boxYBottom, this.cellSize, this.cellSize);
                if ((x + 1) % 5 === 0 || x === 0) {
                    const px = centerX + coordSize + x * this.cellSize + this.cellSize / 2;
                    const coordX = this.flipHorizontal ? (this.width - x) : (x + 1);
                    this.ctx.fillText(coordX, px, centerY + coordSize / 2);
                    this.ctx.fillText(coordX, px, centerY + coordSize + chartHeight + coordSize / 2);
                }
            }

            for (let y = 0; y < this.height; y++) {
                const boxXLeft = centerX + coordSize - this.cellSize;
                const boxXRight = centerX + coordSize + chartWidth;
                const boxY = centerY + coordSize + y * this.cellSize;
                this.ctx.strokeRect(boxXLeft, boxY, this.cellSize, this.cellSize);
                this.ctx.strokeRect(boxXRight, boxY, this.cellSize, this.cellSize);
                if ((y + 1) % 5 === 0 || y === 0) {
                    const py = centerY + coordSize + y * this.cellSize + this.cellSize / 2;
                    this.ctx.fillText(y + 1, centerX + coordSize / 2, py);
                    this.ctx.fillText(y + 1, centerX + coordSize + chartWidth + coordSize / 2, py);
                }
            }
        }
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    getContrastTextColor(rgb) {
        const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    exit() {
        if (this.materialListModal && this.materialListModal.parentNode) {
            this.materialListModal.parentNode.removeChild(this.materialListModal);
        }
        this.materialListModal = null;

        if (this.container) {
            this.container.innerHTML = '';
            this.container.style.cssText = '';
        }
        document.body.style.overflow = this.originalBodyOverflow;
        this.isActive = false;
        this.zoomLevel = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.showCoords = true;
        this.showColorCodes = false;
        this.showGrid = true;
        this.gridColor = '#ffffff';
        this.showSingleHighlight = false;
        this.highlightedColorName = null;
        this.lockedColors.clear();
        this.placedBeans.clear();
        this.colorStats = [];
        this.lastTouchDistance = 0;
        if (this.onExitCallback) {
            this.onExitCallback();
        }
    }

    destroy() {
        this.exit();
        this.perlerColors = null;
        this.placedBeans.clear();
    }
}


/* =============================================================
 * 模块导出（供全局引用/调试）
 * ============================================================= */
if (typeof window !== 'undefined') {
    window.FocusModeRenderer = FocusModeRenderer;
}
