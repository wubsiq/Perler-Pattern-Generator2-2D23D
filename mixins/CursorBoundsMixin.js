/**
 * CursorBoundsMixin — 自定义编辑光标+画布边界-8方法
 * 来源: app.js L5646-L5962
 * 提取时间: 2026-10-02 14:58:05
 */

const CursorBoundsMixin = {
    updateCustomEditBrushCursorSize() {
        if (!this.customEditBrushCursor) return;

        // 连锁剃刀固定为1个格子
        let brushSize;
        if (this.currentEditTool === 'chainRazor') {
            brushSize = 1;
        } else {
            brushSize = parseInt(this.customEditBrushSize.value);
        }

        const size = brushSize * this.customEditCellSize;

        this.customEditBrushCursor.style.width = size + 'px';
        this.customEditBrushCursor.style.height = size + 'px';
    },

    updateCustomEditBrushCursorPosition(e) {
        if (!this.customEditBrushCursor) return;

        const rect = this.customEditCanvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const cellSize = parseInt(this.beadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));

        // 计算当前鼠标所在的格子坐标（与 getCustomEditCell 计算方式完全一致）
        const pixelX = clientX - rect.left - coordSize;
        const pixelY = clientY - rect.top - coordSize;
        const cellX = Math.floor(pixelX / cellSize);
        const cellY = Math.floor(pixelY / cellSize);

        // 检查是否在有效画布范围内（包括透明区域，只要是合法格子就可以）
        const isInCanvas = cellX >= 0 && cellX < this.perlerWidth && cellY >= 0 && cellY < this.perlerHeight;

        // 连锁剃刀固定为1个格子
        let brushSize;
        if (this.currentEditTool === 'chainRazor') {
            brushSize = 1;
        } else {
            brushSize = parseInt(this.customEditBrushSize.value);
        }
        const halfBrush = Math.floor(brushSize / 2);

        // 吸附到左上角的格子边界
        const snapLeft = coordSize + (cellX - halfBrush) * cellSize;
        const snapTop = coordSize + (cellY - halfBrush) * cellSize;
        const snapSize = brushSize * cellSize;

        // 更新光标位置（吸附到格子）
        this.customEditBrushCursor.style.left = snapLeft + 'px';
        this.customEditBrushCursor.style.top = snapTop + 'px';
        this.customEditBrushCursor.style.width = snapSize + 'px';
        this.customEditBrushCursor.style.height = snapSize + 'px';

        // 根据工具类型更新光标颜色
        const cursor = this.customEditBrushCursor;
        cursor.classList.remove('brush-cursor-brush', 'brush-cursor-eraser', 'brush-cursor-razor', 'brush-cursor-picker', 'brush-cursor-fill', 'brush-cursor-invalid');

        // 画布边界工具不显示画笔光标
        if (this.currentEditTool === 'canvasBounds') {
            cursor.style.display = 'none';
            return;
        }

        if (!isInCanvas) {
            cursor.classList.add('brush-cursor-invalid');
            cursor.style.borderColor = 'rgba(128, 128, 128, 0.5)';
            cursor.style.backgroundColor = 'rgba(128, 128, 128, 0.1)';
            return;
        }

        switch (this.currentEditTool) {
            case 'brush':
                cursor.classList.add('brush-cursor-brush');
                cursor.style.borderColor = this.getCurrentEditColor();
                cursor.style.backgroundColor = this.getCurrentEditColor() + '33';
                break;
            case 'eraser':
                cursor.classList.add('brush-cursor-eraser');
                cursor.style.borderColor = this.eraserColor.value;
                cursor.style.backgroundColor = this.eraserColor.value + '33';
                break;
            case 'razor':
            case 'chainRazor':
                cursor.classList.add('brush-cursor-razor');
                cursor.style.borderColor = this.razorBgColor.value;
                cursor.style.backgroundColor = this.razorBgColor.value + '33';
                break;
            case 'picker':
                cursor.classList.add('brush-cursor-picker');
                cursor.style.borderColor = '#333333';
                cursor.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
                break;
            case 'fill':
                cursor.classList.add('brush-cursor-fill');
                cursor.style.borderColor = this.getCurrentEditColor();
                cursor.style.backgroundColor = this.getCurrentEditColor() + '22';
                break;
            default:
                cursor.style.borderColor = 'rgba(0, 123, 255, 0.8)';
                cursor.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
        }
    },

    updateCanvasBoundsInputs() {
        if (!this.canvasBounds) return;
        this.canvasBoundsLeftInput.value = this.canvasBounds.left;
        this.canvasBoundsRightInput.value = this.canvasBounds.right;
        this.canvasBoundsTopInput.value = this.canvasBounds.top;
        this.canvasBoundsBottomInput.value = this.canvasBounds.bottom;
    },

    updateCanvasBoundsDisplay() {
        if (!this.canvasBounds) return;
        const displayWidth = this.canvasBounds.right - this.canvasBounds.left;
        const displayHeight = this.canvasBounds.bottom - this.canvasBounds.top;
        this.canvasBoundsCurrentSize.textContent = `${displayWidth} × ${displayHeight}`;
    },

    applyCanvasBounds(newLeft, newRight, newTop, newBottom) {
        if (!this.customEditData) return;

        const currentWidth = this.perlerWidth;
        const currentHeight = this.perlerHeight;

        let addLeft = 0, addRight = 0, addTop = 0, addBottom = 0;
        if (newLeft < 0) addLeft = -newLeft;
        if (newRight > currentWidth) addRight = newRight - currentWidth;
        if (newTop < 0) addTop = -newTop;
        if (newBottom > currentHeight) addBottom = newBottom - currentHeight;

        const needsExpand = (addLeft + addRight + addTop + addBottom) > 0;

        if (needsExpand) {
            const newWidth = currentWidth + addLeft + addRight;
            const newHeight = currentHeight + addTop + addBottom;

            const transparentColor = { name: '', rgb: [255, 255, 255], isTransparent: true, displayName: '' };

            const newData = [];
            for (let y = 0; y < newHeight; y++) {
                const row = [];
                for (let x = 0; x < newWidth; x++) {
                    const origX = x - addLeft;
                    const origY = y - addTop;
                    if (origX >= 0 && origX < currentWidth && origY >= 0 && origY < currentHeight) {
                        row.push({ ...this.customEditData[origY][origX] });
                    } else {
                        row.push({ ...transparentColor });
                    }
                }
                newData.push(row);
            }

            this.customEditData = newData;
            this.perlerColors = newData.map(row => row.map(cell => ({ ...cell })));
            this.perlerWidth = newWidth;
            this.perlerHeight = newHeight;
            this.canvasBounds.originalWidth = newWidth;
            this.canvasBounds.originalHeight = newHeight;
        }

        this.canvasBounds.left = newLeft + addLeft;
        this.canvasBounds.right = newRight + addLeft;
        this.canvasBounds.top = newTop + addTop;
        this.canvasBounds.bottom = newBottom + addTop;
    },

    resetCanvasBounds() {
        if (!this.canvasBounds) return;
        this.canvasBounds.left = 0;
        this.canvasBounds.right = this.canvasBounds.originalWidth;
        this.canvasBounds.top = 0;
        this.canvasBounds.bottom = this.canvasBounds.originalHeight;
        this.updateCanvasBoundsInputs();
        this.updateCanvasBoundsDisplay();
        this.drawCustomEditCanvas();
    },

    updateCanvasBoundsHandlesPosition() {
        if (!this.canvasBounds || !this.canvasBoundsHandles) return;

        const cellSize = parseInt(this.beadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
        const left = coordSize + this.canvasBounds.left * cellSize;
        const right = coordSize + this.canvasBounds.right * cellSize;
        const top = coordSize + this.canvasBounds.top * cellSize;
        const bottom = coordSize + this.canvasBounds.bottom * cellSize;

        // 更新手柄大小和位置
        const handles = this.canvasBoundsHandles.querySelectorAll('.canvas-bounds-handle');
        handles.forEach(handle => {
            const handleType = handle.dataset.handle;
            let handleLeft, handleTop;

            switch (handleType) {
                case 'tl':
                    handleLeft = left - 6;
                    handleTop = top - 6;
                    break;
                case 'tr':
                    handleLeft = right - 6;
                    handleTop = top - 6;
                    break;
                case 'bl':
                    handleLeft = left - 6;
                    handleTop = bottom - 6;
                    break;
                case 'br':
                    handleLeft = right - 6;
                    handleTop = bottom - 6;
                    break;
                case 't':
                    handleLeft = (left + right) / 2 - 6;
                    handleTop = top - 6;
                    break;
                case 'r':
                    handleLeft = right - 6;
                    handleTop = (top + bottom) / 2 - 6;
                    break;
                case 'b':
                    handleLeft = (left + right) / 2 - 6;
                    handleTop = bottom - 6;
                    break;
                case 'l':
                    handleLeft = left - 6;
                    handleTop = (top + bottom) / 2 - 6;
                    break;
            }

            handle.style.left = handleLeft + 'px';
            handle.style.top = handleTop + 'px';
        });
    },

    initCanvasBoundsDragEvents() {
        const handles = this.canvasBoundsHandles.querySelectorAll('.canvas-bounds-handle');

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.isDraggingCanvasBounds = true;
                this.draggingHandle = handle.dataset.handle;

                // 开始拖拽时保存历史记录
                this.saveCustomEditHistory();
            });
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDraggingCanvasBounds || !this.canvasBounds) return;

            const rect = this.customEditCanvas.getBoundingClientRect();
            const cellSize = parseInt(this.beadSizeSlider.value);
            const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
            const clientX = e.clientX - rect.left - coordSize;
            const clientY = e.clientY - rect.top - coordSize;

            const gridX = Math.round(clientX / cellSize);
            const gridY = Math.round(clientY / cellSize);

            let newLeft = this.canvasBounds.left;
            let newRight = this.canvasBounds.right;
            let newTop = this.canvasBounds.top;
            let newBottom = this.canvasBounds.bottom;

            switch (this.draggingHandle) {
                case 'tl':
                    newLeft = Math.min(gridX, this.canvasBounds.right - 1);
                    newTop = Math.min(gridY, this.canvasBounds.bottom - 1);
                    break;
                case 'tr':
                    newRight = Math.max(gridX, this.canvasBounds.left + 1);
                    newTop = Math.min(gridY, this.canvasBounds.bottom - 1);
                    break;
                case 'bl':
                    newLeft = Math.min(gridX, this.canvasBounds.right - 1);
                    newBottom = Math.max(gridY, this.canvasBounds.top + 1);
                    break;
                case 'br':
                    newRight = Math.max(gridX, this.canvasBounds.left + 1);
                    newBottom = Math.max(gridY, this.canvasBounds.top + 1);
                    break;
                case 't':
                    newTop = Math.min(gridY, this.canvasBounds.bottom - 1);
                    break;
                case 'r':
                    newRight = Math.max(gridX, this.canvasBounds.left + 1);
                    break;
                case 'b':
                    newBottom = Math.max(gridY, this.canvasBounds.top + 1);
                    break;
                case 'l':
                    newLeft = Math.min(gridX, this.canvasBounds.right - 1);
                    break;
            }

            this.applyCanvasBounds(newLeft, newRight, newTop, newBottom);
            this.updateCanvasBoundsInputs();
            this.updateCanvasBoundsDisplay();
            this.drawCustomEditCanvas();
            this.updateCanvasBoundsHandlesPosition();
        });

        document.addEventListener('mouseup', () => {
            if (this.isDraggingCanvasBounds) {
                this.isDraggingCanvasBounds = false;
                this.draggingHandle = null;
            }
        });
    },
};

// 在 PixelArtGenerator 类定义后执行，覆盖 prototype 上的同名方法
if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, CursorBoundsMixin);
}

if (typeof window !== 'undefined') {
    window.CursorBoundsMixin = CursorBoundsMixin;
}
