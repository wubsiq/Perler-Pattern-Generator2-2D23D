/**
 * SelectionManager - 选区管理器
 * 支持多种选区类型：矩形、自由画笔（套索）、多边形、涂抹
 */
class SelectionManager {
    constructor(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
        
        // 选区类型: 'rect' | 'lasso' | 'polygon' | 'smudge'
        this.type = 'rect';
        
        // 矩形选区（已对齐格子）
        this.rectStart = null;      // { x, y } 格子坐标
        this.rectEnd = null;        // { x, y } 格子坐标
        
        // 自由画笔选区（套索）
        this.lassoPoints = [];      // [{x, y}, ...]
        
        // 多边形选区（点击格子形成选区）
        this.polygonPoints = [];    // [{x, y}, ...] - 点击的格子顶点
        this._polygonLines = [];    // 连线经过的格子
        this._polygonFilledCells = new Set();  // 填充的格子
        
        // 涂抹选区
        this.smudgeCells = new Set();  // 存储涂抹过的格子 "x,y"
        this.smudgeBrushSize = 2;      // 涂抹笔刷大小（半径）
        this._isSmudging = false;      // 是否正在涂抹
        
        // 反转选区
        this.inverse = false;
        
        // 是否跳过透明色块（默认不跳过，透明色块可以被选中）
        this.skipTransparent = false;
        
        // 选区颜色配置（默认红色）
        this.selectionColor = '#e74c3c';    // 默认选区颜色 - 红色
        this.inverseColor = '#f39c12';      // 反转选区颜色 - 橙色
        this.selectionOpacity = 0.25;        // 选区高亮透明度
        
        // 生成的掩码缓存
        this._maskCache = null;
        
        // 事件回调
        this.onChange = null;
    }
    
    /**
     * 设置选区颜色
     */
    setSelectionColor(color) {
        this.selectionColor = color;
        this._maskCache = null;
        this._notifyChange();
    }
    
    /**
     * 设置反转选区颜色
     */
    setInverseColor(color) {
        this.inverseColor = color;
        this._maskCache = null;
        this._notifyChange();
    }
    
    /**
     * 设置选区透明度
     */
    setSelectionOpacity(opacity) {
        this.selectionOpacity = Math.max(0.05, Math.min(0.8, opacity));
        this._maskCache = null;
        this._notifyChange();
    }
    
    /**
     * 获取带透明度的选区颜色
     */
    getSelectionColorWithOpacity() {
        return this._hexToRgba(this.selectionColor, this.selectionOpacity);
    }
    
    /**
     * 获取带透明度的反转选区颜色
     */
    getInverseColorWithOpacity() {
        return this._hexToRgba(this.inverseColor, this.selectionOpacity + 0.05);
    }
    
    /**
     * 十六进制转 RGBA
     */
    _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    /**
     * 设置画布尺寸
     */
    setCanvasSize(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
        this._maskCache = null;
    }
    
    /**
     * 设置选区类型
     */
    setType(type) {
        if (['rect', 'lasso', 'polygon', 'smudge'].includes(type)) {
            this.type = type;
            this.clear();
        }
    }
    
    /**
     * 设置涂抹笔刷大小
     */
    setSmudgeBrushSize(size) {
        this.smudgeBrushSize = Math.max(1, size);
        this._maskCache = null;
    }
    
    /**
     * 开始绘制选区
     */
    start(x, y) {
        this._maskCache = null;
        const gx = Math.floor(x);
        const gy = Math.floor(y);
        
        switch (this.type) {
            case 'rect':
                // 方形选区：对齐到格子边界
                this.rectStart = { x: gx, y: gy };
                this.rectEnd = { x: gx, y: gy };
                break;
            case 'lasso':
                this.lassoPoints = [{ x: gx, y: gy }];
                break;
            case 'polygon':
                // 多边形：只有当没有已有顶点时才初始化
                if (this.polygonPoints.length === 0) {
                    this.polygonPoints = [{ x: gx, y: gy }];
                    this._polygonLines = [{ x: gx, y: gy }];
                    this._polygonFilledCells.clear();
                } else {
                    // 已有顶点，直接添加新点
                    this.addPolygonPoint(gx, gy);
                    return;
                }
                break;
            case 'smudge':
                // 涂抹选区：添加笔刷范围内的格子
                this._isSmudging = true;
                this._addSmudgeCells(gx, gy);
                break;
        }
        
        this._notifyChange();
    }
    
