/**
 * CustomEditor - 负责自定义编辑功能
 * 集成 SelectionManager 支持多种选区类型
 */
class CustomEditor {
    constructor(width, height) {
        this.editData = null;
        this.editHistory = [];
        this.isDrawing = false;
        this.currentEditTool = 'brush';
        this.cellSize = 20;
        
        // 初始化选区管理器
        this.selectionManager = new SelectionManager(
            width || 52,
            height || 52
        );
        
        // 兼容性保留
        this.selection = null;
        this.isSelecting = false;
        this.selectionStart = null;
    }

    /**
     * 初始化编辑数据
     * @param {Array} perlerColors - 拼豆颜色矩阵
     */
    initData(perlerColors) {
        if (!perlerColors || !perlerColors.length) return;

        this.editData = perlerColors.map(row => [...row]);
        this.editHistory = [this.editData.map(row => [...row])];
        
        // 更新选区管理器尺寸
        this.selectionManager.setCanvasSize(
            perlerColors[0]?.length || 52,
            perlerColors.length
        );
    }

    /**
     * 保存历史记录
     */
    saveHistory() {
        this.editHistory.push(this.editData.map(row => [...row]));
        if (this.editHistory.length > 50) {
            this.editHistory.shift();
        }
    }

    /**
     * 撤销
     */
    undo() {
        if (this.editHistory.length <= 1) return;
        this.editHistory.pop();
        this.editData = this.editHistory[this.editHistory.length - 1].map(row => [...row]);
    }

    /**
     * 获取透明颜色
     */
    getTransparentColor() {
        return {
            name: '',
            rgb: [255, 255, 255],
            isTransparent: true
        };
    }

    /**
     * 应用链状擦除
     * @param {number} startX - 起始 X
     * @param {number} startY - 起始 Y
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {number} maxCount - 最大数量
     */
    applyChainRazor(startX, startY, width, height, maxCount = 1000) {
        const transparentColor = this.getTransparentColor();
        const targetColor = this.editData[startY][startX];
        
        if (targetColor.isTransparent) return;

        let count = 0;
        const visited = new Set();
        const stack = [{x: startX, y: startY}];

        while (stack.length > 0 && count < maxCount) {
            const {x, y} = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const currentColor = this.editData[y][x];
            if (currentColor.isTransparent) continue;
            if (currentColor.name !== targetColor.name) continue;

            visited.add(key);
            this.editData[y][x] = transparentColor;
            count++;

            // 八方向
            stack.push({x: x + 1, y});
            stack.push({x: x - 1, y});
            stack.push({x, y: y + 1});
            stack.push({x, y: y - 1});
            stack.push({x: x + 1, y: y + 1});
            stack.push({x: x + 1, y: y - 1});
            stack.push({x: x - 1, y: y + 1});
            stack.push({x: x - 1, y: y - 1});
        }
    }

