class CircularPixelArtGenerator {
    constructor() {
        this.originalImage = null;
        this.originalWidth = 0;
        this.originalHeight = 0;
        this.fullOriginalImage = null;
        this.fullOriginalWidth = 0;
        this.fullOriginalHeight = 0;
        this.isCropped = false;
        this.colorCounts = {};
        this.pixelatedData = null;
        this.perlerColors = null;
        this.circularPerlerColors = null;
        this.beadPositions = null;
        this.maxRing = 8;
        this.showSectorLines = true;
        this.isCropMode = false;
        this.isCreatingCrop = false;
        this.isDraggingCrop = false;
        this.isResizingCrop = false;
        this.activeHandle = null;
        this.cropStartX = 0;
        this.cropStartY = 0;
        this.initialCropBox = null;

        this.pixelator = new Pixelator();
        this.perlerGenerator = new PerlerGenerator();
        this.circularGenerator = new CircularPerlerGenerator();
        this.canvasRenderer = new CanvasRenderer();
        this.downloadManager = new DownloadManager();

        this.currentEditTool = 'brush';
        this.isDrawing = false;
        this.customEditData = null;
        this.customEditHistory = [];
        this.customEditHistoryIndex = -1;

        this.initElements();
        this.initEventListeners();
        this.updateTotalBeads();
    }

    initElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.blankCanvasArea = document.getElementById('blankCanvasArea');
        this.fileInput = document.getElementById('fileInput');
        this.uploadSection = document.getElementById('uploadSection');
        this.workspace = document.getElementById('workspace');

        this.originalCanvas = document.getElementById('originalCanvas');
        this.originalCtx = this.originalCanvas.getContext('2d', { willReadFrequently: true });
        this.originalCtx.imageSmoothingEnabled = false;

        this.pixelatedCanvas = document.getElementById('pixelatedCanvas');
        this.pixelatedCtx = this.pixelatedCanvas.getContext('2d', { willReadFrequently: true });
        this.pixelatedCtx.imageSmoothingEnabled = false;

        this.perlerCanvas = document.getElementById('perlerCanvas');
        this.perlerCtx = this.perlerCanvas.getContext('2d', { willReadFrequently: true });
        this.perlerCtx.imageSmoothingEnabled = false;

        this.customEditCanvas = document.getElementById('customEditCanvas');
        this.customEditCtx = this.customEditCanvas.getContext('2d', { willReadFrequently: true });

        this.originalSize = document.getElementById('originalSize');
        this.pixelatedSize = document.getElementById('pixelatedSize');
        this.pixelatedGridCount = document.getElementById('pixelatedGridCount');
        this.perlerSize = document.getElementById('perlerSize');
        this.customEditInfo = document.getElementById('customEditInfo');

        this.cropBtn = document.getElementById('cropBtn');
        this.resetCropBtn = document.getElementById('resetCropBtn');
        this.confirmCropBtn = document.getElementById('confirmCropBtn');
        this.cancelCropBtn = document.getElementById('cancelCropBtn');
        this.cropOverlay = document.getElementById('cropOverlay');
        this.cropBox = document.getElementById('cropBox');

        this.widthInput = document.getElementById('widthInput');
        this.heightInput = document.getElementById('heightInput');
        this.keepRatioCheckbox = document.getElementById('keepRatioCheckbox');

        this.pixelSizeSlider = document.getElementById('pixelSizeSlider');
        this.pixelSizeValue = document.getElementById('pixelSizeValue');

        this.pixelMethod = document.getElementById('pixelMethod');

        this.colorSetSelect = document.getElementById('colorSetSelect');
        this.colorMappingMethod = document.getElementById('colorMappingMethod');
        this.chartStyle = document.getElementById('chartStyle');
        this.legendPosition = document.getElementById('legendPosition');
        this.beadShape = document.getElementById('beadShape');
        this.transparentCellColor = document.getElementById('transparentCellColor');
        this.transparentCellColorValue = document.getElementById('transparentCellColorValue');
        this.beadSizeSlider = document.getElementById('beadSizeSlider');
        this.beadSizeValue = document.getElementById('beadSizeValue');
        this.exportBeadSizeSlider = document.getElementById('exportBeadSizeSlider');
        this.exportBeadSizeValue = document.getElementById('exportBeadSizeValue');
        this.beadScaleSlider = document.getElementById('beadScaleSlider');
        this.beadScaleValue = document.getElementById('beadScaleValue');
        this.showGridLines = document.getElementById('showGridLines');
        this.showCoordNumbers = document.getElementById('showCoordNumbers');
        this.showSectorLinesCheckbox = document.getElementById('showSectorLines');
        this.coordLineColor = document.getElementById('coordLineColor');
        this.coordNumberColor = document.getElementById('coordNumberColor');
        this.gridLineWidth = document.getElementById('gridLineWidth');
        this.watermarkText = document.getElementById('watermarkText');

        this.ringCountInput = document.getElementById('ringCountInput');
        this.totalBeadsValue = document.getElementById('totalBeadsValue');
        this.perlerContent = document.getElementById('perlerContent');
        this.colorLegendArea = document.getElementById('colorLegendArea');
        this.exportFormatSelect = document.getElementById('exportFormatSelect');

        this.renderPerlerBtn = document.getElementById('renderPerlerBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.downloadPerlerBtn = document.getElementById('downloadPerlerBtn');

        this.presetBtns = document.querySelectorAll('.preset-btn[data-width]');
        this.ringPresetBtns = document.querySelectorAll('.preset-btn[data-ring]');

        this.simpleModeBtn = document.getElementById('simpleModeBtn');
        this.advancedModeBtn = document.getElementById('advancedModeBtn');

        this.showPixelGrid = document.getElementById('showPixelGrid');
        this.pixelGridColor = document.getElementById('pixelGridColor');
        this.pixelGridLineWidth = document.getElementById('pixelGridLineWidth');
        this.pixelGridOffsetX = document.getElementById('pixelGridOffsetX');
        this.pixelGridOffsetY = document.getElementById('pixelGridOffsetY');

        this.enableContrast = document.getElementById('enableContrast');
        this.contrastSlider = document.getElementById('contrastSlider');

        this.pixelatedZoomSlider = document.getElementById('pixelatedZoomSlider');
        this.pixelatedZoomValue = document.getElementById('pixelatedZoomValue');
        this.perlerZoomSlider = document.getElementById('perlerZoomSlider');
        this.perlerZoomValue = document.getElementById('perlerZoomValue');

        this.editToolBtns = document.querySelectorAll('.edit-tool-btn');
        this.customEditColor = document.getElementById('customEditColor');
        this.currentColorValue = document.getElementById('currentColorValue');
        this.customEditBrushSize = document.getElementById('customEditBrushSize');
        this.brushSizeValue = document.getElementById('brushSizeValue');
        this.customEditBrushCursor = document.getElementById('customEditBrushCursor');
        this.applyCustomEditBtn = document.getElementById('applyCustomEditBtn');
        this.undoCustomEditBtn = document.getElementById('undoCustomEditBtn');
        this.exportPixelImageBtn = document.getElementById('exportPixelImageBtn');
        this.canvasBoundsControls = document.getElementById('canvasBoundsControls');
        this.canvasBoundsRings = document.getElementById('canvasBoundsRings');
        this.canvasBoundsCurrentSize = document.getElementById('canvasBoundsCurrentSize');
        this.increaseRingBtn = document.getElementById('increaseRingBtn');
        this.decreaseRingBtn = document.getElementById('decreaseRingBtn');
        this.resetCanvasBoundsBtn = document.getElementById('resetCanvasBoundsBtn');
        this.originalMaxRing = 8;

        this.saveSnapshotBtn = document.getElementById('saveSnapshotBtn');
        this.snapshotFloatBtn = document.getElementById('snapshotFloatBtn');
        this.snapshotPanel = document.getElementById('snapshotPanel');
        this.closeSnapshotPanel = document.getElementById('closeSnapshotPanel');
        this.snapshotsContainer = document.getElementById('snapshotsContainer');
        this.unifiedSnapshots = [];
    }