    /**
     * 更新选区（鼠标移动时调用）
     */
    update(x, y) {
        this._maskCache = null;
        const gx = Math.floor(x);
        const gy = Math.floor(y);
        
        switch (this.type) {
            case 'rect':
                if (this.rectStart) {
                    // 方形选区：始终对齐到格子
                    this.rectEnd = { x: gx, y: gy };
                }
                break;
            case 'lasso':
                if (this.lassoPoints.length > 0) {
                    const lastPoint = this.lassoPoints[this.lassoPoints.length - 1];
                    const dist = Math.abs(gx - lastPoint.x) + Math.abs(gy - lastPoint.y);
                    if (dist >= 2) {
                        this.lassoPoints.push({ x: gx, y: gy });
                    }
                }
                break;
            case 'polygon':
                break;
            case 'smudge':
                if (this._isSmudging) {
                    // 涂抹选区：添加鼠标轨迹上的格子
                    this._addSmudgeCells(gx, gy);
                }
                break;
        }
        
        this._notifyChange();
    }
    
    /**
     * 添加涂抹范围内的格子
     */
    _addSmudgeCells(cx, cy) {
        const radius = this.smudgeBrushSize - 1;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= radius * radius + radius) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx >= 0 && nx < this.canvasWidth && 
                        ny >= 0 && ny < this.canvasHeight) {
                        this.smudgeCells.add(`${nx},${ny}`);
                    }
                }
            }
        }
    }
    
    /**
     * 结束绘制选区
     */
    end() {
        this._maskCache = null;
        
        if (this.type === 'rect') {
            if (!this.rectStart || !this.rectEnd) {
                this.clear();
                return;
            }
            // 确保选区至少有 1 个格子
            const x1 = Math.min(this.rectStart.x, this.rectEnd.x);
            const y1 = Math.min(this.rectStart.y, this.rectEnd.y);
            const x2 = Math.max(this.rectStart.x, this.rectEnd.x);
            const y2 = Math.max(this.rectStart.y, this.rectEnd.y);
            if (x2 - x1 < 0 || y2 - y1 < 0) {
                // 修正单点选区
                if (x2 === x1 && y2 === y1) {
                    // 保持单点
                } else {
                    this.clear();
                    return;
                }
            }
        } else if (this.type === 'lasso') {
            if (this.lassoPoints.length < 3) {
                this.clear();
                return;
            }
        } else if (this.type === 'polygon') {
            if (this.polygonPoints.length < 3) {
                this.clear();
                return;
            }
        } else if (this.type === 'smudge') {
            this._isSmudging = false;
            if (this.smudgeCells.size === 0) {
                this.clear();
                return;
            }
        }
        
        this._notifyChange();
    }
    
    /**
     * 多边形添加顶点（点击时调用）
     * 支持：单点、两点连线、三点成面
     */
    addPolygonPoint(x, y) {
        this._maskCache = null;
        const gx = Math.floor(x);
        const gy = Math.floor(y);
        
        // 检查是否点击了已有的点（闭合多边形）
        if (this.polygonPoints.length >= 3) {
            const firstPoint = this.polygonPoints[0];
            const dist = Math.abs(gx - firstPoint.x) + Math.abs(gy - firstPoint.y);
            if (dist <= 1) {
                // 点击第一个点，闭合多边形
                this._fillPolygonInterior();
                this._notifyChange();
                return;
            }
        }
        
        // 添加新顶点
        this.polygonPoints.push({ x: gx, y: gy });
        
        // 计算连线经过的格子
        if (this.polygonPoints.length >= 2) {
            const lastPoint = this.polygonPoints[this.polygonPoints.length - 2];
            const newPoint = this.polygonPoints[this.polygonPoints.length - 1];
            this._addLineCells(lastPoint, newPoint);
        } else {
            // 单个点，选中该格子
            this._polygonLines.push({ x: gx, y: gy });
        }
        
        // 3个点及以上自动填充多边形内部
        if (this.polygonPoints.length >= 3) {
            this._fillPolygonInterior();
        } else {
            // 清空填充（只有1-2个点时不填充）
            this._polygonFilledCells.clear();
        }
        
        this._notifyChange();
    }
    
    /**
     * 使用 Bresenham 算法添加两点之间的连线格子
     */
    _addLineCells(p1, p2) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        
        let x = x1, y = y1;
        
        while (true) {
            // 添加当前格子到连线
            if (!this._polygonLines.some(p => p.x === x && p.y === y)) {
                this._polygonLines.push({ x, y });
            }
            
            if (x === x2 && y === y2) break;
            
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }
    }
    
    /**
     * 填充多边形内部（全部选中模式）
     * 所有被线条包围的格子都选中，不扣除交叉部分
     * 
     * 核心思路：将多边形分割成三角形，对每个三角形独立填充，取并集
     * 这样即使多边形自相交，每个三角形的填充区域都会被保留
     */
    _fillPolygonInterior() {
        this._polygonFilledCells.clear();
        
        if (this.polygonPoints.length < 3) return;
        
        const points = this.polygonPoints.map(p => [p.x, p.y]);
        
        // 计算多边形的质心（用于三角形分割）
        let cx = 0, cy = 0;
        for (const p of points) {
            cx += p[0];
            cy += p[1];
        }
        cx /= points.length;
        cy /= points.length;
        
        // 将多边形分割成三角形：质心 + 每条边的两个端点
        const cellsToFill = new Set();
        
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            
            // 当前三角形：质心 + 边的两个端点
            const triangle = [
                [cx, cy],
                points[i],
                points[j]
            ];
            
            // 对这个三角形进行扫描线填充
            this._scanlineFillTriangle(triangle, cellsToFill);
        }
        
        // 将填充格子添加到结果中
        this._polygonFilledCells = cellsToFill;
        
        // 额外添加连线上的格子（确保线条可见）
        for (const linePoint of this._polygonLines) {
            this._polygonFilledCells.add(`${linePoint.x},${linePoint.y}`);
        }
    }
    
    /**
     * 对三角形进行扫描线填充
     */
    _scanlineFillTriangle(triangle, resultSet) {
        // 按 y 坐标排序三角形的三个顶点
        const sorted = triangle.sort((a, b) => a[1] - b[1]);
        const [p1, p2, p3] = sorted;
        
        const yMin = Math.max(0, Math.ceil(p1[1]));
        const yMax = Math.min(this.canvasHeight - 1, Math.floor(p3[1]));
        
        for (let y = yMin; y <= yMax; y++) {
            const intersections = [];
            
            // 检查每条边是否与扫描线相交
            const edges = [
                [p1, p2],
                [p2, p3],
                [p1, p3]
            ];
            
            for (const [a, b] of edges) {
                const ay = a[1];
                const by = b[1];
                
                if ((ay <= y && by > y) || (by <= y && ay > y)) {
                    const ax = a[0];
                    const bx = b[0];
                    const xIntersect = ax + (y - ay) * (bx - ax) / (by - ay);
                    intersections.push(xIntersect);
                }
            }
            
            if (intersections.length >= 2) {
                intersections.sort((a, b) => a - b);
                
                const xStart = Math.max(0, Math.ceil(intersections[0]));
                const xEnd = Math.min(this.canvasWidth - 1, Math.floor(intersections[1]));
                
                for (let x = xStart; x <= xEnd; x++) {
                    resultSet.add(`${x},${y}`);
                }
            }
        }
    }
    
    /**
     * 多边形闭合（双击时调用）
     */
    closePolygon() {
        this._maskCache = null;
        if (this.polygonPoints.length < 2) {
            this.clear();
            return;
        }
        
        // 如果已经有至少2个点，闭合最后一条边
        if (this.polygonPoints.length >= 2) {
            const firstPoint = this.polygonPoints[0];
            const lastPoint = this.polygonPoints[this.polygonPoints.length - 1];
            this._addLineCells(lastPoint, firstPoint);
        }
        
        // 填充多边形内部
        if (this.polygonPoints.length >= 3) {
            this._fillPolygonInterior();
        }
        
        this._notifyChange();
    }
    
    /**
     * 清除选区
     */
    clear() {
        this.rectStart = null;
        this.rectEnd = null;
        this.lassoPoints = [];
        this.polygonPoints = [];
        this._polygonLines = [];
        this._polygonFilledCells.clear();
        this.smudgeCells.clear();
        this._isSmudging = false;
        this.inverse = false;
        this._maskCache = null;
        this._notifyChange();
    }
    
    /**
     * 反转选区
     */
    toggleInverse() {
        this.inverse = !this.inverse;
        this._maskCache = null;
        this._notifyChange();
    }
    
    /**
     * 设置反转状态
     */
    setInverse(inverse) {
        this.inverse = inverse;
        this._maskCache = null;
        this._notifyChange();
    }
    
    /**
     * 是否有选区
     */
    hasSelection() {
        switch (this.type) {
            case 'rect':
                return this.rectStart && this.rectEnd;
            case 'lasso':
                return this.lassoPoints.length >= 3;
            case 'polygon':
                // 多边形：1个点即可选中外，2个点形成连线，3个点形成面
                return this.polygonPoints.length >= 1;
            case 'smudge':
                return this.smudgeCells.size > 0;
            default:
                return false;
        }
    }
    
    /**
     * 获取选区边界框
     */
    getBounds() {
        if (!this.hasSelection()) return null;
        
        switch (this.type) {
            case 'rect':
                if (!this.rectStart || !this.rectEnd) return null;
                {
                    const x1 = Math.min(this.rectStart.x, this.rectEnd.x);
                    const y1 = Math.min(this.rectStart.y, this.rectEnd.y);
                    const x2 = Math.max(this.rectStart.x, this.rectEnd.x);
                    const y2 = Math.max(this.rectStart.y, this.rectEnd.y);
                    return { x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 };
                }
            case 'lasso':
            case 'polygon':
                {
                    const points = this.type === 'lasso' ? this.lassoPoints : this.polygonPoints;
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const p of points) {
                        minX = Math.min(minX, p.x);
                        minY = Math.min(minY, p.y);
                        maxX = Math.max(maxX, p.x);
                        maxY = Math.max(maxY, p.y);
                    }
                    return {
                        x: Math.floor(minX),
                        y: Math.floor(minY),
                        width: Math.ceil(maxX - minX) + 1,
                        height: Math.ceil(maxY - minY) + 1
                    };
                }
            case 'smudge':
                {
                    if (this.smudgeCells.size === 0) return null;
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const key of this.smudgeCells) {
                        const [x, y] = key.split(',').map(Number);
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
                }
        }
        return null;
    }
    
    /**
     * 检查坐标是否在选区内
     */
    isInSelection(x, y) {
        if (!this.hasSelection()) return !this.inverse;
        
        const inSelection = this._isInShape(x, y);
        return this.inverse ? !inSelection : inSelection;
    }
    
    /**
     * 检查坐标是否在形状内（不考虑反转）
     */
    _isInShape(x, y) {
        switch (this.type) {
            case 'rect':
                return this._isInRect(x, y);
            case 'lasso':
                return this._isInPolygon(x, y, this.lassoPoints);
            case 'polygon':
                return this._isInPolygonSelection(x, y);
            case 'smudge':
                return this.smudgeCells.has(`${x},${y}`);
            default:
                return false;
        }
    }
    
    /**
     * 检查是否在多边形选区内（支持单点、连线、填充）
     */
    _isInPolygonSelection(x, y) {
        if (this.polygonPoints.length === 0) return false;
        
        // 单个点：检查是否是该点
        if (this.polygonPoints.length === 1) {
            return this.polygonPoints[0].x === x && this.polygonPoints[0].y === y;
        }
        
        // 多个点：检查是否在连线或填充区域内
        // 检查是否在连线上
        for (const linePoint of this._polygonLines) {
            if (linePoint.x === x && linePoint.y === y) return true;
        }
        
        // 3个点及以上，检查是否在填充区域内
        if (this.polygonPoints.length >= 3) {
            if (this._polygonFilledCells.has(`${x},${y}`)) return true;
        }
        
        return false;
    }
    
    /**
     * 检查是否在矩形内（格子对齐）
     */
    _isInRect(x, y) {
        if (!this.rectStart || !this.rectEnd) return false;
        const x1 = Math.min(this.rectStart.x, this.rectEnd.x);
        const y1 = Math.min(this.rectStart.y, this.rectEnd.y);
        const x2 = Math.max(this.rectStart.x, this.rectEnd.x);
        const y2 = Math.max(this.rectStart.y, this.rectEnd.y);
        return x >= x1 && x <= x2 && y >= y1 && y <= y2;
    }
    
    /**
     * 检查是否在多边形内（射线法）
     */
    _isInPolygon(x, y, points) {
        if (points.length < 3) return false;
        
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;
            
            if (((yi > y) !== (yj > y)) && 
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        
        return inside;
    }
    
    /**
     * 获取选区掩码（二维数组，true 表示选中）
     */
    getMask() {
        if (this._maskCache) return this._maskCache;
        
        const mask = [];
        for (let y = 0; y < this.canvasHeight; y++) {
            mask[y] = [];
            for (let x = 0; x < this.canvasWidth; x++) {
                mask[y][x] = this.isInSelection(x, y);
            }
        }
        
        this._maskCache = mask;
        return mask;
    }
    
    /**
     * 从选区导出数据（用于创建自定义画笔）
     */
    exportSelectionData(editData) {
        if (!this.hasSelection() || !editData) return null;
        
        const bounds = this.getBounds();
        if (!bounds) return null;
        
        const { x, y, width, height } = bounds;
        
        // 提取选区内的形状和颜色数据
        const shape = [];
        const colors = [];
        
        for (let dy = 0; dy < height; dy++) {
            shape[dy] = [];
            colors[dy] = [];
            for (let dx = 0; dx < width; dx++) {
                const cx = x + dx;
                const cy = y + dy;
                const inSelection = this._isInShape(cx, cy);
                
                if (inSelection && cy >= 0 && cy < editData.length && 
                    cx >= 0 && cx < (editData[cy]?.length || 0)) {
                    const cell = editData[cy][cx];
                    // 如果启用了跳过透明色块，则透明格子不纳入画笔数据
                    if (this.skipTransparent && (!cell || cell.isTransparent)) {
                        shape[dy][dx] = false;
                        colors[dy][dx] = null;
                    } else {
                        shape[dy][dx] = true;
                        colors[dy][dx] = { ...cell };
                    }
                } else {
                    shape[dy][dx] = false;
                    colors[dy][dx] = null;
                }
            }
        }
        
        // 找到形状的边界框（去除空行空列）
        const trimmed = this._trimShape(shape, colors);
        
        return {
            version: '1.0',
            type: 'brush',
            name: '自定义画笔',
            shape: trimmed.shape,
            colors: trimmed.colors,
            width: trimmed.width,
            height: trimmed.height,
            offsetX: 0,
            offsetY: 0,
            createdAt: new Date().toISOString()
        };
    }
    
    /**
     * 裁剪形状，去除边缘空白
     */
    _trimShape(shape, colors) {
        const height = shape.length;
        const width = shape[0]?.length || 0;
        
        // 找到边界
        let minX = width, minY = height, maxX = -1, maxY = -1;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (shape[y][x]) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        
        if (maxX === -1) {
            return { shape: [[false]], colors: [[null]], width: 1, height: 1 };
        }
        
        const newHeight = maxY - minY + 1;
        const newWidth = maxX - minX + 1;
        const newShape = [];
        const newColors = [];
        
        for (let y = 0; y < newHeight; y++) {
            newShape[y] = [];
            newColors[y] = [];
            for (let x = 0; x < newWidth; x++) {
                newShape[y][x] = shape[minY + y][minX + x];
                newColors[y][x] = colors[minY + y][minX + x];
            }
        }
        
        return { shape: newShape, colors: newColors, width: newWidth, height: newHeight };
    }
    
    /**
     * 导出为 JSON 字符串
     */
    exportToJSON(editData) {
        const data = this.exportSelectionData(editData);
        if (!data) return null;
        return JSON.stringify(data, null, 2);
    }
    
    /**
     * 渲染选区到 Canvas（格子级别高亮）
     */
    render(ctx, coordSize, cellSize) {
        if (!this.hasSelection()) return;
        
        ctx.save();
        
        const mask = this.getMask();
        
        // 获取选区颜色
        const fillColor = this.inverse ? this.getInverseColorWithOpacity() : this.getSelectionColorWithOpacity();
        
        // 渲染选中的格子
        for (let y = 0; y < this.canvasHeight; y++) {
            for (let x = 0; x < this.canvasWidth; x++) {
                if (mask[y][x]) {
                    ctx.fillStyle = fillColor;
                    ctx.fillRect(
                        coordSize + x * cellSize,
                        coordSize + y * cellSize,
                        cellSize,
                        cellSize
                    );
                }
            }
        }
        
        // 绘制选区边框（格子级别）
        this._renderGridBorder(ctx, mask, coordSize, cellSize);
        
        // 涂抹选区：显示笔刷大小预览
        if (this.type === 'smudge' && this._isSmudging) {
            // 可以添加额外的涂抹光标指示
        }
        
        ctx.restore();
    }
    
    /**
     * 渲染格子级别的选区边框
     */
    _renderGridBorder(ctx, mask, coordSize, cellSize) {
        ctx.strokeStyle = this.inverse ? this.inverseColor : this.selectionColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        
        const height = mask.length;
        const width = mask[0]?.length || 0;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!mask[y][x]) continue;
                
                const topEmpty = y === 0 || !mask[y-1][x];
                const bottomEmpty = y === height-1 || !mask[y+1][x];
                const leftEmpty = x === 0 || !mask[y][x-1];
                const rightEmpty = x === width-1 || !mask[y][x+1];
                
                const px = coordSize + x * cellSize;
                const py = coordSize + y * cellSize;
                
                if (topEmpty) {
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(px + cellSize, py);
                    ctx.stroke();
                }
                if (bottomEmpty) {
                    ctx.beginPath();
                    ctx.moveTo(px, py + cellSize);
                    ctx.lineTo(px + cellSize, py + cellSize);
                    ctx.stroke();
                }
                if (leftEmpty) {
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(px, py + cellSize);
                    ctx.stroke();
                }
                if (rightEmpty) {
                    ctx.beginPath();
                    ctx.moveTo(px + cellSize, py);
                    ctx.lineTo(px + cellSize, py + cellSize);
                    ctx.stroke();
                }
            }
        }
    }
    
    /**
     * 通知变更
     */
    _notifyChange() {
        if (this.onChange && typeof this.onChange === 'function') {
            this.onChange();
        }
    }
    
    /**
     * 获取选区信息（用于显示）
     */
    getInfo() {
        if (!this.hasSelection()) return null;
        
        const bounds = this.getBounds();
        const mask = this.getMask();
        let selectedCount = 0;
        
        for (let y = 0; y < mask.length; y++) {
            for (let x = 0; x < mask[y].length; x++) {
                if (mask[y][x]) selectedCount++;
            }
        }
        
        return {
            type: this.type,
            inverse: this.inverse,
            bounds,
            selectedCount,
            totalCount: this.canvasWidth * this.canvasHeight
        };
    }
    
    /**
     * 从 JSON 导入画笔数据
     */
    static importFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.type !== 'brush') {
                throw new Error('无效的画笔数据格式');
            }
            return data;
        } catch (e) {
            console.error('导入画笔数据失败:', e);
            return null;
        }
    }
}

// 导出到全局
window.SelectionManager = SelectionManager;