    /**
     * 应用编辑到单元格
     * @param {number} x - X
     * @param {number} y - Y
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {Object} options - 选项
     */
    applyEditToCell(x, y, width, height, options = {}) {
        const brushSize = options.brushSize || 1;
        const halfBrush = Math.floor(brushSize / 2);

        for (let dy = -halfBrush; dy <= halfBrush; dy++) {
            for (let dx = -halfBrush; dx <= halfBrush; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    this.applySingleEdit(nx, ny, width, height, options);
                }
            }
        }
    }

    /**
     * 应用单个编辑
     * @param {number} x - X
     * @param {number} y - Y
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {Object} options - 选项
     */
    applySingleEdit(x, y, width, height, options = {}) {
        const transparentColor = this.getTransparentColor();
        const tool = options.tool || 'brush';
        const targetColor = options.targetColor || null;

        // 使用 SelectionManager 检查选区
        if (this.selectionManager.hasSelection() && 
            !this.isInSelection(x, y)) {
            return;
        }

        switch (tool) {
            case 'brush':
            case 'eraser':
                if (targetColor) {
                    this.editData[y][x] = targetColor;
                }
                break;

            case 'razor':
                this.editData[y][x] = transparentColor;
                break;

            case 'picker':
                const pickedColor = this.editData[y][x];
                if (!pickedColor.isTransparent) {
                    const hex = `#${pickedColor.rgb[0].toString(16).padStart(2, '0')}${pickedColor.rgb[1].toString(16).padStart(2, '0')}${pickedColor.rgb[2].toString(16).padStart(2, '0')}`;
                    return { hex, color: pickedColor };
                }
                break;
        }
    }

    /**
     * 泛洪填充
     * @param {number} startX - 起始 X
     * @param {number} startY - 起始 Y
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {Object} targetColor - 目标颜色
     * @param {Object} fillColor - 填充颜色
     */
    floodFill(startX, startY, width, height, targetColor, fillColor) {
        const targetIsTransparent = targetColor.isTransparent;
        const fillIsTransparent = fillColor.isTransparent;

        if (!targetIsTransparent && !fillIsTransparent && targetColor.name === fillColor.name) {
            return;
        }
        if (targetIsTransparent && fillIsTransparent) {
            return;
        }

        const visited = new Set();
        const stack = [{x: startX, y: startY}];

        while (stack.length > 0) {
            const {x, y} = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            
            // 使用 SelectionManager 检查选区
            if (this.selectionManager.hasSelection() && 
                !this.isInSelection(x, y)) continue;

            const currentColor = this.editData[y][x];
            const currentIsTransparent = currentColor.isTransparent;

            let isMatch = false;
            if (targetIsTransparent) {
                isMatch = currentIsTransparent;
            } else {
                isMatch = !currentIsTransparent && currentColor.name === targetColor.name;
            }

            if (!isMatch) continue;

            visited.add(key);
            this.editData[y][x] = fillColor;

            stack.push({x: x + 1, y});
            stack.push({x: x - 1, y});
            stack.push({x, y: y + 1});
            stack.push({x, y: y - 1});
        }
    }

    /**
     * 移除指定颜色
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {Object} targetColor - 目标颜色
     */
    removeColor(width, height, targetColor) {
        const transparentColor = this.getTransparentColor();
        let count = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // 使用 SelectionManager 检查选区
                if (this.selectionManager.hasSelection() && 
                    !this.isInSelection(x, y)) continue;
                    
                const currentColor = this.editData[y][x];
                if (!currentColor.isTransparent && currentColor.name === targetColor.name) {
                    this.editData[y][x] = transparentColor;
                    count++;
                }
            }
        }

        return count;
    }

    /**
     * 获取编辑数据
     * @returns {Array}
     */
    getData() {
        return this.editData;
    }

    /**
     * 设置编辑数据
     * @param {Array} data
     */
    setData(data) {
        this.editData = data;
    }

    // ========== 选区相关方法（兼容性封装） ==========

    /**
     * 检查坐标是否在选区内（兼容旧接口）
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @returns {boolean}
     */
    isInSelection(x, y) {
        // 如果启用了跳过透明色块，且当前格子是透明的，则视为不在选区内
        if (this.selectionManager.skipTransparent && this.editData) {
            const row = this.editData[y];
            if (row) {
                const cell = row[x];
                if (!cell || cell.isTransparent) return false;
            }
        }
        
        // 优先使用 SelectionManager
        if (this.selectionManager.hasSelection()) {
            return this.selectionManager.isInSelection(x, y);
        }
        
        // 兼容旧的矩形选区
        if (!this.selection) return true;
        const { x1, y1, x2, y2 } = this.selection;
        return x >= Math.min(x1, x2) && x <= Math.max(x1, x2) &&
               y >= Math.min(y1, y2) && y <= Math.max(y1, y2);
    }

    /**
     * 设置选区（兼容旧接口）
     * @param {Object} selection - { x1, y1, x2, y2 }
     */
    setSelection(selection) {
        this.selection = selection;
        // 同步到 SelectionManager
        if (selection) {
            this.selectionManager.setType('rect');
            this.selectionManager.rectStart = { x: selection.x1, y: selection.y1 };
            this.selectionManager.rectEnd = { x: selection.x2, y: selection.y2 };
        } else {
            this.selectionManager.clear();
        }
    }

    /**
     * 清除选区
     */
    clearSelection() {
        this.selection = null;
        this.selectionStart = null;
        this.isSelecting = false;
        this.selectionManager.clear();
    }

    /**
     * 开始选区（兼容旧接口）
     * @param {number} x - 起始X
     * @param {number} y - 起始Y
     */
    startSelection(x, y) {
        this.isSelecting = true;
        this.selectionStart = { x, y };
        this.selection = { x1: x, y1: y, x2: x, y2: y };
        
        // 同步到 SelectionManager
        this.selectionManager.start(x, y);
    }

    /**
     * 更新选区（兼容旧接口）
     * @param {number} x - 当前X
     * @param {number} y - 当前Y
     */
    updateSelection(x, y) {
        if (!this.isSelecting || !this.selectionStart) return;
        this.selection = {
            x1: this.selectionStart.x,
            y1: this.selectionStart.y,
            x2: x,
            y2: y
        };
        
        // 同步到 SelectionManager
        this.selectionManager.update(x, y);
    }

    /**
     * 结束选区
     */
    endSelection() {
        this.isSelecting = false;
        this.selectionManager.end();
        
        // 同步回旧接口
        if (this.selectionManager.hasSelection() && 
            this.selectionManager.type === 'rect') {
            this.selection = {
                x1: this.selectionManager.rectStart.x,
                y1: this.selectionManager.rectStart.y,
                x2: this.selectionManager.rectEnd.x,
                y2: this.selectionManager.rectEnd.y
            };
        } else {
            this.selection = null;
        }
    }

    /**
     * 获取选区范围（兼容旧接口）
     * @returns {Object|null} - { x, y, width, height } 或 null
     */
    getSelectionBounds() {
        // 优先使用 SelectionManager
        const bounds = this.selectionManager.getBounds();
        if (bounds) return bounds;
        
        // 兼容旧接口
        if (!this.selection) return null;
        const { x1, y1, x2, y2 } = this.selection;
        return {
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            width: Math.abs(x2 - x1) + 1,
            height: Math.abs(y2 - y1) + 1
        };
    }

    // ========== 新选区方法 ==========

    /**
     * 设置选区类型
     * @param {string} type - 'rect' | 'lasso' | 'polygon'
     */
    setSelectionType(type) {
        this.selectionManager.setType(type);
    }

    /**
     * 获取选区管理器
     * @returns {SelectionManager}
     */
    getSelectionManager() {
        return this.selectionManager;
    }

    /**
     * 反转选区
     */
    invertSelection() {
        this.selectionManager.toggleInverse();
    }

    /**
     * 导出选区数据
     * @returns {Object|null}
     */
    exportSelectionData() {
        return this.selectionManager.exportSelectionData(this.editData);
    }

    /**
     * 导出选区为 JSON
     * @returns {string|null}
     */
    exportSelectionJSON() {
        return this.selectionManager.exportToJSON(this.editData);
    }
}

// 导出到全局
window.CustomEditor = CustomEditor;
