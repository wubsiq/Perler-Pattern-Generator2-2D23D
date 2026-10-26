/**
 * SmartOptimizeMixin — 智能优化弹窗+预览画布事件+涂抹+全屏+光标(优化专用)
 * 来源: app.js L5345-L5644 (300 行)
 * 提取时间: 2026-10-02 14:54:10
 *
 * 用法: 在 build.js 中把此文件放在 app.js 之后拼接，
 *       Object.assign 会把这些方法覆盖到 PixelArtGenerator.prototype 上。
 *       原 app.js 中的同名方法保留（被覆盖），验证无误后可删除。
 */

const SmartOptimizeMixin = {
    openSmartOptimizeModal() {
        if (!this.perlerColors || !this.perlerColors.length) {
            alert(getI18nText('alertNoPerlerRendered'));
            return;
        }
        
        this.originalPerlerColors = this.perlerColors.map(row => [...row]);
        this.previewPerlerColors = this.perlerColors.map(row => [...row]); // 预览用的临时颜色矩阵
        this.colorSuggestions = this.generateColorSuggestions();
        this.acceptedSuggestions = new Set();
        this.rejectedSuggestions = new Set();
        this.erasedBlocks = new Set(); // 重置取消优化的方块
        
        for (let i = 0; i < this.colorSuggestions.length; i++) {
            if (this.colorSuggestions[i].isMerge) {
                this.acceptedSuggestions.add(i);
                this.applySuggestion(i);
            }
        }
        
        this.renderOptimizationSummary();
        this.renderSuggestionsList();
        this.drawOptimizationPreview();
        
        // 初始化画笔大小显示
        this.optimizeBrushSizeValue.textContent = this.optimizeBrushSizeSlider.value;
        
        this.smartOptimizeModal.style.display = 'flex';
    },

    initOptimizationPreviewCanvasEvents() {
        const canvas = this.optimizationPreviewCanvas;
        
        // 鼠标进入画布
        canvas.addEventListener('mouseenter', (e) => {
            this.brushCursor.style.display = 'block';
            this.updateBrushCursorSize();
            this.updateBrushCursorPosition(e);
        });
        
        // 鼠标离开画布
        canvas.addEventListener('mouseleave', (e) => {
            this.isDrawing = false;
            this.brushCursor.style.display = 'none';
        });
        
        // 鼠标按下
        canvas.addEventListener('mousedown', (e) => {
            this.isDrawing = true;
            this.handleOptimizationDraw(e);
        });
        
        // 鼠标移动
        canvas.addEventListener('mousemove', (e) => {
            this.updateBrushCursorPosition(e);
            if (this.isDrawing) {
                this.handleOptimizationDraw(e);
            }
        });
        
        // 鼠标释放
        canvas.addEventListener('mouseup', () => {
            this.isDrawing = false;
        });
        
        // 触摸开始
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isDrawing = true;
            const touch = e.touches[0];
            this.handleOptimizationDraw(touch);
        });
        
        // 触摸移动
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.isDrawing) {
                const touch = e.touches[0];
                this.handleOptimizationDraw(touch);
            }
        });
        
        // 触摸结束
        canvas.addEventListener('touchend', () => {
            this.isDrawing = false;
        });
    },

    handleOptimizationDraw(e) {
        const rect = this.optimizationPreviewCanvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const gridX = Math.floor(x / this.optimizationCellSize);
        const gridY = Math.floor(y / this.optimizationCellSize);
        
        const brushSize = parseInt(this.optimizeBrushSizeSlider.value);
        
        // 以点击位置为中心，涂抹周围的方块
        for (let dy = -brushSize + 1; dy < brushSize; dy++) {
            for (let dx = -brushSize + 1; dx < brushSize; dx++) {
                const bx = gridX + dx;
                const by = gridY + dy;
                
                if (bx >= 0 && bx < this.perlerWidth && by >= 0 && by < this.perlerHeight) {
                    const key = `${bx},${by}`;
                    
                    if (this.brushMode === 'erase') {
                        this.erasedBlocks.add(key);
                        // 擦除模式：恢复到原始颜色
                        this.previewPerlerColors[by][bx] = this.originalPerlerColors[by][bx];
                    } else {
                        this.erasedBlocks.delete(key);
                        // 恢复模式：重新应用所有已接受的建议
                        this.previewPerlerColors[by][bx] = this.originalPerlerColors[by][bx];
                        for (const idx of this.acceptedSuggestions) {
                            const suggestion = this.colorSuggestions[idx];
                            if (suggestion && this.originalPerlerColors[by][bx].name === suggestion.originalColor.name) {
                                this.previewPerlerColors[by][bx] = suggestion.replacementColor;
                            }
                        }
                    }
                }
            }
        }
        
        this.drawOptimizationPreview();
        this.renderSuggestionsList(); // 同步更新优化列表
    },

    regenerateSuggestions() {
        // 先恢复预览颜色到原始
        this.previewPerlerColors = this.originalPerlerColors.map(row => [...row]);
        
        this.colorSuggestions = this.generateColorSuggestions();
        this.acceptedSuggestions = new Set();
        this.rejectedSuggestions = new Set();
        this.erasedBlocks.clear();
        
        for (let i = 0; i < this.colorSuggestions.length; i++) {
            if (this.colorSuggestions[i].isMerge) {
                this.acceptedSuggestions.add(i);
                this.applySuggestion(i);
            }
        }
        
        this.renderOptimizationSummary();
        this.renderSuggestionsList();
        this.drawOptimizationPreview();
    },

    debouncedRegenerateSuggestions() {
        if (this.regenerateDebounceTimer) {
            clearTimeout(this.regenerateDebounceTimer);
        }
        this.regenerateDebounceTimer = setTimeout(() => {
            this.regenerateSuggestions();
        }, 300); // 300ms 防抖延迟
    },

    drawOptimizationPreview() {
        // 限制最大尺寸，防止图片太大破坏布局
        const MAX_CANVAS_WIDTH = 600;
        const MAX_CANVAS_HEIGHT = 600;
        
        // 计算基础单元格大小
        let cellSize = Math.min(
            Math.floor(600 / Math.max(this.perlerWidth, this.perlerHeight)),
            35
        );
        
        let canvasWidth = this.perlerWidth * cellSize;
        let canvasHeight = this.perlerHeight * cellSize;
        
        // 检查是否超过最大尺寸，如果超过则按比例缩小
        if (canvasWidth > MAX_CANVAS_WIDTH || canvasHeight > MAX_CANVAS_HEIGHT) {
            const scaleX = MAX_CANVAS_WIDTH / canvasWidth;
            const scaleY = MAX_CANVAS_HEIGHT / canvasHeight;
            const scale = Math.min(scaleX, scaleY);
            cellSize = Math.max(1, Math.floor(cellSize * scale));
            canvasWidth = this.perlerWidth * cellSize;
            canvasHeight = this.perlerHeight * cellSize;
        }
        
        this.optimizationPreviewCanvas.width = canvasWidth;
        this.optimizationPreviewCanvas.height = canvasHeight;
        
        this.optimizationCanvasWidth = canvasWidth;
        this.optimizationCanvasHeight = canvasHeight;
        this.optimizationCellSize = cellSize;
        
        // 更新画笔光标大小
        this.updateBrushCursorSize();
        
        const ctx = this.optimizationPreviewCtx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // 先确定哪些颜色会被替换
        const colorsToReplace = new Set();
        for (const idx of this.acceptedSuggestions) {
            const suggestion = this.colorSuggestions[idx];
            if (suggestion) {
                colorsToReplace.add(suggestion.originalColor.name);
            }
        }
        
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                const originalColor = this.originalPerlerColors[y][x];
                const key = `${x},${y}`;
                const isErased = this.erasedBlocks.has(key);
                
                let displayColor;
                let willBeReplaced = false;
                
                // 直接使用预览矩阵中的颜色
                displayColor = this.previewPerlerColors[y][x];
                
                // 判断是否会被替换（用于显示边框）
                if (!isErased && colorsToReplace.has(originalColor.name)) {
                    willBeReplaced = true;
                }
                
                if (displayColor.isTransparent) {
                    ctx.fillStyle = '#ffffff';
                } else {
                    ctx.fillStyle = `rgb(${displayColor.rgb[0]}, ${displayColor.rgb[1]}, ${displayColor.rgb[2]})`;
                }
                ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
                
                // 根据状态显示边框
                if (isErased) {
                    // 自定义取消优化颜色
                    ctx.strokeStyle = this.optimizeErasedColor.value;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x * cellSize + 1, y * cellSize + 1, cellSize - 3, cellSize - 3);
                } else if (willBeReplaced) {
                    // 自定义将要优化颜色
                    ctx.strokeStyle = this.optimizeHighlightColor.value;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x * cellSize + 1, y * cellSize + 1, cellSize - 3, cellSize - 3);
                }
            }
        }
    },

    toggleFullscreen() {
        this.isFullscreen = !this.isFullscreen;
        
        if (this.isFullscreen) {
            this.smartOptimizeModal.classList.add('fullscreen');
            this.toggleFullscreenBtn.textContent = '🗖️';
            this.toggleFullscreenBtn.title = getI18nText('toggleFullscreenOn');
            // 全屏模式下，确保头部始终可见
            document.body.style.overflow = 'hidden';
        } else {
            this.smartOptimizeModal.classList.remove('fullscreen');
            this.toggleFullscreenBtn.textContent = '🔍';
            this.toggleFullscreenBtn.title = getI18nText('toggleFullscreenOff');
            document.body.style.overflow = '';
        }
        
        // 重新绘制预览图以适应新尺寸
        this.drawOptimizationPreview();
    },

    updateBrushCursorSize() {
        if (!this.brushCursor) return;
        
        const brushSize = parseInt(this.optimizeBrushSizeSlider.value);
        const size = brushSize * this.optimizationCellSize;
        
        this.brushCursor.style.width = size + 'px';
        this.brushCursor.style.height = size + 'px';
    },

    updateBrushCursorPosition(e) {
        if (!this.brushCursor) return;
        
        const rect = this.optimizationPreviewCanvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const brushSize = parseInt(this.optimizeBrushSizeSlider.value);
        const size = brushSize * this.optimizationCellSize;
        
        const x = clientX - rect.left - size / 2;
        const y = clientY - rect.top - size / 2;
        
        this.brushCursor.style.left = x + 'px';
        this.brushCursor.style.top = y + 'px';
    }

};

// 在 PixelArtGenerator 类定义后执行，覆盖 prototype 上的同名方法
if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, SmartOptimizeMixin);
}

if (typeof window !== 'undefined') {
    window.SmartOptimizeMixin = SmartOptimizeMixin;
}
