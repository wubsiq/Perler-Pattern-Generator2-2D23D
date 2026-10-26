/**
 * FileIOMixin — 清空/下载图片/InfoPaper导入导出/图纸下载-11方法
 * 来源: app.js L3483-L4090
 */

const FileIOMixin = {
    clear() {
        // 直接刷新页面，模拟用户按F5的效果，确保完全清空
        location.reload();
    },

    reset() {
        this.resetInputs();
        this.drawOriginalImage();
        this.excludedColors.clear();
        this.updatePixelatedImage();
        this.showAllInitialSections();
        if (this.workspace) {
            this.workspace.style.display = 'none';
        }
        this.showPerlerPlaceholder();

        this.perlerContent.style.flexDirection = 'column';
        this.perlerContent.style.gap = '0px';
        const colorLegendArea = document.getElementById('colorLegendArea');
        if (colorLegendArea) {
            colorLegendArea.innerHTML = '';
            colorLegendArea.classList.remove('horizontal');
        }
    },

    downloadImage() {
        this.exportCounter.pixelated++;

        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;

        let fileName = `pixelated-image_${dateStr}`;
        if (this.exportCounter.pixelated > 1) {
            fileName += `(${this.exportCounter.pixelated})`;
        }

        // 添加处理信息到文件名
        const pixelSize = this.pixelSizeSlider.value;
        const method = this.pixelMethod.value;
        const methodMap = {
            'average': 'avg',
            'majority': 'major',
            'pixel-art': 'pixel-art',
            'quantized': 'quant'
        };
        const methodName = methodMap[method] || method;

        fileName += `_${methodName}_px${pixelSize}`;

        if (this.enableContrast.checked) {
            const contrast = parseFloat(this.contrastSlider.value).toFixed(1);
            fileName += `_c${contrast}`;
        }
        if (this.enableSharpen.checked) {
            const sharpen = parseFloat(this.sharpenSlider.value).toFixed(1);
            fileName += `_s${sharpen}`;
        }
        if (this.enableColorQuantize.checked) {
            const colorCount = this.colorCountSlider.value;
            fileName += `_q${colorCount}`;
        }

        fileName += '.png';

        // 创建一个临时画布来下载包含所有元素的图片（所见即所得）
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.pixelatedCanvas.width;
        tempCanvas.height = this.pixelatedCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // 复制当前画布的所有内容（包括像素线）
        tempCtx.drawImage(this.pixelatedCanvas, 0, 0);

        const link = document.createElement('a');
        link.download = fileName;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    },

    exportPixelImage() {
        if (!this.customEditData) {
            alert(getI18nText('alertNoEditableImage'));
            return;
        }

        const useTransparent = this.exportTransparentBackground.checked;
        const beadSize = parseInt(this.beadSizeSlider.value);

        let displayLeft = 0, displayRight = this.perlerWidth;
        let displayTop = 0, displayBottom = this.perlerHeight;
        if (this.canvasBounds) {
            displayLeft = this.canvasBounds.left;
            displayRight = this.canvasBounds.right;
            displayTop = this.canvasBounds.top;
            displayBottom = this.canvasBounds.bottom;
        }

        const exportWidth = (displayRight - displayLeft) * beadSize;
        const exportHeight = (displayBottom - displayTop) * beadSize;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = exportWidth;
        tempCanvas.height = exportHeight;
        const tempCtx = tempCanvas.getContext('2d');

        if (!useTransparent) {
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, exportWidth, exportHeight);
        }

        // 绘制色块（不带编号）
        for (let y = displayTop; y < displayBottom; y++) {
            for (let x = displayLeft; x < displayRight; x++) {
                const color = this.customEditData[y][x];
                const px = (x - displayLeft) * beadSize;
                const py = (y - displayTop) * beadSize;

                if (!color.isTransparent) {
                    tempCtx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                    tempCtx.fillRect(px, py, beadSize, beadSize);
                }
            }
        }

        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;

        this.exportCounter.perler++;

        let fileName = `custom-pixel-image_${dateStr}`;
        if (this.exportCounter.perler > 1) {
            fileName += `(${this.exportCounter.perler})`;
        }
        if (useTransparent) {
            fileName += '_transparent';
        }
        fileName += '.png';

        const link = document.createElement('a');
        link.download = fileName;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    },

    async exportInfoPaperCompressed() {
        if (!this.perlerColors || this.perlerColors.length === 0) {
            alert(getI18nText('alertNoPerlerGenerated'));
            return;
        }

        const colorSetName = this.colorSetSelect.value;
        await this.infoPaperManager.exportCompressedToClipboard(
            this.perlerColors,
            colorSetName,
            this.perlerWidth,
            this.perlerHeight
        );
    },

    async exportInfoPaperCompressedFile() {
        if (!this.perlerColors || this.perlerColors.length === 0) {
            alert(getI18nText('alertNoPerlerGenerated'));
            return;
        }

        const colorSetName = this.colorSetSelect.value;
        await this.infoPaperManager.exportCompressedToFile(
            this.perlerColors,
            colorSetName,
            this.perlerWidth,
            this.perlerHeight
        );
    },

    importInfoPaper() {
        this.infoPaperManager.showImportDialog(
            (result) => {
                this.infoPaperManager.showModeSelectDialog(
                    result,
                    (editResult) => {
                        this.handleInfoPaperEditMode(editResult);
                    },
                    (focusResult) => {
                        this.handleInfoPaperFocusMode(focusResult);
                    },
                    () => {
                        console.log('用户取消了模式选择');
                    }
                );
            },
            () => {
                console.log('用户取消了导入');
            }
        );
    },

    handleInfoPaperEditMode(result) {
        this.perlerColors = result.perlerColors;
        this.perlerWidth = result.width;
        this.perlerHeight = result.height;
        this.colorCounts = result.colorCounts;

        const colorSetName = result.colorSet;
        this.colorSetSelect.value = colorSetName;

        this.hideAllInitialSections();
        if (this.workspace) {
            this.workspace.style.display = 'block';
        }
        this.drawPerlerChart(this.perlerColors, this.perlerWidth, this.perlerHeight, colorSetName);
        this.drawColorLegend();
        this.perlerSize.textContent = `${getI18nText('perlerSize')}: ${this.perlerWidth} × ${this.perlerHeight} ${getI18nText('beans')}`;
        this.initCustomEditData();

        alert(getI18nText('alertLoadedToEditMode'));
    },

    handleInfoPaperFocusMode(result) {
        this.hideAllInitialSections();
        if (this.workspace) {
            this.workspace.style.display = 'none';
        }
        const container = document.createElement('div');
        container.id = 'focus-mode-container';
        document.body.appendChild(container);

        this.focusModeRenderer.init(
            '#focus-mode-container',
            result.perlerColors,
            result.width,
            result.height,
            result.colorSet,
            () => {
                if (this.workspace) {
                    this.workspace.style.display = 'block';
                }
                document.body.removeChild(container);
            }
        );
    },

    _generateRandomSuffix() {
        return Math.floor(1000 + Math.random() * 9000);
    },

    downloadPerlerChart() {
        const format = this.exportFormatSelect.value;

        if (format === 'svg') {
            // SVG 导出
            const perlerWidth = this.perlerWidth;
            const perlerHeight = this.perlerHeight;
            const cellSize = parseInt(this.exportBeadSizeSlider.value);
            const colorSetName = this.colorSetSelect.value;

            const svgString = this.perlerGenerator.generatePerlerChartSVG(
                this.perlerColors,
                perlerWidth,
                perlerHeight,
                cellSize,
                colorSetName,
                {
                    chartStyle: this.chartStyle.value,
                    beadShape: this.beadShape.value,
                    showGrid: this.showGridLines.checked,
                    showCoords: this.showCoordNumbers.checked,
                    coordLineColor: this.coordLineColor.value,
                    coordNumberColor: this.coordNumberColor.value,
                    showLargeGrid: this.showLargeGridLines.checked,
                    largeGridColor: this.largeGridLineColor.value,
                    largeGridSize: parseInt(this.largeGridSize.value),
                    largeGridLineWidth: parseInt(this.largeGridLineWidth.value),
                    gridLineWidth: parseInt(this.gridLineWidth.value),
                    watermarkText: this.watermarkText.value,
                    colorCounts: this.colorCounts,
                    legendPosition: this.legendPosition.value
                }
            );

            // 导出 SVG
            this.exportCounter.perler++;
            const chartStyle = this.chartStyle.value;
            const beadShape = this.beadShape.value;
            const i18nFileName = i18n[getCurrentLang()].fileName;
            const randomSuffix = this._generateRandomSuffix();
            let fileName = `${randomSuffix}_${i18nFileName.perlerChart}_${colorSetName}_${perlerWidth}x${perlerHeight}`;

            if (this.exportCounter.perler > 1) fileName += `_(${this.exportCounter.perler})`;
            if (chartStyle === 'bw') fileName += `_${i18nFileName.bw}`;
            if (chartStyle === 'color-with-code') fileName += `_${i18nFileName.withCode}`;
            if (beadShape === 'circle') fileName += `_${i18nFileName.circle}`;
            if (beadShape === 'ring') fileName += `_${i18nFileName.ring}`;
            if (beadShape === 'round-square') fileName += `_${i18nFileName['round-square']}`;

            fileName += '.svg';

            const blob = new Blob([svgString], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = fileName;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            return;
        }

        // PNG 导出（原来的逻辑）
        // 使用当前实际的拼豆图纸尺寸，而不是根据输入重新计算
        const perlerWidth = this.perlerWidth;
        const perlerHeight = this.perlerHeight;

        const cellSize = parseInt(this.exportBeadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
        const footerSize = 25;

        // 动态计算摘要字号（与 Canvas 导出保持一致）
        const chartContentWidth = perlerWidth * cellSize;
        const targetSummaryWidth = chartContentWidth * 0.45;
        const tempCtx = document.createElement('canvas').getContext('2d');
        const totalBeans = Object.values(this.colorCounts).reduce((a, b) => a + b, 0);
        const colorCount = Object.keys(this.colorCounts).length;
        const summaryText = `[${perlerWidth}x${perlerHeight}/${totalBeans}颗/${colorCount}色]`;
        let summaryFontSize = Math.max(12, Math.floor(targetSummaryWidth / summaryText.length * 1.6));
        tempCtx.font = `bold ${summaryFontSize}px sans-serif`;
        const measuredWidth = tempCtx.measureText(summaryText).width;
        if (measuredWidth > 0) {
            summaryFontSize = Math.max(12, Math.floor(summaryFontSize * targetSummaryWidth / measuredWidth));
        }
        const summaryMargin = summaryFontSize + 8;
        const colorNames = Object.keys(this.colorCounts).sort();
        const colorTypes = colorNames.length;

        const position = this.legendPosition.value;
        const chartWidth = coordSize * 2 + perlerWidth * cellSize;
        // 增加summaryMargin和coordSize/2的空间，确保摘要和下面的编号能够完全显示
        const chartHeight = summaryMargin + coordSize * 2 + perlerHeight * cellSize + coordSize / 2 + footerSize;
        const colorSetName = this.colorSetSelect.value;

        let canvasWidth, canvasHeight;

        // 如果选择隐藏，直接导出纯图纸
        if (position === 'hidden') {
            canvasWidth = chartWidth;
            canvasHeight = chartHeight;
        } else {
            const baseScale = summaryFontSize / 10;
            const colorCount = colorNames.length;

            // 根据图纸尺寸约束计算最大允许缩放比例
            let heightConstrainedScale, widthConstrainedScale;

            if (position === 'right') {
                // 右侧模式：图例宽度不超过图纸宽度的 50%
                const maxLegendWidth = chartWidth * 0.5;
                // 假设最多4列，计算单列可用宽度
                const maxColumnWidth = (maxLegendWidth - 40) / Math.min(4, Math.max(1, colorCount));
                widthConstrainedScale = maxColumnWidth / 210;
                // 图例高度不超过图纸高度
                const maxLegendHeight = chartHeight;
                const perRowHeight = (maxLegendHeight - 100) / Math.max(1, Math.ceil(colorCount / 1));
                heightConstrainedScale = perRowHeight / 52;
            } else {
                // 底部模式：图例高度不超过图纸高度的 40%
                const maxLegendHeight = chartHeight * 0.4;
                const perRowHeight = (maxLegendHeight - 80) / Math.max(1, colorCount);
                heightConstrainedScale = perRowHeight / 52;
                // 宽度约束：每行2-4列，确保色块足够大
                const desiredColumns = Math.min(4, Math.max(2, Math.floor(colorCount / 8)));
                const totalWidthAllowed = chartWidth - 20;
                const maxColumnWidthForDesiredCols = totalWidthAllowed / desiredColumns;
                widthConstrainedScale = maxColumnWidthForDesiredCols / 210;
            }

            // 图例标题字号：按图纸宽度的35%动态计算
            const legendTitleText = `${getI18nText('colorLegend')} (${colorTypes}${getI18nText('colorTypes')}, ${totalBeans}${getI18nText('beans')})`;
            const targetTitleWidth = chartWidth * 0.35;
            let legendTitleSize = Math.max(14, Math.floor(targetTitleWidth / legendTitleText.length * 1.6));
            tempCtx.font = `bold ${legendTitleSize}px sans-serif`;
            const titleMeasuredWidth = tempCtx.measureText(legendTitleText).width;
            if (titleMeasuredWidth > 0) {
                legendTitleSize = Math.max(14, Math.floor(legendTitleSize * targetTitleWidth / titleMeasuredWidth));
            }

            // 色块宽度 = 图纸宽度的10%，高度 = 宽度/3
            const rectWidthScaled = Math.max(60, Math.floor(chartWidth * 0.10));
            const rectHeightScaled = Math.max(20, Math.floor(rectWidthScaled / 3));
            // 每行最多10个色块，每个色块之间有间距
            const legendGap = Math.max(4, Math.floor(rectWidthScaled * 0.05));
            let columns = Math.min(10, Math.max(1, colorCount));
            const rowHeightScaled = Math.floor(rectHeightScaled * 1.8);
            const columnWidthScaled = rectWidthScaled + legendGap;
            // 色块内字体小于色块高度
            const colorNameSize = Math.max(8, Math.floor(rectHeightScaled * 0.65));
            const legendYOffset1 = legendTitleSize + 6;
            const legendStartY = legendTitleSize + 16;

            const itemsPerColumn = Math.ceil(colorCount / columns);
            const legendHeaderHeight = legendTitleSize + 20;

            // 再计算图例的整体尺寸
            const legendWidth = columns * columnWidthScaled + 20;
            const legendHeight = legendHeaderHeight + itemsPerColumn * rowHeightScaled;

            let legendX, legendY;
            const gap = 20;

            // 底部模式布局
            canvasWidth = Math.max(chartWidth, legendWidth);
            canvasHeight = chartHeight + legendHeight + gap;
            legendX = 0;
            legendY = chartHeight + gap / 2;

            const scale = parseFloat(this.exportScaleSlider.value);

            const finalWidth = canvasWidth * scale;
            const finalHeight = canvasHeight * scale;

            const MAX_CANVAS_SIZE = 32767;
            const MAX_CANVAS_AREA = 268435456;

            if (finalWidth > MAX_CANVAS_SIZE || finalHeight > MAX_CANVAS_SIZE) {
                alert(getI18nTextWithVars('alertExportSizeTooLarge', {max: MAX_CANVAS_SIZE, width: Math.round(finalWidth), height: Math.round(finalHeight)}));
                return;
            }

            if (finalWidth * finalHeight > MAX_CANVAS_AREA) {
                alert(getI18nTextWithVars('alertExportPixelsTooMany', {max: (MAX_CANVAS_AREA / 1000000).toFixed(1), current: ((finalWidth * finalHeight) / 1000000).toFixed(1)}));
                return;
            }

            const tempChartCanvas = document.createElement('canvas');
            const tempChartCtx = tempChartCanvas.getContext('2d');
            tempChartCanvas.width = chartWidth;
            tempChartCanvas.height = chartHeight;
            tempChartCtx.fillStyle = '#ffffff';
            tempChartCtx.fillRect(0, 0, chartWidth, chartHeight);

            this.drawPerlerChartToCanvas(
                tempChartCtx,
                this.perlerColors,
                perlerWidth,
                perlerHeight,
                cellSize,
                this.colorSetSelect.value
            );

            const downloadCanvas = document.createElement('canvas');
            const downloadCtx = downloadCanvas.getContext('2d');
            downloadCanvas.width = finalWidth;
            downloadCanvas.height = finalHeight;

            downloadCtx.scale(scale, scale);

            downloadCtx.fillStyle = '#ffffff';
            downloadCtx.fillRect(0, 0, canvasWidth, canvasHeight);

            downloadCtx.drawImage(tempChartCanvas, 0, 0);

            downloadCtx.font = `bold ${legendTitleSize}px sans-serif`;
            downloadCtx.fillStyle = '#667eea';
            downloadCtx.textAlign = 'left';
            downloadCtx.fillText(`${getI18nText('colorLegend')} (${colorTypes}${getI18nText('colorTypes')}, ${totalBeans}${getI18nText('beans')})`, legendX + legendGap, legendY + legendYOffset1);

            const colorSetName = this.colorSetSelect.value;
            const colorSet = colorSets[colorSetName];

            let col = 0, row = 0;

            for (let idx = 0; idx < colorNames.length; idx++) {
                const name = colorNames[idx];
                col = idx % columns;
                row = Math.floor(idx / columns);

                const count = this.colorCounts[name];
                const color = colorSet.find(c => c.name === name);

                const x = legendX + legendGap + col * columnWidthScaled;
                const y = legendY + legendStartY + row * rowHeightScaled;

                if (color) {
                    downloadCtx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                    downloadCtx.fillRect(x, y, rectWidthScaled, rectHeightScaled);
                    downloadCtx.strokeStyle = '#999';
                    downloadCtx.strokeRect(x, y, rectWidthScaled, rectHeightScaled);

                    downloadCtx.fillStyle = getContrastTextColor(color.rgb);
                    downloadCtx.font = `bold ${colorNameSize}px sans-serif`;
                    downloadCtx.textAlign = 'center';
                    downloadCtx.textBaseline = 'middle';
                    downloadCtx.fillText(`${name} x ${count}`, x + rectWidthScaled / 2, y + rectHeightScaled / 2);
                    downloadCtx.textAlign = 'left';
                    downloadCtx.textBaseline = 'alphabetic';
                }
            }

            const link = document.createElement('a');

            // 增加导出计数器
            this.exportCounter.perler++;

            const chartStyle = this.chartStyle.value;
            const beadShape = this.beadShape.value;

            const i18nFileName = i18n[getCurrentLang()].fileName;
            const randomSuffix = this._generateRandomSuffix();
            let fileName = `${randomSuffix}_${i18nFileName.perlerChart}_${colorSetName}_${perlerWidth}x${perlerHeight}`;

            // 添加导出编号
            if (this.exportCounter.perler > 1) {
                fileName += `_(${this.exportCounter.perler})`;
            }

            if (chartStyle === 'bw') fileName += `_${i18nFileName.bw}`;
            if (chartStyle === 'color-with-code') fileName += `_${i18nFileName.withCode}`;
            if (beadShape === 'circle') fileName += `_${i18nFileName.circle}`;
            if (beadShape === 'ring') fileName += `_${i18nFileName.ring}`;
            if (beadShape === 'round-square') fileName += `_${i18nFileName['round-square']}`;
            if (position === 'right') fileName += `_${i18nFileName.legendRight}`;
            if (scale !== 1) fileName += `_${scale}x`;

            fileName += '.png';

            link.download = fileName;
            link.href = downloadCanvas.toDataURL('image/png');
            link.click();
            return;
        }

        // 隐藏模式 - 只导出图纸
        const scale = parseFloat(this.exportScaleSlider.value);

        const finalWidth = canvasWidth * scale;
        const finalHeight = canvasHeight * scale;

        const MAX_CANVAS_SIZE = 32767;
        const MAX_CANVAS_AREA = 268435456;

        if (finalWidth > MAX_CANVAS_SIZE || finalHeight > MAX_CANVAS_SIZE) {
            alert(getI18nTextWithVars('alertExportSizeTooLarge', {max: MAX_CANVAS_SIZE, width: Math.round(finalWidth), height: Math.round(finalHeight)}));
            return;
        }

        if (finalWidth * finalHeight > MAX_CANVAS_AREA) {
            alert(getI18nTextWithVars('alertExportPixelsTooMany', {max: (MAX_CANVAS_AREA / 1000000).toFixed(1), current: ((finalWidth * finalHeight) / 1000000).toFixed(1)}));
            return;
        }

        const tempChartCanvas = document.createElement('canvas');
        const tempChartCtx = tempChartCanvas.getContext('2d');
        tempChartCanvas.width = chartWidth;
        tempChartCanvas.height = chartHeight;
        tempChartCtx.fillStyle = '#ffffff';
        tempChartCtx.fillRect(0, 0, chartWidth, chartHeight);

        this.drawPerlerChartToCanvas(
            tempChartCtx,
            this.perlerColors,
            perlerWidth,
            perlerHeight,
            cellSize,
            this.colorSetSelect.value
        );

        const downloadCanvas = document.createElement('canvas');
        const downloadCtx = downloadCanvas.getContext('2d');
        downloadCanvas.width = finalWidth;
        downloadCanvas.height = finalHeight;

        downloadCtx.scale(scale, scale);

        downloadCtx.fillStyle = '#ffffff';
        downloadCtx.fillRect(0, 0, canvasWidth, canvasHeight);

        downloadCtx.drawImage(tempChartCanvas, 0, 0);

        const link = document.createElement('a');

        // 增加导出计数器
        this.exportCounter.perler++;

        const chartStyle = this.chartStyle.value;
        const beadShape = this.beadShape.value;

        const i18nFileName = i18n[getCurrentLang()].fileName;
        const randomSuffix = this._generateRandomSuffix();
        let fileName = `${randomSuffix}_${i18nFileName.perlerChart}_${colorSetName}_${perlerWidth}x${perlerHeight}`;

        // 添加导出编号
        if (this.exportCounter.perler > 1) {
            fileName += `_(${this.exportCounter.perler})`;
        }

        if (chartStyle === 'bw') fileName += `_${i18nFileName.bw}`;
        if (chartStyle === 'color-with-code') fileName += `_${i18nFileName.withCode}`;
        if (beadShape === 'circle') fileName += `_${i18nFileName.circle}`;
        if (beadShape === 'ring') fileName += `_${i18nFileName.ring}`;
        if (position === 'right') fileName += `_${i18nFileName.legendRight}`;
        if (scale !== 1) fileName += `_${scale}x`;

        fileName += '.png';

        link.download = fileName;
        link.href = downloadCanvas.toDataURL('image/png');
        link.click();
    },
};

if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, FileIOMixin);
}
if (typeof window !== 'undefined') {
    window.FileIOMixin = FileIOMixin;
}