    initEventListeners() {
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.loadImage(files[0]);
            }
        });

        this.cropBtn.addEventListener('click', () => this.toggleCropMode());
        this.confirmCropBtn.addEventListener('click', () => this.confirmCrop());
        this.cancelCropBtn.addEventListener('click', () => this.cancelCrop());
        this.resetCropBtn.addEventListener('click', () => this.resetToFullImage());

        this.cropOverlay.addEventListener('mousedown', (e) => this.cropMouseDown(e));
        this.cropOverlay.addEventListener('touchstart', (e) => this.cropTouchStart(e), { passive: false });
        document.addEventListener('mousemove', (e) => this.cropMouseMove(e));
        document.addEventListener('touchmove', (e) => this.cropTouchMove(e), { passive: false });
        document.addEventListener('mouseup', (e) => this.cropMouseUp(e));
        document.addEventListener('touchend', (e) => this.cropTouchEnd(e));

        this.presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const width = parseInt(btn.dataset.width);
                const height = parseInt(btn.dataset.height);
                this.widthInput.value = width;
                if (this.keepRatioCheckbox.checked && this.originalWidth > 0) {
                    const ratio = this.originalHeight / this.originalWidth;
                    this.heightInput.value = Math.round(width * ratio);
                } else {
                    this.heightInput.value = height;
                }
                this.updatePixelatedImage();
            });
        });

        this.widthInput.addEventListener('input', () => {
            if (this.keepRatioCheckbox.checked && this.originalWidth > 0) {
                const ratio = this.originalHeight / this.originalWidth;
                this.heightInput.value = Math.round(this.widthInput.value * ratio);
            }
            this.updatePixelatedImage();
        });

        this.heightInput.addEventListener('input', () => {
            if (this.keepRatioCheckbox.checked && this.originalHeight > 0) {
                const ratio = this.originalWidth / this.originalHeight;
                this.widthInput.value = Math.round(this.heightInput.value * ratio);
            }
            this.updatePixelatedImage();
        });

        this.pixelSizeSlider.addEventListener('input', () => {
            this.pixelSizeValue.textContent = this.pixelSizeSlider.value + 'px';
            this.updatePixelatedImage();
        });

        this.renderPerlerBtn.addEventListener('click', () => this.updatePerlerChart());

        this.clearBtn.addEventListener('click', () => this.clearAll());
        this.resetBtn.addEventListener('click', () => this.resetAll());

        this.ringCountInput.addEventListener('input', (e) => {
            this.maxRing = parseInt(e.target.value);
            this.updateTotalBeads();
        });

        this.ringPresetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const ring = parseInt(btn.dataset.ring);
                this.maxRing = ring;
                this.ringCountInput.value = ring;
                this.updateTotalBeads();
            });
        });

        this.showSectorLinesCheckbox.addEventListener('change', (e) => {
            this.showSectorLines = e.target.checked;
            this.refreshPerlerChartDisplay();
        });

        this.showGridLines.addEventListener('change', () => {
            this.refreshPerlerChartDisplay();
        });

        this.showCoordNumbers.addEventListener('change', () => {
            this.refreshPerlerChartDisplay();
        });

        this.chartStyle.addEventListener('change', () => {
            this.refreshPerlerChartDisplay();
        });

        this.beadShape.addEventListener('change', () => {
            this.refreshPerlerChartDisplay();
        });

        if (this.legendPosition) {
            this.legendPosition.addEventListener('change', () => {
                this.drawColorLegend();
            });
        }

        if (this.transparentCellColor) {
            const transparentColorHandler = () => {
                if (this.transparentCellColorValue) {
                    this.transparentCellColorValue.textContent = this.transparentCellColor.value;
                }
                if (this.circularPerlerColors) {
                    this.refreshPerlerChartDisplay();
                }
            };
            this.transparentCellColor.addEventListener('input', transparentColorHandler);
            this.transparentCellColor.addEventListener('change', transparentColorHandler);
        }

        this.beadSizeSlider.addEventListener('input', () => {
            const displaySize = parseInt(this.beadSizeSlider.value);
            this.beadSizeValue.textContent = displaySize + 'px';
            let exportSize = displaySize * 2;
            exportSize = Math.max(3, Math.min(96, exportSize));
            this.exportBeadSizeSlider.value = exportSize;
            this.exportBeadSizeValue.textContent = exportSize + 'px';
        });

        this.beadScaleSlider.addEventListener('input', () => {
            const scale = parseInt(this.beadScaleSlider.value);
            this.beadScaleValue.textContent = scale + '%';
            this.refreshPerlerChartDisplay();
            if (this.customEditData) {
                this.renderCustomEditCanvas();
            }
        });

        this.simpleModeBtn.addEventListener('click', () => {
            this.simpleModeBtn.classList.add('active');
            this.advancedModeBtn.classList.remove('active');
            document.querySelector('.workspace').classList.remove('advanced-mode');
        });

        this.advancedModeBtn.addEventListener('click', () => {
            this.advancedModeBtn.classList.add('active');
            this.simpleModeBtn.classList.remove('active');
            document.querySelector('.workspace').classList.add('advanced-mode');
        });

        this.showPixelGrid.addEventListener('change', () => this.updatePixelatedImage());
        this.pixelGridColor.addEventListener('input', () => this.updatePixelatedImage());
        if (this.pixelGridLineWidth) {
            this.pixelGridLineWidth.addEventListener('input', () => this.updatePixelatedImage());
        }
        this.pixelGridOffsetX.addEventListener('input', (e) => {
            document.getElementById('pixelGridOffsetXValue').textContent = e.target.value + 'px';
            this.updatePixelatedImage();
        });
        this.pixelGridOffsetY.addEventListener('input', (e) => {
            document.getElementById('pixelGridOffsetYValue').textContent = e.target.value + 'px';
            this.updatePixelatedImage();
        });

        this.enableContrast.addEventListener('change', () => this.updatePixelatedImage());
        this.contrastSlider.addEventListener('input', (e) => {
            document.getElementById('contrastValue').textContent = e.target.value + 'x';
            this.updatePixelatedImage();
        });

        this.pixelatedZoomSlider.addEventListener('input', (e) => {
            this.pixelatedZoomValue.textContent = e.target.value + '%';
            const scale = e.target.value / 100;
            if (this.pixelatedCanvasDisplayWidth && this.pixelatedCanvasDisplayHeight) {
                this.pixelatedCanvas.style.width = (this.pixelatedCanvasDisplayWidth * scale) + 'px';
                this.pixelatedCanvas.style.height = (this.pixelatedCanvasDisplayHeight * scale) + 'px';
            }
        });

        this.perlerZoomSlider.addEventListener('input', (e) => {
            this.perlerZoomValue.textContent = e.target.value + '%';
            this.updatePerlerZoom();
        });

        this.downloadBtn.addEventListener('click', () => {
            this.downloadManager.downloadCanvas(this.pixelatedCanvas, 'pixelated-image');
        });

        this.downloadPerlerBtn.addEventListener('click', () => {
            this.downloadPerlerChart();
        });

        this.editToolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.editToolBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentEditTool = btn.dataset.tool;
                
                if (this.canvasBoundsControls) {
                    if (this.currentEditTool === 'canvasBounds') {
                        this.canvasBoundsControls.style.display = 'block';
                        if (this.canvasBoundsRings) {
                            this.canvasBoundsRings.value = this.maxRing;
                        }
                        this.updateCanvasBoundsInfo();
                    } else {
                        this.canvasBoundsControls.style.display = 'none';
                    }
                }
            });
        });

        if (this.canvasBoundsRings) {
            this.canvasBoundsRings.addEventListener('input', (e) => {
                const newRings = parseInt(e.target.value);
                if (newRings >= 1) {
                    this.adjustRings(newRings);
                }
            });
        }

        if (this.increaseRingBtn) {
            this.increaseRingBtn.addEventListener('click', () => {
                this.adjustRings(this.maxRing + 1);
            });
        }

        if (this.decreaseRingBtn) {
            this.decreaseRingBtn.addEventListener('click', () => {
                if (this.maxRing > 1) {
                    this.adjustRings(this.maxRing - 1);
                }
            });
        }

        if (this.resetCanvasBoundsBtn) {
            this.resetCanvasBoundsBtn.addEventListener('click', () => {
                this.adjustRings(this.originalMaxRing);
            });
        }

        this.customEditColor.addEventListener('input', (e) => {
            this.currentColorValue.textContent = e.target.value;
        });

        this.customEditBrushSize.addEventListener('input', (e) => {
            this.brushSizeValue.textContent = e.target.value;
        });

        this.customEditCanvas.addEventListener('mousedown', (e) => this.handleCustomEditMouseDown(e));
        this.customEditCanvas.addEventListener('mousemove', (e) => this.handleCustomEditMouseMove(e));
        this.customEditCanvas.addEventListener('mouseup', () => this.handleCustomEditMouseUp());
        this.customEditCanvas.addEventListener('mouseleave', () => this.handleCustomEditMouseUp());

        this.applyCustomEditBtn.addEventListener('click', () => this.applyCustomEdit());
        this.undoCustomEditBtn.addEventListener('click', () => this.undoCustomEdit());

        this.saveSnapshotBtn.addEventListener('click', () => this.saveUnifiedSnapshot('custom'));

        this.snapshotFloatBtn.addEventListener('click', () => {
            this.toggleSnapshotPanel();
        });

        this.closeSnapshotPanel.addEventListener('click', () => {
            this.snapshotPanel.classList.remove('show');
        });

        document.addEventListener('click', (e) => {
            if (this.snapshotPanel.classList.contains('show') && 
                !this.snapshotPanel.contains(e.target) && 
                e.target !== this.snapshotFloatBtn && 
                !this.snapshotFloatBtn.contains(e.target)) {
                this.snapshotPanel.classList.remove('show');
            }
        });
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.loadImage(file);
        }
    }

    loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.originalImage = img;
                this.fullOriginalImage = img;
                this.originalWidth = img.width;
                this.originalHeight = img.height;
                this.fullOriginalWidth = img.width;
                this.fullOriginalHeight = img.height;

                const defaultWidth = Math.min(img.width, 512);
                const defaultHeight = Math.round(defaultWidth * (img.height / img.width));
                this.widthInput.value = defaultWidth;
                this.heightInput.value = defaultHeight;

                this.showWorkspace();
                this.renderOriginalImage();
                this.updatePixelatedImage();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    showWorkspace() {
        this.uploadSection.style.display = 'none';
        this.workspace.style.display = 'block';
    }

    renderOriginalImage() {
        if (!this.originalImage) return;

        const maxWidth = 400;
        const maxHeight = 400;
        let displayWidth = this.originalWidth;
        let displayHeight = this.originalHeight;

        if (displayWidth > maxWidth) {
            const ratio = maxWidth / displayWidth;
            displayWidth = maxWidth;
            displayHeight = displayHeight * ratio;
        }
        if (displayHeight > maxHeight) {
            const ratio = maxHeight / displayHeight;
            displayHeight = maxHeight;
            displayWidth = displayWidth * ratio;
        }

        this.originalCanvas.width = this.originalWidth;
        this.originalCanvas.height = this.originalHeight;
        this.originalCtx.drawImage(this.originalImage, 0, 0);

        this.originalCanvas.style.width = displayWidth + 'px';
        this.originalCanvas.style.height = displayHeight + 'px';

        this.originalSize.textContent = `${this.originalWidth} × ${this.originalHeight} px`;

        this.cropOverlay.style.width = displayWidth + 'px';
        this.cropOverlay.style.height = displayHeight + 'px';

        this.cropScaleX = this.originalWidth / displayWidth;
        this.cropScaleY = this.originalHeight / displayHeight;
    }

    updatePixelatedImage() {
        if (!this.originalImage) return;

        const targetWidth = parseInt(this.widthInput.value);
        const targetHeight = parseInt(this.heightInput.value);
        const pixelSize = parseInt(this.pixelSizeSlider.value);
        const method = this.pixelMethod.value;
        const offsetX = parseInt(this.pixelGridOffsetX.value) || 0;
        const offsetY = parseInt(this.pixelGridOffsetY.value) || 0;

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.mozImageSmoothingEnabled = false;
        tempCtx.webkitImageSmoothingEnabled = false;
        tempCtx.msImageSmoothingEnabled = false;
        
        tempCtx.drawImage(this.originalImage, 0, 0, targetWidth, targetHeight);
        
        const imageData = tempCtx.getImageData(0, 0, targetWidth, targetHeight);

        const result = this.pixelator.process(imageData, {
            blockSize: pixelSize,
            offsetX: offsetX,
            offsetY: offsetY,
            method: method,
            enableContrast: this.enableContrast.checked,
            contrastFactor: parseFloat(this.contrastSlider.value)
        });

        this.pixelatedData = result.imageData;

        this.pixelatedCanvas.width = targetWidth;
        this.pixelatedCanvas.height = targetHeight;
        this.pixelatedCtx.putImageData(result.imageData, 0, 0);

        if (this.showPixelGrid.checked) {
            const lineWidth = parseFloat(this.pixelGridLineWidth.value);
            if (lineWidth > 0) {
                this.pixelatedCtx.strokeStyle = this.pixelGridColor.value;
                this.pixelatedCtx.lineWidth = lineWidth;
                this.pixelatedCtx.beginPath();
                
                for (let x = offsetX; x < targetWidth; x += pixelSize) {
                    if (x > 0) {
                        this.pixelatedCtx.moveTo(x - 0.5, 0);
                        this.pixelatedCtx.lineTo(x - 0.5, targetHeight);
                    }
                }
                
                for (let y = offsetY; y < targetHeight; y += pixelSize) {
                    if (y > 0) {
                        this.pixelatedCtx.moveTo(0, y - 0.5);
                        this.pixelatedCtx.lineTo(targetWidth, y - 0.5);
                    }
                }
                
                this.pixelatedCtx.stroke();
            }
        }

        const gridWidth = Math.ceil(targetWidth / pixelSize);
        const gridHeight = Math.ceil(targetHeight / pixelSize);
        this.pixelatedSize.textContent = `${targetWidth} × ${targetHeight} px`;
        this.pixelatedGridCount.textContent = `${gridWidth} × ${gridHeight} 像素格`;

        const savedZoom = parseInt(this.pixelatedZoomSlider.value);
        this.pixelatedCanvas.style.width = 'auto';
        this.pixelatedCanvas.style.height = 'auto';
        
        requestAnimationFrame(() => {
            this.pixelatedCanvasDisplayWidth = this.pixelatedCanvas.offsetWidth;
            this.pixelatedCanvasDisplayHeight = this.pixelatedCanvas.offsetHeight;
            
            if (savedZoom !== 100) {
                const scale = savedZoom / 100;
                this.pixelatedCanvas.style.width = (this.pixelatedCanvasDisplayWidth * scale) + 'px';
                this.pixelatedCanvas.style.height = (this.pixelatedCanvasDisplayHeight * scale) + 'px';
            }
        });
        
        this.pixelatedZoomSlider.value = savedZoom;
        this.pixelatedZoomValue.textContent = savedZoom + '%';
    }

    updatePerlerChart() {
        const pixelSize = parseInt(this.pixelSizeSlider.value);
        const targetWidth = parseInt(this.widthInput.value);
        const targetHeight = parseInt(this.heightInput.value);
        const colorSetName = this.colorSetSelect.value;
        const mappingMethod = this.colorMappingMethod.value;

        const extracted = this.perlerGenerator.extractFromImageData(
            this.pixelatedData,
            targetWidth,
            targetHeight,
            pixelSize,
            parseInt(this.pixelGridOffsetX.value) || 0,
            parseInt(this.pixelGridOffsetY.value) || 0
        );

        const perlerResult = this.perlerGenerator.generateFromProcessedData(
            extracted.processedData,
            extracted.perlerWidth,
            extracted.perlerHeight,
            {
                colorSet: colorSetName,
                mappingMethod: mappingMethod,
                enableNeighborSmooth: false,
                noiseThreshold: 0
            }
        );

        this.perlerColors = perlerResult.perlerColors;
        this.colorCounts = perlerResult.colorCounts;

        this.drawPerlerChart(this.perlerColors, extracted.perlerWidth, extracted.perlerHeight, colorSetName);
        this.perlerSize.textContent = `${this.maxRing}圈 / ${this.updateTotalBeads()}颗豆子`;
        this.initCustomEditData();
        this.saveUnifiedSnapshot('initial', '初始生成');
    }

    drawPerlerChart(perlerColors, perlerWidth, perlerHeight, colorSetName) {
        const cellSize = parseInt(this.beadSizeSlider.value);

        const circularResult = this.circularGenerator.generateFromPerlerColors(
            perlerColors,
            perlerWidth,
            perlerHeight,
            this.maxRing,
            {
                colorSet: colorSetName,
                mappingMethod: this.colorMappingMethod.value,
                beadSpacing: cellSize
            }
        );

        this.circularPerlerColors = circularResult.perlerColors;
        this.beadPositions = circularResult.beadPositions;
        this.colorCounts = circularResult.colorCounts;

        const totalBeads = this.updateTotalBeads();

        this.canvasRenderer.renderCircularChart(
            this.perlerCanvas,
            this.circularPerlerColors,
            this.beadPositions,
            this.maxRing,
            totalBeads,
            {
                cellSize: cellSize,
                chartStyle: this.chartStyle.value,
                beadShape: this.beadShape.value,
                showGrid: this.showGridLines.checked,
                showCoords: this.showCoordNumbers.checked,
                showSectorLines: this.showSectorLines,
                coordColor: this.coordLineColor.value,
                coordNumColor: this.coordNumberColor.value,
                transparentColor: this.transparentCellColor.value,
                watermarkText: this.watermarkText.value,
                beadScale: parseInt(this.beadScaleSlider.value) / 100
            }
        );

        this.updateColorCounts();
        this.drawColorLegend();

        this.perlerCanvasNaturalWidth = this.perlerCanvas.width;
        this.perlerCanvasNaturalHeight = this.perlerCanvas.height;
        this.autoFitPerlerZoom();
    }

    autoFitPerlerZoom() {
        if (!this.perlerCanvasNaturalWidth || !this.perlerZoomSlider) return;
        const wrapper = this.perlerCanvas.parentElement;
        if (!wrapper) return;
        const maxWidth = wrapper.clientWidth - 20;
        if (this.perlerCanvasNaturalWidth > maxWidth) {
            const scale = Math.min(1, maxWidth / this.perlerCanvasNaturalWidth);
            const scalePercent = Math.round(scale * 100);
            this.perlerZoomSlider.value = scalePercent;
            this.perlerZoomValue.textContent = scalePercent + '%';
        } else {
            this.perlerZoomSlider.value = 100;
            this.perlerZoomValue.textContent = '100%';
        }
        this.updatePerlerZoom();
    }

    updatePerlerZoom() {
        if (!this.perlerCanvasNaturalWidth || !this.perlerZoomSlider) return;
        const scale = this.perlerZoomSlider.value / 100;
        this.perlerCanvas.style.width = (this.perlerCanvasNaturalWidth * scale) + 'px';
        this.perlerCanvas.style.height = (this.perlerCanvasNaturalHeight * scale) + 'px';
    }

    refreshPerlerChartDisplay() {
        if (!this.circularPerlerColors) return;

        const cellSize = parseInt(this.beadSizeSlider.value);
        const colorSetName = this.colorSetSelect.value;
        const totalBeads = this.updateTotalBeads();

        this.canvasRenderer.renderCircularChart(
            this.perlerCanvas,
            this.circularPerlerColors,
            this.beadPositions,
            this.maxRing,
            totalBeads,
            {
                cellSize: cellSize,
                chartStyle: this.chartStyle.value,
                beadShape: this.beadShape.value,
                showGrid: this.showGridLines.checked,
                showCoords: this.showCoordNumbers.checked,
                showSectorLines: this.showSectorLines,
                coordColor: this.coordLineColor.value,
                coordNumColor: this.coordNumberColor.value,
                transparentColor: this.transparentCellColor.value,
                watermarkText: this.watermarkText.value,
                beadScale: parseInt(this.beadScaleSlider.value) / 100
            }
        );

        this.updateColorCounts();
        this.drawColorLegend();

        this.perlerCanvasNaturalWidth = this.perlerCanvas.width;
        this.perlerCanvasNaturalHeight = this.perlerCanvas.height;
        this.updatePerlerZoom();
    }

    initCustomEditData() {
        if (!this.circularPerlerColors) return;

        const cellSize = parseInt(this.beadSizeSlider.value);
        const totalBeads = this.updateTotalBeads();

        this.customEditData = [...this.circularPerlerColors];
        this.customEditHistory = [];
        this.customEditHistoryIndex = -1;
        this.originalMaxRing = this.maxRing;
        this.saveCustomEditHistory();

        this.renderCustomEditCanvas();
        this.customEditInfo.textContent = `${this.maxRing}圈 / ${totalBeads}颗豆子`;
    }

    renderCustomEditCanvas() {
        if (!this.customEditData) return;

        const cellSize = parseInt(this.beadSizeSlider.value);
        const totalBeads = this.updateTotalBeads();

        this.canvasRenderer.renderCircularChart(
            this.customEditCanvas,
            this.customEditData,
            this.beadPositions,
            this.maxRing,
            totalBeads,
            {
                cellSize: cellSize,
                chartStyle: 'color',
                beadShape: 'circle',
                showGrid: true,
                showCoords: false,
                showSectorLines: false,
                coordColor: '#000000',
                coordNumColor: '#000000',
                transparentColor: this.transparentCellColor.value,
                beadScale: parseInt(this.beadScaleSlider.value) / 100
            }
        );

        this.customEditInfo.textContent = `${this.maxRing}圈 / ${totalBeads}颗豆子`;
    }

    getCustomEditBead(e) {
        const rect = this.customEditCanvas.getBoundingClientRect();
        const cellSize = parseInt(this.beadSizeSlider.value);
        const padding = cellSize * 2;
        const maxRadius = (this.maxRing - 0.5) * cellSize;
        const canvasSize = (maxRadius + cellSize) * 2 + padding * 2;
        const center = canvasSize / 2;

        const x = e.clientX - rect.left - center;
        const y = e.clientY - rect.top - center;

        return this.circularGenerator.findNearestBead(x, y, this.maxRing, cellSize);
    }

    handleCustomEditMouseDown(e) {
        if (!this.customEditData) return;

        const { index } = this.getCustomEditBead(e);

        if (this.currentEditTool === 'fill') {
            this.applyFillTool(index);
            this.saveCustomEditHistory();
            return;
        }

        if (this.currentEditTool === 'picker') {
            const color = this.customEditData[index];
            if (!color.isTransparent) {
                const hex = this.rgbToHex(color.rgb[0], color.rgb[1], color.rgb[2]);
                this.customEditColor.value = hex;
                this.currentColorValue.textContent = hex;
            }
            return;
        }

        this.isDrawing = true;
        this.applyEditToBead(index);
    }

    handleCustomEditMouseMove(e) {
        if (!this.isDrawing || !this.customEditData) return;
        if (this.currentEditTool === 'fill' || this.currentEditTool === 'picker') return;

        const { index } = this.getCustomEditBead(e);
        this.applyEditToBead(index);
    }

    handleCustomEditMouseUp() {
        if (this.isDrawing && this.customEditData) {
            this.saveCustomEditHistory();
        }
        this.isDrawing = false;
    }

    applyEditToBead(index) {
        if (!this.customEditData || index < 0 || index >= this.customEditData.length) return;

        const brushSize = parseInt(this.customEditBrushSize.value);
        const beadIndices = this.getBeadsInRange(index, brushSize);

        if (this.currentEditTool === 'brush') {
            const hex = this.customEditColor.value;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const colorSet = colorSets[this.colorSetSelect.value] || [];
            const closestColor = findClosestColor([r, g, b], colorSet, this.colorMappingMethod.value);
            
            beadIndices.forEach(i => {
                this.customEditData[i] = { ...closestColor };
            });
        } else if (this.currentEditTool === 'eraser') {
            const transparentColor = {
                name: '',
                rgb: [255, 255, 255],
                isTransparent: true
            };
            beadIndices.forEach(i => {
                this.customEditData[i] = { ...transparentColor };
            });
        }

        this.renderCustomEditCanvas();
    }

    getBeadsInRange(centerIndex, range) {
        if (range <= 1) return [centerIndex];
        
        const visited = new Set();
        const result = [];
        const queue = [{ index: centerIndex, depth: 0 }];
        const cellSize = parseInt(this.beadSizeSlider.value);

        while (queue.length > 0) {
            const { index, depth } = queue.shift();
            if (visited.has(index)) continue;
            visited.add(index);
            result.push(index);

            if (depth < range - 1) {
                const neighbors = this.circularGenerator.getNeighborBeads(index, this.maxRing, cellSize);
                neighbors.forEach(n => {
                    if (!visited.has(n)) {
                        queue.push({ index: n, depth: depth + 1 });
                    }
                });
            }
        }

        return result;
    }

    applyFillTool(startIndex) {
        if (!this.customEditData) return;

        const targetColor = this.customEditData[startIndex];
        const hex = this.customEditColor.value;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const colorSet = colorSets[this.colorSetSelect.value] || [];
        const fillColor = findClosestColor([r, g, b], colorSet, this.colorMappingMethod.value);

        if (this.colorsEqual(targetColor, fillColor)) return;

        const cellSize = parseInt(this.beadSizeSlider.value);
        const visited = new Set();
        const stack = [startIndex];

        while (stack.length > 0) {
            const index = stack.pop();
            if (visited.has(index)) continue;
            visited.add(index);

            if (!this.colorsEqual(this.customEditData[index], targetColor)) continue;

            this.customEditData[index] = { ...fillColor };

            const neighbors = this.circularGenerator.getNeighborBeads(index, this.maxRing, cellSize);
            neighbors.forEach(n => {
                if (!visited.has(n)) {
                    stack.push(n);
                }
            });
        }

        this.renderCustomEditCanvas();
    }

    colorsEqual(c1, c2) {
        if (c1.isTransparent && c2.isTransparent) return true;
        if (c1.isTransparent || c2.isTransparent) return false;
        return c1.rgb[0] === c2.rgb[0] && c1.rgb[1] === c2.rgb[1] && c1.rgb[2] === c2.rgb[2];
    }

    saveCustomEditHistory() {
        if (!this.customEditData) return;

        this.customEditHistory = this.customEditHistory.slice(0, this.customEditHistoryIndex + 1);
        this.customEditHistory.push([...this.customEditData]);
        this.customEditHistoryIndex++;

        if (this.customEditHistory.length > 50) {
            this.customEditHistory.shift();
            this.customEditHistoryIndex--;
        }
    }

    undoCustomEdit() {
        if (this.customEditHistoryIndex <= 0) return;

        this.customEditHistoryIndex--;
        this.customEditData = [...this.customEditHistory[this.customEditHistoryIndex]];
        this.renderCustomEditCanvas();
    }

    applyCustomEdit() {
        if (!this.customEditData) return;

        this.circularPerlerColors = [...this.customEditData];
        this.refreshPerlerChartDisplay();
        this.saveUnifiedSnapshot('custom', '应用编辑');
    }

    adjustRings(newMaxRing) {
        if (newMaxRing < 1) newMaxRing = 1;
        if (newMaxRing > 200) newMaxRing = 200;
        
        const oldMaxRing = this.maxRing;
        const oldTotalBeads = this.circularGenerator.getTotalBeads(oldMaxRing);
        const newTotalBeads = this.circularGenerator.getTotalBeads(newMaxRing);
        
        this.maxRing = newMaxRing;
        this.ringCountInput.value = newMaxRing;
        
        if (this.canvasBoundsRings) {
            this.canvasBoundsRings.value = newMaxRing;
        }
        
        const cellSize = parseInt(this.beadSizeSlider.value);
        const newPositions = [];
        for (let i = 0; i < newTotalBeads; i++) {
            const pos = this.circularGenerator.getBeadPosition(i, newMaxRing);
            const cartesian = this.circularGenerator.polarToCartesian(pos.ring, pos.sector, pos.pos, cellSize);
            newPositions.push({ ...cartesian, ...pos, index: i });
        }
        this.beadPositions = newPositions;
        
        if (this.customEditData) {
            const transparentColor = {
                name: '',
                rgb: [255, 255, 255],
                isTransparent: true
            };
            
            const newData = [];
            for (let i = 0; i < newTotalBeads; i++) {
                if (i < oldTotalBeads) {
                    newData.push({ ...this.customEditData[i] });
                } else {
                    newData.push({ ...transparentColor });
                }
            }
            this.customEditData = newData;
            this.saveCustomEditHistory();
            this.renderCustomEditCanvas();
        }
        
        if (this.circularPerlerColors) {
            const transparentColor = {
                name: '',
                rgb: [255, 255, 255],
                isTransparent: true
            };
            
            const newColors = [];
            for (let i = 0; i < newTotalBeads; i++) {
                if (i < this.circularPerlerColors.length) {
                    newColors.push({ ...this.circularPerlerColors[i] });
                } else {
                    newColors.push({ ...transparentColor });
                }
            }
            this.circularPerlerColors = newColors;
            this.refreshPerlerChartDisplay();
        }
        
        this.updateTotalBeads();
        this.updateCanvasBoundsInfo();
        this.saveUnifiedSnapshot('custom', `调整环数为${this.maxRing}圈`);
    }

    updateCanvasBoundsInfo() {
        if (this.canvasBoundsCurrentSize) {
            const totalBeads = this.circularGenerator.getTotalBeads(this.maxRing);
            this.canvasBoundsCurrentSize.textContent = totalBeads;
        }
    }

    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    updateTotalBeads() {
        const total = this.circularGenerator.getTotalBeads(this.maxRing);
        if (this.totalBeadsValue) {
            this.totalBeadsValue.textContent = `${total} 颗`;
        }
        return total;
    }

    toggleCropMode() {
        if (this.isCropMode) {
            this.cancelCrop();
        } else {
            this.isCropMode = true;
            this.cropBtn.style.display = 'none';
            this.resetCropBtn.style.display = 'inline-block';
            this.confirmCropBtn.style.display = 'inline-block';
            this.cancelCropBtn.style.display = 'inline-block';

            const wrapperRect = this.cropOverlay.parentElement.getBoundingClientRect();
            const canvasRect = this.originalCanvas.getBoundingClientRect();
            const offsetX = canvasRect.left - wrapperRect.left;
            const offsetY = canvasRect.top - wrapperRect.top;
            const canvasW = canvasRect.width;
            const canvasH = canvasRect.height;

            this.cropOverlay.style.display = 'block';
            this.cropOverlay.style.left = offsetX + 'px';
            this.cropOverlay.style.top = offsetY + 'px';
            this.cropOverlay.style.width = canvasW + 'px';
            this.cropOverlay.style.height = canvasH + 'px';
            this.cropOverlay.style.right = 'auto';
            this.cropOverlay.style.bottom = 'auto';

            this.setCropBox(0, 0, canvasW, canvasH);
            this.cropBox.style.display = 'block';
        }
    }

    setCropBox(x, y, w, h) {
        const overlayRect = this.cropOverlay.getBoundingClientRect();
        const maxW = overlayRect.width;
        const maxH = overlayRect.height;
        x = Math.max(0, Math.min(x, maxW - 20));
        y = Math.max(0, Math.min(y, maxH - 20));
        w = Math.max(20, Math.min(w, maxW - x));
        h = Math.max(20, Math.min(h, maxH - y));
        this.cropBox.style.left = x + 'px';
        this.cropBox.style.top = y + 'px';
        this.cropBox.style.width = w + 'px';
        this.cropBox.style.height = h + 'px';
    }

    getCropBoxRect() {
        const overlayRect = this.cropOverlay.getBoundingClientRect();
        const boxRect = this.cropBox.getBoundingClientRect();
        return {
            left: boxRect.left - overlayRect.left,
            top: boxRect.top - overlayRect.top,
            width: boxRect.width,
            height: boxRect.height,
            right: boxRect.right - overlayRect.left,
            bottom: boxRect.bottom - overlayRect.top
        };
    }

    getCropEventPos(e) {
        const overlayRect = this.cropOverlay.getBoundingClientRect();
        return {
            x: e.clientX - overlayRect.left,
            y: e.clientY - overlayRect.top,
            containerW: overlayRect.width,
            containerH: overlayRect.height
        };
    }

    cropMouseDown(e) {
        const pos = this.getCropEventPos(e);
        const handle = e.target.getAttribute && e.target.getAttribute('data-handle');
        if (handle) {
            this.isResizingCrop = true;
            this.activeHandle = handle;
            this.cropStartX = pos.x;
            this.cropStartY = pos.y;
            this.initialCropBox = this.getCropBoxRect();
        } else if (e.target === this.cropBox) {
            this.isDraggingCrop = true;
            this.cropStartX = pos.x;
            this.cropStartY = pos.y;
            this.initialCropBox = this.getCropBoxRect();
        } else {
            this.isCreatingCrop = true;
            this.cropStartX = pos.x;
            this.cropStartY = pos.y;
            this.setCropBox(pos.x, pos.y, 1, 1);
        }
        e.preventDefault();
        e.stopPropagation();
    }

    cropMouseMove(e) {
        if (!this.isCropMode || (!this.isCreatingCrop && !this.isDraggingCrop && !this.isResizingCrop)) return;
        const pos = this.getCropEventPos(e);
        if (this.isCreatingCrop) {
            const x = Math.min(this.cropStartX, pos.x);
            const y = Math.min(this.cropStartY, pos.y);
            const w = Math.abs(pos.x - this.cropStartX);
            const h = Math.abs(pos.y - this.cropStartY);
            this.setCropBox(x, y, w, h);
        } else if (this.isDraggingCrop) {
            const dx = pos.x - this.cropStartX;
            const dy = pos.y - this.cropStartY;
            this.setCropBox(
                this.initialCropBox.left + dx,
                this.initialCropBox.top + dy,
                this.initialCropBox.width,
                this.initialCropBox.height
            );
        } else if (this.isResizingCrop) {
            const dx = pos.x - this.cropStartX;
            const dy = pos.y - this.cropStartY;
            let newX = this.initialCropBox.left;
            let newY = this.initialCropBox.top;
            let newW = this.initialCropBox.width;
            let newH = this.initialCropBox.height;
            const handle = this.activeHandle;
            if (handle.includes('w')) { newX = this.initialCropBox.left + dx; newW = this.initialCropBox.width - dx; }
            if (handle.includes('e')) { newW = this.initialCropBox.width + dx; }
            if (handle.includes('n')) { newY = this.initialCropBox.top + dy; newH = this.initialCropBox.height - dy; }
            if (handle.includes('s')) { newH = this.initialCropBox.height + dy; }
            if (newW < 20) { newX = this.initialCropBox.left; newW = 20; }
            if (newH < 20) { newY = this.initialCropBox.top; newH = 20; }
            this.setCropBox(newX, newY, newW, newH);
        }
        e.preventDefault();
    }

    cropMouseUp(e) {
        this.isCreatingCrop = false;
        this.isDraggingCrop = false;
        this.isResizingCrop = false;
        this.activeHandle = null;
        this.initialCropBox = null;
    }

    cropTouchStart(e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const mouseLikeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            target: e.target,
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation()
        };
        this.cropMouseDown(mouseLikeEvent);
    }

    cropTouchMove(e) {
        if (!this.isCropMode || e.touches.length !== 1) return;
        const touch = e.touches[0];
        const mouseLikeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => e.preventDefault()
        };
        this.cropMouseMove(mouseLikeEvent);
    }

    cropTouchEnd(e) {
        this.cropMouseUp(e);
    }

    confirmCrop() {
        const cropLeft = parseFloat(this.cropBox.style.left) * this.cropScaleX;
        const cropTop = parseFloat(this.cropBox.style.top) * this.cropScaleY;
        const cropWidth = parseFloat(this.cropBox.style.width) * this.cropScaleX;
        const cropHeight = parseFloat(this.cropBox.style.height) * this.cropScaleY;

        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = Math.round(cropWidth);
        croppedCanvas.height = Math.round(cropHeight);
        const ctx = croppedCanvas.getContext('2d');
        ctx.drawImage(
            this.originalImage,
            cropLeft, cropTop, cropWidth, cropHeight,
            0, 0, croppedCanvas.width, croppedCanvas.height
        );

        const croppedImg = new Image();
        croppedImg.onload = () => {
            this.originalImage = croppedImg;
            this.originalWidth = croppedImg.width;
            this.originalHeight = croppedImg.height;
            this.isCropped = true;

            const defaultWidth = Math.min(croppedImg.width, 512);
            const defaultHeight = Math.round(defaultWidth * (croppedImg.height / croppedImg.width));
            this.widthInput.value = defaultWidth;
            this.heightInput.value = defaultHeight;

            this.cancelCrop();
            this.renderOriginalImage();
            this.updatePixelatedImage();
        };
        croppedImg.src = croppedCanvas.toDataURL();
    }

    cancelCrop() {
        this.isCropMode = false;
        this.cropOverlay.style.display = 'none';
        this.cropOverlay.style.left = '';
        this.cropOverlay.style.top = '';
        this.cropOverlay.style.width = '';
        this.cropOverlay.style.height = '';
        this.cropBtn.style.display = 'inline-block';
        this.resetCropBtn.style.display = 'none';
        this.confirmCropBtn.style.display = 'none';
        this.cancelCropBtn.style.display = 'none';
    }

    resetToFullImage() {
        if (!this.fullOriginalImage) return;

        this.originalImage = this.fullOriginalImage;
        this.originalWidth = this.fullOriginalWidth;
        this.originalHeight = this.fullOriginalHeight;
        this.isCropped = false;

        const defaultWidth = Math.min(this.fullOriginalWidth, 512);
        const defaultHeight = Math.round(defaultWidth * (this.fullOriginalHeight / this.fullOriginalWidth));
        this.widthInput.value = defaultWidth;
        this.heightInput.value = defaultHeight;

        this.cancelCrop();
        this.renderOriginalImage();
        this.updatePixelatedImage();
    }

    clearAll() {
        this.originalImage = null;
        this.pixelatedData = null;
        this.perlerColors = null;
        this.circularPerlerColors = null;
        this.beadPositions = null;
        this.colorCounts = {};

        this.workspace.style.display = 'none';
        this.uploadSection.style.display = 'block';

        this.originalCanvas.width = 0;
        this.originalCanvas.height = 0;
        this.pixelatedCanvas.width = 0;
        this.pixelatedCanvas.height = 0;
        this.perlerCanvas.width = 0;
        this.perlerCanvas.height = 0;
        this.customEditCanvas.width = 0;
        this.customEditCanvas.height = 0;
    }

    resetAll() {
        if (!this.fullOriginalImage) return;

        this.originalImage = this.fullOriginalImage;
        this.originalWidth = this.fullOriginalWidth;
        this.originalHeight = this.fullOriginalHeight;
        this.isCropped = false;

        this.widthInput.value = this.fullOriginalWidth;
        this.heightInput.value = this.fullOriginalHeight;

        this.renderOriginalImage();
        this.updatePixelatedImage();
    }

    saveUnifiedSnapshot(type, description = '', data = null) {
        let perlerColors;
        let maxRing;

        if (data && data.colors) {
            perlerColors = data.colors;
            maxRing = data.maxRing;
        } else if (type === 'custom' && this.customEditData) {
            perlerColors = this.customEditData;
            maxRing = this.maxRing;
        } else if (this.circularPerlerColors) {
            perlerColors = this.circularPerlerColors;
            maxRing = this.maxRing;
        } else {
            return;
        }

        const lastSnapshotOfType = this.unifiedSnapshots
            .slice()
            .reverse()
            .find(s => s.type === type);
        
        if (lastSnapshotOfType) {
            let isEqual = true;
            if (lastSnapshotOfType.maxRing === maxRing && lastSnapshotOfType.data.length === perlerColors.length) {
                for (let i = 0; i < perlerColors.length; i++) {
                    const c1 = perlerColors[i];
                    const c2 = lastSnapshotOfType.data[i];
                    
                    if ((c1.isTransparent !== c2.isTransparent) ||
                        (c1.name !== c2.name) ||
                        (JSON.stringify(c1.rgb) !== JSON.stringify(c2.rgb))) {
                        isEqual = false;
                        break;
                    }
                }
            } else {
                isEqual = false;
            }
            
            if (isEqual) {
                return;
            }
        }
        
        const snapshotId = Date.now();
        const timestamp = new Date().toLocaleString();
        
        const colorCounts = {};
        let totalBeans = 0;
        perlerColors.forEach(color => {
            if (!color.isTransparent) {
                const name = color.name || 'unknown';
                colorCounts[name] = (colorCounts[name] || 0) + 1;
                totalBeans++;
            }
        });
        const colorCount = Object.keys(colorCounts).length;
        
        let colorChange = null;
        let beansChange = null;
        if (this.unifiedSnapshots.length > 0) {
            const lastSnapshot = this.unifiedSnapshots[this.unifiedSnapshots.length - 1];
            colorChange = colorCount - lastSnapshot.colorCount;
            beansChange = totalBeans - lastSnapshot.totalBeans;
        }
        
        this.unifiedSnapshots.push({
            id: snapshotId,
            type,
            timestamp,
            colorCount,
            totalBeans,
            colorChange,
            beansChange,
            maxRing,
            description,
            data: [...perlerColors]
        });
        
        if (this.unifiedSnapshots.length > 50) {
            this.unifiedSnapshots.shift();
        }
        
        this.renderUnifiedSnapshotsList();
    }
    
    renderUnifiedSnapshotsList() {
        if (!this.snapshotsContainer) return;
        
        this.snapshotsContainer.innerHTML = '';
        
        if (this.unifiedSnapshots.length === 0) {
            this.snapshotsContainer.innerHTML = `
                <div style="text-align: center; color: #999; padding: 40px 20px;">
                    暂无操作历史
                </div>
            `;
            return;
        }
        
        const reversedSnapshots = [...this.unifiedSnapshots].reverse();
        
        reversedSnapshots.forEach((snapshot, index) => {
            const realIndex = this.unifiedSnapshots.length - 1 - index;
            const typeLabels = {
                initial: '初始生成',
                smart: '智能优化',
                custom: '自定义编辑'
            };
            const typeLabel = typeLabels[snapshot.type] || snapshot.type;
            
            const changeText = snapshot.beansChange !== null ? 
                (snapshot.beansChange > 0 ? `+${snapshot.beansChange}` : snapshot.beansChange) + '颗' : 
                '-';
            
            const colorChangeText = snapshot.colorChange !== null ?
                (snapshot.colorChange > 0 ? `+${snapshot.colorChange}` : snapshot.colorChange) + '色' :
                '-';
            
            const snapshotItem = document.createElement('div');
            snapshotItem.className = 'snapshot-item';
            snapshotItem.innerHTML = `
                <div class="snapshot-type-badge">${typeLabel}</div>
                <div class="snapshot-info">
                    <div class="snapshot-time">${snapshot.timestamp}</div>
                    <div class="snapshot-stats">
                        <span>${snapshot.maxRing}圈 / ${snapshot.totalBeans}颗</span>
                        <span>${snapshot.colorCount}色</span>
                    </div>
                    ${snapshot.description ? `<div class="snapshot-desc">${snapshot.description}</div>` : ''}
                </div>
                <div class="snapshot-changes">
                    <div>豆子: ${changeText}</div>
                    <div>颜色: ${colorChangeText}</div>
                </div>
                <div class="snapshot-actions">
                    <button class="btn btn-sm btn-primary restore-btn" data-index="${realIndex}">恢复</button>
                    <button class="btn btn-sm btn-danger delete-btn" data-index="${realIndex}">删除</button>
                </div>
            `;
            
            const restoreBtn = snapshotItem.querySelector('.restore-btn');
            const deleteBtn = snapshotItem.querySelector('.delete-btn');
            
            restoreBtn.addEventListener('click', () => {
                this.restoreSnapshot(realIndex);
            });
            
            deleteBtn.addEventListener('click', () => {
                this.deleteSnapshot(realIndex);
            });
            
            this.snapshotsContainer.appendChild(snapshotItem);
        });
    }
    
    restoreSnapshot(index) {
        const snapshot = this.unifiedSnapshots[index];
        if (!snapshot) return;
        
        this.maxRing = snapshot.maxRing;
        this.ringCountInput.value = snapshot.maxRing;
        if (this.canvasBoundsRings) {
            this.canvasBoundsRings.value = snapshot.maxRing;
        }
        
        this.circularPerlerColors = [...snapshot.data];
        
        const cellSize = parseInt(this.beadSizeSlider.value);
        const totalBeads = this.updateTotalBeads();
        
        const newPositions = [];
        for (let i = 0; i < totalBeads; i++) {
            const pos = this.circularGenerator.getBeadPosition(i, this.maxRing);
            const cartesian = this.circularGenerator.polarToCartesian(pos.ring, pos.sector, pos.pos, cellSize);
            newPositions.push({ ...cartesian, ...pos, index: i });
        }
        this.beadPositions = newPositions;
        
        this.refreshPerlerChartDisplay();
        
        this.customEditData = [...snapshot.data];
        this.customEditHistory = [];
        this.customEditHistoryIndex = -1;
        this.saveCustomEditHistory();
        this.renderCustomEditCanvas();
        
        this.customEditInfo.textContent = `${this.maxRing}圈 / ${totalBeads}颗豆子`;
        this.updateCanvasBoundsInfo();
    }
    
    deleteSnapshot(index) {
        this.unifiedSnapshots.splice(index, 1);
        this.renderUnifiedSnapshotsList();
    }
    
    toggleSnapshotPanel() {
        if (this.snapshotPanel.classList.contains('show')) {
            this.snapshotPanel.classList.remove('show');
        } else {
            this.snapshotPanel.classList.add('show');
        }
    }

    updateColorCounts() {
        this.colorCounts = {};
        if (!this.circularPerlerColors) return;
        
        for (let i = 0; i < this.circularPerlerColors.length; i++) {
            const color = this.circularPerlerColors[i];
            if (!color.isTransparent && color.name) {
                if (this.colorCounts[color.name]) {
                    this.colorCounts[color.name]++;
                } else {
                    this.colorCounts[color.name] = 1;
                }
            }
        }
    }

    drawColorLegend() {
        if (!this.colorLegendArea || !this.legendPosition) return;
        
        const position = this.legendPosition.value;
        
        const existingLegend = document.getElementById('colorLegend');
        if (existingLegend) {
            existingLegend.remove();
        }
        this.colorLegendArea.innerHTML = '';
        
        if (position === 'hidden') {
            if (this.perlerContent) {
                this.perlerContent.style.flexDirection = 'column';
                this.perlerContent.style.gap = '0px';
            }
            return;
        }
        
        if (!this.circularPerlerColors || Object.keys(this.colorCounts).length === 0) return;
        
        const legendCanvas = document.createElement('canvas');
        const legendCtx = legendCanvas.getContext('2d');
        const colorNames = Object.keys(this.colorCounts).sort();
        
        const totalBeans = Object.values(this.colorCounts).reduce((a, b) => a + b, 0);
        const colorTypes = colorNames.length;
        const cellSize = parseInt(this.beadSizeSlider.value);
        const padding = cellSize * 2;
        const maxRadius = (this.maxRing - 0.5) * cellSize;
        const chartWidth = (maxRadius + cellSize) * 2 + padding * 2;
        const chartHeight = chartWidth;
        
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
        legendCtx.fillText('颜色统计', 8, 18);
        
        legendCtx.font = 'bold 12px sans-serif';
        legendCtx.fillStyle = '#333';
        legendCtx.fillText(`总豆子: ${totalBeans} 颗 · 颜色数: ${colorTypes}`, 8, 36);
        
        let col = 0, row = 0;
        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName] || [];
        
        for (const name of colorNames) {
            const count = this.colorCounts[name];
            const color = colorSet.find(c => c.name === name);
            
            const x = 8 + col * columnWidth;
            const y = 50 + row * rowHeight;
            
            if (color) {
                legendCtx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                legendCtx.fillRect(x, y, rectWidth, rectHeight);
                legendCtx.strokeStyle = '#999';
                legendCtx.strokeRect(x, y, rectWidth, rectHeight);
                
                const textColor = this.getContrastTextColor(color.rgb);
                legendCtx.fillStyle = textColor;
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
            this.colorLegendArea.classList.add('horizontal');
            if (this.perlerContent) {
                this.perlerContent.style.flexDirection = 'row';
                this.perlerContent.style.gap = '20px';
            }
            this.colorLegendArea.style.flexDirection = 'column';
            this.colorLegendArea.style.alignItems = 'flex-start';
        } else {
            legendDiv.classList.remove('horizontal');
            this.colorLegendArea.classList.remove('horizontal');
            if (this.perlerContent) {
                this.perlerContent.style.flexDirection = 'column';
                this.perlerContent.style.gap = '0px';
            }
        }
        
        this.colorLegendArea.appendChild(legendDiv);
    }

    getContrastTextColor(rgb) {
        const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    }

    downloadPerlerChart() {
        const format = this.exportFormatSelect ? this.exportFormatSelect.value : 'png';
        
        if (format === 'svg') {
            this.downloadCircularPerlerSVG();
        } else {
            this.downloadCircularPerlerPNG();
        }
    }

    downloadCircularPerlerPNG() {
        this.updateColorCounts();
        const cellSize = parseInt(this.exportBeadSizeSlider.value);
        const totalBeads = this.updateTotalBeads();
        
        const chartCanvas = document.createElement('canvas');
        
        const padding = cellSize * 2;
        const maxRadius = (this.maxRing - 0.5) * cellSize;
        const canvasSize = (maxRadius + cellSize) * 2 + padding * 2;
        
        const exportBeadPositions = [];
        for (let i = 0; i < totalBeads; i++) {
            const pos = this.circularGenerator.getBeadPosition(i, this.maxRing);
            const cartesian = this.circularGenerator.polarToCartesian(pos.ring, pos.sector, pos.pos, cellSize);
            exportBeadPositions.push({ ...cartesian, ...pos, index: i });
        }
        
        this.canvasRenderer.renderCircularChart(
            chartCanvas,
            this.circularPerlerColors,
            exportBeadPositions,
            this.maxRing,
            totalBeads,
            {
                cellSize: cellSize,
                chartStyle: this.chartStyle.value,
                beadShape: this.beadShape.value,
                showGrid: this.showGridLines.checked,
                showCoords: this.showCoordNumbers.checked,
                showSectorLines: this.showSectorLines,
                coordColor: this.coordLineColor.value,
                coordNumColor: this.coordNumberColor.value,
                transparentColor: this.transparentCellColor.value,
                watermarkText: this.watermarkText.value,
                beadScale: parseInt(this.beadScaleSlider.value) / 100
            }
        );
        
        let legendHeight = 0;
        let legendWidth = 0;
        const position = this.legendPosition ? this.legendPosition.value : 'bottom';
        
        if (position !== 'hidden' && Object.keys(this.colorCounts).length > 0) {
            const colorNames = Object.keys(this.colorCounts).sort();
            const rectWidth = 120;
            const rectHeight = 28;
            const rowHeight = rectHeight + 5;
            const columnWidth = rectWidth + 10;
            
            if (position === 'right') {
                const availableHeight = canvasSize - 60;
                const maxItemsPerColumn = Math.max(1, Math.floor(availableHeight / rowHeight));
                const columns = Math.min(Math.ceil(colorNames.length / maxItemsPerColumn), 4);
                legendWidth = columns * columnWidth + 40;
            } else {
                const maxWidth = canvasSize - 20;
                const columns = Math.max(1, Math.min(Math.floor(maxWidth / columnWidth), Math.ceil(colorNames.length / 1)));
                const itemsPerColumn = Math.ceil(colorNames.length / columns);
                legendHeight = 60 + itemsPerColumn * rowHeight + 30;
            }
        }
        
        let totalWidth = canvasSize + (position === 'right' ? legendWidth : 0);
        let totalHeight = canvasSize + (position === 'bottom' ? legendHeight : 0);
        
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = totalWidth;
        tempCanvas.height = totalHeight;
        
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, totalWidth, totalHeight);
        
        tempCtx.drawImage(chartCanvas, 0, 0);
        
        if (position !== 'hidden' && Object.keys(this.colorCounts).length > 0) {
            this.drawColorLegendToCanvas(tempCtx, 
                position === 'right' ? canvasSize + 10 : 10, 
                position === 'bottom' ? canvasSize + 10 : 10,
                position === 'right' ? legendWidth - 20 : canvasSize - 20
            );
        }
        
        const colorSetName = this.colorSetSelect.value;
        let fileName = `圆形拼豆图纸_${colorSetName}_${this.maxRing}圈`;
        fileName += '.png';
        
        const link = document.createElement('a');
        link.download = fileName;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }

    drawColorLegendToCanvas(ctx, x, y, maxWidth) {
        const colorNames = Object.keys(this.colorCounts).sort();
        const totalBeans = Object.values(this.colorCounts).reduce((a, b) => a + b, 0);
        const colorTypes = colorNames.length;
        
        const rectWidth = 120;
        const rectHeight = 28;
        const rowHeight = rectHeight + 5;
        const columnWidth = rectWidth + 10;
        
        const columns = Math.max(1, Math.min(Math.floor(maxWidth / columnWidth), Math.ceil(colorNames.length / 1)));
        const itemsPerColumn = Math.ceil(colorNames.length / columns);
        
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#667eea';
        ctx.textAlign = 'left';
        ctx.fillText('颜色统计', x, y + 18);
        
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#333';
        ctx.fillText(`总豆子: ${totalBeans} 颗 · 颜色数: ${colorTypes}`, x, y + 36);
        
        let col = 0, row = 0;
        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName] || [];
        
        for (const name of colorNames) {
            const count = this.colorCounts[name];
            const color = colorSet.find(c => c.name === name);
            
            const rectX = x + col * columnWidth;
            const rectY = y + 50 + row * rowHeight;
            
            if (color) {
                ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
                ctx.strokeStyle = '#999';
                ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
                
                const textColor = this.getContrastTextColor(color.rgb);
                ctx.fillStyle = textColor;
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${name} x ${count}`, rectX + rectWidth / 2, rectY + rectHeight / 2);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            }
            
            row++;
            if (row >= itemsPerColumn) {
                row = 0;
                col++;
            }
        }
    }

    downloadCircularPerlerSVG() {
        this.updateColorCounts();
        const cellSize = parseInt(this.exportBeadSizeSlider.value);
        const totalBeads = this.updateTotalBeads();
        
        const padding = cellSize * 2;
        const maxRadius = (this.maxRing - 0.5) * cellSize;
        const canvasSize = (maxRadius + cellSize) * 2 + padding * 2;
        const center = canvasSize / 2;
        
        const exportBeadPositions = [];
        for (let i = 0; i < totalBeads; i++) {
            const pos = this.circularGenerator.getBeadPosition(i, this.maxRing);
            const cartesian = this.circularGenerator.polarToCartesian(pos.ring, pos.sector, pos.pos, cellSize);
            exportBeadPositions.push({ ...cartesian, ...pos, index: i });
        }
        
        const position = this.legendPosition ? this.legendPosition.value : 'bottom';
        let legendHeight = 0;
        let legendWidth = 0;
        
        if (position !== 'hidden' && Object.keys(this.colorCounts).length > 0) {
            const colorNames = Object.keys(this.colorCounts).sort();
            const rectWidth = 120;
            const rectHeight = 28;
            const rowHeight = rectHeight + 5;
            const columnWidth = rectWidth + 10;
            
            if (position === 'right') {
                const availableHeight = canvasSize - 60;
                const maxItemsPerColumn = Math.max(1, Math.floor(availableHeight / rowHeight));
                const columns = Math.min(Math.ceil(colorNames.length / maxItemsPerColumn), 4);
                legendWidth = columns * columnWidth + 40;
            } else {
                const maxWidth = canvasSize - 20;
                const columns = Math.max(1, Math.min(Math.floor(maxWidth / columnWidth), Math.ceil(colorNames.length / 1)));
                const itemsPerColumn = Math.ceil(colorNames.length / columns);
                legendHeight = 60 + itemsPerColumn * rowHeight + 30;
            }
        }
        
        let totalWidth = canvasSize + (position === 'right' ? legendWidth : 0);
        let totalHeight = canvasSize + (position === 'bottom' ? legendHeight : 0);
        
        let svgParts = [];
        svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`);
        svgParts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
        
        if (this.showSectorLines) {
            svgParts.push(`<g stroke="#cccccc" stroke-width="2">`);
            for (let sector = 0; sector < 6; sector++) {
                const angle = sector * (Math.PI / 3);
                const x2 = center + (maxRadius + cellSize) * Math.cos(angle);
                const y2 = center + (maxRadius + cellSize) * Math.sin(angle);
                svgParts.push(`<line x1="${center}" y1="${center}" x2="${x2}" y2="${y2}"/>`);
            }
            svgParts.push(`</g>`);
        }
        
        if (this.showGridLines.checked) {
            svgParts.push(`<g stroke="#e0e0e0" stroke-width="${this.gridLineWidth.value}">`);
            for (let ring = 1; ring < this.maxRing; ring++) {
                const radius = ring * cellSize;
                svgParts.push(`<circle cx="${center}" cy="${center}" r="${radius}" fill="none"/>`);
            }
            svgParts.push(`</g>`);
        }
        
        for (let i = 0; i < totalBeads; i++) {
            const color = this.circularPerlerColors[i];
            const pos = exportBeadPositions[i];
            
            const px = center + pos.x - cellSize / 2;
            const py = center + pos.y - cellSize / 2;
            
            let fillColor;
            if (color.isTransparent) {
                fillColor = this.transparentCellColor.value;
            } else {
                fillColor = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
            }
            
            if (this.beadShape.value === 'circle' || this.beadShape.value === 'ring') {
                svgParts.push(`<circle cx="${px + cellSize / 2}" cy="${py + cellSize / 2}" r="${cellSize / 2 - 1}" fill="${fillColor}"/>`);
            } else if (this.beadShape.value === 'round-square') {
                const r = Math.min(8, Math.floor(cellSize * 0.2));
                const s = cellSize - 1;
                svgParts.push(`<rect x="${px}" y="${py}" width="${s}" height="${s}" rx="${r}" ry="${r}" fill="${fillColor}"/>`);
            } else {
                svgParts.push(`<rect x="${px}" y="${py}" width="${cellSize - 1}" height="${cellSize - 1}" fill="${fillColor}"/>`);
            }
        }
        
        if (position !== 'hidden' && Object.keys(this.colorCounts).length > 0) {
            const legendX = position === 'right' ? canvasSize + 10 : 10;
            const legendY = position === 'bottom' ? canvasSize + 10 : 10;
            const colorNames = Object.keys(this.colorCounts).sort();
            const totalBeans = Object.values(this.colorCounts).reduce((a, b) => a + b, 0);
            const colorTypes = colorNames.length;
            const rectWidth = 120;
            const rectHeight = 28;
            const rowHeight = rectHeight + 5;
            const columnWidth = rectWidth + 10;
            const colorSetName = this.colorSetSelect.value;
            const colorSet = colorSets[colorSetName] || [];
            
            let columns, itemsPerColumn;
            if (position === 'right') {
                const availableHeight = canvasSize - 60;
                const maxItemsPerColumn = Math.max(1, Math.floor(availableHeight / rowHeight));
                columns = Math.min(Math.ceil(colorNames.length / maxItemsPerColumn), 4);
                itemsPerColumn = Math.ceil(colorNames.length / columns);
            } else {
                const maxWidth = canvasSize - 20;
                columns = Math.max(1, Math.min(Math.floor(maxWidth / columnWidth), Math.ceil(colorNames.length / 1)));
                itemsPerColumn = Math.ceil(colorNames.length / columns);
            }
            
            svgParts.push(`<g>`);
            svgParts.push(`<text x="${legendX + 8}" y="${legendY + 18}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#667eea">颜色统计</text>`);
            svgParts.push(`<text x="${legendX + 8}" y="${legendY + 36}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#333">总豆子: ${totalBeans} 颗 · 颜色数: ${colorTypes}</text>`);
            
            let col = 0, row = 0;
            for (const name of colorNames) {
                const count = this.colorCounts[name];
                const color = colorSet.find(c => c.name === name);
                
                const x = legendX + 8 + col * columnWidth;
                const y = legendY + 50 + row * rowHeight;
                
                if (color) {
                    const textColor = this.getContrastTextColor(color.rgb);
                    svgParts.push(`<rect x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}" fill="rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})" stroke="#999"/>`);
                    svgParts.push(`<text x="${x + rectWidth / 2}" y="${y + rectHeight / 2 + 4}" font-family="sans-serif" font-size="11" font-weight="bold" fill="${textColor}" text-anchor="middle">${name} x ${count}</text>`);
                }
                
                row++;
                if (row >= itemsPerColumn) {
                    row = 0;
                    col++;
                }
            }
            svgParts.push(`</g>`);
        }
        
        svgParts.push(`</svg>`);
        
        const svgString = svgParts.join('\n');
        const colorSetName = this.colorSetSelect.value;
        let fileName = `圆形拼豆图纸_${colorSetName}_${this.maxRing}圈`;
        fileName += '.svg';
        
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.generator = new CircularPixelArtGenerator();
});