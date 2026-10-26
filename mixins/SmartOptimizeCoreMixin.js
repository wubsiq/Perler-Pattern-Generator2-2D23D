/**
 * SmartOptimizeCoreMixin — 智能优化核心-建议生成/渲染/接受/拒绝/确认
 * 来源: app.js L5966-L6525
 * 提取时间: 2026-10-02 14:58:14
 */

const SmartOptimizeCoreMixin = {
    closeSmartOptimizeModal(restoreOriginal = true) {
        this.smartOptimizeModal.style.display = 'none';
        // 退出全屏模式
        if (this.isFullscreen) {
            this.isFullscreen = false;
            this.smartOptimizeModal.classList.remove('fullscreen');
            this.toggleFullscreenBtn.textContent = '🔍';
            this.toggleFullscreenBtn.title = getI18nText('toggleFullscreenOff');
        }
        if (this.originalPerlerColors && restoreOriginal) {
            this.perlerColors = this.originalPerlerColors.map(row => [...row]);
            this.drawPerlerChartSync(this.perlerColors, this.perlerWidth, this.perlerHeight, this.colorSetSelect.value);
            this.drawColorLegend();
        }
        this.initCustomEditData();
    },

    generateColorSuggestions() {
        const suggestions = [];
        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName];
        const enableMerge = this.enableColorMerge.checked;
        const mergeThreshold = parseInt(this.colorMergeThresholdSlider.value);
        const enableEdgeColorMerge = this.enableEdgeColorMerge.checked;
        const edgeColorThreshold = parseInt(this.edgeColorThresholdSlider.value);

        console.log('[智能优化] 开始生成建议');
        console.log('[智能优化] 颜色集:', colorSetName);
        console.log('[智能优化] 近似色融合:', enableMerge);
        console.log('[智能优化] 近似色融合相似度:', mergeThreshold);
        console.log('[智能优化] 边缘色融合:', enableEdgeColorMerge);
        console.log('[智能优化] 边缘色融合相似度:', edgeColorThreshold);

        const colorUsage = new Map();
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                const color = this.perlerColors[y][x];
                colorUsage.set(color.name, (colorUsage.get(color.name) || 0) + 1);
            }
        }

        const totalBeans = this.perlerWidth * this.perlerHeight;
        const usageThreshold = Math.max(2, Math.floor(totalBeans * 0.005));

        console.log('[智能优化] 总豆豆数:', totalBeans);
        console.log('[智能优化] 使用阈值:', usageThreshold);
        console.log('[智能优化] 颜色使用情况:', Object.fromEntries(colorUsage));

        const colorsByUsage = Array.from(colorUsage.entries())
            .sort((a, b) => a[1] - b[1]);

        const highUsageColors = colorsByUsage
            .filter(([_, count]) => count > usageThreshold * 2)
            .map(([name]) => colorSet.find(c => c.name === name))
            .filter(Boolean);

        console.log('[智能优化] 高使用颜色数:', highUsageColors.length);
        console.log('[智能优化] 高使用颜色:', highUsageColors.map(c => c.name));

        if (enableMerge) {
            const mergeSuggestions = this.generateMergeSuggestions(colorsByUsage, colorSet, mergeThreshold);
            suggestions.push(...mergeSuggestions);
        }

        const processedColors = new Set(suggestions.map(s => s.originalColor.name));

        // 计算边缘色阈值 - 使用和近似色融合相同的计算方式
        // 范围：0-约441，50% -> 220.5，100% -> 0
        const edgeEffectiveThreshold = ((100 - edgeColorThreshold) / 100) * (255 * 3);
        // 非边缘色使用固定阈值，对应大约 85% 的相似度
        const normalEffectiveThreshold = ((100 - 85) / 100) * (255 * 3);

        console.log('[智能优化] 边缘色融合阈值:', edgeEffectiveThreshold, ', 非边缘色阈值:', normalEffectiveThreshold);

        for (const [colorName, count] of colorsByUsage) {
            if (processedColors.has(colorName)) continue;

            console.log(`[智能优化] 处理颜色 ${colorName}, 数量: ${count}`);
            if (count >= usageThreshold * 2) {
                console.log(`[智能优化] 跳过 ${colorName}: 数量 ${count} >= 高使用阈值 ${usageThreshold * 2}`);
                continue;
            }

            const originalColor = colorSet.find(c => c.name === colorName);
            if (!originalColor) {
                console.log(`[智能优化] 跳过 ${colorName}: 未在颜色集中找到`);
                continue;
            }

            const isEdgeColor = this.isColorOnEdge(colorName);

            // 如果是边缘色但禁用了边缘色融合，则跳过
            if (isEdgeColor && !enableEdgeColorMerge) {
                console.log(`[智能优化] 跳过 ${colorName}: 是边缘色但边缘色融合被禁用`);
                continue;
            }

            let bestReplacement = null;
            let minDistance = Infinity;

            for (const candidate of highUsageColors) {
                if (candidate.name === colorName) continue;

                // 使用和近似色融合一样的距离计算方式
                const distance = this.getRgbDistance(originalColor.rgb, candidate.rgb);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestReplacement = candidate;
                }
            }

            const effectiveThreshold = isEdgeColor ? edgeEffectiveThreshold : normalEffectiveThreshold;

            console.log(`[智能优化] ${colorName} -> 最佳替换: ${bestReplacement ? bestReplacement.name : '无'}, 距离: ${minDistance}, 阈值: ${effectiveThreshold}, 边缘色: ${isEdgeColor}`);

            if (bestReplacement && minDistance <= effectiveThreshold) {
                suggestions.push({
                    id: suggestions.length,
                    originalColor,
                    replacementColor: bestReplacement,
                    beanCount: count,
                    isEdgeColor,
                    accepted: false,
                    isMerge: false
                });
            }
        }

        console.log('[智能优化] 最终建议数:', suggestions.length);
        return suggestions.sort((a, b) => {
            if (a.isMerge && !b.isMerge) return -1;
            if (!a.isMerge && b.isMerge) return 1;
            return a.beanCount - b.beanCount;
        });
    },

    generateMergeSuggestions(colorsByUsage, colorSet, mergeThreshold) {
        const suggestions = [];
        const rgbDistanceThreshold = ((100 - mergeThreshold) / 100) * 255 * 3;

        console.log('[近似色融合][新算法] 开始生成融合建议');
        console.log('[近似色融合][新算法] RGB距离阈值:', rgbDistanceThreshold);

        // 1. 生成所有满足阈值的候选配对
        const candidates = [];
        for (let i = 0; i < colorsByUsage.length; i++) {
            const [nameA, countA] = colorsByUsage[i];
            const colorA = colorSet.find(c => c.name === nameA);
            if (!colorA) continue;

            for (let j = i + 1; j < colorsByUsage.length; j++) {
                const [nameB, countB] = colorsByUsage[j];
                const colorB = colorSet.find(c => c.name === nameB);
                if (!colorB) continue;

                const distance = this.getRgbDistance(colorA.rgb, colorB.rgb);

                if (distance <= rgbDistanceThreshold) {
                    candidates.push({
                        colorA: colorA,
                        nameA: nameA,
                        countA: countA,
                        colorB: colorB,
                        nameB: nameB,
                        countB: countB,
                        distance: distance
                    });
                }
            }
        }

        console.log('[近似色融合][新算法] 候选配对数:', candidates.length);

        // 2. 按相似度从高到低排序（距离越小越靠前）
        candidates.sort((a, b) => a.distance - b.distance);

        // 3. 贪心选择最优配对
        const used = new Set();
        for (const candidate of candidates) {
            if (used.has(candidate.nameA) || used.has(candidate.nameB)) continue;

            // 选择使用量大的颜色作为保留颜色
            const keepColor = candidate.countA >= candidate.countB ? candidate.colorA : candidate.colorB;
            const mergeColor = candidate.countA >= candidate.countB ? candidate.colorB : candidate.colorA;
            const mergeCount = candidate.countA >= candidate.countB ? candidate.countB : candidate.countA;

            suggestions.push({
                id: suggestions.length,
                originalColor: mergeColor,
                replacementColor: keepColor,
                beanCount: mergeCount,
                isEdgeColor: false,
                accepted: true,
                isMerge: true
            });

            used.add(candidate.nameA);
            used.add(candidate.nameB);

            console.log(`[近似色融合][新算法] ${mergeColor.name} -> ${keepColor.name}, 距离: ${candidate.distance.toFixed(1)}`);
        }

        console.log('[近似色融合][新算法] 融合建议数:', suggestions.length);
        return suggestions;
    },

    getRgbDistance(rgb1, rgb2) {
        const dr = rgb1[0] - rgb2[0];
        const dg = rgb1[1] - rgb2[1];
        const db = rgb1[2] - rgb2[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
    },

    isColorOnEdge(colorName) {
        let edgeCount = 0;
        let totalCount = 0;

        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                if (this.perlerColors[y][x].name === colorName) {
                    totalCount++;

                    let differentNeighbors = 0;
                    const neighbors = [
                        [y - 1, x],
                        [y + 1, x],
                        [y, x - 1],
                        [y, x + 1]
                    ];

                    for (const [ny, nx] of neighbors) {
                        if (ny >= 0 && ny < this.perlerHeight && nx >= 0 && nx < this.perlerWidth) {
                            if (this.perlerColors[ny][nx].name !== colorName) {
                                differentNeighbors++;
                            }
                        }
                    }

                    if (differentNeighbors >= 2) {
                        edgeCount++;
                    }
                }
            }
        }

        return totalCount > 0 && edgeCount / totalCount > 0.3;
    },

    renderOptimizationSummary() {
        const originalColors = new Set();
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                originalColors.add(this.perlerColors[y][x].name);
            }
        }

        const acceptedCount = this.acceptedSuggestions.size;
        const replacedColors = new Set();
        for (const idx of this.acceptedSuggestions) {
            replacedColors.add(this.colorSuggestions[idx].originalColor.name);
        }

        const suggestedColors = originalColors.size - replacedColors.size;

        this.optimizationSummary.innerHTML = `
            <div class="summary-item">
                <span class="summary-label">${getI18nText('originalColors')}:</span>
                <span class="summary-value">${originalColors.size}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">${getI18nText('suggestedColors')}:</span>
                <span class="summary-value">${suggestedColors}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">${getI18nText('colorReduction')}:</span>
                <span class="summary-value">${originalColors.size - suggestedColors}</span>
            </div>
        `;
    },

    getErasedCountForColor(colorName) {
        let count = 0;
        for (const key of this.erasedBlocks) {
            const [x, y] = key.split(',').map(Number);
            if (this.originalPerlerColors[y][x].name === colorName) {
                count++;
            }
        }
        return count;
    },

    renderSuggestionsList() {
        if (this.colorSuggestions.length === 0) {
            this.suggestionsList.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">' + getI18nText('noOptimizationSuggestions') + '</p>';
            return;
        }

        const html = this.colorSuggestions.map((suggestion, index) => {
            const statusClass = this.acceptedSuggestions.has(index) ? 'accepted' : 
                             this.rejectedSuggestions.has(index) ? 'rejected' : '';
            const edgeIndicator = suggestion.isEdgeColor ? '🔍 边缘色' : '';
            const mergeIndicator = suggestion.isMerge ? '🔄 近似色融合' : '';
            const erasedCount = this.getErasedCountForColor(suggestion.originalColor.name);
            const erasedIndicator = erasedCount > 0 ? `<span style="margin-left: 10px; font-size: 0.85em; color: #27ae60;">🟢 ${erasedCount}个取消优化</span>` : '';

            return `
                <div class="suggestion-item ${statusClass} ${suggestion.isMerge ? 'merge-suggestion' : ''}" data-index="${index}">
                    <div class="color-swatch-small" style="background-color: rgb(${suggestion.originalColor.rgb[0]}, ${suggestion.originalColor.rgb[1]}, ${suggestion.originalColor.rgb[2]});"></div>
                    <div class="suggestion-info">
                        <div class="suggestion-text">
                            <span>${suggestion.originalColor.name}</span>
                            <span class="arrow">→</span>
                            <div class="color-swatch-small" style="background-color: rgb(${suggestion.replacementColor.rgb[0]}, ${suggestion.replacementColor.rgb[1]}, ${suggestion.replacementColor.rgb[2]}); width: 24px; height: 24px;"></div>
                            <span>${suggestion.replacementColor.name}</span>
                            ${mergeIndicator ? `<span style="margin-left: 10px; font-size: 0.85em; color: #667eea;">${mergeIndicator}</span>` : ''}
                            ${edgeIndicator ? `<span style="margin-left: 10px; font-size: 0.85em; color: #ff6b00;">${edgeIndicator}</span>` : ''}
                            ${erasedIndicator}
                        </div>
                        <div class="suggestion-beans">
                            ${getI18nText('beansAffected')}: ${suggestion.beanCount} ${getI18nText('beans')}
                            ${erasedCount > 0 ? ` <span style="color: #27ae60;">(其中${erasedCount}个已取消优化)</span>` : ''}
                        </div>
                    </div>
                    <div class="suggestion-actions">
                        <button class="suggestion-action-btn preview" data-index="${index}">${getI18nText('preview')}</button>
                        <button class="suggestion-action-btn accept" data-index="${index}">${getI18nText('accept')}</button>
                        <button class="suggestion-action-btn reject" data-index="${index}">${getI18nText('reject')}</button>
                    </div>
                </div>
            `;
        }).join('');

        this.suggestionsList.innerHTML = html;

        this.suggestionsList.querySelectorAll('.suggestion-action-btn.accept').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                this.acceptSuggestion(index);
            });
        });

        this.suggestionsList.querySelectorAll('.suggestion-action-btn.reject').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                this.rejectSuggestion(index);
            });
        });

        this.suggestionsList.querySelectorAll('.suggestion-action-btn.preview').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                this.previewSuggestion(index);
            });
        });
    },

    acceptSuggestion(index) {
        if (this.rejectedSuggestions.has(index)) {
            this.rejectedSuggestions.delete(index);
        }
        if (!this.acceptedSuggestions.has(index)) {
            this.acceptedSuggestions.add(index);
            this.applySuggestion(index);
        }
        this.renderOptimizationSummary();
        this.renderSuggestionsList();
        this.drawOptimizationPreview();
    },

    rejectSuggestion(index) {
        if (this.acceptedSuggestions.has(index)) {
            this.acceptedSuggestions.delete(index);
            this.restoreSuggestion(index);
        }
        this.rejectedSuggestions.add(index);
        this.renderOptimizationSummary();
        this.renderSuggestionsList();
        this.drawOptimizationPreview();
    },

    acceptAllSuggestions() {
        this.rejectedSuggestions.clear();
        for (let i = 0; i < this.colorSuggestions.length; i++) {
            this.acceptedSuggestions.add(i);
            this.applySuggestion(i);
        }
        this.renderOptimizationSummary();
        this.renderSuggestionsList();
        this.drawOptimizationPreview();
    },

    rejectAllSuggestions() {
        for (const index of this.acceptedSuggestions) {
            this.restoreSuggestion(index);
        }
        this.acceptedSuggestions.clear();
        this.rejectedSuggestions = new Set(this.colorSuggestions.map((_, i) => i));
        this.renderOptimizationSummary();
        this.renderSuggestionsList();
        this.drawOptimizationPreview();
    },

    applySuggestion(index) {
        const suggestion = this.colorSuggestions[index];
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                const key = `${x},${y}`;
                // 跳过被取消优化的方块
                if (this.erasedBlocks.has(key)) {
                    continue;
                }
                if (this.previewPerlerColors[y][x].name === suggestion.originalColor.name) {
                    this.previewPerlerColors[y][x] = suggestion.replacementColor;
                }
            }
        }
        this.drawOptimizationPreview();
    },

    restoreSuggestion(index) {
        const suggestion = this.colorSuggestions[index];
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                const key = `${x},${y}`;
                // 跳过被取消优化的方块
                if (this.erasedBlocks.has(key)) {
                    continue;
                }
                if (this.originalPerlerColors[y][x].name === suggestion.originalColor.name) {
                    this.previewPerlerColors[y][x] = this.originalPerlerColors[y][x];
                }
            }
        }
        this.drawOptimizationPreview();
    },

    previewSuggestion(index) {
        const suggestion = this.colorSuggestions[index];
        const tempColors = this.previewPerlerColors.map(row => [...row]);

        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                const key = `${x},${y}`;
                // 跳过被取消优化的方块
                if (this.erasedBlocks.has(key)) {
                    continue;
                }
                if (tempColors[y][x].name === suggestion.originalColor.name) {
                    tempColors[y][x] = suggestion.replacementColor;
                }
            }
        }

        this.drawPerlerChartSync(tempColors, this.perlerWidth, this.perlerHeight, this.colorSetSelect.value);
    },

    updateColorCounts() {
        this.colorCounts = {};
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                const color = this.perlerColors[y][x];
                if (this.colorCounts[color.name]) {
                    this.colorCounts[color.name]++;
                } else {
                    this.colorCounts[color.name] = 1;
                }
            }
        }
    },

    confirmOptimization() {
        // 把预览矩阵应用到真实数据
        this.perlerColors = this.previewPerlerColors.map(row => [...row]);

        // 更新计数和主画布
        this.updateColorCounts();
        this.drawPerlerChartSync(this.perlerColors, this.perlerWidth, this.perlerHeight, this.colorSetSelect.value);
        this.drawColorLegend();

        const acceptedCount = this.acceptedSuggestions.size;
        const description = acceptedCount > 0 
            ? `替换了 ${acceptedCount} 个颜色（${this.erasedBlocks.size} 个方块保留原样）` 
            : getI18nText('noChanges');

        this.saveUnifiedSnapshot('smart', description);
        this.closeSmartOptimizeModal(false);
    },
};

// 在 PixelArtGenerator 类定义后执行，覆盖 prototype 上的同名方法
if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, SmartOptimizeCoreMixin);
}

if (typeof window !== 'undefined') {
    window.SmartOptimizeCoreMixin = SmartOptimizeCoreMixin;
}
