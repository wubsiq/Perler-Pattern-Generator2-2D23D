/**
 * CustomEditMixin — 自定义编辑核心-画笔/剃刀/填充/翻转/撤销/颜色剔除/描边-29方法
 * 来源: app.js L4092-L5344
 */

const CustomEditMixin = {
    initCustomEditCanvasEvents() {
        const canvas = this.customEditCanvas;

        canvas.addEventListener('mouseenter', (e) => {
            this.customEditBrushCursor.style.display = 'block';
            this.lastCustomEditMouseEvent = e;
            this.updateCustomEditBrushCursorSize();
            this.updateCustomEditBrushCursorPosition(e);

            // 如果当前使用 customBrush 工具，立即重绘以显示预笔迹
            if (this.currentEditTool === 'customBrush' && 
                this.brushManager && this.brushManager.getCurrentBrush()) {
                this.drawCustomEditCanvas();
            }
        });

        canvas.addEventListener('mouseleave', (e) => {
            this.handleCustomEditMouseUp();
            this.customEditBrushCursor.style.display = 'none';
            this.lastCustomEditMouseEvent = null;

            // 鼠标离开画布时，清除预笔迹（通过重绘）
            if (this.currentEditTool === 'customBrush') {
                this.drawCustomEditCanvas();
            }
        });

        canvas.addEventListener('mousedown', (e) => {
            this.lastCustomEditMouseEvent = e;
            this.handleCustomEditMouseDown(e);
        });

        canvas.addEventListener('mousemove', (e) => {
            this.lastCustomEditMouseEvent = e;
            this.updateCustomEditBrushCursorPosition(e);
            this.handleCustomEditMouseMove(e);
        });

        canvas.addEventListener('mouseup', () => this.handleCustomEditMouseUp());

        // 多边形选区：双击闭合
        canvas.addEventListener('dblclick', (e) => {
            if (this.currentEditTool === 'selection' && 
                this.customEditor && 
                this.customEditor.selectionManager.type === 'polygon') {
                this.customEditor.selectionManager.closePolygon();
                this.isDrawing = false;
                this.drawCustomEditCanvas();
                if (this.selectionPanel) {
                    this.selectionPanel.updateInfo();
                }
            }
        });
    },

    refreshCustomEditBrushCursor() {
        if (this.customEditBrushCursor && this.customEditBrushCursor.style.display === 'block' && this.lastCustomEditMouseEvent) {
            this.updateCustomEditBrushCursorPosition(this.lastCustomEditMouseEvent);
        }
    },

    getCurrentEditColor() {
        return this.currentBeadColor || '#FAF4C8';
    },

    getCurrentEditColorName() {
        return this.currentBeadColorName || 'A1';
    },

    getPerlerSignature() {
        if (!this.perlerColors || !this.perlerColors.length) return '';
        const width = this.perlerColors[0].length;
        const height = this.perlerColors.length;
        const sample = [];
        for (let y = 0; y < Math.min(3, height); y++) {
            for (let x = 0; x < Math.min(3, width); x++) {
                sample.push(this.perlerColors[y][x].name);
            }
        }
        return `${width}x${height}-${sample.join('-')}`;
    },

    initCustomEditData() {
        if (!this.perlerColors || !this.perlerColors.length) return;

        const currentSignature = this.getPerlerSignature();

        if (currentSignature !== this.lastPerlerSignature) {
            this.lastPerlerSignature = currentSignature;
            this.customEditSnapshots = [];
            this.snapshotsContainer.innerHTML = '';
            this.snapshotsList.style.display = 'none';
        }

        this.perlerWidth = this.perlerColors[0].length;
        this.perlerHeight = this.perlerColors.length;
        this.customEditData = this.perlerColors.map(row => [...row]);
        this.customEditHistory = [this.customEditData.map(row => [...row])];

        // 更新 CustomEditor 数据和选区管理器尺寸
        if (this.customEditor) {
            this.customEditor.initData(this.customEditData);
            // 让 CustomEditor 直接引用同一份数据，确保 isInSelection 的透明检查能读到最新状态
            this.customEditor.editData = this.customEditData;
            this.customEditor.selectionManager.setCanvasSize(this.perlerWidth, this.perlerHeight);
        }

        // 初始化画布边界
        this.canvasBounds = {
            originalWidth: this.perlerWidth,
            originalHeight: this.perlerHeight,
            left: 0,
            right: this.perlerWidth,
            top: 0,
            bottom: this.perlerHeight
        };
        this.updateCanvasBoundsInputs();
        this.updateCanvasBoundsDisplay();

        this.drawCustomEditCanvas();
    },

    drawCustomEditCanvas() {
        if (!this.customEditData) return;

        const cellSize = parseInt(this.beadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));

        this.customEditCanvas.width = coordSize * 2 + this.perlerWidth * cellSize;
        this.customEditCanvas.height = coordSize * 2 + this.perlerHeight * cellSize;

        // 保存单元格大小用于画笔光标
        this.customEditCellSize = cellSize;

        // 更新画笔光标大小
        this.updateCustomEditBrushCursorSize();

        const ctx = this.customEditCtx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.customEditCanvas.width, this.customEditCanvas.height);

        // 确定显示范围
        let displayLeft = 0, displayRight = this.perlerWidth;
        let displayTop = 0, displayBottom = this.perlerHeight;
        if (this.canvasBounds) {
            displayLeft = this.canvasBounds.left;
            displayRight = this.canvasBounds.right;
            displayTop = this.canvasBounds.top;
            displayBottom = this.canvasBounds.bottom;
        }

        // 绘制隐藏区域的遮罩（半透明灰色）
        if (this.canvasBounds && this.currentEditTool === 'canvasBounds') {
            ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
            // 左边
            if (displayLeft > 0) {
                ctx.fillRect(coordSize, coordSize, displayLeft * cellSize, this.perlerHeight * cellSize);
            }
            // 右边
            if (displayRight < this.perlerWidth) {
                ctx.fillRect(coordSize + displayRight * cellSize, coordSize, (this.perlerWidth - displayRight) * cellSize, this.perlerHeight * cellSize);
            }
            // 上边
            if (displayTop > 0) {
                ctx.fillRect(coordSize + displayLeft * cellSize, coordSize, (displayRight - displayLeft) * cellSize, displayTop * cellSize);
            }
            // 下边
            if (displayBottom < this.perlerHeight) {
                ctx.fillRect(coordSize + displayLeft * cellSize, coordSize + displayBottom * cellSize, (displayRight - displayLeft) * cellSize, (this.perlerHeight - displayBottom) * cellSize);
            }
        }

        // 只绘制显示范围内的色块
        for (let y = displayTop; y < displayBottom; y++) {
            for (let x = displayLeft; x < displayRight; x++) {
                const color = this.customEditData[y][x];
                if (color.isTransparent) {
                    ctx.fillStyle = this.razorBgColor.value;
                } else {
                    ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                }
                ctx.fillRect(coordSize + x * cellSize, coordSize + y * cellSize, cellSize, cellSize);
            }
        }

        // 绘制边界高亮框
        if (this.canvasBounds && this.currentEditTool === 'canvasBounds') {
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 2;
            ctx.strokeRect(coordSize + displayLeft * cellSize + 1, coordSize + displayTop * cellSize + 1, (displayRight - displayLeft) * cellSize - 2, (displayBottom - displayTop) * cellSize - 2);
        }

        // 绘制选区（使用 SelectionManager）
        if (this.customEditor && this.customEditor.selectionManager) {
            this.customEditor.selectionManager.render(ctx, coordSize, cellSize);
        } else if (this.customEditor && this.customEditor.selection) {
            // 兼容旧的矩形选区
            const sel = this.customEditor.selection;
            const selX1 = Math.min(sel.x1, sel.x2);
            const selY1 = Math.min(sel.y1, sel.y2);
            const selX2 = Math.max(sel.x1, sel.x2);
            const selY2 = Math.max(sel.y1, sel.y2);
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(coordSize + selX1 * cellSize, coordSize + selY1 * cellSize, (selX2 - selX1 + 1) * cellSize, (selY2 - selY1 + 1) * cellSize);
            ctx.setLineDash([]);
        }

        // 绘制编号
        const fontSizeCoord = Math.max(9, Math.floor(cellSize * 0.45));
        ctx.font = `${fontSizeCoord}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#333';

        // 上面编号
        for (let x = displayLeft; x < displayRight; x++) {
            ctx.fillText(x + 1, coordSize + x * cellSize + cellSize / 2, coordSize / 2);
        }

        // 左边编号
        for (let y = displayTop; y < displayBottom; y++) {
            ctx.fillText(y + 1, coordSize / 2, coordSize + y * cellSize + cellSize / 2);
        }

        // 右边编号
        const rightCoordX = coordSize + this.perlerWidth * cellSize + coordSize / 2;
        for (let y = displayTop; y < displayBottom; y++) {
            ctx.fillText(y + 1, rightCoordX, coordSize + y * cellSize + cellSize / 2);
        }

        // 下面编号
        const bottomCoordY = coordSize + this.perlerHeight * cellSize + coordSize / 2;
        for (let x = displayLeft; x < displayRight; x++) {
            ctx.fillText(x + 1, coordSize + x * cellSize + cellSize / 2, bottomCoordY);
        }

        // 更新显示尺寸信息
        let displayWidth = this.perlerWidth;
        let displayHeight = this.perlerHeight;
        if (this.canvasBounds) {
            displayWidth = this.canvasBounds.right - this.canvasBounds.left;
            displayHeight = this.canvasBounds.bottom - this.canvasBounds.top;
        }
        this.customEditInfo.textContent = `${getI18nText('customEditSize')}: ${this.perlerWidth} × ${this.perlerHeight} | ${getI18nText('displaySizeLabel')}: ${displayWidth} × ${displayHeight}`;

        // 更新手柄位置
        if (this.currentEditTool === 'canvasBounds') {
            this.updateCanvasBoundsHandlesPosition();
        }

        // 绘制画笔预览（预笔迹显示）
        this.drawBrushPreview(ctx, coordSize, cellSize);
    },

    drawBrushPreview(ctx, coordSize, cellSize) {
        if (this.currentEditTool !== 'customBrush') return;
        if (!this.brushManager || !this.brushManager.getCurrentBrush()) return;
        if (!this.lastCustomEditMouseEvent) return;

        const brush = this.brushManager.getCurrentBrush();
        if (!brush.shape || !brush.width || !brush.height) return;

        const { x, y } = this.getCustomEditCell(this.lastCustomEditMouseEvent);

        // 计算画笔的偏移（以中心为基准）
        const offsetX = Math.floor(brush.width / 2);
        const offsetY = Math.floor(brush.height / 2);

        // 绘制半透明预览
        ctx.save();
        ctx.globalAlpha = 0.45; // 半透明显示（稍亮一些，更清晰）

        let hasValidCell = false;

        for (let by = 0; by < brush.height; by++) {
            for (let bx = 0; bx < brush.width; bx++) {
                // 检查 shape 数据
                if (!brush.shape[by] || !brush.shape[by][bx]) continue;

                const targetX = x + (bx - offsetX);
                const targetY = y + (by - offsetY);

                // 检查是否在画布范围内
                if (targetX < 0 || targetX >= this.perlerWidth || 
                    targetY < 0 || targetY >= this.perlerHeight) continue;

                hasValidCell = true;

                // 获取颜色
                const color = brush.colors && brush.colors[by] ? brush.colors[by][bx] : null;

                // 确定填充颜色
                let fillColor = '#cccccc'; // 默认灰色
                if (color && color.rgb && Array.isArray(color.rgb)) {
                    fillColor = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                } else if (color && color.hex) {
                    fillColor = color.hex;
                } else {
                    // 使用当前选择的颜色
                    const currentColor = this.getCurrentEditColorData();
                    if (currentColor && currentColor.rgb && Array.isArray(currentColor.rgb)) {
                        fillColor = `rgb(${currentColor.rgb[0]}, ${currentColor.rgb[1]}, ${currentColor.rgb[2]})`;
                    }
                }

                ctx.fillStyle = fillColor;
                ctx.fillRect(
                    coordSize + targetX * cellSize,
                    coordSize + targetY * cellSize,
                    cellSize,
                    cellSize
                );
            }
        }

        // 如果有有效格子，绘制整体边框
        if (hasValidCell) {
            // 画笔整体边框（使用虚线区分）
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 2]);

            // 计算画笔的边界框
            const minX = x - offsetX;
            const minY = y - offsetY;
            const maxX = x + (brush.width - 1) - offsetX;
            const maxY = y + (brush.height - 1) - offsetY;

            // 只绘制在画布范围内的部分
            const drawX1 = Math.max(0, minX);
            const drawY1 = Math.max(0, minY);
            const drawX2 = Math.min(this.perlerWidth - 1, maxX);
            const drawY2 = Math.min(this.perlerHeight - 1, maxY);

            if (drawX2 >= drawX1 && drawY2 >= drawY1) {
                ctx.strokeRect(
                    coordSize + drawX1 * cellSize,
                    coordSize + drawY1 * cellSize,
                    (drawX2 - drawX1 + 1) * cellSize,
                    (drawY2 - drawY1 + 1) * cellSize
                );
            }

            ctx.setLineDash([]);
        }

        ctx.restore();
    },

    getCustomEditCell(e) {
        const rect = this.customEditCanvas.getBoundingClientRect();
        const cellSize = parseInt(this.beadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
        const x = Math.floor((e.clientX - rect.left - coordSize) / cellSize);
        const y = Math.floor((e.clientY - rect.top - coordSize) / cellSize);
        return { x, y };
    },

    handleCustomEditMouseDown(e) {
        console.log('[handleCustomEditMouseDown] 鼠标按下！');
        console.log('[handleCustomEditMouseDown] 当前工具:', this.currentEditTool);

        if (!this.customEditData) {
            console.log('[handleCustomEditMouseDown] 没有 customEditData，返回');
            return;
        }

        const { x, y } = this.getCustomEditCell(e);
        console.log('[handleCustomEditMouseDown] 点击位置:', x, y);

        if (this.colorConvertPickMode) {
            const color = this.customEditData[y][x];
            if (color.isTransparent) {
                if (this.colorConvertPickMode === 'source') {
                    this.colorConvertSourceIsTransparent = true;
                    this.colorConvertSourceColorValue.textContent = '透明';
                    this.colorConvertSourceColor.style.opacity = '0.3';
                } else if (this.colorConvertPickMode === 'target') {
                    this.colorConvertTargetIsTransparent = true;
                    this.colorConvertTargetColorValue.textContent = '透明';
                    this.colorConvertTargetColor.style.opacity = '0.3';
                }
            } else {
                const hex = this.rgbToHex(color.rgb[0], color.rgb[1], color.rgb[2]);
                if (this.colorConvertPickMode === 'source') {
                    this.colorConvertSourceIsTransparent = false;
                    this.colorConvertSourceColor.value = hex;
                    this.colorConvertSourceColorValue.textContent = hex;
                    this.colorConvertSourceColor.style.opacity = '1';
                } else if (this.colorConvertPickMode === 'target') {
                    this.colorConvertTargetIsTransparent = false;
                    this.colorConvertTargetColor.value = hex;
                    this.colorConvertTargetColorValue.textContent = hex;
                    this.colorConvertTargetColor.style.opacity = '1';
                }
            }
            this.colorConvertPickMode = null;
            this.pickSourceColorBtn.classList.remove('color-pick-active');
            this.pickTargetColorBtn.classList.remove('color-pick-active');
            return;
        }

        // 颜色剔除取色模式
        if (this.pickRemoveColorMode) {
            const color = this.customEditData[y][x];
            if (!color.isTransparent) {
                const hex = this.rgbToHex(color.rgb[0], color.rgb[1], color.rgb[2]);
                this.removeColorPicker.value = hex;
                this.removeColorValue.textContent = hex;
            }
            this.pickRemoveColorMode = false;
            this.pickRemoveColorBtn.classList.remove('color-pick-active');
            return;
        }

        // 颜色量化取色模式
        if (this.quantizePickMode) {
            console.log('[颜色量化取色] 点击画布，颜色名:', this.customEditData[y][x].name, '透明:', this.customEditData[y][x].isTransparent);
            const color = this.customEditData[y][x];
            if (!color.isTransparent) {
                const checkbox = this.quantizeColorList.querySelector(`.quantize-color-checkbox[data-color="${color.name}"]`);
                console.log('[颜色量化取色] 找到checkbox:', checkbox);
                if (checkbox) {
                    checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('change'));
                }
            }
            this.quantizePickMode = false;
            this.quantizePickColorBtn.classList.remove('color-pick-active');
            return;
        }

        if (this.currentEditTool === 'selection') {
            if (x >= 0 && x < this.perlerWidth && y >= 0 && y < this.perlerHeight) {
                const selMgr = this.customEditor.selectionManager;

                if (selMgr.type === 'polygon') {
                    // 多边形：点击添加顶点
                    if (selMgr.polygonPoints.length === 0) {
                        // 第一次点击，开始新的多边形
                        selMgr.start(x, y);
                    } else {
                        // 继续添加顶点
                        selMgr.addPolygonPoint(x, y);
                    }
                    this.isDrawing = true;
                    this.drawCustomEditCanvas();
                } else if (selMgr.type === 'smudge') {
                    // 涂抹选区：开始涂抹
                    this.customEditor.startSelection(x, y);
                    this.isDrawing = true;
                    this.drawCustomEditCanvas();
                } else {
                    // 矩形或套索：开始绘制
                    this.customEditor.startSelection(x, y);
                    this.isDrawing = true;
                    this.drawCustomEditCanvas();
                }
            }
            return;
        }

        // 自定义画笔工具
        if (this.currentEditTool === 'customBrush') {
            if (this.brushManager && this.brushManager.getCurrentBrush()) {
                // 半自动模式：使用选中的画笔绘制
                this.isDrawing = true;
                this.applyCustomBrushAt(x, y);
            } else {
                // 没有选中画笔，提示用户
                if (!this._brushTipShown) {
                    alert('请先在画笔管理面板中选择一个画笔');
                    this._brushTipShown = true;
                    setTimeout(() => this._brushTipShown = false, 3000);
                }
            }
            return;
        }

        if (this.currentEditTool === 'chainRazor') {
            console.log('[handleCustomEditMouseDown] 调用 chainRazor');
            this.applyChainRazor(x, y);
            this.isDrawing = true;
            this.saveCustomEditHistory();
        } else if (this.currentEditTool === 'fill') {
            console.log('[handleCustomEditMouseDown] 调用 fill 工具（不设置 isDrawing）');
            this.applyEditToCell(x, y);
        } else if (
            this.currentEditTool === 'colorConvert' ||
            this.currentEditTool === 'canvasBounds' ||
            this.currentEditTool === 'stroke'
        ) {
            // 非交互式工具：点击画布不执行任何绘制
            return;
        } else {
            console.log('[handleCustomEditMouseDown] 调用 applyEditToCell');
            this.isDrawing = true;
            this.applyEditToCell(x, y);
        }
    },

    handleCustomEditMouseMove(e) {
        // 自定义画笔工具：始终重绘以显示预笔迹
        if (this.currentEditTool === 'customBrush' && this.brushManager && this.brushManager.getCurrentBrush()) {
            if (this.isDrawing) {
                // 按下时：应用画笔
                const { x, y } = this.getCustomEditCell(e);
                this.applyCustomBrushAt(x, y);
            } else {
                // 未按下时：只更新预览
                this.drawCustomEditCanvas();
            }
            return;
        }

        if (!this.isDrawing || !this.customEditData) return;

        if (this.currentEditTool === 'chainRazor') {
            return;
        }

        if (this.currentEditTool === 'selection') {
            const { x, y } = this.getCustomEditCell(e);
            const clampedX = Math.max(0, Math.min(x, this.perlerWidth - 1));
            const clampedY = Math.max(0, Math.min(y, this.perlerHeight - 1));

            const selMgr = this.customEditor.selectionManager;

            if (selMgr.type === 'rect' || selMgr.type === 'lasso') {
                // 矩形或套索：更新选区
                this.customEditor.updateSelection(clampedX, clampedY);
                this.drawCustomEditCanvas();
            } else if (selMgr.type === 'smudge') {
                // 涂抹选区：添加经过的格子
                this.customEditor.updateSelection(clampedX, clampedY);
                this.drawCustomEditCanvas();
            } else if (selMgr.type === 'polygon') {
                // 多边形：更新最后一个顶点的预览位置
                // 需要添加一个临时点来显示预览线
                this.drawCustomEditCanvas();
            }
            return;
        }

        const { x, y } = this.getCustomEditCell(e);
        this.applyEditToCell(x, y);
    },

    handleCustomEditMouseUp() {
        if (this.currentEditTool === 'selection') {
            const selMgr = this.customEditor.selectionManager;

            if (selMgr.type === 'polygon') {
                // 多边形：鼠标松开后保留已有的顶点，等待继续点击或双击闭合
                this.isDrawing = false;
                // 注意：不调用 endSelection()，保留已添加的点
            } else if (selMgr.type === 'smudge') {
                // 涂抹选区：结束涂抹
                this.customEditor.endSelection();
                this.isDrawing = false;
            } else {
                // 矩形或套索：结束绘制
                this.customEditor.endSelection();
                this.isDrawing = false;
            }

            // 更新选区面板信息
            if (this.selectionPanel) {
                this.selectionPanel.updateInfo();
            }
            return;
        }

        // 自定义画笔工具：结束绘制
        if (this.currentEditTool === 'customBrush') {
            if (this.isDrawing && this.customEditData) {
                this.saveCustomEditHistory();
            }
            this.isDrawing = false;
            return;
        }

        if (this.isDrawing && this.customEditData && this.currentEditTool !== 'chainRazor') {
            this.saveCustomEditHistory();
        }
        this.isDrawing = false;
    },

    applyCustomBrushAt(x, y) {
        if (!this.brushManager || !this.brushManager.getCurrentBrush()) return;
        if (!this.customEditData) return;

        const strokes = this.brushManager.getBrushStrokes(x, y);

        let modified = false;
        for (const stroke of strokes) {
            if (stroke.x >= 0 && stroke.x < this.perlerWidth && 
                stroke.y >= 0 && stroke.y < this.perlerHeight) {
                // 获取颜色信息
                let colorData;
                if (stroke.color) {
                    // 使用画笔自带的颜色
                    colorData = { ...stroke.color };
                } else {
                    // 使用当前选择的颜色
                    colorData = this.getCurrentEditColorData();
                }

                if (colorData) {
                    this.customEditData[stroke.y][stroke.x] = { ...colorData };
                    modified = true;
                }
            }
        }

        if (modified) {
            this.drawCustomEditCanvas();
        }
    },

    getCurrentEditColorData() {
        // 从色板组件获取当前选中的颜色
        if (this.beadPalette && this.beadPalette.getSelectedColor()) {
            return this.beadPalette.getSelectedColor();
        }

        // 默认返回一个白色
        return {
            name: '白',
            rgb: [255, 255, 255],
            isTransparent: false
        };
    },

    applyChainRazor(startX, startY) {
        const transparentColor = {
            name: '',
            rgb: [255, 255, 255],
            isTransparent: true
        };

        const targetColor = this.customEditData[startY][startX];
        if (targetColor.isTransparent) return;

        const maxCount = parseInt(this.chainRazorMax.value) || 1000;
        let count = 0;

        const visited = new Set();
        const stack = [{x: startX, y: startY}];

        while (stack.length > 0 && count < maxCount) {
            const {x, y} = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= this.perlerWidth || y < 0 || y >= this.perlerHeight) continue;

            if (this.customEditor && !this.customEditor.isInSelection(x, y)) continue;

            const currentColor = this.customEditData[y][x];
            if (currentColor.isTransparent) continue;
            if (currentColor.name !== targetColor.name) continue;

            visited.add(key);
            this.customEditData[y][x] = transparentColor;
            count++;

            // 八爪鱼方向：上下左右 + 四个对角线
            stack.push({x: x + 1, y});       // 右
            stack.push({x: x - 1, y});       // 左
            stack.push({x, y: y + 1});       // 下
            stack.push({x, y: y - 1});       // 上
            stack.push({x: x + 1, y: y + 1}); // 右下
            stack.push({x: x + 1, y: y - 1}); // 右上
            stack.push({x: x - 1, y: y + 1}); // 左下
            stack.push({x: x - 1, y: y - 1}); // 左上
        }

        this.drawCustomEditCanvas();
    },

    removeSelectedColor() {
        if (!this.customEditData) {
            alert(getI18nText('alertNoEditableImage'));
            return;
        }

        const hexColor = this.removeColorPicker.value;
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);

        // 找到最接近的颜色
        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName];
        const mappingMethod = this.colorMappingMethod.value;
        const targetColor = findClosestColor([r, g, b], colorSet, mappingMethod);

        if (!targetColor || targetColor.isTransparent) {
            alert(getI18nText('alertInvalidColor'));
            return;
        }

        // 统计要剔除的颜色数量
        let count = 0;
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                if (this.customEditor && !this.customEditor.isInSelection(x, y)) continue;
                const currentColor = this.customEditData[y][x];
                if (!currentColor.isTransparent && currentColor.name === targetColor.name) {
                    count++;
                }
            }
        }

        if (count === 0) {
            alert(getI18nText('alertNoColorToRemove'));
            return;
        }

        // 去掉确认弹窗，直接执行剔除
        console.log(`正在剔除所有 ${targetColor.name} 颜色，共 ${count} 个色块...`);

        // 保存历史记录
        this.saveCustomEditHistory();

        // 执行颜色剔除
        const transparentColor = {
            name: '',
            rgb: [255, 255, 255],
            isTransparent: true
        };

        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                if (this.customEditor && !this.customEditor.isInSelection(x, y)) continue;
                const currentColor = this.customEditData[y][x];
                if (!currentColor.isTransparent && currentColor.name === targetColor.name) {
                    this.customEditData[y][x] = transparentColor;
                }
            }
        }

        this.drawCustomEditCanvas();
        // 去掉弹窗，改为在控制台显示
        console.log(`已成功剔除 ${count} 个 ${targetColor.name} 颜色！`);
    },

    applyNoiseFilter() {
        if (!this.customEditData) {
            alert(getI18nText('alertNoEditableImage'));
            return;
        }

        const threshold = parseInt(this.noiseFilterThresholdSlider.value);
        if (threshold <= 0) {
            alert(getI18nText('alertInvalidNoiseThreshold'));
            return;
        }

        this.saveCustomEditHistory();

        const isInSelection = this.customEditor ? (x, y) => this.customEditor.isInSelection(x, y) : null;

        this.customEditData = filterNoisePixels(this.customEditData, threshold, 1, isInSelection);

        this.drawCustomEditCanvas();
        console.log(`已应用杂色过滤，阈值: ${threshold}`);
    },

    applyEditToCell(x, y) {
        console.log('[applyEditToCell] 开始！');
        console.log('[applyEditToCell] 当前工具:', this.currentEditTool);

        if (x < 0 || x >= this.perlerWidth || y < 0 || y >= this.perlerHeight) {
            console.log('[applyEditToCell] 位置无效');
            return;
        }

        const brushSize = parseInt(this.customEditBrushSize.value);
        const halfBrush = Math.floor(brushSize / 2);

        for (let dy = -halfBrush; dy <= halfBrush; dy++) {
            for (let dx = -halfBrush; dx <= halfBrush; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < this.perlerWidth && ny >= 0 && ny < this.perlerHeight) {
                    if (this.customEditor && !this.customEditor.isInSelection(nx, ny)) continue;
                    this.applySingleEdit(nx, ny);
                }
            }
        }

        this.drawCustomEditCanvas();
    },

    applySingleEdit(x, y) {
        const transparentColor = {
            name: '',
            rgb: [255, 255, 255],
            isTransparent: true
        };

        switch (this.currentEditTool) {
            case 'brush':
                const hexColor = this.getCurrentEditColor();
                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);

                const colorSetName = this.colorSetSelect.value;
                const colorSet = colorSets[colorSetName];
                const mappingMethod = this.colorMappingMethod.value;
                const closestColor = findClosestColor([r, g, b], colorSet, mappingMethod);

                this.customEditData[y][x] = closestColor;
                break;

            case 'eraser':
                const eraserHex = this.eraserColor.value;
                const er = parseInt(eraserHex.slice(1, 3), 16);
                const eg = parseInt(eraserHex.slice(3, 5), 16);
                const eb = parseInt(eraserHex.slice(5, 7), 16);

                const csName = this.colorSetSelect.value;
                const cs = colorSets[csName];
                const mm = this.colorMappingMethod.value;
                const eraserClosestColor = findClosestColor([er, eg, eb], cs, mm);

                this.customEditData[y][x] = eraserClosestColor;
                break;

            case 'razor':
                this.customEditData[y][x] = transparentColor;
                break;

            case 'fill':
                if (!this.isDrawing) {
                    console.log('[applySingleEdit] 填充工具触发');
                    console.log('[applySingleEdit] 点击位置:', x, y);
                    console.log('[applySingleEdit] 选中颜色:', this.getCurrentEditColor());

                    this.saveCustomEditHistory();
                    const targetColor = this.customEditData[y][x];
                    const hexFill = this.getCurrentEditColor();
                    const fr = parseInt(hexFill.slice(1, 3), 16);
                    const fg = parseInt(hexFill.slice(3, 5), 16);
                    const fb = parseInt(hexFill.slice(5, 7), 16);

                    const csName = this.colorSetSelect.value;
                    const cs = colorSets[csName];
                    const mm = this.colorMappingMethod.value;
                    const fillColor = findClosestColor([fr, fg, fb], cs, mm);

                    console.log('[applySingleEdit] 准备调用 floodFill');
                    this.floodFill(x, y, targetColor, fillColor);
                }
                break;

            case 'picker':
                const pickedColor = this.customEditData[y][x];
                if (pickedColor.isTransparent) break;
                const pickedHex = `#${pickedColor.rgb[0].toString(16).padStart(2, '0')}${pickedColor.rgb[1].toString(16).padStart(2, '0')}${pickedColor.rgb[2].toString(16).padStart(2, '0')}`;

                // 使用色板组件设置颜色（如果存在）
                if (this.beadPalette && pickedColor.name) {
                    this.beadPalette.setColor(pickedColor.name);
                } else {
                    // 后备方案：直接更新属性
                    this.currentBeadColor = pickedHex;
                    this.currentBeadColorName = pickedColor.name || '未知';
                }
                break;
        }
    },

    floodFill(startX, startY, targetColor, fillColor) {
        console.log('[floodFill] 开始填充');
        console.log('[floodFill] 开始位置:', startX, startY);
        console.log('[floodFill] 目标颜色:', targetColor);
        console.log('[floodFill] 填充颜色:', fillColor);

        // 判断是否需要填充
        const targetIsTransparent = targetColor.isTransparent;
        const fillIsTransparent = fillColor.isTransparent;
        if (!targetIsTransparent && !fillIsTransparent && targetColor.name === fillColor.name) {
            console.log('[floodFill] 目标颜色与填充颜色相同，跳过');
            return;
        }
        if (targetIsTransparent && fillIsTransparent) {
            console.log('[floodFill] 都是透明色，跳过');
            return;
        }

        const visited = new Set();
        const stack = [{x: startX, y: startY}];
        let fillCount = 0;

        while (stack.length > 0) {
            const {x, y} = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= this.perlerWidth || y < 0 || y >= this.perlerHeight) continue;

            if (this.customEditor && !this.customEditor.isInSelection(x, y)) continue;

            const currentColor = this.customEditData[y][x];
            const currentIsTransparent = currentColor.isTransparent;

            // 检查当前颜色是否等于目标颜色
            let isMatch = false;
            if (targetIsTransparent) {
                isMatch = currentIsTransparent;
            } else {
                isMatch = !currentIsTransparent && currentColor.name === targetColor.name;
            }

            if (!isMatch) continue;

            visited.add(key);
            this.customEditData[y][x] = fillColor;
            fillCount++;

            // 十字方向：只上下左右
            stack.push({x: x + 1, y});
            stack.push({x: x - 1, y});
            stack.push({x, y: y + 1});
            stack.push({x, y: y - 1});
        }

        console.log('[floodFill] 填充完成，共填充', fillCount, '个格子');

        // 重绘画布
        this.drawCustomEditCanvas();
    },

    saveCustomEditHistory() {
        this.customEditHistory.push(this.customEditData.map(row => [...row]));
        if (this.customEditHistory.length > 50) {
            this.customEditHistory.shift();
        }
    },

    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    },

    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    },

    executeColorConvert() {
        if (!this.customEditData) return;

        const sourceHex = this.colorConvertSourceColor.value;
        const targetHex = this.colorConvertTargetColor.value;

        const sourceIsTrans = this.colorConvertSourceIsTransparent;
        const targetIsTrans = this.colorConvertTargetIsTransparent;

        if (sourceIsTrans && targetIsTrans) {
            return;
        }

        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName];
        const mappingMethod = this.colorMappingMethod.value;

        let sourceColor;
        let targetColor;

        if (sourceIsTrans) {
            sourceColor = { name: '', isTransparent: true };
        } else {
            const sourceRgb = this.hexToRgb(sourceHex);
            sourceColor = findClosestColor(sourceRgb, colorSet, mappingMethod);
        }

        if (targetIsTrans) {
            targetColor = { name: '', isTransparent: true, rgb: [255, 255, 255] };
        } else {
            const targetRgb = this.hexToRgb(targetHex);
            targetColor = findClosestColor(targetRgb, colorSet, mappingMethod);
        }

        if (sourceColor.name === targetColor.name) {
            return;
        }

        let convertedCount = 0;
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                if (this.customEditor && !this.customEditor.isInSelection(x, y)) continue;
                const currentColor = this.customEditData[y][x];

                let match = false;
                if (sourceIsTrans) {
                    match = currentColor.isTransparent;
                } else {
                    match = !currentColor.isTransparent && currentColor.name === sourceColor.name;
                }

                if (match) {
                    if (targetIsTrans) {
                        this.customEditData[y][x] = { name: '', isTransparent: true, rgb: [255, 255, 255] };
                    } else {
                        this.customEditData[y][x] = targetColor;
                    }
                    convertedCount++;
                }
            }
        }

        if (convertedCount > 0) {
            this.saveCustomEditHistory();
            this.drawCustomEditCanvas();
            console.log(`颜色转换完成，共转换 ${convertedCount} 个色块`);
        }
    },

    applyStroke(type, thickness, colorHex) {
        if (!this.customEditData) {
            alert(getI18nText('alertNoImageLoaded'));
            return;
        }
        if (thickness < 1) thickness = 1;
        if (thickness > 10) thickness = 10;

        const width = this.perlerWidth;
        const height = this.perlerHeight;
        const [r, g, b] = this.hexToRgb(colorHex);

        // 获取当前色板，把用户选择的颜色映射到色板中最接近的颜色
        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName];
        const mappingMethod = this.colorMappingMethod.value;

        const closestColor = findClosestColor([r, g, b], colorSet, mappingMethod);

        const strokeColorObj = {
            name: closestColor.name,
            rgb: closestColor.rgb,
            isTransparent: false,
            displayName: closestColor.name
        };

        // 保存历史记录（在修改之前保存原始数据）
        this.saveCustomEditHistory();

        let totalChanged = 0;

        // 8 邻居：上、下、左、右 + 四个对角
        const neighbors = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0],           [1, 0],
            [-1, 1],  [0, 1],  [1, 1]
        ];

        // 循环 N 次实现"扩散"效果
        // 每次只能用当前轮次开始时的状态来判断边缘，所以用临时数组
        for (let round = 0; round < thickness; round++) {
            // 标记本轮需要修改的格子（不能边遍历边修改，会影响判断）
            const toChange = [];

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (this.customEditor && !this.customEditor.isInSelection(x, y)) continue;

                    const current = this.customEditData[y][x];
                    const isTransparentCurrent = !current || current.isTransparent;

                    // 判断当前格子是否为"目标类型"的边缘
                    let isEdge = false;

                    if (type === 'outer') {
                        // 外描边：当前是透明的 + 8邻居中至少有一个非透明 → 涂成描边色
                        if (!isTransparentCurrent) continue; // 只处理透明格子

                        for (const [dx, dy] of neighbors) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nb = this.customEditData[ny][nx];
                                if (nb && !nb.isTransparent) {
                                    isEdge = true;
                                    break;
                                }
                            }
                        }
                    } else {
                        // 内描边：当前是非透明的 + 8邻居中至少有一个透明 → 涂成描边色
                        if (isTransparentCurrent) continue; // 只处理实体格子

                        // 已经是描边色本身的格子，不参与判断（避免持续扩散）
                        if (current.name === strokeColorObj.name) continue;

                        for (const [dx, dy] of neighbors) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                                // 超出边界 → 视为透明（边缘格子也算边缘）
                                isEdge = true;
                                break;
                            }
                            const nb = this.customEditData[ny][nx];
                            if (!nb || nb.isTransparent) {
                                isEdge = true;
                                break;
                            }
                        }
                    }

                    if (isEdge) {
                        toChange.push({ x, y });
                    }
                }
            }

            // 本轮没有任何可修改的格子 → 提前结束
            if (toChange.length === 0) break;

            // 批量修改
            for (const pos of toChange) {
                this.customEditData[pos.y][pos.x] = strokeColorObj;
                totalChanged++;
            }
        }

        // 重绘画布
        this.drawCustomEditCanvas();

        if (totalChanged > 0) {
            const mappedHex = this.rgbToHex(closestColor.rgb[0], closestColor.rgb[1], closestColor.rgb[2]);
            alert(getI18nTextWithVars('alertStrokeDone', {color: colorHex.toUpperCase(), mapped: closestColor.name + ' (' + mappedHex.toUpperCase() + ')', count: totalChanged}));
        } else {
            alert(getI18nText('alertNoStrokableCells'));
        }
    },

    undoCustomEdit() {
        if (this.customEditHistory.length > 1) {
            this.customEditHistory.pop();
            this.customEditData = this.customEditHistory[this.customEditHistory.length - 1].map(row => [...row]);
            this.drawCustomEditCanvas();
        }
    },

    flipImageHorizontal() {
        if (!this.customEditData) return;

        // 保存历史记录
        this.saveCustomEditHistory();

        // 左右翻转：每行反转
        this.customEditData = this.customEditData.map(row => [...row].reverse());

        this.drawCustomEditCanvas();
    },

    flipImageVertical() {
        if (!this.customEditData) return;

        // 保存历史记录
        this.saveCustomEditHistory();

        // 上下翻转：数组反转
        this.customEditData = [...this.customEditData].reverse();

        this.drawCustomEditCanvas();
    },

    applyCustomEdit() {
        if (!this.customEditData) return;

        // 根据画布边界裁剪内容
        let finalData = this.customEditData;
        let finalWidth = this.perlerWidth;
        let finalHeight = this.perlerHeight;

        if (this.canvasBounds) {
            const left = this.canvasBounds.left;
            const right = this.canvasBounds.right;
            const top = this.canvasBounds.top;
            const bottom = this.canvasBounds.bottom;

            finalWidth = right - left;
            finalHeight = bottom - top;
            finalData = [];

            for (let y = top; y < bottom; y++) {
                const newRow = [];
                for (let x = left; x < right; x++) {
                    newRow.push(this.customEditData[y][x]);
                }
                finalData.push(newRow);
            }

            // 更新画布尺寸
            this.perlerWidth = finalWidth;
            this.perlerHeight = finalHeight;
        }

        this.perlerColors = finalData.map(row => [...row]);

        this.colorCounts = {};
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                const color = this.perlerColors[y][x];
                if (!color.isTransparent) {
                    if (this.colorCounts[color.name]) {
                        this.colorCounts[color.name]++;
                    } else {
                        this.colorCounts[color.name] = 1;
                    }
                }
            }
        }

        // 更新拼豆尺寸显示
        this.perlerSize.textContent = `${getI18nText('perlerSize')}: ${this.perlerWidth} × ${this.perlerHeight} ${getI18nText('beans')}`;

        this.saveUnifiedSnapshot('custom', '', finalData);

        this.drawPerlerChart(this.perlerColors, this.perlerWidth, this.perlerHeight, this.colorSetSelect.value);
        this.drawColorLegend();

        // 重新初始化自定义编辑数据（因为尺寸可能改变了）
        this.initCustomEditData();
    },
};

if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, CustomEditMixin);
}
if (typeof window !== 'undefined') {
    window.CustomEditMixin = CustomEditMixin;
}
