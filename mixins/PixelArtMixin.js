/**
 * PixelArtMixin — 像素化+珠子绘制+颜色统计-9方法
 * 来源: app.js L1869-L2279
 */

const PixelArtMixin = {
    showWorkspace() {
        this.uploadSection.style.display = 'none';
        this.showcaseSection.style.display = 'none';
        this.workspace.style.display = 'block';
        this.setWorkspaceMode('normal');
        this.showPerlerPlaceholder();
    },

    /**
     * 读画布像素，污染时降级而不是崩掉。
     *
     * 背景：画布一旦被 tainted（file:// 协议下用 blob: URL 加载本地图片
     * 就会发生），getImageData 直接抛 SecurityError。
     * 而这一层是全站承重墙 —— 像素化、颜色统计、画笔、剃刀、雕刻
     * 都靠 originalImageData，一崩就是整个编辑器不能用。
     *
     * 上游 loadImage 已改用 FileReader 读 dataURL（正常情况下不会污染）。
     * 这里再加一道兜底：万一还有别的路径把画布污染了，
     * 至少让用户能看见图、能导出，只是不能编辑。
     */
    _safeGetImageData(ctx, w, h) {
        try {
            return ctx.getImageData(0, 0, w, h);
        } catch (e) {
            console.warn('[豆师傅] 画布被污染，无法读取像素：', e.message);
            console.warn('[豆师傅] 预览可用，但像素化/编辑功能会不可用。');
            console.warn('[豆师傅] 若在用 file:// 协议打开，请改用本地服务器或部署后的网址。');
            return null;
        }
    },

    drawOriginalImage() {
        // 设置画布的实际像素尺寸为原始尺寸
        this.originalCanvas.width = this.originalWidth;
        this.originalCanvas.height = this.originalHeight;
        this.originalCtx.drawImage(this.originalImage, 0, 0);
        this.originalImageData = this._safeGetImageData(this.originalCtx, this.originalWidth, this.originalHeight);
        this.originalSize.textContent = `${getI18nText('originalSize')}: ${this.originalWidth} × ${this.originalHeight} px`;

        // 计算画布的显示尺寸，限制最大尺寸，保持宽高比
        const maxDisplayHeight = 400;
        const maxDisplayWidth = 500;

        // 获取容器宽度
        const container = this.originalCanvas.parentElement;
        const containerWidth = container ? container.clientWidth - 20 : maxDisplayWidth;

        // 计算缩放比例，确保适配容器
        const scaleH = maxDisplayHeight / this.originalHeight;
        const scaleW = Math.min(maxDisplayWidth, containerWidth) / this.originalWidth;
        const scale = Math.min(1, scaleH, scaleW);

        const displayWidth = Math.round(this.originalWidth * scale);
        const displayHeight = Math.round(this.originalHeight * scale);

        // 设置画布的显示尺寸
        this.originalCanvas.style.width = displayWidth + 'px';
        this.originalCanvas.style.height = displayHeight + 'px';
    },

    resetInputs() {
        this.pixelSizeSlider.value = 16;
        this.pixelSizeValue.textContent = '16px';
        this.widthInput.value = Math.min(this.originalWidth, 512);
        this.heightInput.value = Math.round(Math.min(this.originalWidth, 512) * (this.originalHeight / this.originalWidth));
        this.keepRatioCheckbox.checked = true;
        this.showGridLines.checked = true;
        this.showCoordNumbers.checked = true;
        this.coordLineColor.value = '#000000';
        this.coordNumberColor.value = '#000000';
        this.showLargeGridLines.checked = false;
        this.largeGridLineColor.value = '#8B4513';
        this.largeGridSize.value = '5';
        this.largeGridLineWidth.value = '2';
        this.gridLineWidth.value = '1';
        this.colorCountSlider.value = 8;
        this.colorCountValue.textContent = '8';
        this.colorCountInput.value = 8;
        this.beadSizeSlider.value = 24;
        this.beadSizeValue.textContent = '24px';
        this.showPixelGrid.checked = true;
        this.pixelGridColor.value = '#000000';
        this.pixelGridOffsetX.value = 0;
        this.pixelGridOffsetY.value = 0;
        this.pixelGridOffsetXValue.textContent = '0px';
        this.pixelGridOffsetYValue.textContent = '0px';
        this.pixelGridOffsetX.max = 15; // 16-1
        this.pixelGridOffsetY.max = 15; // 16-1
        this.pixelGridLineWidth.value = '1';
        this.pixelGridLineWidthValue.textContent = '1px';

        this.lastPerlerSignature = null;
        this.unifiedSnapshots = [];

        // 重置导出计数器
        this.exportCounter = {
            pixelated: 0,
            perler: 0 
        };

        if (this.snapshotsContainer) {
            this.snapshotsContainer.innerHTML = '';
        }
        if (this.snapshotsList) {
            this.snapshotsList.style.display = 'none';
        }
    },

    updatePixelatedImage() {
        const targetWidth = parseInt(this.widthInput.value);
        const targetHeight = parseInt(this.heightInput.value);

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;

        // 禁用平滑插值，使用最近邻，避免颜色模糊扩散
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.mozImageSmoothingEnabled = false;
        tempCtx.webkitImageSmoothingEnabled = false;
        tempCtx.msImageSmoothingEnabled = false;

        tempCtx.drawImage(this.originalImage, 0, 0, targetWidth, targetHeight);

        const imageData = this._safeGetImageData(tempCtx, targetWidth, targetHeight);
        if (!imageData) return;   // 画布被污染，无法像素化（见 _safeGetImageData 注释）
        const pixelSize = parseInt(this.pixelSizeSlider.value);
        const method = this.pixelMethod.value;
        const offsetX = parseInt(this.pixelGridOffsetX.value);
        const offsetY = parseInt(this.pixelGridOffsetY.value);

        // 使用 Pixelator 处理像素化、对比度、锐化
        const pixelatorResult = this.pixelator.process(imageData, {
            blockSize: pixelSize,
            offsetX: offsetX,
            offsetY: offsetY,
            method: method,
            targetColorCount: parseInt(this.targetColorCountSlider.value),
            enableContrast: this.enableContrast.checked,
            contrastFactor: parseFloat(this.contrastSlider.value),
            enableSharpen: this.enableSharpen.checked,
            sharpenStrength: parseFloat(this.sharpenSlider.value)
        });

        let pixelatedData = pixelatorResult.imageData;
        this.pixelColorStats = pixelatorResult.colorStats;
        const totalColors = this.pixelColorStats.length;
        this.imageTotalColors.textContent = totalColors;

        this.colorCountSlider.max = Math.max(2, totalColors);
        this.colorCountInput.max = Math.max(2, totalColors);
        if (parseInt(this.colorCountSlider.value) > totalColors) {
            this.colorCountSlider.value = Math.max(2, totalColors);
            this.colorCountInput.value = this.colorCountSlider.value;
            this.colorCountValue.textContent = this.colorCountSlider.value;
        }

        if (this.enableColorQuantize.checked) {
            const colorCount = parseInt(this.colorCountSlider.value);
            // 使用层级替换策略
            pixelatedData = quantizeColors(pixelatedData, colorCount, this.excludedColors, 'layered');
        }

        this.pixelatedCanvas.width = targetWidth;
        this.pixelatedCanvas.height = targetHeight;
        this.pixelatedCtx.putImageData(pixelatedData, 0, 0);

        // 绘制像素划分线
        if (this.showPixelGrid.checked) {
            const pixelSize = parseInt(this.pixelSizeSlider.value);
            const offsetX = parseInt(this.pixelGridOffsetX.value);
            const offsetY = parseInt(this.pixelGridOffsetY.value);
            const lineWidth = parseFloat(this.pixelGridLineWidth.value);

            if (lineWidth > 0) {
                this.pixelatedCtx.strokeStyle = this.pixelGridColor.value;
                this.pixelatedCtx.lineWidth = lineWidth;
                this.pixelatedCtx.beginPath();

                // 绘制垂直线
                for (let x = offsetX; x < targetWidth; x += pixelSize) {
                    if (x > 0) { // 不画边界线
                        this.pixelatedCtx.moveTo(x - 0.5, 0);
                        this.pixelatedCtx.lineTo(x - 0.5, targetHeight);
                    }
                }

                // 绘制水平线
                for (let y = offsetY; y < targetHeight; y += pixelSize) {
                    if (y > 0) { // 不画边界线
                        this.pixelatedCtx.moveTo(0, y - 0.5);
                        this.pixelatedCtx.lineTo(targetWidth, y - 0.5);
                    }
                }

                this.pixelatedCtx.stroke();
            }
        }

        // 保存像素化结果，用于拼豆化
        this.pixelatedData = pixelatedData;

        this.pixelatedSize.textContent = `${getI18nText('pixelatedSize')}: ${targetWidth} × ${targetHeight} px`;
        // 计算格子数，向上取整
        const gridWidth = Math.ceil(targetWidth / pixelSize);
        const gridHeight = Math.ceil(targetHeight / pixelSize);
        this.pixelatedGridCount.textContent = `${getI18nText('gridRatio')}: ${gridWidth} × ${gridHeight}`;

        if (this.enableColorQuantize.checked) {
            this.updateColorUsageList();
        }

        this.pixelatedCanvasNaturalWidth = targetWidth;
        this.pixelatedCanvasNaturalHeight = targetHeight;

        const savedPixelatedZoom = parseInt(this.pixelatedZoomSlider.value);
        this.pixelatedCanvas.style.width = 'auto';
        this.pixelatedCanvas.style.height = 'auto';

        requestAnimationFrame(() => {
            this.pixelatedCanvasDisplayWidth = this.pixelatedCanvas.offsetWidth;
            this.pixelatedCanvasDisplayHeight = this.pixelatedCanvas.offsetHeight;

            if (savedPixelatedZoom !== 100) {
                const scale = savedPixelatedZoom / 100;
                this.pixelatedCanvas.style.width = (this.pixelatedCanvasDisplayWidth * scale) + 'px';
                this.pixelatedCanvas.style.height = (this.pixelatedCanvasDisplayHeight * scale) + 'px';
            }
        });

        this.pixelatedZoomSlider.value = savedPixelatedZoom;
        this.pixelatedZoomValue.textContent = savedPixelatedZoom + '%';

        this.showPerlerPlaceholder();
    },

    updatePixelGridColor() {
        if (!this.pixelatedData) {
            return;
        }

        const targetWidth = this.pixelatedCanvasNaturalWidth;
        const targetHeight = this.pixelatedCanvasNaturalHeight;
        const pixelSize = parseInt(this.pixelSizeSlider.value);
        const offsetX = parseInt(this.pixelGridOffsetX.value);
        const offsetY = parseInt(this.pixelGridOffsetY.value);

        // 先恢复原始像素化数据
        this.pixelatedCtx.putImageData(this.pixelatedData, 0, 0);

        // 如果不显示网格线，直接返回
        if (!this.showPixelGrid.checked) {
            return;
        }

        // 再绘制新颜色的网格线
        const lineWidth = parseFloat(this.pixelGridLineWidth.value);
        if (lineWidth > 0) {
            this.pixelatedCtx.strokeStyle = this.pixelGridColor.value;
            this.pixelatedCtx.lineWidth = lineWidth;
            this.pixelatedCtx.beginPath();

            // 绘制垂直线
            for (let x = offsetX; x < targetWidth; x += pixelSize) {
                if (x > 0) { // 不画边界线
                    this.pixelatedCtx.moveTo(x - 0.5, 0);
                    this.pixelatedCtx.lineTo(x - 0.5, targetHeight);
                }
            }

            // 绘制水平线
            for (let y = offsetY; y < targetHeight; y += pixelSize) {
                if (y > 0) { // 不画边界线
                    this.pixelatedCtx.moveTo(0, y - 0.5);
                    this.pixelatedCtx.lineTo(targetWidth, y - 0.5);
                }
            }

            this.pixelatedCtx.stroke();
        }
    },

    resetPerlerZoom() {
        this.perlerZoomSlider.value = 100;
        this.perlerZoomValue.textContent = '100%';
        // 1:1原生尺寸显示
        this.perlerCanvas.style.width = this.perlerCanvasNaturalWidth + 'px';
        this.perlerCanvas.style.height = this.perlerCanvasNaturalHeight + 'px';
        this.perlerCanvasDisplayWidth = this.perlerCanvasNaturalWidth;
        this.perlerCanvasDisplayHeight = this.perlerCanvasNaturalHeight;
    },

    drawRingBead(ctx, px, py, cellSize, color, chartStyle, fontSize) {
        ctx.save();
        const ringWidth = Math.max(2, Math.floor(cellSize * 0.3));
        const centerX = px + cellSize / 2;
        const centerY = py + cellSize / 2;
        const outerRadius = cellSize / 2 - 1;
        const innerRadius = outerRadius - ringWidth;

        if (chartStyle === 'color') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
            ctx.fill();
        } else if (chartStyle === 'color-with-code') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = getContrastTextColor(color.rgb);
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(color.name, centerX, centerY);
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#333';
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillText(color.name, centerX, centerY);
        }

        ctx.restore();
    },

    drawRoundSquareBead(ctx, px, py, cellSize, color, chartStyle, fontSize) {
        ctx.save();
        const cornerRadius = Math.min(8, Math.floor(cellSize * 0.2));
        const actualSize = cellSize - 1;
        const centerX = px + cellSize / 2;
        const centerY = py + cellSize / 2;

        // 开始绘制圆角正方形
        ctx.beginPath();
        ctx.moveTo(px + cornerRadius, py);
        ctx.lineTo(px + actualSize - cornerRadius, py);
        ctx.quadraticCurveTo(px + actualSize, py, px + actualSize, py + cornerRadius);
        ctx.lineTo(px + actualSize, py + actualSize - cornerRadius);
        ctx.quadraticCurveTo(px + actualSize, py + actualSize, px + actualSize - cornerRadius, py + actualSize);
        ctx.lineTo(px + cornerRadius, py + actualSize);
        ctx.quadraticCurveTo(px, py + actualSize, px, py + actualSize - cornerRadius);
        ctx.lineTo(px, py + cornerRadius);
        ctx.quadraticCurveTo(px, py, px + cornerRadius, py);
        ctx.closePath();

        if (chartStyle === 'color') {
            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
            ctx.fill();
        } else if (chartStyle === 'color-with-code') {
            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
            ctx.fill();
            ctx.fillStyle = getContrastTextColor(color.rgb);
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(color.name, centerX, centerY);
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#333';
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillText(color.name, centerX, centerY);
        }

        ctx.restore();
    },

    calculateColorStats(imageData) {
        const data = imageData.data;
        const colorMap = new Map();
        const totalPixels = imageData.width * imageData.height;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const key = `${r},${g},${b}`;

            if (!colorMap.has(key)) {
                colorMap.set(key, { r, g, b, count: 0 });
            }
            colorMap.get(key).count++;
        }

        return Array.from(colorMap.values()).map(color => ({
            ...color,
            percentage: ((color.count / totalPixels) * 100).toFixed(2)
        }));
    },
};

if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, PixelArtMixin);
}
if (typeof window !== 'undefined') {
    window.PixelArtMixin = PixelArtMixin;
}
