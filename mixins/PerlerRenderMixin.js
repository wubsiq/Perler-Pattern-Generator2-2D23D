/**
 * PerlerRenderMixin — 拼豆图纸渲染+颜色图例-13方法
 * 来源: app.js L2280-L3482
 */

const PerlerRenderMixin = {
    updateColorUsageList() {
        if (!this.pixelColorStats.length) {
            this.colorUsageList.innerHTML = '<p style="color: #555; text-align: center; padding: 20px;">' + getI18nText('noColorData') + '</p>';
            return;
        }

        let sortedColors = [...this.pixelColorStats];

        switch (this.currentSort) {
            case 'count-desc':
                sortedColors.sort((a, b) => b.count - a.count);
                break;
            case 'count-asc':
                sortedColors.sort((a, b) => a.count - b.count);
                break;
            case 'hue':
                sortedColors.sort((a, b) => {
                    const hslA = rgbToHsl(a.r, a.g, a.b);
                    const hslB = rgbToHsl(b.r, b.g, b.b);
                    return hslA[0] - hslB[0];
                });
                break;
        }

        const html = sortedColors.map((color, index) => {
            const colorKey = `${color.r},${color.g},${color.b}`;
            const isExcluded = this.excludedColors.has(colorKey);
            return `
                <div class="color-usage-item ${isExcluded ? 'excluded' : ''}" data-color="${colorKey}">
                    <div class="color-swatch" style="background-color: rgb(${color.r}, ${color.g}, ${color.b});"></div>
                    <div class="color-info">
                        <div>
                            <span class="color-count">${color.count}</span>
                            <span class="color-percentage">(${color.percentage}%)</span>
                        </div>
                        <div class="color-rgb">RGB(${color.r}, ${color.g}, ${color.b})</div>
                    </div>
                    <button class="color-action-btn remove" data-color="${colorKey}" data-i18n="remove">
                        ${isExcluded ? getI18nText('restoreColor') : getI18nText('excludeColor')}
                    </button>
                </div>
            `;
        }).join('');

        this.colorUsageList.innerHTML = html;

        this.colorUsageList.querySelectorAll('.color-action-btn.remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const colorKey = btn.dataset.color;
                if (this.excludedColors.has(colorKey)) {
                    this.excludedColors.delete(colorKey);
                } else {
                    this.excludedColors.add(colorKey);
                }
                this.updatePixelatedImage();
            });
        });
    },

    showPerlerPlaceholder() {
        this.perlerCtx.clearRect(0, 0, this.perlerCanvas.width, this.perlerCanvas.height);
        this.perlerCtx.fillStyle = '#f0f0f0';
        this.perlerCtx.fillRect(0, 0, this.perlerCanvas.width, this.perlerCanvas.height);
        this.perlerCtx.fillStyle = '#666';
        this.perlerCtx.font = '14px sans-serif';
        this.perlerCtx.textAlign = 'center';
        this.perlerCtx.fillText(getI18nText('clickToRenderPerler'), this.perlerCanvas.width / 2, this.perlerCanvas.height / 2);
        this.perlerSize.textContent = getI18nText('perlerWaitingRender');
    },

    refreshPerlerChartDisplay() {
        if (!this.perlerColors || !this.perlerColors.length) return;
        this.drawPerlerChartSync(this.perlerColors, this.perlerWidth, this.perlerHeight, this.colorSetSelect.value);
    },

    debouncedRefreshPerlerChart() {
        if (this.transparentColorDebounceTimer) {
            clearTimeout(this.transparentColorDebounceTimer);
        }
        this.transparentColorDebounceTimer = setTimeout(() => {
            this.refreshPerlerChartDisplay();
        }, 150);
    },

    updatePerlerChart() {
        const targetWidth = parseInt(this.widthInput.value);
        const targetHeight = parseInt(this.heightInput.value);
        const pixelSize = parseInt(this.pixelSizeSlider.value);

        const colorSetName = this.colorSetSelect.value;
        const mappingMethod = this.colorMappingMethod.value;

        // 使用 PerlerGenerator 处理
        const extracted = this.perlerGenerator.extractFromImageData(
            this.pixelatedData,
            targetWidth,
            targetHeight,
            pixelSize,
            parseInt(this.pixelGridOffsetX.value),
            parseInt(this.pixelGridOffsetY.value)
        );

        const perlerResult = this.perlerGenerator.generateFromProcessedData(
            extracted.processedData,
            extracted.perlerWidth,
            extracted.perlerHeight,
            {
                colorSet: colorSetName,
                mappingMethod: mappingMethod,
                enableNeighborSmooth: this.enableNeighborSmooth.checked,
                cie2000OptimizedParams: this.cie2000OptimizedParams
            }
        );

        this.perlerColors = perlerResult.perlerColors;
        this.colorCounts = perlerResult.colorCounts;

        this.hideShowcase();
        this.drawPerlerChart(this.perlerColors, perlerResult.perlerWidth, perlerResult.perlerHeight, colorSetName);
        this.perlerSize.textContent = `${getI18nText('perlerSize')}: ${perlerResult.perlerWidth} × ${perlerResult.perlerHeight} ${getI18nText('beans')}`;
        this.initCustomEditData();
    },

    drawPerlerChart(perlerColors, perlerWidth, perlerHeight, colorSetName) {
        const cellSize = parseInt(this.beadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
        const footerSize = 25;

        const newCanvasWidth = coordSize * 2 + perlerWidth * cellSize;
        const newCanvasHeight = coordSize * 2 + perlerHeight * cellSize + footerSize;

        const savedPerlerZoom = parseInt(this.perlerZoomSlider.value);
        const oldNaturalWidth = this.perlerCanvasNaturalWidth || newCanvasWidth;

        this.perlerCanvas.width = newCanvasWidth;
        this.perlerCanvas.height = newCanvasHeight;
        this.perlerCanvasNaturalWidth = newCanvasWidth;
        this.perlerCanvasNaturalHeight = newCanvasHeight;

        if (savedPerlerZoom === 100 || !oldNaturalWidth || oldNaturalWidth === 0) {
            this.perlerCanvas.style.width = newCanvasWidth + 'px';
            this.perlerCanvas.style.height = newCanvasHeight + 'px';
            this.perlerCanvasDisplayWidth = newCanvasWidth;
            this.perlerCanvasDisplayHeight = newCanvasHeight;
        } else {
            const scale = savedPerlerZoom / 100;
            this.perlerCanvas.style.width = (newCanvasWidth * scale) + 'px';
            this.perlerCanvas.style.height = (newCanvasHeight * scale) + 'px';
            this.perlerCanvasDisplayWidth = newCanvasWidth;
            this.perlerCanvasDisplayHeight = newCanvasHeight;
        }
        this.perlerZoomSlider.value = savedPerlerZoom;
        this.perlerZoomValue.textContent = savedPerlerZoom + '%';

        const ctx = this.perlerCtx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.perlerCanvas.width, this.perlerCanvas.height);

        this.drawPerlerChartAsync(perlerColors, perlerWidth, perlerHeight, colorSetName);
    },

    updatePerlerSummary(perlerWidth, perlerHeight, colorSetName) {
        const totalBeads = Object.values(this.colorCounts).reduce((a, b) => a + b, 0);
        const colorCount = Object.keys(this.colorCounts).length;
        const summaryText = `[${perlerWidth}x${perlerHeight}/${totalBeads}颗/${colorCount}色]`;
        const perlerSummaryElement = document.getElementById('perlerSummary');
        if (perlerSummaryElement) {
            perlerSummaryElement.textContent = summaryText;
        }

        // 更新水印
        const perlerWatermarkElement = document.getElementById('perlerWatermark');
        if (perlerWatermarkElement) {
            perlerWatermarkElement.textContent = this.watermarkText.value;
        }
    },

    drawPerlerChartToCanvas(ctx, perlerColors, perlerWidth, perlerHeight, cellSize, colorSetName) {
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
        const footerSize = 25;

        // 提前计算摘要信息，用于确定顶部空间
        const totalBeads = Object.values(this.colorCounts).reduce((a, b) => a + b, 0);
        const colorCount = Object.keys(this.colorCounts).length;
        const summaryText = `[${perlerWidth}x${perlerHeight}/${totalBeads}颗/${colorCount}色]`;

        // 动态计算字号：摘要文字占图纸内容宽度的45%
        const chartContentWidth = perlerWidth * cellSize;
        const targetSummaryWidth = chartContentWidth * 0.45;
        let summaryFontSize = Math.max(12, Math.floor(targetSummaryWidth / summaryText.length * 1.6));
        ctx.font = `bold ${summaryFontSize}px sans-serif`;
        const measuredWidth = ctx.measureText(summaryText).width;
        if (measuredWidth > 0) {
            summaryFontSize = Math.max(12, Math.floor(summaryFontSize * targetSummaryWidth / measuredWidth));
        }
        const summaryMargin = summaryFontSize + 8;

        const chartStyle = this.chartStyle.value;
        const beadShape = this.beadShape.value;
        const showGrid = this.showGridLines.checked;
        const showCoords = this.showCoordNumbers.checked;
        const coordColor = this.coordLineColor.value;
        const coordNumColor = this.coordNumberColor.value;
        const transparentColor = (this.transparentCellColor && this.transparentCellColor.value) || '#ffffff';

        const canvasWidth = coordSize * 2 + perlerWidth * cellSize;
        // 增加coordSize/2的空间，确保下面的编号和大格子线能够完全显示
        const canvasHeight = summaryMargin + coordSize * 2 + perlerHeight * cellSize + coordSize / 2 + footerSize;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const drawFooter = () => {
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#555';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const footerY = summaryMargin + coordSize * 2 + perlerHeight * cellSize + footerSize / 2;
            ctx.fillText(this.watermarkText.value, canvasWidth / 2, footerY);
        };

        const fontSizeCoord = Math.max(9, Math.floor(cellSize * 0.45));
        ctx.font = `${fontSizeCoord}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (showCoords) {
            ctx.fillStyle = coordNumColor;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;

            // 上面编号
            for (let x = 0; x < perlerWidth; x++) {
                const boxX = coordSize + x * cellSize;
                const boxY = summaryMargin + coordSize - cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(x + 1, coordSize + x * cellSize + cellSize / 2, summaryMargin + coordSize / 2);
            }

            // 左边编号
            for (let y = 0; y < perlerHeight; y++) {
                const boxX = coordSize - cellSize;
                const boxY = summaryMargin + coordSize + y * cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(y + 1, coordSize / 2, summaryMargin + coordSize + y * cellSize + cellSize / 2);
            }

            // 右边编号
            const rightCoordX = coordSize + perlerWidth * cellSize + coordSize / 2;
            for (let y = 0; y < perlerHeight; y++) {
                const boxX = coordSize + perlerWidth * cellSize;
                const boxY = summaryMargin + coordSize + y * cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(y + 1, rightCoordX, summaryMargin + coordSize + y * cellSize + cellSize / 2);
            }

            // 下面编号
            const bottomCoordY = summaryMargin + coordSize + perlerHeight * cellSize + coordSize / 2;
            for (let x = 0; x < perlerWidth; x++) {
                const boxX = coordSize + x * cellSize;
                const boxY = summaryMargin + coordSize + perlerHeight * cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(x + 1, coordSize + x * cellSize + cellSize / 2, bottomCoordY);
            }
        }

        if (showGrid) {
            const lineWidth = parseFloat(this.gridLineWidth.value);
            if (lineWidth > 0) {
                ctx.strokeStyle = coordColor;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();

                for (let x = 0; x <= perlerWidth; x++) {
                    ctx.moveTo(coordSize + x * cellSize - 0.5, summaryMargin + coordSize);
                    ctx.lineTo(coordSize + x * cellSize - 0.5, summaryMargin + coordSize + perlerHeight * cellSize);
                }

                for (let y = 0; y <= perlerHeight; y++) {
                    ctx.moveTo(coordSize, summaryMargin + coordSize + y * cellSize - 0.5);
                    ctx.lineTo(coordSize + perlerWidth * cellSize, summaryMargin + coordSize + y * cellSize - 0.5);
                }

                ctx.stroke();
            }
        }

        // 绘制大格子线
        if (this.showLargeGridLines.checked) {
            const largeGridSize = parseInt(this.largeGridSize.value);
            if (largeGridSize > 0) {
                ctx.strokeStyle = this.largeGridLineColor.value;
                ctx.lineWidth = parseFloat(this.largeGridLineWidth.value); // 自定义粗度
                ctx.beginPath();

                // 绘制垂直大格子线
                for (let x = 0; x <= perlerWidth; x += largeGridSize) {
                    ctx.moveTo(coordSize + x * cellSize, summaryMargin + coordSize);
                    ctx.lineTo(coordSize + x * cellSize, summaryMargin + coordSize + perlerHeight * cellSize);
                }

                // 绘制水平大格子线
                for (let y = 0; y <= perlerHeight; y += largeGridSize) {
                    ctx.moveTo(coordSize, summaryMargin + coordSize + y * cellSize);
                    ctx.lineTo(coordSize + perlerWidth * cellSize, summaryMargin + coordSize + y * cellSize);
                }

                // 绘制最底部的水平大格子线（如果需要）
                if (largeGridSize <= perlerHeight) {
                    ctx.moveTo(coordSize, summaryMargin + coordSize + perlerHeight * cellSize);
                    ctx.lineTo(coordSize + perlerWidth * cellSize, summaryMargin + coordSize + perlerHeight * cellSize);
                }

                ctx.stroke();
            }
        }

        for (let y = 0; y < perlerHeight; y++) {
            for (let x = 0; x < perlerWidth; x++) {
                const color = perlerColors[y][x];
                const px = coordSize + x * cellSize;
                const py = summaryMargin + coordSize + y * cellSize;

                if (color.isTransparent) {
                    ctx.fillStyle = transparentColor;
                    if (beadShape === 'circle' || beadShape === 'ring') {
                        ctx.beginPath();
                        ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (beadShape === 'round-square') {
                        const cornerRadius = Math.min(8, Math.floor(cellSize * 0.2));
                        const actualSize = cellSize - 1;
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
                        ctx.fill();
                    } else {
                        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                    }
                    continue;
                }

                const nameLen = color.name.length;
                let fontSizeBase = Math.max(6, Math.floor(cellSize * 0.45));
                let fontSize = fontSizeBase;
                if (nameLen === 1) {
                    fontSize = Math.floor(fontSizeBase * 1.1);
                } else if (nameLen === 2) {
                    fontSize = fontSizeBase;
                } else if (nameLen === 3) {
                    fontSize = Math.floor(fontSizeBase * 0.85);
                } else {
                    fontSize = Math.floor(fontSizeBase * 0.7);
                }

                if (beadShape === 'circle') {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                    ctx.clip();

                    if (chartStyle === 'color') {
                        ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                        ctx.fillRect(px, py, cellSize, cellSize);
                    } else if (chartStyle === 'color-with-code') {
                        ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                        ctx.fillRect(px, py, cellSize, cellSize);
                        ctx.fillStyle = getContrastTextColor(color.rgb);
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                    } else {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(px, py, cellSize, cellSize);
                        ctx.strokeStyle = '#999';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.fillStyle = '#333';
                        ctx.font = `${fontSize}px sans-serif`;
                        ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                    }

                    ctx.restore();

                } else if (beadShape === 'ring') {
                    this.drawRingBead(ctx, px, py, cellSize, color, chartStyle, fontSize);
                } else if (beadShape === 'round-square') {
                    this.drawRoundSquareBead(ctx, px, py, cellSize, color, chartStyle, fontSize);
                } else {
                    if (chartStyle === 'color') {
                        ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                    } else if (chartStyle === 'color-with-code') {
                        ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                        ctx.fillStyle = getContrastTextColor(color.rgb);
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                    } else {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                        ctx.strokeStyle = '#999';
                        ctx.strokeRect(px, py, cellSize - 1, cellSize - 1);
                        ctx.fillStyle = '#333';
                        ctx.font = `${fontSize}px sans-serif`;
                        ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                    }
                }
            }
        }

        // 在导出的图像上绘制摘要（放在顶部预留空间）

        // 绘制水印（靠左），字号为摘要的70%
        const watermarkFontSize = Math.max(10, Math.floor(summaryFontSize * 0.7));
        ctx.font = `${watermarkFontSize}px sans-serif`;
        ctx.fillStyle = '#666'; // 黑灰色
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const summaryY = summaryMargin / 2; // 垂直居中放在顶部预留空间
        ctx.fillText(this.watermarkText.value, coordSize + 10, summaryY);

        // 绘制摘要（靠右）
        ctx.font = `bold ${summaryFontSize}px sans-serif`;
        ctx.fillStyle = '#333';
        ctx.textAlign = 'right';

        const summaryX = coordSize + perlerWidth * cellSize;
        ctx.fillText(summaryText, summaryX - 10, summaryY);

        // 不再绘制底部水印
        // drawFooter();
    },

    drawPerlerChartAsync(perlerColors, perlerWidth, perlerHeight, colorSetName) {
        this.updatePerlerSummary(perlerWidth, perlerHeight, colorSetName);
        const cellSize = parseInt(this.beadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
        const footerSize = 25;
        const chartStyle = this.chartStyle.value;
        const beadShape = this.beadShape.value;
        const showGrid = this.showGridLines.checked;
        const showCoords = this.showCoordNumbers.checked;
        const coordColor = this.coordLineColor.value;
        const coordNumColor = this.coordNumberColor.value;
        const transparentColor = (this.transparentCellColor && this.transparentCellColor.value) || '#ffffff';
        const ctx = this.perlerCtx;

        const fontSizeCoord = Math.max(9, Math.floor(cellSize * 0.45));
        ctx.font = `${fontSizeCoord}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (showCoords) {
            ctx.fillStyle = coordNumColor;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;

            // 上面编号
            for (let x = 0; x < perlerWidth; x++) {
                const boxX = coordSize + x * cellSize;
                const boxY = coordSize - cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(x + 1, coordSize + x * cellSize + cellSize / 2, coordSize / 2);
            }

            // 左边编号
            for (let y = 0; y < perlerHeight; y++) {
                const boxX = coordSize - cellSize;
                const boxY = coordSize + y * cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(y + 1, coordSize / 2, coordSize + y * cellSize + cellSize / 2);
            }

            // 右边编号
            const rightCoordX = coordSize + perlerWidth * cellSize + coordSize / 2;
            for (let y = 0; y < perlerHeight; y++) {
                const boxX = coordSize + perlerWidth * cellSize;
                const boxY = coordSize + y * cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(y + 1, rightCoordX, coordSize + y * cellSize + cellSize / 2);
            }

            // 下面编号
            const bottomCoordY = coordSize + perlerHeight * cellSize + coordSize / 2;
            for (let x = 0; x < perlerWidth; x++) {
                const boxX = coordSize + x * cellSize;
                const boxY = coordSize + perlerHeight * cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(x + 1, coordSize + x * cellSize + cellSize / 2, bottomCoordY);
            }
        }

        if (showGrid) {
            const lineWidth = parseFloat(this.gridLineWidth.value);
            if (lineWidth > 0) {
                ctx.strokeStyle = coordColor;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();

                for (let x = 0; x <= perlerWidth; x++) {
                    ctx.moveTo(coordSize + x * cellSize - 0.5, coordSize);
                    ctx.lineTo(coordSize + x * cellSize - 0.5, coordSize + perlerHeight * cellSize);
                }

                for (let y = 0; y <= perlerHeight; y++) {
                    ctx.moveTo(coordSize, coordSize + y * cellSize - 0.5);
                    ctx.lineTo(coordSize + perlerWidth * cellSize, coordSize + y * cellSize - 0.5);
                }

                ctx.stroke();
            }
        }

        // 绘制大格子线
        if (this.showLargeGridLines.checked) {
            const largeGridSize = parseInt(this.largeGridSize.value);
            if (largeGridSize > 0) {
                ctx.strokeStyle = this.largeGridLineColor.value;
                ctx.lineWidth = parseFloat(this.largeGridLineWidth.value); // 自定义粗度
                ctx.beginPath();

                // 绘制垂直大格子线
                for (let x = 0; x <= perlerWidth; x += largeGridSize) {
                    ctx.moveTo(coordSize + x * cellSize, coordSize);
                    ctx.lineTo(coordSize + x * cellSize, coordSize + perlerHeight * cellSize);
                }

                // 绘制水平大格子线
                for (let y = 0; y <= perlerHeight; y += largeGridSize) {
                    ctx.moveTo(coordSize, coordSize + y * cellSize);
                    ctx.lineTo(coordSize + perlerWidth * cellSize, coordSize + y * cellSize);
                }

                ctx.stroke();
            }
        }

        const blockSize = 10;
        const totalBlocksX = Math.ceil(perlerWidth / blockSize);
        const totalBlocksY = Math.ceil(perlerHeight / blockSize);
        let currentBlockX = 0;
        let currentBlockY = 0;

        this.drawColorLegend();

        const drawFooter = () => {
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#555';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const footerY = coordSize * 2 + perlerHeight * cellSize + footerSize / 2;
            ctx.fillText(this.watermarkText.value, this.perlerCanvas.width / 2, footerY);
        };

        const drawBlock = () => {
            const startX = currentBlockX * blockSize;
            const startY = currentBlockY * blockSize;
            const endX = Math.min(startX + blockSize, perlerWidth);
            const endY = Math.min(startY + blockSize, perlerHeight);

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const color = perlerColors[y][x];
                    const px = coordSize + x * cellSize;
                    const py = coordSize + y * cellSize;

                    if (color.isTransparent) {
                        ctx.fillStyle = transparentColor;
                        if (beadShape === 'circle' || beadShape === 'ring') {
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                            ctx.fill();
                        } else {
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                        }
                        continue;
                    }

                    const nameLen = color.name.length;
                    let fontSizeBase = Math.max(6, Math.floor(cellSize * 0.45));
                    let fontSize = fontSizeBase;
                    if (nameLen === 1) {
                        fontSize = Math.floor(fontSizeBase * 1.1);
                    } else if (nameLen === 2) {
                        fontSize = fontSizeBase;
                    } else if (nameLen === 3) {
                        fontSize = Math.floor(fontSizeBase * 0.85);
                    } else {
                        fontSize = Math.floor(fontSizeBase * 0.7);
                    }

                    if (beadShape === 'circle') {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                        ctx.clip();

                        if (chartStyle === 'color') {
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.fillRect(px, py, cellSize, cellSize);
                        } else if (chartStyle === 'color-with-code') {
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.fillRect(px, py, cellSize, cellSize);
                            ctx.fillStyle = getContrastTextColor(color.rgb);
                            ctx.font = `bold ${fontSize}px sans-serif`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        } else {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize, cellSize);
                            ctx.strokeStyle = '#999';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                            ctx.fillStyle = '#333';
                            ctx.font = `${fontSize}px sans-serif`;
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        }

                        ctx.restore();
                    } else if (beadShape === 'ring') {
                        ctx.save();
                        const ringWidth = Math.max(2, Math.floor(cellSize * 0.3));

                        if (chartStyle === 'color') {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = '#ffffff';
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1 - ringWidth, 0, Math.PI * 2);
                            ctx.fill();
                        } else if (chartStyle === 'color-with-code') {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = '#ffffff';
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1 - ringWidth, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = getContrastTextColor(color.rgb);
                            ctx.font = `bold ${fontSize}px sans-serif`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        } else {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.strokeStyle = '#999';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1 - ringWidth, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.fillStyle = '#333';
                            ctx.font = `${fontSize}px sans-serif`;
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        }

                        ctx.restore();
                    } else {
                        if (chartStyle === 'color') {
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                        } else if (chartStyle === 'color-with-code') {
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.fillStyle = getContrastTextColor(color.rgb);
                            ctx.font = `bold ${fontSize}px sans-serif`;
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        } else {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.strokeStyle = '#999';
                            ctx.strokeRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.fillStyle = '#333';
                            ctx.font = `${fontSize}px sans-serif`;
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        }
                    }
                }
            }

            currentBlockX++;
            if (currentBlockX >= totalBlocksX) {
                currentBlockX = 0;
                currentBlockY++;
            }

            if (currentBlockY < totalBlocksY) {
                requestAnimationFrame(drawBlock);
            } else {
                this.drawColorLegend();
                drawFooter();
            }
        };

        if (totalBlocksX * totalBlocksY > 1) {
            requestAnimationFrame(drawBlock);
        } else {
            for (let y = 0; y < perlerHeight; y++) {
                for (let x = 0; x < perlerWidth; x++) {
                    const color = perlerColors[y][x];
                    const px = coordSize + x * cellSize;
                    const py = coordSize + y * cellSize;

                    const nameLen = color.name.length;
                    let fontSizeBase = Math.max(6, Math.floor(cellSize * 0.45));
                    let fontSize = fontSizeBase;
                    if (nameLen === 1) {
                        fontSize = Math.floor(fontSizeBase * 1.1);
                    } else if (nameLen === 2) {
                        fontSize = fontSizeBase;
                    } else if (nameLen === 3) {
                        fontSize = Math.floor(fontSizeBase * 0.85);
                    } else {
                        fontSize = Math.floor(fontSizeBase * 0.7);
                    }

                    if (beadShape === 'circle') {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                        ctx.clip();

                        if (chartStyle === 'color') {
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.fillRect(px, py, cellSize, cellSize);
                        } else if (chartStyle === 'color-with-code') {
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.fillRect(px, py, cellSize, cellSize);
                            ctx.fillStyle = getContrastTextColor(color.rgb);
                            ctx.font = `bold ${fontSize}px sans-serif`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        } else {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize, cellSize);
                            ctx.strokeStyle = '#999';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                            ctx.fillStyle = '#333';
                            ctx.font = `${fontSize}px sans-serif`;
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        }

                        ctx.restore();
                    } else if (beadShape === 'ring') {
                        ctx.save();
                        const ringWidth = Math.max(2, Math.floor(cellSize * 0.3));

                        if (chartStyle === 'color') {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = '#ffffff';
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1 - ringWidth, 0, Math.PI * 2);
                            ctx.fill();
                        } else if (chartStyle === 'color-with-code') {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = '#ffffff';
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1 - ringWidth, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = getContrastTextColor(color.rgb);
                            ctx.font = `bold ${fontSize}px sans-serif`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        } else {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.strokeStyle = '#999';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1 - ringWidth, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.fillStyle = '#333';
                            ctx.font = `${fontSize}px sans-serif`;
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        }

                        ctx.restore();
                    } else {
                        if (chartStyle === 'color') {
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                        } else if (chartStyle === 'color-with-code') {
                            ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.fillStyle = getContrastTextColor(color.rgb);
                            ctx.font = `bold ${fontSize}px sans-serif`;
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        } else {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.strokeStyle = '#999';
                            ctx.strokeRect(px, py, cellSize - 1, cellSize - 1);
                            ctx.fillStyle = '#333';
                            ctx.font = `${fontSize}px sans-serif`;
                            ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                        }
                    }
                }
            }
        }
        this.drawColorLegend();
        // 不再绘制底部水印，改为在顶部显示
        // drawFooter();
    },

    drawPerlerChartSync(perlerColors, perlerWidth, perlerHeight, colorSetName) {
        this.updatePerlerSummary(perlerWidth, perlerHeight, colorSetName);
        const cellSize = parseInt(this.beadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
        const footerSize = 25;
        const chartStyle = this.chartStyle.value;
        const beadShape = this.beadShape.value;
        const showGrid = this.showGridLines.checked;
        const showCoords = this.showCoordNumbers.checked;
        const coordColor = this.coordLineColor.value;
        const coordNumColor = this.coordNumberColor.value;
        const transparentColor = (this.transparentCellColor && this.transparentCellColor.value) || '#ffffff';

        const newCanvasWidth = coordSize * 2 + perlerWidth * cellSize;
        const newCanvasHeight = coordSize * 2 + perlerHeight * cellSize + footerSize;

        const savedPerlerZoom = parseInt(this.perlerZoomSlider.value);
        const oldNaturalWidth = this.perlerCanvasNaturalWidth || newCanvasWidth;

        this.perlerCanvas.width = newCanvasWidth;
        this.perlerCanvas.height = newCanvasHeight;
        this.perlerCanvasNaturalWidth = newCanvasWidth;
        this.perlerCanvasNaturalHeight = newCanvasHeight;

        if (savedPerlerZoom === 100 || !oldNaturalWidth || oldNaturalWidth === 0) {
            this.perlerCanvas.style.width = newCanvasWidth + 'px';
            this.perlerCanvas.style.height = newCanvasHeight + 'px';
            this.perlerCanvasDisplayWidth = newCanvasWidth;
            this.perlerCanvasDisplayHeight = newCanvasHeight;
        } else {
            const scale = savedPerlerZoom / 100;
            this.perlerCanvas.style.width = (newCanvasWidth * scale) + 'px';
            this.perlerCanvas.style.height = (newCanvasHeight * scale) + 'px';
            this.perlerCanvasDisplayWidth = newCanvasWidth;
            this.perlerCanvasDisplayHeight = newCanvasHeight;
        }
        this.perlerZoomSlider.value = savedPerlerZoom;
        this.perlerZoomValue.textContent = savedPerlerZoom + '%';

        const ctx = this.perlerCtx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.perlerCanvas.width, this.perlerCanvas.height);

        const drawFooter = () => {
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#555';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const footerY = coordSize * 2 + perlerHeight * cellSize + footerSize / 2;
            ctx.fillText(this.watermarkText.value, this.perlerCanvas.width / 2, footerY);
        };

        const fontSizeCoord = Math.max(9, Math.floor(cellSize * 0.45));
        ctx.font = `${fontSizeCoord}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (showCoords) {
            ctx.fillStyle = coordNumColor;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;

            // 上面编号
            for (let x = 0; x < perlerWidth; x++) {
                const boxX = coordSize + x * cellSize;
                const boxY = coordSize - cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(x + 1, coordSize + x * cellSize + cellSize / 2, coordSize / 2);
            }

            // 左边编号
            for (let y = 0; y < perlerHeight; y++) {
                const boxX = coordSize - cellSize;
                const boxY = coordSize + y * cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(y + 1, coordSize / 2, coordSize + y * cellSize + cellSize / 2);
            }

            // 右边编号
            const rightCoordX = coordSize + perlerWidth * cellSize + coordSize / 2;
            for (let y = 0; y < perlerHeight; y++) {
                const boxX = coordSize + perlerWidth * cellSize;
                const boxY = coordSize + y * cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(y + 1, rightCoordX, coordSize + y * cellSize + cellSize / 2);
            }

            // 下面编号
            const bottomCoordY = coordSize + perlerHeight * cellSize + coordSize / 2;
            for (let x = 0; x < perlerWidth; x++) {
                const boxX = coordSize + x * cellSize;
                const boxY = coordSize + perlerHeight * cellSize;
                ctx.strokeRect(boxX, boxY, cellSize, cellSize);
                ctx.fillText(x + 1, coordSize + x * cellSize + cellSize / 2, bottomCoordY);
            }
        }

        if (showGrid) {
            const lineWidth = parseFloat(this.gridLineWidth.value);
            if (lineWidth > 0) {
                ctx.strokeStyle = coordColor;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();

                for (let x = 0; x <= perlerWidth; x++) {
                    ctx.moveTo(coordSize + x * cellSize - 0.5, coordSize);
                    ctx.lineTo(coordSize + x * cellSize - 0.5, coordSize + perlerHeight * cellSize);
                }

                for (let y = 0; y <= perlerHeight; y++) {
                    ctx.moveTo(coordSize, coordSize + y * cellSize - 0.5);
                    ctx.lineTo(coordSize + perlerWidth * cellSize, coordSize + y * cellSize - 0.5);
                }

                ctx.stroke();
            }
        }

        for (let y = 0; y < perlerHeight; y++) {
            for (let x = 0; x < perlerWidth; x++) {
                const color = perlerColors[y][x];
                const px = coordSize + x * cellSize;
                const py = coordSize + y * cellSize;

                if (color.isTransparent) {
                    ctx.fillStyle = transparentColor;
                    if (beadShape === 'circle' || beadShape === 'ring') {
                        ctx.beginPath();
                        ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (beadShape === 'round-square') {
                        const cornerRadius = Math.min(8, Math.floor(cellSize * 0.2));
                        const actualSize = cellSize - 1;
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
                        ctx.fill();
                    } else {
                        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                    }
                    continue;
                }

                const nameLen = color.name.length;
                let fontSizeBase = Math.max(6, Math.floor(cellSize * 0.45));
                let fontSize = fontSizeBase;
                if (nameLen === 1) {
                    fontSize = Math.floor(fontSizeBase * 1.1);
                } else if (nameLen === 2) {
                    fontSize = fontSizeBase;
                } else if (nameLen === 3) {
                    fontSize = Math.floor(fontSizeBase * 0.85);
                } else {
                    fontSize = Math.floor(fontSizeBase * 0.7);
                }

                if (beadShape === 'circle') {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 2 - 1, 0, Math.PI * 2);
                    ctx.clip();

                    if (chartStyle === 'color') {
                        ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                        ctx.fillRect(px, py, cellSize, cellSize);
                    } else if (chartStyle === 'color-with-code') {
                        ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                        ctx.fillRect(px, py, cellSize, cellSize);
                        ctx.fillStyle = getContrastTextColor(color.rgb);
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                    } else {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(px, py, cellSize, cellSize);
                        ctx.strokeStyle = '#999';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.fillStyle = '#333';
                        ctx.font = `${fontSize}px sans-serif`;
                        ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                    }

                    ctx.restore();

                } else if (beadShape === 'ring') {
                    this.drawRingBead(ctx, px, py, cellSize, color, chartStyle, fontSize);
                } else if (beadShape === 'round-square') {
                    this.drawRoundSquareBead(ctx, px, py, cellSize, color, chartStyle, fontSize);
                } else {
                    if (chartStyle === 'color') {
                        ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                    } else if (chartStyle === 'color-with-code') {
                        ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                        ctx.fillStyle = getContrastTextColor(color.rgb);
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                    } else {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
                        ctx.strokeStyle = '#999';
                        ctx.strokeRect(px, py, cellSize - 1, cellSize - 1);
                        ctx.fillStyle = '#333';
                        ctx.font = `${fontSize}px sans-serif`;
                        ctx.fillText(color.name, px + cellSize / 2, py + cellSize / 2);
                    }
                }
            }
        }

        this.drawColorLegend();
        // 不再绘制底部水印，改为在顶部显示
        // drawFooter();
    },

    drawColorLegend() {
        const position = this.legendPosition.value;

        // 如果选择隐藏，删除现有图例并返回
        const existingLegend = document.getElementById('colorLegend');
        if (existingLegend) {
            existingLegend.remove();
        }
        const colorLegendArea = document.getElementById('colorLegendArea');
        colorLegendArea.innerHTML = '';

        if (position === 'hidden') {
            // 确保设置回正常布局
            this.perlerContent.style.flexDirection = 'column';
            this.perlerContent.style.gap = '0px';
            return;
        }

        const legendCanvas = document.createElement('canvas');
        const legendCtx = legendCanvas.getContext('2d');
        const colorNames = Object.keys(this.colorCounts).sort();

        const totalBeans = Object.values(this.colorCounts).reduce((a, b) => a + b, 0);
        const colorTypes = colorNames.length;
        const perlerWidth = Math.ceil(parseInt(this.widthInput.value) / parseInt(this.pixelSizeSlider.value));
        const perlerHeight = Math.ceil(parseInt(this.heightInput.value) / parseInt(this.pixelSizeSlider.value));
        const cellSize = parseInt(this.beadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
        const chartWidth = coordSize + perlerWidth * cellSize;
        const chartHeight = coordSize + perlerHeight * cellSize;

        let columns, itemsPerColumn, columnWidth;
        const rectWidth = 120;
        const rectHeight = 28;
        const rowHeight = rectHeight + 5;

        if (position === 'right') {
            columnWidth = rectWidth + 10;
            const availableHeight = chartHeight - 60;
            const maxItemsPerColumn = Math.max(1, Math.floor(availableHeight / rowHeight));
            columns = Math.min(Math.ceil(colorNames.length / maxItemsPerColumn), 4);
            itemsPerColumn = Math.ceil(colorNames.length / columns);
        } else {
            const maxWidth = chartWidth - 20;
            columnWidth = rectWidth + 10;
            columns = Math.max(1, Math.min(Math.floor(maxWidth / columnWidth), Math.ceil(colorNames.length / 1)));
            itemsPerColumn = Math.ceil(colorNames.length / columns);
        }

        const legendWidth = columns * columnWidth + 20;
        const legendHeight = 60 + itemsPerColumn * rowHeight;

        legendCanvas.width = legendWidth;
        legendCanvas.height = legendHeight;

        legendCtx.fillStyle = '#ffffff';
        legendCtx.fillRect(0, 0, legendCanvas.width, legendCanvas.height);

        legendCtx.font = 'bold 13px sans-serif';
        legendCtx.fillStyle = '#667eea';
        legendCtx.textAlign = 'left';
        legendCtx.fillText(getI18nText('colorLegend'), 8, 18);

        legendCtx.font = 'bold 12px sans-serif';
        legendCtx.fillStyle = '#333';
        legendCtx.fillText(`${getI18nText('totalBeans')}: ${totalBeans} ${getI18nText('beans')} · ${getI18nText('colorTypes')}: ${colorTypes}`, 8, 36);

        let col = 0, row = 0;

        for (const name of colorNames) {
            const count = this.colorCounts[name];
            const colorSetName = this.colorSetSelect.value;
            const colorSet = colorSets[colorSetName];
            const color = colorSet.find(c => c.name === name);

            const x = 8 + col * columnWidth;
            const y = 50 + row * rowHeight;

            if (color) {
                legendCtx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                legendCtx.fillRect(x, y, rectWidth, rectHeight);
                legendCtx.strokeStyle = '#999';
                legendCtx.strokeRect(x, y, rectWidth, rectHeight);

                legendCtx.fillStyle = getContrastTextColor(color.rgb);
                legendCtx.font = 'bold 11px sans-serif';
                legendCtx.textAlign = 'center';
                legendCtx.textBaseline = 'middle';
                legendCtx.fillText(`${name} x ${count}`, x + rectWidth / 2, y + rectHeight / 2);
                legendCtx.textAlign = 'left';
                legendCtx.textBaseline = 'alphabetic';
            }

            row++;
            if (row >= itemsPerColumn) {
                row = 0;
                col++;
            }
        }

        const legendDiv = document.createElement('div');
        legendDiv.id = 'colorLegend';
        legendDiv.style.padding = '15px';
        legendDiv.style.background = '#f8f9fa';
        legendDiv.style.borderRadius = '8px';
        legendDiv.style.display = 'inline-block';
        legendDiv.appendChild(legendCanvas);

        if (position === 'right') {
            legendDiv.classList.add('horizontal');
            colorLegendArea.classList.add('horizontal');
            this.perlerContent.style.flexDirection = 'row';
            this.perlerContent.style.gap = '20px';
            colorLegendArea.style.flexDirection = 'column';
            colorLegendArea.style.alignItems = 'flex-start';
        } else {
            legendDiv.classList.remove('horizontal');
            colorLegendArea.classList.remove('horizontal');
            this.perlerContent.style.flexDirection = 'column';
            this.perlerContent.style.gap = '0px';
            colorLegendArea.style.flexDirection = 'column';
            colorLegendArea.style.alignItems = 'center';
        }

        colorLegendArea.appendChild(legendDiv);
    },

    refreshLegendPosition() {
        if (Object.keys(this.colorCounts).length > 0) {
            this.drawColorLegend();
        }
    },
};

if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, PerlerRenderMixin);
}
if (typeof window !== 'undefined') {
    window.PerlerRenderMixin = PerlerRenderMixin;
}
