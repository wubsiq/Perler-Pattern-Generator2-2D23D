/**
 * BrushManager - 自定义画笔管理器
 * 支持保存选区为画笔、使用画笔绘制、管理画笔库
 */
class BrushManager {
    constructor() {
        // 画笔存储（从 localStorage 加载）
        this.brushes = this._loadBrushes();
        
        // 当前选中的画笔
        this.currentBrush = null;
        
        // 绘制模式：'manual' | 'auto'
        this.drawMode = 'manual';  // 半自动：手动选择画笔绘制
        
        // 事件回调
        this.onBrushChange = null;
        this.onModeChange = null;
        
        // 存储 key
        this.STORAGE_KEY = 'customBeadBrushes';
    }
    
    /**
     * 从 localStorage 加载画笔
     */
    _loadBrushes() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('加载画笔失败:', e);
            return [];
        }
    }
    
    /**
     * 保存画笔到 localStorage
     */
    _saveBrushes() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.brushes));
        } catch (e) {
            console.error('保存画笔失败:', e);
        }
    }
    
    /**
     * 从选区数据创建新画笔
     */
    createBrushFromSelection(selectionData, name = '自定义画笔') {
        if (!selectionData) return null;
        
        const brush = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
            name: name || `画笔 ${this.brushes.length + 1}`,
            shape: selectionData.shape,
            colors: selectionData.colors,
            width: selectionData.width,
            height: selectionData.height,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.brushes.push(brush);
        this._saveBrushes();
        this._notifyBrushChange();
        
        return brush;
    }
    
    /**
     * 从剪贴板数据创建画笔
     */
    createBrushFromClipboard(jsonString, name = '剪贴板画笔') {
        try {
            const data = JSON.parse(jsonString);
            if (data.type !== 'brush' && !data.shape) {
                throw new Error('无效的画笔数据格式');
            }
            
            return this.createBrushFromSelection(data, name);
        } catch (e) {
            console.error('解析剪贴板数据失败:', e);
            return null;
        }
    }
    
    /**
     * 获取所有画笔
     */
    getAllBrushes() {
        return this.brushes;
    }
    
    /**
     * 根据 ID 获取画笔
     */
    getBrushById(id) {
        return this.brushes.find(b => b.id === id);
    }
    
    /**
     * 选择当前画笔
     */
    selectBrush(id) {
        const brush = this.getBrushById(id);
        if (brush) {
            this.currentBrush = brush;
            this._notifyBrushChange();
            return true;
        }
        return false;
    }
    
    /**
     * 取消选择画笔
     */
    clearCurrentBrush() {
        this.currentBrush = null;
        this._notifyBrushChange();
    }
    
    /**
     * 获取当前画笔
     */
    getCurrentBrush() {
        return this.currentBrush;
    }
    
    /**
     * 删除画笔
     */
    deleteBrush(id) {
        const index = this.brushes.findIndex(b => b.id === id);
        if (index !== -1) {
            this.brushes.splice(index, 1);
            if (this.currentBrush && this.currentBrush.id === id) {
                this.currentBrush = null;
            }
            this._saveBrushes();
            this._notifyBrushChange();
            return true;
        }
        return false;
    }
    
    /**
     * 重命名画笔
     */
    renameBrush(id, newName) {
        const brush = this.getBrushById(id);
        if (brush) {
            brush.name = newName;
            brush.updatedAt = new Date().toISOString();
            this._saveBrushes();
            this._notifyBrushChange();
            return true;
        }
        return false;
    }
    
    /**
     * 更新绘制模式
     */
    setDrawMode(mode) {
        if (['manual', 'auto'].includes(mode)) {
            this.drawMode = mode;
            if (this.onModeChange && typeof this.onModeChange === 'function') {
                this.onModeChange(mode);
            }
        }
    }
    
    /**
     * 获取当前绘制模式
     */
    getDrawMode() {
        return this.drawMode;
    }
    
    /**
     * 使用画笔绘制（返回需要修改的格子数据）
     * @param {number} startX - 起始格子 x 坐标
     * @param {number} startY - 起始格子 y 坐标
     * @returns {Array} 需要修改的格子数据 [{x, y, color}]
     */
    getBrushStrokes(startX, startY) {
        if (!this.currentBrush) return [];
        
        const strokes = [];
        const brush = this.currentBrush;
        
        // 计算画笔的偏移（以中心为基准）
        const offsetX = Math.floor(brush.width / 2);
        const offsetY = Math.floor(brush.height / 2);
        
        for (let y = 0; y < brush.height; y++) {
            for (let x = 0; x < brush.width; x++) {
                if (brush.shape[y] && brush.shape[y][x]) {
                    const targetX = startX + (x - offsetX);
                    const targetY = startY + (y - offsetY);
                    const color = brush.colors[y] ? brush.colors[y][x] : null;
                    
                    strokes.push({
                        x: targetX,
                        y: targetY,
                        color: color
                    });
                }
            }
        }
        
        return strokes;
    }
    
    /**
     * 获取画笔预览数据（用于面板显示）
     */
    getBrushPreview(brush) {
        if (!brush) return null;
        
        const cells = [];
        for (let y = 0; y < brush.height; y++) {
            for (let x = 0; x < brush.width; x++) {
                if (brush.shape[y] && brush.shape[y][x]) {
                    // 获取颜色 - 支持多种格式
                    let cellColor = null;
                    if (brush.colors && brush.colors.length > 0) {
                        // 如果 colors 是二维数组
                        if (Array.isArray(brush.colors[y])) {
                            cellColor = brush.colors[y][x];
                        } 
                        // 如果 colors 是一维数组（所有格子用同一种颜色）
                        else if (y === 0 && Array.isArray(brush.colors)) {
                            cellColor = brush.colors[0];
                        }
                        // 如果 colors 是数组且每个元素是颜色对象
                        else if (brush.colors[y] && typeof brush.colors[y] === 'object') {
                            cellColor = brush.colors[y];
                        }
                    }
                    
                    cells.push({
                        x,
                        y,
                        color: cellColor
                    });
                }
            }
        }
        
        return {
            width: brush.width,
            height: brush.height,
            cells: cells
        };
    }
    
    /**
     * 导出画笔为 JSON
     */
    exportBrush(brush) {
        return JSON.stringify({
            version: '1.0',
            type: 'brush',
            name: brush.name,
            shape: brush.shape,
            colors: brush.colors,
            width: brush.width,
            height: brush.height,
            createdAt: brush.createdAt
        }, null, 2);
    }
    
    /**
     * 从 JSON 字符串导入画笔
     */
    importFromJSON(jsonString, name) {
        try {
            const data = JSON.parse(jsonString);
            if (data.type !== 'brush') {
                throw new Error('无效的画笔数据格式');
            }
            
            return this.createBrushFromSelection(data, name || data.name);
        } catch (e) {
            console.error('导入画笔失败:', e);
            return null;
        }
    }
    
    /**
     * 获取画笔数量
     */
    getBrushCount() {
        return this.brushes.length;
    }
    
    /**
     * 旋转画笔（90度）
     * @param {Object} brush - 画笔对象
     * @param {string} direction - 'left' 逆时针90度 | 'right' 顺时针90度
     * @returns {Object} 旋转后的画笔
     */
    rotateBrush(brush, direction) {
        if (!brush) return null;
        
        const { width, height, shape, colors } = brush;
        const newWidth = height;
        const newHeight = width;
        
        // 初始化新数组
        const newShape = [];
        const newColors = [];
        for (let y = 0; y < newHeight; y++) {
            newShape[y] = [];
            newColors[y] = [];
            for (let x = 0; x < newWidth; x++) {
                let srcX, srcY;
                if (direction === 'left') {
                    // 逆时针90度: srcX = width - 1 - y, srcY = x
                    srcX = width - 1 - y;
                    srcY = x;
                } else {
                    // 顺时针90度: srcX = y, srcY = height - 1 - x
                    srcX = y;
                    srcY = height - 1 - x;
                }
                
                if (srcY >= 0 && srcY < height && srcX >= 0 && srcX < width) {
                    newShape[y][x] = shape[srcY] ? !!shape[srcY][srcX] : false;
                    newColors[y][x] = colors && colors[srcY] ? colors[srcY][srcX] : null;
                } else {
                    newShape[y][x] = false;
                    newColors[y][x] = null;
                }
            }
        }
        
        brush.width = newWidth;
        brush.height = newHeight;
        brush.shape = newShape;
        brush.colors = newColors;
        brush.updatedAt = new Date().toISOString();
        
        this._saveBrushes();
        this._notifyBrushChange();
        
        return brush;
    }
    
    /**
     * 水平翻转画笔（左右镜像）
     */
    flipBrushHorizontal(brush) {
        if (!brush) return null;
        
        const { width, height, shape, colors } = brush;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < Math.floor(width / 2); x++) {
                const mirrorX = width - 1 - x;
                // 交换 shape
                const tempShape = shape[y][x];
                shape[y][x] = !!shape[y][mirrorX];
                shape[y][mirrorX] = !!tempShape;
                
                // 交换 colors
                if (colors && colors[y]) {
                    const tempColor = colors[y][x];
                    colors[y][x] = colors[y][mirrorX];
                    colors[y][mirrorX] = tempColor;
                }
            }
        }
        
        brush.updatedAt = new Date().toISOString();
        this._saveBrushes();
        this._notifyBrushChange();
        
        return brush;
    }
    
    /**
     * 垂直翻转画笔（上下镜像）
     */
    flipBrushVertical(brush) {
        if (!brush) return null;
        
        const { height, shape, colors } = brush;
        
        for (let y = 0; y < Math.floor(height / 2); y++) {
            const mirrorY = height - 1 - y;
            // 交换整行 shape
            const tempShape = shape[y];
            shape[y] = shape[mirrorY];
            shape[mirrorY] = tempShape;
            
            // 交换整行 colors
            if (colors) {
                const tempColors = colors[y];
                colors[y] = colors[mirrorY];
                colors[mirrorY] = tempColors;
            }
        }
        
        brush.updatedAt = new Date().toISOString();
        this._saveBrushes();
        this._notifyBrushChange();
        
        return brush;
    }
    
    /**
     * 添加画笔（用于从预设或导入添加）
     */
    addBrush(brushData) {
        // 检查是否已存在相同 ID
        const existingIndex = this.brushes.findIndex(b => b.id === brushData.id);
        if (existingIndex !== -1) {
            // 已存在，直接选中
            this.currentBrush = this.brushes[existingIndex];
            this._notifyBrushChange();
            return this.currentBrush;
        }
        
        const brush = {
            id: brushData.id,
            name: brushData.name,
            shape: brushData.shape,
            colors: brushData.colors || [{ r: 0, g: 0, b: 0 }],
            width: brushData.width,
            height: brushData.height,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.brushes.push(brush);
        this.currentBrush = brush;
        this._saveBrushes();
        this._notifyBrushChange();
        
        return brush;
    }
    
    /**
     * 通知画笔变更
     */
    _notifyBrushChange() {
        if (this.onBrushChange && typeof this.onBrushChange === 'function') {
            this.onBrushChange(this.brushes, this.currentBrush);
        }
    }
}

// 导出到全局
window.BrushManager = BrushManager;
