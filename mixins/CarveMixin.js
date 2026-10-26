/**
 * CarveMixin — 雕刻分割-9方法
 * 来源: app.js L6772-L7058
 * 提取时间: 2026-10-02 14:58:06
 */

const CarveMixin = {
    setPixelMode(carveMode) {
        this.carveMode = carveMode;

        if (carveMode) {
            this.pixelModeBtn.classList.remove('active');
            this.carveModeBtn.classList.add('active');
            this.carveControls.style.display = 'block';

            const pixelControls = document.querySelectorAll('#perlerOptions');
            if (pixelControls.length > 0) {
                pixelControls[0].style.display = 'none';
            }

            this.resetCarving();
        } else {
            this.carveModeBtn.classList.remove('active');
            this.pixelModeBtn.classList.add('active');
            this.carveControls.style.display = 'none';

            const pixelControls = document.querySelectorAll('#perlerOptions');
            if (pixelControls.length > 0) {
                pixelControls[0].style.display = 'block';
            }

            this.updatePixelatedImage();
        }
    },

    resetCarving() {
        if (!this.originalImage) return;

        this.carveBlocks = [];
        this.selectedBlocks.clear();

        const blockSize = this.initialBlockSize;
        const cols = Math.ceil(this.originalWidth / blockSize);
        const rows = Math.ceil(this.originalHeight / blockSize);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * blockSize;
                const y = row * blockSize;
                const w = Math.min(blockSize, this.originalWidth - x);
                const h = Math.min(blockSize, this.originalHeight - y);

                const color = this.getDominantColor(x, y, w, h);

                this.carveBlocks.push({
                    id: `${row}-${col}`,
                    x: x,
                    y: y,
                    width: w,
                    height: h,
                    color: color,
                    parent: null,
                    children: null
                });
            }
        }

        this.updatePixelatedFromCarve();
        this.drawCarveBlocks();
    },

    getDominantColor(x, y, width, height) {
        if (!this.originalImageData || width <= 0 || height <= 0) {
            return { r: 255, g: 255, b: 255 };
        }

        x = Math.max(0, Math.floor(x));
        y = Math.max(0, Math.floor(y));
        width = Math.max(1, Math.min(Math.floor(width), this.originalWidth - x));
        height = Math.max(1, Math.min(Math.floor(height), this.originalHeight - y));

        const data = this.originalImageData.data;
        const imgWidth = this.originalWidth;

        let r = 0, g = 0, b = 0, count = 0;

        const step = Math.max(1, Math.floor(Math.sqrt(width * height) / 10));

        for (let py = 0; py < height; py += step) {
            for (let px = 0; px < width; px += step) {
                const idx = ((y + py) * imgWidth + (x + px)) * 4;
                r += data[idx];
                g += data[idx + 1];
                b += data[idx + 2];
                count++;
            }
        }

        if (count === 0) {
            return { r: 255, g: 255, b: 255 };
        }

        return {
            r: Math.round(r / count),
            g: Math.round(g / count),
            b: Math.round(b / count)
        };
    },

    handleCarveCanvasClick(e) {
        if (!this.carveMode) return;

        const rect = this.pixelatedCanvas.getBoundingClientRect();
        const scaleX = this.pixelatedCanvas.width / rect.width;
        const scaleY = this.pixelatedCanvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const clickedBlock = this.carveBlocks.find(block => 
            x >= block.x && x < block.x + block.width && 
            y >= block.y && y < block.y + block.height
        );

        if (clickedBlock) {
            if (clickedBlock.width > this.minBlockSize || clickedBlock.height > this.minBlockSize) {
                this.splitBlock(clickedBlock);
            }
        }
    },

    splitAllBlocks() {
        let splitHappened = true;
        let iterations = 0;
        const maxIterations = 5;

        while (splitHappened && iterations < maxIterations) {
            splitHappened = false;
            const blocksToSplit = [...this.carveBlocks].filter(block => 
                block.width > this.minBlockSize || block.height > this.minBlockSize
            );

            if (blocksToSplit.length === 0) break;

            for (const block of blocksToSplit) {
                if (this.carveBlocks.includes(block)) {
                    this.splitBlock(block, false);
                    splitHappened = true;
                }
            }
            iterations++;
        }

        this.updatePixelatedFromCarve();
        this.drawCarveBlocks();
    },

    splitBlock(block, updateAfter = true) {
        if (block.width <= this.minBlockSize && block.height <= this.minBlockSize) return;

        const index = this.carveBlocks.indexOf(block);
        if (index === -1) return;

        this.carveBlocks.splice(index, 1);

        const newSize = Math.max(this.minBlockSize, Math.min(block.width, block.height) / 2);

        const splits = [
            { x: block.x, y: block.y, w: Math.min(newSize, block.width), h: Math.min(newSize, block.height) },
            { x: block.x + newSize, y: block.y, w: block.width - newSize, h: Math.min(newSize, block.height) },
            { x: block.x, y: block.y + newSize, w: Math.min(newSize, block.width), h: block.height - newSize },
            { x: block.x + newSize, y: block.y + newSize, w: block.width - newSize, h: block.height - newSize }
        ];

        const newBlocks = [];
        splits.forEach((split, idx) => {
            if (split.w > 0 && split.h > 0) {
                const color = this.getDominantColor(split.x, split.y, split.w, split.h);
                newBlocks.push({
                    id: `${block.id}-${idx}`,
                    x: split.x,
                    y: split.y,
                    width: split.w,
                    height: split.h,
                    color: color,
                    parent: block,
                    children: null
                });
            }
        });

        this.carveBlocks.splice(index, 0, ...newBlocks);
        block.children = newBlocks;

        if (updateAfter) {
            this.updatePixelatedFromCarve();
            this.drawCarveBlocks();
        }
    },

    mergeSelectedBlocks() {
        console.log('合并功能待实现');
    },

    updatePixelatedFromCarve() {
        this.pixelatedCanvas.width = this.originalWidth;
        this.pixelatedCanvas.height = this.originalHeight;

        this.pixelatedCtx.clearRect(0, 0, this.pixelatedCanvas.width, this.pixelatedCanvas.height);

        this.carveBlocks.forEach(block => {
            this.pixelatedCtx.fillStyle = `rgb(${block.color.r}, ${block.color.g}, ${block.color.b})`;
            this.pixelatedCtx.fillRect(block.x, block.y, block.width, block.height);
        });

        this.pixelatedSize.textContent = `${getI18nText('size')}: ${this.originalWidth} × ${this.originalHeight} px`;

        this.convertCarveToPixelatedData();
    },

    convertCarveToPixelatedData() {
        this.pixelatedData = [];

        const sortedBlocks = [...this.carveBlocks].sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y;
            return a.x - b.x;
        });

        for (let y = 0; y < this.originalHeight; y++) {
            const row = new Array(this.originalWidth);

            let x = 0;
            while (x < this.originalWidth) {
                let found = false;

                for (const block of sortedBlocks) {
                    if (block.y > y + 1) break;

                    if (x >= block.x && x < block.x + block.width && 
                        y >= block.y && y < block.y + block.height) {

                        const colorObj = {
                            r: block.color.r,
                            g: block.color.g,
                            b: block.color.b,
                            isTransparent: false
                        };

                        const fillCount = Math.min(block.x + block.width - x, this.originalWidth - x);

                        for (let i = 0; i < fillCount; i++) {
                            row[x + i] = colorObj;
                        }

                        x += fillCount;
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    row[x] = { r: 255, g: 255, b: 255, isTransparent: false };
                    x++;
                }
            }

            this.pixelatedData.push(row);
        }
    },

    drawCarveBlocks() {
        if (!this.carveMode) return;

        const scaleX = this.pixelatedCanvas.width / this.originalWidth;
        const scaleY = this.pixelatedCanvas.height / this.originalHeight;

        this.pixelatedCtx.clearRect(0, 0, this.pixelatedCanvas.width, this.pixelatedCanvas.height);

        this.carveBlocks.forEach(block => {
            const x = block.x * scaleX;
            const y = block.y * scaleY;
            const w = block.width * scaleX;
            const h = block.height * scaleY;

            this.pixelatedCtx.fillStyle = `rgb(${block.color.r}, ${block.color.g}, ${block.color.b})`;
            this.pixelatedCtx.fillRect(x, y, w, h);

            if (this.showCarveGrid) {
                this.pixelatedCtx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                this.pixelatedCtx.lineWidth = 1;
                this.pixelatedCtx.strokeRect(x, y, w, h);
            }
        });
    },
};

// 在 PixelArtGenerator 类定义后执行，覆盖 prototype 上的同名方法
if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, CarveMixin);
}

if (typeof window !== 'undefined') {
    window.CarveMixin = CarveMixin;
}
