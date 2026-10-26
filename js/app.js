class PixelArtGenerator {
    constructor() {
        this.originalImage = null;
        this.originalWidth = 0;
        this.originalHeight = 0;
        this.fullOriginalImage = null; // 保存完整的原始图片（用于重置裁切）
        this.fullOriginalWidth = 0;
        this.fullOriginalHeight = 0;
        this.isCropped = false; // 是否已裁切过
        this.perlerMode = false;
        this.colorCounts = {};
        this.pixelColorStats = [];
        this.currentSort = 'count-desc';
        this.excludedColors = new Set();
        this.pixelatedData = null;
        this.unifiedSnapshots = [];
        
        // 导出计数器
        this.exportCounter = {
            pixelated: 0,
            perler: 0
        };
        
        // 雕刻分裂相关
        this.carveMode = false; // 是否在雕刻分裂模式
        this.carveBlocks = []; // 存储雕刻块
        this.selectedBlocks = new Set(); // 选中的块
        this.initialBlockSize = 200; // 初始块大小
        this.minBlockSize = 40; // 最小块大小
        this.originalImageData = null; // 缓存原图 imageData
        this.carveScale = 0.5; // 雕刻时的缩放比例
        this.showCarveGrid = true; // 是否显示分裂网格
        this.isBlankCanvasMode = false; // 是否在空白画布模式
        
        // CIEDE2000 优化参数
        this.cie2000OptimizedParams = {
            neighborhoodRadius: 1,
            colorDiffThreshold: 5,
            minRatio: 0.5,
            iterationCount: 1
        };
        
        // 版本号
        this.APP_VERSION = '1.2.18';
        
        // 初始化模块
        this.pixelator = new Pixelator();
        this.perlerGenerator = new PerlerGenerator();
        this.infoPaperManager = new InfoPaperManager();
        this.focusModeRenderer = new FocusModeRenderer();
        this.customEditor = new CustomEditor();
        this.selectionPanel = null;
        this.brushManager = null;
        this.brushPanel = null;
        this.customBrushes = []; // 存储导入的自定义画笔
        
        this.initElements();
        this.initEventListeners();
        // 延迟初始化示例区域，避免阻塞首屏渲染影响 LCP
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => this.initShowcase(), { timeout: 1000 });
        } else {
            setTimeout(() => this.initShowcase(), 100);
        }
    }

    initElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.blankCanvasArea = document.getElementById('blankCanvasArea');
        this.blankCanvasModal = document.getElementById('blankCanvasModal');
        this.blankCanvasWidth = document.getElementById('blankCanvasWidth');
        this.blankCanvasHeight = document.getElementById('blankCanvasHeight');
        this.closeBlankCanvasModalBtn = document.getElementById('closeBlankCanvasModalBtn');
        this.cancelBlankCanvasBtn = document.getElementById('cancelBlankCanvasBtn');
        this.confirmBlankCanvasBtn = document.getElementById('confirmBlankCanvasBtn');

        this.originalSection = document.getElementById('originalSection');
        this.pixelatedSection = document.getElementById('pixelatedSection');
        this.modeSwitch = document.getElementById('modeSwitch');
        this.customEditSection = document.getElementById('customEditSection');

        this.fileInput = document.getElementById('fileInput');
        this.uploadSection = document.getElementById('uploadSection');
        this.showcaseSection = document.getElementById('showcaseSection');
        this.showcaseGrid = document.getElementById('showcaseGrid');
        this.workspace = document.getElementById('workspace');
        this.perlerSection = document.getElementById('perlerSection');
        
        this.originalCanvas = document.getElementById('originalCanvas');
        this.originalCtx = this.originalCanvas.getContext('2d', { willReadFrequently: true });
        // 禁用所有 Canvas 的平滑插值
        this.originalCtx.imageSmoothingEnabled = false;
        this.originalCtx.mozImageSmoothingEnabled = false;
        this.originalCtx.webkitImageSmoothingEnabled = false;
        this.originalCtx.msImageSmoothingEnabled = false;
        
        this.pixelatedCanvas = document.getElementById('pixelatedCanvas');
        this.pixelatedCtx = this.pixelatedCanvas.getContext('2d', { willReadFrequently: true });
        // 禁用所有 Canvas 的平滑插值
        this.pixelatedCtx.imageSmoothingEnabled = false;
        this.pixelatedCtx.mozImageSmoothingEnabled = false;
        this.pixelatedCtx.webkitImageSmoothingEnabled = false;
        this.pixelatedCtx.msImageSmoothingEnabled = false;
        
        this.perlerCanvas = document.getElementById('perlerCanvas');
        this.perlerCtx = this.perlerCanvas.getContext('2d', { willReadFrequently: true });
        // 禁用所有 Canvas 的平滑插值
        this.perlerCtx.imageSmoothingEnabled = false;
        this.perlerCtx.mozImageSmoothingEnabled = false;
        this.perlerCtx.webkitImageSmoothingEnabled = false;
        this.perlerCtx.msImageSmoothingEnabled = false;
        
        this.originalSize = document.getElementById('originalSize');
        this.pixelatedSize = document.getElementById('pixelatedSize');
        this.pixelatedGridCount = document.getElementById('pixelatedGridCount');
        this.perlerSize = document.getElementById('perlerSize');

        // 裁切功能相关元素
        this.cropBtn = document.getElementById('cropBtn');
        this.resetCropBtn = document.getElementById('resetCropBtn');
        this.confirmCropBtn = document.getElementById('confirmCropBtn');
        this.cancelCropBtn = document.getElementById('cancelCropBtn');
        this.cropOverlay = document.getElementById('cropOverlay');
        this.cropBox = document.getElementById('cropBox');
        this.isCropMode = false;
        this.isCreatingCrop = false;
        this.isDraggingCrop = false;
        this.isResizingCrop = false;
        this.activeHandle = null;
        this.cropStartX = 0;
        this.cropStartY = 0;
        this.initialCropBox = null;
        
        // 旋转功能相关元素
        this.rotateControls = document.getElementById('rotateControls');
        this.rotateSlider = document.getElementById('rotateSlider');
        this.rotateValue = document.getElementById('rotateValue');
        this.rotate90Btn = document.getElementById('rotate90Btn');
        this.rotate180Btn = document.getElementById('rotate180Btn');
        this.rotate270Btn = document.getElementById('rotate270Btn');
        this.rotationAngle = 0; // 当前旋转角度
        
        this.pixelSizeSlider = document.getElementById('pixelSizeSlider');
        this.pixelSizeValue = document.getElementById('pixelSizeValue');
        
        this.widthInput = document.getElementById('widthInput');
        this.heightInput = document.getElementById('heightInput');
        this.keepRatioCheckbox = document.getElementById('keepRatioCheckbox');
        
        this.perlerContent = document.getElementById('perlerContent');
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
        this.showGridLines = document.getElementById('showGridLines');
        this.showCoordNumbers = document.getElementById('showCoordNumbers');
        this.coordLineColor = document.getElementById('coordLineColor');
        this.coordNumberColor = document.getElementById('coordNumberColor');
        this.showLargeGridLines = document.getElementById('showLargeGridLines');
        this.largeGridLineColor = document.getElementById('largeGridLineColor');
        this.largeGridSize = document.getElementById('largeGridSize');
        this.largeGridLineWidth = document.getElementById('largeGridLineWidth');
        this.gridLineWidth = document.getElementById('gridLineWidth');
        this.watermarkText = document.getElementById('watermarkText');
        
        this.simpleModeBtn = document.getElementById('simpleModeBtn');
        this.advancedModeBtn = document.getElementById('advancedModeBtn');
        
        this.clearBtn = document.getElementById('clearBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.downloadPerlerBtn = document.getElementById('downloadPerlerBtn');
        this.exportFormatSelect = document.getElementById('exportFormatSelect');
        this.exportInfoPaperCompressedBtn = document.getElementById('exportInfoPaperCompressedBtn');
        this.exportInfoPaperCompressedFileBtn = document.getElementById('exportInfoPaperCompressedFileBtn');
        this.importInfoPaperBtn = document.getElementById('importInfoPaperBtn');
        
        this.presetBtns = document.querySelectorAll('.preset-btn');
        
        this.langZh = document.getElementById('langZh');
        this.langEn = document.getElementById('langEn');
        
        this.enableContrast = document.getElementById('enableContrast');
        this.contrastSlider = document.getElementById('contrastSlider');
        this.contrastValue = document.getElementById('contrastValue');
        
        this.enableSharpen = document.getElementById('enableSharpen');
        this.sharpenSlider = document.getElementById('sharpenSlider');
        this.sharpenValue = document.getElementById('sharpenValue');
        
        this.enableColorQuantize = document.getElementById('enableColorQuantize');
        this.colorCountSlider = document.getElementById('colorCountSlider');
        this.colorCountValue = document.getElementById('colorCountValue');
        this.colorCountInput = document.getElementById('colorCountInput');
        this.imageTotalColors = document.getElementById('imageTotalColors');
        this.colorQuantizePanel = document.getElementById('colorQuantizePanel');
        this.colorUsageList = document.getElementById('colorUsageList');
        this.pixelMethod = document.getElementById('pixelMethod');
        this.targetColorCountSlider = document.getElementById('targetColorCountSlider');
        this.targetColorCountValue = document.getElementById('targetColorCountValue');
        this.targetColorCountInput = document.getElementById('targetColorCountInput');
        this.quantizedPixelControls = document.getElementById('quantizedPixelControls');
        this.enableNeighborSmooth = document.getElementById('enableNeighborSmooth');
        this.showPixelGrid = document.getElementById('showPixelGrid');
        this.pixelGridColor = document.getElementById('pixelGridColor');
        this.pixelGridOffsetX = document.getElementById('pixelGridOffsetX');
        this.pixelGridOffsetY = document.getElementById('pixelGridOffsetY');
        this.pixelGridOffsetXValue = document.getElementById('pixelGridOffsetXValue');
        this.pixelGridOffsetYValue = document.getElementById('pixelGridOffsetYValue');
        this.pixelGridLineWidth = document.getElementById('pixelGridLineWidth');
        this.pixelGridLineWidthValue = document.getElementById('pixelGridLineWidthValue');
        
        // 雕刻分裂相关元素
        this.pixelModeBtn = document.getElementById('pixelModeBtn');
        this.carveModeBtn = document.getElementById('carveModeBtn');
        this.carveControls = document.getElementById('carveControls');
        this.initialBlockSizeSlider = document.getElementById('initialBlockSizeSlider');
        this.initialBlockSizeValue = document.getElementById('initialBlockSizeValue');
        this.minBlockSizeSlider = document.getElementById('minBlockSizeSlider');
        this.minBlockSizeValue = document.getElementById('minBlockSizeValue');
        this.showCarveGridCheckbox = document.getElementById('showCarveGrid');
        this.resetCarveBtn = document.getElementById('resetCarveBtn');
        this.splitAllBtn = document.getElementById('splitAllBtn');
        this.mergeSelectedBtn = document.getElementById('mergeSelectedBtn');
        
        this.customEditCanvas = document.getElementById('customEditCanvas');
        this.customEditCtx = this.customEditCanvas.getContext('2d', { willReadFrequently: true });
        this.customEditInfo = document.getElementById('customEditInfo');
        
        // 初始化拼豆色板组件
        this.currentBeadColor = '#FAF4C8'; // 默认 A1 颜色
        this.currentBeadColorName = 'A1';
        this.beadPalette = null;
        
        const beadPaletteContainer = document.getElementById('beadPaletteContainer');
        if (beadPaletteContainer && typeof BeadPalette !== 'undefined') {
            this.beadPalette = new BeadPalette({
                container: '#beadPaletteContainer',
                colorSet: 'mard221',
                columns: 8,
                initialColor: 'A1',
                onSelect: (color) => {
                    this.currentBeadColor = color.hex;
                    this.currentBeadColorName = color.name;
                    this.refreshCustomEditBrushCursor();
                }
            });
        }
        
        this.customEditBrushSize = document.getElementById('customEditBrushSize');
        this.brushSizeValue = document.getElementById('brushSizeValue');
        this.applyCustomEditBtn = document.getElementById('applyCustomEditBtn');
        this.undoCustomEditBtn = document.getElementById('undoCustomEditBtn');
        this.eraserColor = document.getElementById('eraserColor');
        this.eraserColorValue = document.getElementById('eraserColorValue');
        this.razorBgColor = document.getElementById('razorBgColor');
        this.razorBgColorValue = document.getElementById('razorBgColorValue');
        this.chainRazorMax = document.getElementById('chainRazorMax');
        this.removeColorPicker = document.getElementById('removeColorPicker');
        this.removeColorValue = document.getElementById('removeColorValue');
        this.pickRemoveColorBtn = document.getElementById('pickRemoveColorBtn');
        this.removeColorBtn = document.getElementById('removeColorBtn');
        this.colorQuantizePanel = document.getElementById('colorQuantizePanel');
        this.colorQuantizePanelHeader = document.getElementById('colorQuantizePanelHeader');
        this.closeColorQuantizeBtn = document.getElementById('closeColorQuantizeBtn');
        this.quantizeColorList = document.getElementById('quantizeColorList');
        this.quantizeSelectAllBtn = document.getElementById('quantizeSelectAllBtn');
        this.quantizeSelectNoneBtn = document.getElementById('quantizeSelectNoneBtn');
        this.applyColorQuantizeBtn = document.getElementById('applyColorQuantizeBtn');
        this.quantizePickColorBtn = document.getElementById('quantizePickColorBtn');
        this.quantizePickMode = false;
        this.saveSnapshotBtn = document.getElementById('saveSnapshotBtn');
        this.snapshotsList = document.getElementById('snapshotsList');
        this.snapshotsContainer = document.getElementById('snapshotsContainer');
        this.flipHorizontalBtn = document.getElementById('flipHorizontalBtn');
        this.flipVerticalBtn = document.getElementById('flipVerticalBtn');
        this.exportTransparentBackground = document.getElementById('exportTransparentBackground');
        this.exportPixelImageBtn = document.getElementById('exportPixelImageBtn');
        
        // 悬浮快照按钮和面板
        this.snapshotFloatBtn = document.getElementById('snapshotFloatBtn');
        this.snapshotPanel = document.getElementById('snapshotPanel');
        this.closeSnapshotPanel = document.getElementById('closeSnapshotPanel');
        
        this.customEditData = null;
        this.customEditHistory = [];
        this.lastPerlerSignature = null;
        this.currentEditTool = 'brush';
        this.isDrawing = false;
        this.savedBrushSize = 1; // 保存原始的画笔大小
        this.pickRemoveColorMode = false; // 颜色剔除的取色模式
        
        this.smartOptimizeBtn = document.getElementById('smartOptimizeBtn');
        this.smartOptimizeModal = document.getElementById('smartOptimizeModal');
        this.closeModalBtn = document.getElementById('closeModalBtn');
        this.toggleFullscreenBtn = document.getElementById('toggleFullscreenBtn');
        this.isFullscreen = false;
        this.optimizationSummary = document.getElementById('optimizationSummary');
        this.suggestionsList = document.getElementById('suggestionsList');
        this.rejectAllBtn = document.getElementById('rejectAllBtn');
        this.applyAllBtn = document.getElementById('applyAllBtn');
        this.confirmBtn = document.getElementById('confirmBtn');
        this.optimizationPreviewCanvas = document.getElementById('optimizationPreviewCanvas');
        this.optimizationPreviewCtx = this.optimizationPreviewCanvas.getContext('2d');
        this.enableColorMerge = document.getElementById('enableColorMerge');
        this.colorMergeThresholdSlider = document.getElementById('colorMergeThresholdSlider');
        this.colorMergeThresholdValue = document.getElementById('colorMergeThresholdValue');
        this.enableEdgeColorMerge = document.getElementById('enableEdgeColorMerge');
        this.edgeColorThresholdSlider = document.getElementById('edgeColorThresholdSlider');
        this.edgeColorThresholdValue = document.getElementById('edgeColorThresholdValue');
        this.regenerateDebounceTimer = null;
        this.transparentColorDebounceTimer = null;
        
        this.pixelatedZoomSlider = document.getElementById('pixelatedZoomSlider');
        this.pixelatedZoomValue = document.getElementById('pixelatedZoomValue');
        this.perlerZoomSlider = document.getElementById('perlerZoomSlider');
        this.perlerZoomValue = document.getElementById('perlerZoomValue');
        
        this.pixelatedCanvasNaturalWidth = 0;
        this.pixelatedCanvasNaturalHeight = 0;
        this.perlerCanvasNaturalWidth = 0;
        this.perlerCanvasNaturalHeight = 0;
        this.pixelatedCanvasDisplayWidth = 0;
        this.pixelatedCanvasDisplayHeight = 0;
        this.perlerCanvasDisplayWidth = 0;
        this.perlerCanvasDisplayHeight = 0;
        
        this.colorConvertPanel = document.getElementById('colorConvertPanel');
        this.colorConvertPanelHeader = document.getElementById('colorConvertPanelHeader');
        this.closeColorConvertBtn = document.getElementById('closeColorConvertBtn');
        this.colorConvertSourceColor = document.getElementById('colorConvertSourceColor');
        this.colorConvertSourceColorValue = document.getElementById('colorConvertSourceColorValue');
        this.colorConvertTargetColor = document.getElementById('colorConvertTargetColor');
        this.colorConvertTargetColorValue = document.getElementById('colorConvertTargetColorValue');
        this.pickSourceColorBtn = document.getElementById('pickSourceColorBtn');
        this.pickTargetColorBtn = document.getElementById('pickTargetColorBtn');
        this.executeColorConvertBtn = document.getElementById('executeColorConvertBtn');

        this.colorConvertPickMode = null;
        this.colorConvertSourceIsTransparent = false;
        this.colorConvertTargetIsTransparent = false;
        this.colorConvertPanelDragState = null;
        
        this.exportScaleSlider = document.getElementById('exportScaleSlider');
        this.exportScaleValue = document.getElementById('exportScaleValue');
        this.exportScaleInput = document.getElementById('exportScaleInput');
        
        this.colorSuggestions = [];
        this.acceptedSuggestions = new Set();
        this.rejectedSuggestions = new Set();
        this.originalPerlerColors = null;
        
        // 画笔工具相关
        this.optimizeBrushSizeSlider = document.getElementById('optimizeBrushSizeSlider');
        this.optimizeBrushSizeValue = document.getElementById('optimizeBrushSizeValue');
        this.brushModeErase = document.getElementById('brushModeErase');
        this.brushModeRestore = document.getElementById('brushModeRestore');
        this.clearErasedBlocksBtn = document.getElementById('clearErasedBlocks');
        this.brushMode = 'erase'; // 'erase' 或 'restore'
        this.erasedBlocks = new Set(); // 存储被取消优化的方块，格式 "x,y"
        this.isDrawing = false;
        this.optimizationCellSize = 0; // 预览图中每个格子的大小
        this.optimizationCanvasWidth = 0;
        this.optimizationCanvasHeight = 0;
        this.brushCursor = document.getElementById('brushCursor');
        this.customEditBrushCursor = document.getElementById('customEditBrushCursor');
        this.customEditCellSize = 0;
        
        // 画布边界调整相关
        this.canvasBoundsLeftInput = document.getElementById('canvasBoundsLeft');
        this.canvasBoundsRightInput = document.getElementById('canvasBoundsRight');
        this.canvasBoundsTopInput = document.getElementById('canvasBoundsTop');
        this.canvasBoundsBottomInput = document.getElementById('canvasBoundsBottom');
        this.canvasBoundsCurrentSize = document.getElementById('canvasBoundsCurrentSize');
        this.canvasBoundsControls = document.getElementById('canvasBoundsControls');
        this.canvasBoundsHandles = document.getElementById('canvasBoundsHandles');
        this.resetCanvasBoundsBtn = document.getElementById('resetCanvasBoundsBtn');
        
        // 描边工具（浮动面板版）
        this.strokePanel = document.getElementById('strokePanel');
        this.strokePanelHeader = document.getElementById('strokePanelHeader');
        this.closeStrokePanelBtn = document.getElementById('closeStrokePanelBtn');
        this.strokeColor = document.getElementById('strokeColor');
        this.strokeColorValue = document.getElementById('strokeColorValue');
        this.strokeThickness = document.getElementById('strokeThickness');
        this.strokeThicknessValue = document.getElementById('strokeThicknessValue');
        this.executeStrokeBtn = document.getElementById('executeStrokeBtn');

        // 颜色剔除工具（浮动面板版）
        this.colorRemovePanel = document.getElementById('colorRemovePanel');
        this.colorRemovePanelHeader = document.getElementById('colorRemovePanelHeader');
        this.closeColorRemoveBtn = document.getElementById('closeColorRemoveBtn');
        
        // 杂色过滤工具（浮动面板版）
        this.noiseFilterPanel = document.getElementById('noiseFilterPanel');
        this.noiseFilterPanelHeader = document.getElementById('noiseFilterPanelHeader');
        this.closeNoiseFilterBtn = document.getElementById('closeNoiseFilterBtn');
        this.noiseFilterThresholdSlider = document.getElementById('noiseFilterThresholdSlider');
        this.noiseFilterThresholdValue = document.getElementById('noiseFilterThresholdValue');
        this.applyNoiseFilterBtn = document.getElementById('applyNoiseFilterBtn');
        
        this.canvasBounds = null;
        this.isDraggingCanvasBounds = false;
        this.draggingHandle = null;
        this.optimizeHighlightColor = document.getElementById('optimizeHighlightColor');
        this.optimizeErasedColor = document.getElementById('optimizeErasedColor');
        
        const savedLang = localStorage.getItem('beadMasterLang') || 'zh';
        setLanguage(savedLang);
        
        const displaySize = parseInt(this.beadSizeSlider.value);
        let exportSize = displaySize * 2;
        exportSize = Math.max(3, Math.min(96, exportSize));
        this.exportBeadSizeSlider.value = exportSize;
        this.exportBeadSizeValue.textContent = exportSize + 'px';
        
        this.quantizedPixelControls.style.display = this.pixelMethod.value === 'quantized' ? 'block' : 'none';
        
        const versionBadge = document.getElementById('versionBadge');
        if (versionBadge) {
            versionBadge.textContent = `v${this.APP_VERSION}`;
        }
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

        if (this.blankCanvasArea) {
            this.blankCanvasArea.addEventListener('click', () => this.openBlankCanvasModal());
        }
        if (this.closeBlankCanvasModalBtn) {
            this.closeBlankCanvasModalBtn.addEventListener('click', () => this.closeBlankCanvasModal());
        }
        if (this.cancelBlankCanvasBtn) {
            this.cancelBlankCanvasBtn.addEventListener('click', () => this.closeBlankCanvasModal());
        }
        if (this.confirmBlankCanvasBtn) {
            this.confirmBlankCanvasBtn.addEventListener('click', () => {
                const width = parseInt(this.blankCanvasWidth.value);
                const height = parseInt(this.blankCanvasHeight.value);
                this.createBlankCanvas(width, height);
            });
        }
        document.querySelectorAll('.blank-size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.blank-size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const w = parseInt(btn.dataset.width);
                const h = parseInt(btn.dataset.height);
                this.blankCanvasWidth.value = w;
                this.blankCanvasHeight.value = h;
                this.createBlankCanvas(w, h);
            });
        });
        if (this.blankCanvasModal) {
            this.blankCanvasModal.addEventListener('click', (e) => {
                if (e.target === this.blankCanvasModal) {
                    this.closeBlankCanvasModal();
                }
            });
        }

        // 裁切功能按钮
        this.cropBtn.addEventListener('click', () => this.toggleCropMode());
        this.confirmCropBtn.addEventListener('click', () => this.confirmCrop());
        this.cancelCropBtn.addEventListener('click', () => this.cancelCrop());
        this.resetCropBtn.addEventListener('click', () => this.resetToFullImage());

        // 旋转功能事件绑定
        if (this.rotateSlider) {
            this.rotateSlider.addEventListener('input', () => {
                this.setRotationAngle(parseInt(this.rotateSlider.value));
            });
        }
        if (this.rotate90Btn) {
            this.rotate90Btn.addEventListener('click', () => {
                this.setRotationAngle((this.rotationAngle + 90) % 360);
            });
        }
        if (this.rotate180Btn) {
            this.rotate180Btn.addEventListener('click', () => {
                this.setRotationAngle((this.rotationAngle + 180) % 360);
            });
        }
        if (this.rotate270Btn) {
            this.rotate270Btn.addEventListener('click', () => {
                this.setRotationAngle((this.rotationAngle + 270) % 360);
            });
        }

        // 裁切选框交互
        this.cropOverlay.addEventListener('mousedown', (e) => this.cropMouseDown(e));
        this.cropOverlay.addEventListener('touchstart', (e) => this.cropTouchStart(e), { passive: false });
        document.addEventListener('mousemove', (e) => this.cropMouseMove(e));
        document.addEventListener('touchmove', (e) => this.cropTouchMove(e), { passive: false });
        document.addEventListener('mouseup', (e) => this.cropMouseUp(e));
        document.addEventListener('touchend', (e) => this.cropTouchEnd(e));
        
        this.langZh.addEventListener('click', () => setLanguage('zh'));
        this.langEn.addEventListener('click', () => setLanguage('en'));
        
        this.pixelSizeSlider.addEventListener('input', () => {
            this.pixelSizeValue.textContent = this.pixelSizeSlider.value + 'px';
            this.updatePixelatedImage();
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
        
        this.colorSetSelect.addEventListener('change', () => this.showPerlerPlaceholder());
        
        // CIEDE2000 优化参数面板交互
        this.cie2000SettingsBtn = document.getElementById('cie2000SettingsBtn');
        this.cie2000ParamsPanel = document.getElementById('cie2000ParamsPanel');
        this.cie2000Radius = document.getElementById('cie2000Radius');
        this.cie2000RadiusValue = document.getElementById('cie2000RadiusValue');
        this.cie2000Threshold = document.getElementById('cie2000Threshold');
        this.cie2000ThresholdValue = document.getElementById('cie2000ThresholdValue');
        this.cie2000Ratio = document.getElementById('cie2000Ratio');
        this.cie2000RatioValue = document.getElementById('cie2000RatioValue');
        this.cie2000Iteration = document.getElementById('cie2000Iteration');
        this.cie2000IterationValue = document.getElementById('cie2000IterationValue');
        this.cie2000ApplyBtn = document.getElementById('cie2000ApplyBtn');
        this.cie2000ResetBtn = document.getElementById('cie2000ResetBtn');

        if (this.colorMappingMethod) {
            this.colorMappingMethod.addEventListener('change', () => {
                if (this.cie2000SettingsBtn && this.cie2000ParamsPanel) {
                    if (this.colorMappingMethod.value === 'cie2000-smoothed') {
                        this.cie2000SettingsBtn.style.display = 'inline-block';
                    } else {
                        this.cie2000SettingsBtn.style.display = 'none';
                        this.cie2000ParamsPanel.style.display = 'none';
                    }
                }
            });
        }

        if (this.cie2000SettingsBtn && this.cie2000ParamsPanel) {
            this.cie2000SettingsBtn.addEventListener('click', () => {
                const isVisible = this.cie2000ParamsPanel.style.display !== 'none';
                this.cie2000ParamsPanel.style.display = isVisible ? 'none' : 'block';
            });
        }

        if (this.cie2000Radius && this.cie2000RadiusValue) {
            this.cie2000Radius.addEventListener('input', () => {
                const radius = parseInt(this.cie2000Radius.value);
                const size = radius * 2 + 1;
                this.cie2000RadiusValue.textContent = `${radius} (${size}×${size}区域)`;
            });
        }

        if (this.cie2000Threshold && this.cie2000ThresholdValue) {
            this.cie2000Threshold.addEventListener('input', () => {
                this.cie2000ThresholdValue.textContent = this.cie2000Threshold.value;
            });
        }

        if (this.cie2000Ratio && this.cie2000RatioValue) {
            this.cie2000Ratio.addEventListener('input', () => {
                this.cie2000RatioValue.textContent = this.cie2000Ratio.value + '%';
            });
        }

        if (this.cie2000Iteration && this.cie2000IterationValue) {
            this.cie2000Iteration.addEventListener('input', () => {
                this.cie2000IterationValue.textContent = this.cie2000Iteration.value;
            });
        }

        if (this.cie2000ApplyBtn) {
            this.cie2000ApplyBtn.addEventListener('click', () => {
                this.cie2000OptimizedParams = {
                    neighborhoodRadius: parseInt(this.cie2000Radius.value),
                    colorDiffThreshold: parseInt(this.cie2000Threshold.value),
                    minRatio: parseInt(this.cie2000Ratio.value) / 100,
                    iterationCount: parseInt(this.cie2000Iteration.value)
                };
                if (this.cie2000ParamsPanel) {
                    this.cie2000ParamsPanel.style.display = 'none';
                }
            });
        }

        if (this.cie2000ResetBtn) {
            this.cie2000ResetBtn.addEventListener('click', () => {
                if (this.cie2000Radius) this.cie2000Radius.value = 1;
                if (this.cie2000RadiusValue) this.cie2000RadiusValue.textContent = '1';
                if (this.cie2000Threshold) this.cie2000Threshold.value = 5;
                if (this.cie2000ThresholdValue) this.cie2000ThresholdValue.textContent = '5';
                if (this.cie2000Ratio) this.cie2000Ratio.value = 50;
                if (this.cie2000RatioValue) this.cie2000RatioValue.textContent = '50%';
                if (this.cie2000Iteration) this.cie2000Iteration.value = 1;
                if (this.cie2000IterationValue) this.cie2000IterationValue.textContent = '1';
                
                this.cie2000OptimizedParams = {
                    neighborhoodRadius: 1,
                    colorDiffThreshold: 5,
                    minRatio: 0.5,
                    iterationCount: 1
                };
            });
        }
        this.showGridLines.addEventListener('change', () => {
            if (Object.keys(this.colorCounts).length > 0) {
                this.refreshPerlerChartDisplay();
            }
        });
        this.showCoordNumbers.addEventListener('change', () => {
            if (Object.keys(this.colorCounts).length > 0) {
                this.refreshPerlerChartDisplay();
            }
        });
        // 注意：颜色选择器（coordLineColor 和 coordNumberColor）不实时渲染，只有点击"渲染拼豆图纸"按钮才会生效
        this.chartStyle.addEventListener('change', () => {
            if (Object.keys(this.colorCounts).length > 0) {
                this.refreshPerlerChartDisplay();
            } else {
                this.showPerlerPlaceholder();
            }
        });
        this.legendPosition.addEventListener('change', () => this.refreshLegendPosition());
        this.beadShape.addEventListener('change', () => {
            if (Object.keys(this.colorCounts).length > 0) {
                this.refreshPerlerChartDisplay();
            }
        });
        if (this.transparentCellColor) {
            const transparentColorHandler = () => {
                if (this.transparentCellColorValue) {
                    this.transparentCellColorValue.textContent = this.transparentCellColor.value;
                }
                if (Object.keys(this.colorCounts).length > 0) {
                    this.debouncedRefreshPerlerChart();
                }
            };
            this.transparentCellColor.addEventListener('input', transparentColorHandler);
            this.transparentCellColor.addEventListener('change', transparentColorHandler);
        }
        this.gridLineWidth.addEventListener('input', () => {
            if (Object.keys(this.colorCounts).length > 0) {
                this.refreshPerlerChartDisplay();
            }
        });
        this.beadSizeSlider.addEventListener('input', () => {
            const displaySize = parseInt(this.beadSizeSlider.value);
            this.beadSizeValue.textContent = displaySize + 'px';
            
            let exportSize = displaySize * 2;
            exportSize = Math.max(3, Math.min(96, exportSize));
            this.exportBeadSizeSlider.value = exportSize;
            this.exportBeadSizeValue.textContent = exportSize + 'px';
        });
        
        this.exportBeadSizeSlider.addEventListener('input', () => {
            this.exportBeadSizeValue.textContent = this.exportBeadSizeSlider.value + 'px';
        });
        this.renderPerlerBtn = document.getElementById('renderPerlerBtn');
        this.renderPerlerBtn.addEventListener('click', () => this.updatePerlerChart());

        // 熨烫成品效果预览按钮
        this.ironPreviewBtn = document.getElementById('ironPreviewBtn');
        this.ironPreviewBtn.addEventListener('click', () => this.openIronPreview());
        
        this.simpleModeBtn = document.getElementById('simpleModeBtn');
        this.advancedModeBtn = document.getElementById('advancedModeBtn');
        
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
        
        this.enableContrast.addEventListener('change', () => this.updatePixelatedImage());
        this.contrastSlider.addEventListener('input', () => {
            this.contrastValue.textContent = this.contrastSlider.value + 'x';
            this.updatePixelatedImage();
        });
        
        this.enableSharpen.addEventListener('change', () => this.updatePixelatedImage());
        this.sharpenSlider.addEventListener('input', () => {
            this.sharpenValue.textContent = this.sharpenSlider.value;
            this.updatePixelatedImage();
        });
        
        this.enableColorQuantize.addEventListener('change', () => {
            this.colorQuantizePanel.style.display = this.enableColorQuantize.checked ? 'block' : 'none';
            this.updatePixelatedImage();
        });
        this.colorCountSlider.addEventListener('input', () => {
            const value = this.colorCountSlider.value;
            this.colorCountValue.textContent = value;
            this.colorCountInput.value = value;
            this.updatePixelatedImage();
        });
        this.colorCountInput.addEventListener('input', () => {
            let value = parseInt(this.colorCountInput.value);
            if (isNaN(value)) value = 2;
            if (value < 2) value = 2;
            if (value > 291) value = 291;
            this.colorCountValue.textContent = value;
            this.colorCountSlider.value = value;
            this.colorCountInput.value = value;
            this.updatePixelatedImage();
        });
        
        // 雕刻分裂相关事件
        this.pixelModeBtn.addEventListener('click', () => this.setPixelMode(false));
        this.carveModeBtn.addEventListener('click', () => this.setPixelMode(true));
        
        this.initialBlockSizeSlider.addEventListener('input', () => {
            this.initialBlockSizeValue.textContent = this.initialBlockSizeSlider.value + 'px';
            this.initialBlockSize = parseInt(this.initialBlockSizeSlider.value);
            if (this.carveMode) {
                this.resetCarving();
            }
        });
        
        this.minBlockSizeSlider.addEventListener('input', () => {
            this.minBlockSizeValue.textContent = this.minBlockSizeSlider.value + 'px';
            this.minBlockSize = parseInt(this.minBlockSizeSlider.value);
        });
        
        this.initialBlockSizeValue.textContent = '200px';
        this.minBlockSizeValue.textContent = '40px';
        
        this.showCarveGridCheckbox.addEventListener('change', () => {
            this.showCarveGrid = this.showCarveGridCheckbox.checked;
            if (this.carveMode) {
                this.drawCarveBlocks();
            }
        });
        
        this.resetCarveBtn.addEventListener('click', () => this.resetCarving());
        this.splitAllBtn.addEventListener('click', () => this.splitAllBlocks());
        this.mergeSelectedBtn.addEventListener('click', () => this.mergeSelectedBlocks());
        
        this.pixelatedCanvas.addEventListener('click', (e) => this.handleCarveCanvasClick(e));
        
        this.clearBtn.addEventListener('click', () => this.clear());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.downloadBtn.addEventListener('click', () => this.downloadImage());
        this.downloadPerlerBtn.addEventListener('click', () => this.downloadPerlerChart());
        this.exportPixelImageBtn.addEventListener('click', () => this.exportPixelImage());
        
        this.exportInfoPaperCompressedBtn.addEventListener('click', () => this.exportInfoPaperCompressed());
        this.exportInfoPaperCompressedFileBtn.addEventListener('click', () => this.exportInfoPaperCompressedFile());
        this.importInfoPaperBtn.addEventListener('click', () => this.importInfoPaper());
        
        this.exportScaleSlider.addEventListener('input', () => {
            const value = parseFloat(this.exportScaleSlider.value);
            this.exportScaleValue.textContent = value + '×';
            this.exportScaleInput.value = value;
        });
        
        this.exportScaleInput.addEventListener('input', () => {
            let value = parseFloat(this.exportScaleInput.value);
            if (isNaN(value)) value = 1;
            value = Math.max(1, Math.min(16, value));
            this.exportScaleInput.value = value;
            this.exportScaleSlider.value = value;
            this.exportScaleValue.textContent = value + '×';
        });
        
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentSort = btn.dataset.sort;
                this.updateColorUsageList();
            });
        });
        
        this.pixelMethod.addEventListener('change', () => {
            this.quantizedPixelControls.style.display = this.pixelMethod.value === 'quantized' ? 'block' : 'none';
            this.updatePixelatedImage();
        });
        
        this.targetColorCountSlider.addEventListener('input', () => {
            const value = this.targetColorCountSlider.value;
            this.targetColorCountValue.textContent = value;
            this.targetColorCountInput.value = value;
            this.updatePixelatedImage();
        });
        this.targetColorCountInput.addEventListener('input', () => {
            let value = parseInt(this.targetColorCountInput.value);
            if (isNaN(value)) value = 8;
            if (value < 8) value = 8;
            if (value > 96) value = 96;
            this.targetColorCountValue.textContent = value;
            this.targetColorCountSlider.value = value;
            this.targetColorCountInput.value = value;
            this.updatePixelatedImage();
        });
        
        this.enableNeighborSmooth.addEventListener('change', () => {
            if (Object.keys(this.colorCounts).length > 0) {
                this.updatePerlerChart();
            }
        });
        
        this.showPixelGrid.addEventListener('change', () => this.updatePixelatedImage());
        
        // 优化：直接修改网格线颜色，不需要重新计算像素化
        this.pixelGridColor.addEventListener('input', () => this.updatePixelGridColor());
        
        // 像素划分线偏移调整 - 需要重新计算像素化
        this.pixelGridOffsetX.addEventListener('input', () => {
            this.pixelGridOffsetXValue.textContent = this.pixelGridOffsetX.value + 'px';
            this.updatePixelatedImage();
        });
        this.pixelGridOffsetY.addEventListener('input', () => {
            this.pixelGridOffsetYValue.textContent = this.pixelGridOffsetY.value + 'px';
            this.updatePixelatedImage();
        });

        // 像素划分线粗度调整
        this.pixelGridLineWidth.addEventListener('input', () => {
            this.pixelGridLineWidthValue.textContent = this.pixelGridLineWidth.value + 'px';
            this.updatePixelGridColor();
        });
        
        // 像素块大小变化时，调整偏移滑块的最大值
        this.pixelSizeSlider.addEventListener('input', () => {
            const pixelSize = parseInt(this.pixelSizeSlider.value);
            this.pixelGridOffsetX.max = pixelSize - 1;
            this.pixelGridOffsetY.max = pixelSize - 1;
            if (parseInt(this.pixelGridOffsetX.value) >= pixelSize) {
                this.pixelGridOffsetX.value = 0;
                this.pixelGridOffsetXValue.textContent = '0px';
            }
            if (parseInt(this.pixelGridOffsetY.value) >= pixelSize) {
                this.pixelGridOffsetY.value = 0;
                this.pixelGridOffsetYValue.textContent = '0px';
            }
        });
        
        document.querySelectorAll('.edit-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const newTool = btn.dataset.tool;

                // 描边工具：打开浮动面板，不切换工具状态
                if (newTool === 'stroke') {
                    this.openStrokePanel();
                    return;
                }

                // 颜色转换工具：打开浮动面板，不切换工具状态
                if (newTool === 'colorConvert') {
                    this.openColorConvertPanel();
                    return;
                }

                // 颜色剔除工具：打开浮动面板，不切换工具状态
                if (newTool === 'colorRemove') {
                    this.openColorRemovePanel();
                    return;
                }

                // 杂色过滤工具：打开浮动面板，不切换工具状态
                if (newTool === 'noiseFilter') {
                    this.openNoiseFilterPanel();
                    return;
                }

                // 颜色量化工具：打开浮动面板，不切换工具状态
                if (newTool === 'colorQuantize') {
                    this.openColorQuantizePanel();
                    return;
                }

                // 如果之前是取色器，恢复原始的画笔大小
                if (this.currentEditTool === 'picker' && newTool !== 'picker') {
                    this.customEditBrushSize.value = this.savedBrushSize;
                    this.brushSizeValue.textContent = this.savedBrushSize;
                }

                // 如果新工具是取色器，保存当前的画笔大小，然后设置为1
                if (newTool === 'picker' && this.currentEditTool !== 'picker') {
                    this.savedBrushSize = this.customEditBrushSize.value;
                    this.customEditBrushSize.value = 1;
                    this.brushSizeValue.textContent = '1';
                }

                

                if (newTool === 'selection') {
                    if (this.currentEditTool === 'selection' && this.customEditor && this.customEditor.selection) {
                        this.customEditor.clearSelection();
                        this.drawCustomEditCanvas();
                    }
                    // 显示选区设置面板（不隐藏画笔面板，支持多窗口共存）
                    if (this.selectionPanel) {
                        this.selectionPanel.show();
                    } else {
                        this.initSelectionPanel();
                    }
                } else if (newTool === 'customBrush') {
                    // 显示画笔管理面板（不隐藏选区面板，支持多窗口共存）
                    if (this.brushPanel) {
                        this.brushPanel.show();
                    } else {
                        this.initBrushManager();
                    }
                } else {
                    // 切换到其他工具时，不隐藏面板（让用户自己管理窗口）
                    // 面板作为自由窗口，保持显示状态
                }

                document.querySelectorAll('.edit-tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentEditTool = newTool;

                // 显示/隐藏画布边界控制
                if (this.currentEditTool === 'canvasBounds') {
                    this.canvasBoundsControls.style.display = 'block';
                    this.canvasBoundsHandles.style.display = 'block';
                    this.customEditBrushCursor.style.display = 'none';
                    this.updateCanvasBoundsHandlesPosition();
                } else {
                    this.canvasBoundsControls.style.display = 'none';
                    this.canvasBoundsHandles.style.display = 'none';
                }
                
                // 更新画笔光标
                this.updateCustomEditBrushCursorSize();
            });
        });
        
        // 色板组件已在 initElements 中初始化，回调已处理颜色变化
        
        this.eraserColor.addEventListener('input', () => {
            this.eraserColorValue.textContent = this.eraserColor.value;
            this.refreshCustomEditBrushCursor();
        });
        
        this.razorBgColor.addEventListener('input', () => {
            this.razorBgColorValue.textContent = this.razorBgColor.value;
            this.drawCustomEditCanvas();
            this.refreshCustomEditBrushCursor();
        });
        
        this.customEditBrushSize.addEventListener('input', () => {
            this.brushSizeValue.textContent = this.customEditBrushSize.value;
            this.refreshCustomEditBrushCursor();
        });
        
        this.applyCustomEditBtn.addEventListener('click', () => this.applyCustomEdit());
        this.undoCustomEditBtn.addEventListener('click', () => this.undoCustomEdit());
        this.saveSnapshotBtn.addEventListener('click', () => this.saveUnifiedSnapshot('custom'));
        this.flipHorizontalBtn.addEventListener('click', () => this.flipImageHorizontal());
        this.flipVerticalBtn.addEventListener('click', () => this.flipImageVertical());
        
        // 颜色剔除功能
        this.removeColorPicker.addEventListener('input', () => {
            this.removeColorValue.textContent = this.removeColorPicker.value;
        });
        
        this.pickRemoveColorBtn.addEventListener('click', () => {
            // 不切换工具，仅设置取色模式
            this.pickRemoveColorMode = true;
            this.pickRemoveColorBtn.classList.add('color-pick-active');
        });

        this.removeColorBtn.addEventListener('click', () => {
            this.removeSelectedColor();
        });

        // 颜色剔除面板关闭按钮
        this.closeColorRemoveBtn.addEventListener('click', () => {
            this.closeColorRemovePanel();
        });

        // 杂色过滤面板事件
        this.closeNoiseFilterBtn.addEventListener('click', () => {
            this.closeNoiseFilterPanel();
        });

        this.noiseFilterThresholdSlider.addEventListener('input', () => {
            this.noiseFilterThresholdValue.textContent = this.noiseFilterThresholdSlider.value;
        });

        this.applyNoiseFilterBtn.addEventListener('click', () => {
            this.applyNoiseFilter();
        });

        // 颜色量化面板事件
        this.closeColorQuantizeBtn.addEventListener('click', () => {
            this.closeColorQuantizePanel();
        });

        this.quantizeSelectAllBtn.addEventListener('click', () => {
            this.quantizeColorList.querySelectorAll('.quantize-color-checkbox').forEach(cb => {
                cb.checked = true;
            });
        });

        this.quantizeSelectNoneBtn.addEventListener('click', () => {
            this.quantizeColorList.querySelectorAll('.quantize-color-checkbox').forEach(cb => {
                cb.checked = false;
            });
        });

        this.applyColorQuantizeBtn.addEventListener('click', () => {
            this.applyColorQuantize();
        });

        this.quantizePickColorBtn.addEventListener('click', () => {
            if (this.quantizePickMode) {
                this.quantizePickMode = false;
                this.quantizePickColorBtn.classList.remove('color-pick-active');
                console.log('[颜色量化取色] 退出取色模式');
            } else {
                this.quantizePickMode = true;
                this.quantizePickColorBtn.classList.add('color-pick-active');
                console.log('[颜色量化取色] 进入取色模式');
            }
        });

        // 悬浮快照面板事件
        this.snapshotFloatBtn.addEventListener('click', () => {
            this.toggleSnapshotPanel();
        });
        
        this.closeSnapshotPanel.addEventListener('click', () => {
            this.closePanel();
        });
        
        // 点击面板外部关闭
        document.addEventListener('click', (e) => {
            if (this.snapshotPanel.classList.contains('show') && 
                !this.snapshotPanel.contains(e.target) && 
                e.target !== this.snapshotFloatBtn && 
                !this.snapshotFloatBtn.contains(e.target)) {
                this.closePanel();
            }
        });
        
        this.closeColorConvertBtn.addEventListener('click', () => {
            this.closeColorConvertPanel();
        });

        this.initColorConvertPanelDrag();
        this.initStrokePanelDrag();
        this.initColorRemovePanelDrag();
        this.initNoiseFilterPanelDrag();
        this.initColorQuantizePanelDrag();

        this.colorConvertSourceColor.addEventListener('input', () => {
            this.colorConvertSourceColorValue.textContent = this.colorConvertSourceColor.value;
            this.colorConvertSourceIsTransparent = false;
            this.colorConvertSourceColor.style.opacity = '1';
        });

        this.colorConvertTargetColor.addEventListener('input', () => {
            this.colorConvertTargetColorValue.textContent = this.colorConvertTargetColor.value;
            this.colorConvertTargetIsTransparent = false;
            this.colorConvertTargetColor.style.opacity = '1';
        });

        this.pickSourceColorBtn.addEventListener('click', () => {
            if (this.colorConvertPickMode === 'source') {
                this.colorConvertPickMode = null;
                this.pickSourceColorBtn.classList.remove('color-pick-active');
            } else {
                this.colorConvertPickMode = 'source';
                this.pickSourceColorBtn.classList.add('color-pick-active');
                this.pickTargetColorBtn.classList.remove('color-pick-active');
            }
        });
        
        this.pickTargetColorBtn.addEventListener('click', () => {
            if (this.colorConvertPickMode === 'target') {
                this.colorConvertPickMode = null;
                this.pickTargetColorBtn.classList.remove('color-pick-active');
            } else {
                this.colorConvertPickMode = 'target';
                this.pickTargetColorBtn.classList.add('color-pick-active');
                this.pickSourceColorBtn.classList.remove('color-pick-active');
            }
        });
        
        this.executeColorConvertBtn.addEventListener('click', () => this.executeColorConvert());
        
        this.initCustomEditCanvasEvents();
        
        this.smartOptimizeBtn.addEventListener('click', () => this.openSmartOptimizeModal());
        this.closeModalBtn.addEventListener('click', () => this.closeSmartOptimizeModal());
        this.toggleFullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.rejectAllBtn.addEventListener('click', () => this.rejectAllSuggestions());
        this.applyAllBtn.addEventListener('click', () => this.acceptAllSuggestions());
        this.confirmBtn.addEventListener('click', () => this.confirmOptimization());
        
        this.enableColorMerge.addEventListener('change', () => this.debouncedRegenerateSuggestions());
        this.colorMergeThresholdSlider.addEventListener('input', () => {
            this.colorMergeThresholdValue.textContent = this.colorMergeThresholdSlider.value + '%';
            this.debouncedRegenerateSuggestions();
        });
        this.enableEdgeColorMerge.addEventListener('change', () => this.debouncedRegenerateSuggestions());
        this.edgeColorThresholdSlider.addEventListener('input', () => {
            this.edgeColorThresholdValue.textContent = this.edgeColorThresholdSlider.value + '%';
            this.debouncedRegenerateSuggestions();
        });
        
        // 画笔工具事件
        this.optimizeBrushSizeSlider.addEventListener('input', () => {
            this.optimizeBrushSizeValue.textContent = this.optimizeBrushSizeSlider.value;
            this.updateBrushCursorSize();
        });
        
        this.brushModeErase.addEventListener('click', () => {
            this.brushMode = 'erase';
            this.brushModeErase.classList.add('active');
            this.brushModeRestore.classList.remove('active');
        });
        
        this.brushModeRestore.addEventListener('click', () => {
            this.brushMode = 'restore';
            this.brushModeRestore.classList.add('active');
            this.brushModeErase.classList.remove('active');
        });
        
        this.clearErasedBlocksBtn.addEventListener('click', () => {
            this.erasedBlocks.clear();
            this.drawOptimizationPreview();
        });
        
        // 颜色选择器事件
        this.optimizeHighlightColor.addEventListener('input', () => {
            this.drawOptimizationPreview();
        });
        
        this.optimizeErasedColor.addEventListener('input', () => {
            this.drawOptimizationPreview();
        });
        
        // 优化预览画布的鼠标事件
        this.initOptimizationPreviewCanvasEvents();
        
        this.pixelatedZoomSlider.addEventListener('input', () => {
            const zoom = this.pixelatedZoomSlider.value;
            this.pixelatedZoomValue.textContent = zoom + '%';
            const scale = zoom / 100;
            if (this.pixelatedCanvasDisplayWidth && this.pixelatedCanvasDisplayHeight) {
                this.pixelatedCanvas.style.width = (this.pixelatedCanvasDisplayWidth * scale) + 'px';
                this.pixelatedCanvas.style.height = (this.pixelatedCanvasDisplayHeight * scale) + 'px';
            }
        });
        
        // 画布边界调整事件
        this.canvasBoundsLeftInput.addEventListener('input', () => {
            if (!this.canvasBounds) return;
            let val = parseInt(this.canvasBoundsLeftInput.value);
            if (isNaN(val)) return;
            val = Math.min(val, this.canvasBounds.right - 1);
            this.applyCanvasBounds(val, this.canvasBounds.right, this.canvasBounds.top, this.canvasBounds.bottom);
            this.updateCanvasBoundsInputs();
            this.updateCanvasBoundsDisplay();
            this.drawCustomEditCanvas();
            this.updateCanvasBoundsHandlesPosition();
        });

        this.canvasBoundsRightInput.addEventListener('input', () => {
            if (!this.canvasBounds) return;
            let val = parseInt(this.canvasBoundsRightInput.value);
            if (isNaN(val)) return;
            val = Math.max(val, this.canvasBounds.left + 1);
            this.applyCanvasBounds(this.canvasBounds.left, val, this.canvasBounds.top, this.canvasBounds.bottom);
            this.updateCanvasBoundsInputs();
            this.updateCanvasBoundsDisplay();
            this.drawCustomEditCanvas();
            this.updateCanvasBoundsHandlesPosition();
        });

        this.canvasBoundsTopInput.addEventListener('input', () => {
            if (!this.canvasBounds) return;
            let val = parseInt(this.canvasBoundsTopInput.value);
            if (isNaN(val)) return;
            val = Math.min(val, this.canvasBounds.bottom - 1);
            this.applyCanvasBounds(this.canvasBounds.left, this.canvasBounds.right, val, this.canvasBounds.bottom);
            this.updateCanvasBoundsInputs();
            this.updateCanvasBoundsDisplay();
            this.drawCustomEditCanvas();
            this.updateCanvasBoundsHandlesPosition();
        });

        this.canvasBoundsBottomInput.addEventListener('input', () => {
            if (!this.canvasBounds) return;
            let val = parseInt(this.canvasBoundsBottomInput.value);
            if (isNaN(val)) return;
            val = Math.max(val, this.canvasBounds.top + 1);
            this.applyCanvasBounds(this.canvasBounds.left, this.canvasBounds.right, this.canvasBounds.top, val);
            this.updateCanvasBoundsInputs();
            this.updateCanvasBoundsDisplay();
            this.drawCustomEditCanvas();
            this.updateCanvasBoundsHandlesPosition();
        });
        
        this.resetCanvasBoundsBtn.addEventListener('click', () => {
            this.resetCanvasBounds();
        });
        
        // 描边工具（浮动面板版）：颜色和厚度更新
        this.strokeColor.addEventListener('input', () => {
            this.strokeColorValue.textContent = this.strokeColor.value;
        });
        this.strokeThickness.addEventListener('input', () => {
            this.strokeThicknessValue.textContent = this.strokeThickness.value;
        });

        // 描边工具（浮动面板版）：关闭按钮
        this.closeStrokePanelBtn.addEventListener('click', () => {
            this.closeStrokePanel();
        });

        // 描边工具（浮动面板版）：执行描边
        this.executeStrokeBtn.addEventListener('click', () => {
            const type = document.querySelector('input[name="strokeType"]:checked').value;
            const thickness = parseInt(this.strokeThickness.value);
            const colorHex = this.strokeColor.value;
            this.applyStroke(type, thickness, colorHex);
        });
        
        // 初始化画布边界拖拽事件
        this.initCanvasBoundsDragEvents();
        
        this.perlerZoomSlider.addEventListener('input', () => {
            const zoom = this.perlerZoomSlider.value;
            this.perlerZoomValue.textContent = zoom + '%';
            const scale = zoom / 100;
            if (this.perlerCanvasDisplayWidth && this.perlerCanvasDisplayHeight) {
                this.perlerCanvas.style.width = (this.perlerCanvasDisplayWidth * scale) + 'px';
                this.perlerCanvas.style.height = (this.perlerCanvasDisplayHeight * scale) + 'px';
            }
        });
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.loadImage(file);
            // 清空 fileInput 值，确保可以重复选择相同文件
            e.target.value = '';
        }
    }

    loadImage(file) {
        console.log('开始加载图片:', file.name, '类型:', file.type, '大小:', file.size);
        
        if (!file.type.startsWith('image/')) {
            console.warn('文件类型不标准，尝试继续加载');
        }
        
        if (file.size > 20 * 1024 * 1024) {
            alert(getI18nText('alertFileTooLarge'));
            return;
        }
        
        const img = new Image();
        const objectURL = URL.createObjectURL(file);
        
        img.onload = () => {
            console.log('图片加载完成，尺寸:', img.width, 'x', img.height);
            this.originalImage = img;
            this.originalWidth = img.width;
            this.originalHeight = img.height;
            // 保存完整的原始图片用于重置裁切
            this.fullOriginalImage = img;
            this.fullOriginalWidth = img.width;
            this.fullOriginalHeight = img.height;
            this.isCropped = false;
            // 重置裁切按钮状态
            this.updateCropButtonState();
            this.showWorkspace();
            this.drawOriginalImage();
            this.resetInputs();
            this.updatePixelatedImage();
            URL.revokeObjectURL(objectURL);
        };
        
        img.onerror = (error) => {
            console.error('图片加载失败:', error);
            URL.revokeObjectURL(objectURL);
            alert(getI18nText('alertImageLoadFailed'));
        };
        
        img.src = objectURL;
    }

    updateCropButtonState() {
        if (this.isCropMode) {
            this.cropBtn.style.display = 'none';
            // 重置按钮在裁剪模式下也显示（用于重置旋转和裁剪框）
            this.resetCropBtn.style.display = 'inline-block';
            this.confirmCropBtn.style.display = 'inline-block';
            this.cancelCropBtn.style.display = 'inline-block';
            // 显示旋转控件
            if (this.rotateControls) this.rotateControls.style.display = 'block';
        } else {
            this.cropBtn.style.display = 'inline-block';
            this.confirmCropBtn.style.display = 'none';
            this.cancelCropBtn.style.display = 'none';
            this.resetCropBtn.style.display = this.isCropped ? 'inline-block' : 'none';
            // 隐藏旋转控件
            if (this.rotateControls) this.rotateControls.style.display = 'none';
        }
    }

    setRotationAngle(angle) {
        this.rotationAngle = angle;
        if (this.rotateSlider) this.rotateSlider.value = angle;
        if (this.rotateValue) this.rotateValue.textContent = angle + '°';
        
        // 只旋转 originalCanvas 元素
        if (this.originalCanvas) {
            // 获取裁剪框的固定尺寸（目标显示区域）
            const cropRect = this.cropOverlay.getBoundingClientRect();
            const targetW = this._baseCropWidth || cropRect.width;
            const targetH = this._baseCropHeight || cropRect.height;
            
            if (angle === 0) {
                // 重置旋转，使用基础尺寸
                this.originalCanvas.style.transform = '';
                this.originalCanvas.style.transformOrigin = '';
                this.originalCanvas.style.width = this._baseCanvasWidth + 'px';
                this.originalCanvas.style.height = this._baseCanvasHeight + 'px';
            } else {
                // 计算旋转后图片的包围盒尺寸
                const rad = angle * Math.PI / 180;
                const cos = Math.abs(Math.cos(rad));
                const sin = Math.abs(Math.sin(rad));
                const originalW = this.originalWidth;
                const originalH = this.originalHeight;
                const rotatedW = Math.round(originalW * cos + originalH * sin);
                const rotatedH = Math.round(originalW * sin + originalH * cos);
                
                // 计算缩放比例，使旋转后的图片完全适配裁剪框
                const scale = Math.min(targetW / rotatedW, targetH / rotatedH);
                
                // 计算新的显示尺寸（基于原始宽高比）
                const newDisplayW = Math.round(originalW * scale);
                const newDisplayH = Math.round(originalH * scale);
                
                // 应用变换：旋转 + 缩放
                this.originalCanvas.style.width = newDisplayW + 'px';
                this.originalCanvas.style.height = newDisplayH + 'px';
                this.originalCanvas.style.transform = `rotate(${angle}deg)`;
                this.originalCanvas.style.transformOrigin = 'center center';
            }
            
            // 重新定位裁剪框到canvas位置
            if (this.isCropMode) {
                this.repositionCropOverlay();
            }
        }
    }

    repositionCropOverlay() {
        const wrapperRect = this.cropOverlay.parentElement.getBoundingClientRect();
        const canvasRect = this.originalCanvas.getBoundingClientRect();
        const offsetX = canvasRect.left - wrapperRect.left;
        const offsetY = canvasRect.top - wrapperRect.top;
        
        // 使用基础尺寸设置裁剪框（保持固定）
        const targetW = this._baseCropWidth || canvasRect.width;
        const targetH = this._baseCropHeight || canvasRect.height;
        
        this.cropOverlay.style.left = offsetX + 'px';
        this.cropOverlay.style.top = offsetY + 'px';
        this.cropOverlay.style.width = targetW + 'px';
        this.cropOverlay.style.height = targetH + 'px';
        
        // 如果裁剪框超出canvas范围，重置裁剪框
        const boxRect = this.getCropBoxRect();
        const effectiveCanvasW = Math.min(canvasRect.width, targetW);
        const effectiveCanvasH = Math.min(canvasRect.height, targetH);
        
        if (boxRect.left < 0 || boxRect.top < 0 || 
            boxRect.width > effectiveCanvasW || boxRect.height > effectiveCanvasH) {
            this.setCropBox(0, 0, effectiveCanvasW, effectiveCanvasH);
        }
    }

    toggleCropMode() {
        this.isCropMode = !this.isCropMode;
        if (this.isCropMode) {
            this.enterCropMode();
        } else {
            this.exitCropMode();
        }
    }

    enterCropMode() {
        const wrapper = this.cropOverlay.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const canvasRect = this.originalCanvas.getBoundingClientRect();
        // overlay相对于wrapper的偏移（因为canvas在wrapper中是居中的）
        const offsetX = canvasRect.left - wrapperRect.left;
        const offsetY = canvasRect.top - wrapperRect.top;
        const canvasW = canvasRect.width;
        const canvasH = canvasRect.height;
        
        // 保存基础尺寸（用于旋转时保持裁剪框大小不变）
        this._baseCanvasWidth = canvasW;
        this._baseCanvasHeight = canvasH;
        this._baseCropWidth = canvasW;
        this._baseCropHeight = canvasH;
        
        // 修改容器样式，允许旋转后的图片完整显示
        this._savedWrapperOverflow = wrapper.style.overflow;
        wrapper.style.overflow = 'visible';
        wrapper.style.minHeight = Math.max(canvasH * 1.4, 250) + 'px';
        
        this.cropOverlay.style.display = 'block';
        this.cropOverlay.style.left = offsetX + 'px';
        this.cropOverlay.style.top = offsetY + 'px';
        this.cropOverlay.style.width = canvasW + 'px';
        this.cropOverlay.style.height = canvasH + 'px';
        this.cropOverlay.style.right = 'auto';
        this.cropOverlay.style.bottom = 'auto';
        // 默认选框100%覆盖整个图片
        this.setCropBox(0, 0, canvasW, canvasH);
        this.cropBox.style.display = 'block';
        this.updateCropButtonState();
        // 重置旋转角度
        this.setRotationAngle(0);
    }

    exitCropMode() {
        this.cropOverlay.style.display = 'none';
        this.cropOverlay.style.left = '';
        this.cropOverlay.style.top = '';
        this.cropOverlay.style.width = '';
        this.cropOverlay.style.height = '';
        this.cropOverlay.style.right = '';
        this.cropOverlay.style.bottom = '';
        this.cropBox.style.display = 'none';
        // 重置旋转样式
        if (this.originalCanvas) {
            this.originalCanvas.style.transform = '';
            this.originalCanvas.style.transformOrigin = '';
            // 不清除 width/height，保持正确的显示尺寸
        }
        // 恢复容器样式
        const wrapper = this.cropOverlay?.parentElement;
        if (wrapper) {
            wrapper.style.overflow = this._savedWrapperOverflow || '';
            wrapper.style.minHeight = '';
        }
        this.rotationAngle = 0;
        if (this.rotateSlider) this.rotateSlider.value = 0;
        if (this.rotateValue) this.rotateValue.textContent = '0°';
        this.updateCropButtonState();
    }

    cancelCrop() {
        this.isCropMode = false;
        this.exitCropMode();
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

    cropMouseUp(e) {
        this.isCreatingCrop = false;
        this.isDraggingCrop = false;
        this.isResizingCrop = false;
        this.activeHandle = null;
        this.initialCropBox = null;
    }

    cropTouchEnd(e) {
        this.cropMouseUp(e);
    }

    confirmCrop() {
        const hasRotation = this.rotationAngle !== 0;
        const boxRect = this.getCropBoxRect();
        const cropRect = this.cropOverlay.getBoundingClientRect();
        const canvasRect = this.originalCanvas.getBoundingClientRect();
        
        // 裁剪框相对于裁剪覆盖层的坐标，映射到 canvas 的显示坐标
        // 裁剪覆盖层和 canvas 在旋转后应该是重叠的
        // boxRect 是裁剪框在裁剪覆盖层内的坐标
        // 需要转换为 canvas 显示坐标，再转换为原图像素坐标
        
        // canvas 在裁剪覆盖层内的偏移
        const canvasOffsetX = canvasRect.left - cropRect.left;
        const canvasOffsetY = canvasRect.top - cropRect.top;
        
        // 裁剪框相对于 canvas 的坐标
        const cropLeft = boxRect.left - canvasOffsetX;
        const cropTop = boxRect.top - canvasOffsetY;
        
        // 计算显示尺寸与实际像素尺寸的比例
        const scaleX = this.originalWidth / canvasRect.width;
        const scaleY = this.originalHeight / canvasRect.height;

        if (hasRotation) {
            // 旋转 + 裁剪模式
            const adjustedBoxRect = {
                left: cropLeft,
                top: cropTop,
                width: boxRect.width,
                height: boxRect.height
            };
            this.confirmCropWithRotation(adjustedBoxRect, scaleX, scaleY);
        } else {
            // 仅裁剪模式（原有逻辑）
            const sourceX = Math.round(cropLeft * scaleX);
            const sourceY = Math.round(cropTop * scaleY);
            const sourceW = Math.round(boxRect.width * scaleX);
            const sourceH = Math.round(boxRect.height * scaleY);
            
            if (sourceW < 10 || sourceH < 10) {
                alert(getI18nText('alertCropAreaTooSmall'));
                return;
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = sourceW;
            tempCanvas.height = sourceH;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(
                this.originalImage,
                sourceX, sourceY, sourceW, sourceH,
                0, 0, sourceW, sourceH
            );

            const croppedDataURL = tempCanvas.toDataURL('image/png');
            const newImg = new Image();
            newImg.onload = () => {
                this.originalImage = newImg;
                this.originalWidth = newImg.width;
                this.originalHeight = newImg.height;
                this.isCropped = true;
                this.isCropMode = false;
                this.exitCropMode();
                this.drawOriginalImage();
                this.resetInputs();
                this.updatePixelatedImage();
            };
            newImg.src = croppedDataURL;
        }
    }

    confirmCropWithRotation(boxRect, scaleX, scaleY) {
        const angle = this.rotationAngle;
        const rad = angle * Math.PI / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));

        // 计算旋转后的尺寸
        const newWidth = Math.round(this.originalWidth * cos + this.originalHeight * sin);
        const newHeight = Math.round(this.originalWidth * sin + this.originalHeight * cos);

        // boxRect 现在是相对于 canvas 的显示坐标
        // 检查裁剪框大小
        const tempSourceW = Math.round(boxRect.width * scaleX);
        const tempSourceH = Math.round(boxRect.height * scaleY);
        
        if (tempSourceW < 10 || tempSourceH < 10) {
            alert(getI18nText('alertCropAreaTooSmall'));
            return;
        }

        // 创建旋转后的 canvas
        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = newWidth;
        rotatedCanvas.height = newHeight;
        const rotatedCtx = rotatedCanvas.getContext('2d');

        // 执行旋转
        rotatedCtx.save();
        rotatedCtx.translate(newWidth / 2, newHeight / 2);
        rotatedCtx.rotate(rad);
        rotatedCtx.drawImage(this.originalImage, -this.originalWidth / 2, -this.originalHeight / 2);
        rotatedCtx.restore();

        // boxRect 是相对于 canvas 显示坐标
        // 转换到原图像素坐标，然后转换到旋转后 canvas 坐标
        // 原图像素坐标: sourceX = boxRect.left * scaleX
        // 旋转后 canvas 坐标需要根据旋转角度转换
        
        let cropX, cropY, cropW, cropH;
        
        if (angle === 90) {
            // 90° 旋转: 原(x,y) → 新(y, originalWidth-1-x)
            const srcX = boxRect.left * scaleX;
            const srcY = boxRect.top * scaleY;
            const srcW = boxRect.width * scaleX;
            const srcH = boxRect.height * scaleY;
            
            cropY = Math.round(srcX);
            cropX = Math.round(this.originalHeight - srcY - srcH);
            cropW = Math.round(srcH);
            cropH = Math.round(srcW);
        } else if (angle === 180) {
            // 180° 旋转: 原(x,y) → 新(originalWidth-1-x, originalHeight-1-y)
            const srcX = boxRect.left * scaleX;
            const srcY = boxRect.top * scaleY;
            const srcW = boxRect.width * scaleX;
            const srcH = boxRect.height * scaleY;
            
            cropX = Math.round(this.originalWidth - srcX - srcW);
            cropY = Math.round(this.originalHeight - srcY - srcH);
            cropW = Math.round(srcW);
            cropH = Math.round(srcH);
        } else if (angle === 270) {
            // 270° 旋转: 原(x,y) → 新(originalHeight-1-y, x)
            const srcX = boxRect.left * scaleX;
            const srcY = boxRect.top * scaleY;
            const srcW = boxRect.width * scaleX;
            const srcH = boxRect.height * scaleY;
            
            cropY = Math.round(this.originalWidth - srcX - srcW);
            cropX = Math.round(srcY);
            cropW = Math.round(srcH);
            cropH = Math.round(srcW);
        } else {
            // 任意角度：使用简化的近似转换
            cropX = Math.round(boxRect.left * scaleX);
            cropY = Math.round(boxRect.top * scaleY);
            cropW = Math.round(boxRect.width * scaleX);
            cropH = Math.round(boxRect.height * scaleY);
        }

        // 确保裁剪框在有效范围内
        cropX = Math.max(0, Math.min(cropX, newWidth - 1));
        cropY = Math.max(0, Math.min(cropY, newHeight - 1));
        cropW = Math.max(1, Math.min(cropW, newWidth - cropX));
        cropH = Math.max(1, Math.min(cropH, newHeight - cropY));

        // 裁剪旋转后的图像
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = cropW;
        croppedCanvas.height = cropH;
        const croppedCtx = croppedCanvas.getContext('2d');
        croppedCtx.drawImage(rotatedCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // 检查是否裁剪了（如果裁剪框是100%覆盖，就不裁剪）
        const isFullCrop = (cropW >= newWidth - 1 && cropH >= newHeight - 1);
        
        let finalDataURL;
        if (isFullCrop) {
            finalDataURL = rotatedCanvas.toDataURL('image/png');
            this.originalWidth = newWidth;
            this.originalHeight = newHeight;
        } else {
            finalDataURL = croppedCanvas.toDataURL('image/png');
            this.originalWidth = cropW;
            this.originalHeight = cropH;
        }

        const newImg = new Image();
        newImg.onload = () => {
            this.originalImage = newImg;
            this.isCropped = true;
            this.isCropMode = false;
            this.exitCropMode();
            this.drawOriginalImage();
            this.resetInputs();
            this.updatePixelatedImage();
        };
        newImg.src = finalDataURL;
    }

    resetToFullImage() {
        // 如果在裁剪模式下，只重置旋转和裁剪框
        if (this.isCropMode) {
            // 重置旋转角度
            this.setRotationAngle(0);
            // 重置裁剪框为全选
            if (this._baseCanvasWidth && this._baseCanvasHeight) {
                this.setCropBox(0, 0, this._baseCanvasWidth, this._baseCanvasHeight);
            }
            return;
        }
        
        // 否则执行原有的重置逻辑
        if (!this.fullOriginalImage) return;
        this.originalImage = this.fullOriginalImage;
        this.originalWidth = this.fullOriginalWidth;
        this.originalHeight = this.fullOriginalHeight;
        this.isCropped = false;
        this.isCropMode = false;
        this.exitCropMode();
        this.drawOriginalImage();
        this.resetInputs();
        this.updatePixelatedImage();
    }

    showWorkspace() {
        this.uploadSection.style.display = 'none';
        this.showcaseSection.style.display = 'none';
        this.workspace.style.display = 'block';
        this.setWorkspaceMode('normal');
        this.showPerlerPlaceholder();
    }

    drawOriginalImage() {
        // 设置画布的实际像素尺寸为原始尺寸
        this.originalCanvas.width = this.originalWidth;
        this.originalCanvas.height = this.originalHeight;
        this.originalCtx.drawImage(this.originalImage, 0, 0);
        this.originalImageData = this.originalCtx.getImageData(0, 0, this.originalWidth, this.originalHeight);
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
    }

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
    }

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
        
        const imageData = tempCtx.getImageData(0, 0, targetWidth, targetHeight);
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
    }
    
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
    }

    resetPerlerZoom() {
        this.perlerZoomSlider.value = 100;
        this.perlerZoomValue.textContent = '100%';
        // 1:1原生尺寸显示
        this.perlerCanvas.style.width = this.perlerCanvasNaturalWidth + 'px';
        this.perlerCanvas.style.height = this.perlerCanvasNaturalHeight + 'px';
        this.perlerCanvasDisplayWidth = this.perlerCanvasNaturalWidth;
        this.perlerCanvasDisplayHeight = this.perlerCanvasNaturalHeight;
    }

    /**
     * 绘制单个圆环珠子
     * @param {CanvasRenderingContext2D} ctx Canvas 上下文
     * @param {number} px 左上角 x 坐标
     * @param {number} py 左上角 y 坐标
     * @param {number} cellSize 单元格大小
     * @param {any} color 颜色对象
     * @param {'color' | 'color-with-code' | 'bw'} chartStyle 图纸风格
     * @param {number} fontSize 字体大小
     */
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
    }

    /**
     * 绘制圆角正方形拼豆
     * @param {CanvasRenderingContext2D} ctx 绘制上下文
     * @param {number} px 左上角 x 坐标
     * @param {number} py 左上角 y 坐标
     * @param {number} cellSize 单元格大小
     * @param {any} color 颜色对象
     * @param {'color' | 'color-with-code' | 'bw'} chartStyle 图纸风格
     * @param {number} fontSize 字体大小
     */
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
    }

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
    }

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
    }

    showPerlerPlaceholder() {
        this.perlerCtx.clearRect(0, 0, this.perlerCanvas.width, this.perlerCanvas.height);
        this.perlerCtx.fillStyle = '#f0f0f0';
        this.perlerCtx.fillRect(0, 0, this.perlerCanvas.width, this.perlerCanvas.height);
        this.perlerCtx.fillStyle = '#666';
        this.perlerCtx.font = '14px sans-serif';
        this.perlerCtx.textAlign = 'center';
        this.perlerCtx.fillText(getI18nText('clickToRenderPerler'), this.perlerCanvas.width / 2, this.perlerCanvas.height / 2);
        this.perlerSize.textContent = getI18nText('perlerWaitingRender');
    }

    refreshPerlerChartDisplay() {
        if (!this.perlerColors || !this.perlerColors.length) return;
        this.drawPerlerChartSync(this.perlerColors, this.perlerWidth, this.perlerHeight, this.colorSetSelect.value);
    }

    debouncedRefreshPerlerChart() {
        if (this.transparentColorDebounceTimer) {
            clearTimeout(this.transparentColorDebounceTimer);
        }
        this.transparentColorDebounceTimer = setTimeout(() => {
            this.refreshPerlerChartDisplay();
        }, 150);
    }

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
    }

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
    }
    
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
    }
    
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
    }
    
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
    }

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
    }

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
    }

    refreshLegendPosition() {
        if (Object.keys(this.colorCounts).length > 0) {
            this.drawColorLegend();
        }
    }

    clear() {
        // 直接刷新页面，模拟用户按F5的效果，确保完全清空
        location.reload();
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    /**
     * 生成4位随机参数（用于文件名防重复）
     */
    _generateRandomSuffix() {
        return Math.floor(1000 + Math.random() * 9000);
    }

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
    }

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
    }
    
    refreshCustomEditBrushCursor() {
        if (this.customEditBrushCursor && this.customEditBrushCursor.style.display === 'block' && this.lastCustomEditMouseEvent) {
            this.updateCustomEditBrushCursorPosition(this.lastCustomEditMouseEvent);
        }
    }
    
    // 获取当前画笔颜色（从色板组件或后备方案）
    getCurrentEditColor() {
        return this.currentBeadColor || '#FAF4C8';
    }
    
    getCurrentEditColorName() {
        return this.currentBeadColorName || 'A1';
    }

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
    }

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
    }

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
    }
    
    /**
     * 绘制画笔预览（预笔迹显示）
     */
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
    }

    getCustomEditCell(e) {
        const rect = this.customEditCanvas.getBoundingClientRect();
        const cellSize = parseInt(this.beadSizeSlider.value);
        const coordSize = Math.max(30, Math.floor(cellSize * 1.4));
        const x = Math.floor((e.clientX - rect.left - coordSize) / cellSize);
        const y = Math.floor((e.clientY - rect.top - coordSize) / cellSize);
        return { x, y };
    }

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
    }

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
    }

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
    }
    
    /**
     * 在指定位置应用自定义画笔
     */
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
    }
    
    /**
     * 获取当前编辑颜色数据
     */
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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    saveCustomEditHistory() {
        this.customEditHistory.push(this.customEditData.map(row => [...row]));
        if (this.customEditHistory.length > 50) {
            this.customEditHistory.shift();
        }
    }
    
    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    
    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    }
    
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
    }
    
    // 描边工具：外描边/内描边
    // type: 'outer' | 'inner'
    //   outer = 把透明且邻近有实体的格子涂成描边色（向外扩散）
    //   inner = 把实体且邻近有透明的格子涂成描边色（向内侵蚀）
    // thickness: 1-10，循环执行 N 次以产生扩散效果
    // colorHex: '#xxxxxx'，用户选择的颜色，会自动映射到当前色板中最接近的颜色
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
    }

    undoCustomEdit() {
        if (this.customEditHistory.length > 1) {
            this.customEditHistory.pop();
            this.customEditData = this.customEditHistory[this.customEditHistory.length - 1].map(row => [...row]);
            this.drawCustomEditCanvas();
        }
    }

    flipImageHorizontal() {
        if (!this.customEditData) return;
        
        // 保存历史记录
        this.saveCustomEditHistory();
        
        // 左右翻转：每行反转
        this.customEditData = this.customEditData.map(row => [...row].reverse());
        
        this.drawCustomEditCanvas();
    }

    flipImageVertical() {
        if (!this.customEditData) return;
        
        // 保存历史记录
        this.saveCustomEditHistory();
        
        // 上下翻转：数组反转
        this.customEditData = [...this.customEditData].reverse();
        
        this.drawCustomEditCanvas();
    }

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
    }

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
    }
    
    // 初始化优化预览画布的鼠标事件
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
    }
    
    // 处理涂抹操作
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
    }
    
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
    }
    
    debouncedRegenerateSuggestions() {
        if (this.regenerateDebounceTimer) {
            clearTimeout(this.regenerateDebounceTimer);
        }
        this.regenerateDebounceTimer = setTimeout(() => {
            this.regenerateSuggestions();
        }, 300); // 300ms 防抖延迟
    }
    
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
    }

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
    }
    
    // 更新画笔光标大小
    updateBrushCursorSize() {
        if (!this.brushCursor) return;
        
        const brushSize = parseInt(this.optimizeBrushSizeSlider.value);
        const size = brushSize * this.optimizationCellSize;
        
        this.brushCursor.style.width = size + 'px';
        this.brushCursor.style.height = size + 'px';
    }
    
    // 更新画笔光标位置
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
    
    // 更新自定义编辑画笔光标大小
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
    }
    
    // 更新自定义编辑画笔光标位置（吸附到格子）
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
    }
    
    // ==================== 画布边界调整相关方法 ====================
    
    updateCanvasBoundsInputs() {
        if (!this.canvasBounds) return;
        this.canvasBoundsLeftInput.value = this.canvasBounds.left;
        this.canvasBoundsRightInput.value = this.canvasBounds.right;
        this.canvasBoundsTopInput.value = this.canvasBounds.top;
        this.canvasBoundsBottomInput.value = this.canvasBounds.bottom;
    }
    
    updateCanvasBoundsDisplay() {
        if (!this.canvasBounds) return;
        const displayWidth = this.canvasBounds.right - this.canvasBounds.left;
        const displayHeight = this.canvasBounds.bottom - this.canvasBounds.top;
        this.canvasBoundsCurrentSize.textContent = `${displayWidth} × ${displayHeight}`;
    }

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
    }
    
    resetCanvasBounds() {
        if (!this.canvasBounds) return;
        this.canvasBounds.left = 0;
        this.canvasBounds.right = this.canvasBounds.originalWidth;
        this.canvasBounds.top = 0;
        this.canvasBounds.bottom = this.canvasBounds.originalHeight;
        this.updateCanvasBoundsInputs();
        this.updateCanvasBoundsDisplay();
        this.drawCustomEditCanvas();
    }
    
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
    }
    
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
    }
    
    // ==================== 画布边界调整相关方法结束 ====================
    
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
    }

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
    }
    
    // ==================== 旧算法（保留纪念）====================
    // 这是原始的贪心算法，按颜色使用量顺序遍历，存在次优配对问题
    // 问题：h1-h2(99%) 但 h1-h3(85%) 先被遍历到，就会配对 h1-h3 而错过最优配对
    // 保留日期：2026-05-18
    /*
    generateMergeSuggestions(colorsByUsage, colorSet, mergeThreshold) {
        const suggestions = [];
        const rgbDistanceThreshold = ((100 - mergeThreshold) / 100) * 255 * 3;
        
        console.log('[近似色融合] 开始生成融合建议');
        console.log('[近似色融合] RGB距离阈值:', rgbDistanceThreshold);
        
        const mergedPairs = new Set();
        
        for (let i = 0; i < colorsByUsage.length; i++) {
            const [nameA, countA] = colorsByUsage[i];
            if (mergedPairs.has(nameA)) continue;
            
            const colorA = colorSet.find(c => c.name === nameA);
            if (!colorA) continue;
            
            let bestMerge = null;
            let minDistance = Infinity;
            let bestCount = 0;
            
            for (let j = i + 1; j < colorsByUsage.length; j++) {
                const [nameB, countB] = colorsByUsage[j];
                if (mergedPairs.has(nameB)) continue;
                
                const colorB = colorSet.find(c => c.name === nameB);
                if (!colorB) continue;
                
                const distance = this.getRgbDistance(colorA.rgb, colorB.rgb);
                
                if (distance <= rgbDistanceThreshold && distance < minDistance) {
                    minDistance = distance;
                    bestMerge = { color: colorB, name: nameB, count: countB };
                    bestCount = countB;
                }
            }
            
            if (bestMerge) {
                const keepColor = countA >= bestCount ? colorA : bestMerge.color;
                const mergeColor = countA >= bestCount ? bestMerge.color : colorA;
                
                suggestions.push({
                    id: suggestions.length,
                    originalColor: mergeColor,
                    replacementColor: keepColor,
                    beanCount: countA >= bestCount ? bestCount : countA,
                    isEdgeColor: false,
                    accepted: true,
                    isMerge: true
                });
                
                mergedPairs.add(nameA);
                mergedPairs.add(bestMerge.name);
                
                console.log(`[近似色融合] ${mergeColor.name} -> ${keepColor.name}, 距离: ${minDistance.toFixed(1)}`);
            }
        }
        
        console.log('[近似色融合] 融合建议数:', suggestions.length);
        return suggestions;
    }
    */

    // ==================== 新算法（全局最优配对）====================
    // 改进思路：
    // 1. 先生成所有满足相似度阈值的候选配对
    // 2. 按相似度从高到低排序（距离越小，相似度越高）
    // 3. 贪心选择最优配对：最相似的颜色对优先被配对
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
    }
    
    getRgbDistance(rgb1, rgb2) {
        const dr = rgb1[0] - rgb2[0];
        const dg = rgb1[1] - rgb2[1];
        const db = rgb1[2] - rgb2[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
    }
    
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
    }

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
    }

    // 计算某个颜色被取消优化的方块数量
    getErasedCountForColor(colorName) {
        let count = 0;
        for (const key of this.erasedBlocks) {
            const [x, y] = key.split(',').map(Number);
            if (this.originalPerlerColors[y][x].name === colorName) {
                count++;
            }
        }
        return count;
    }
    
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
    }

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
    }

    rejectSuggestion(index) {
        if (this.acceptedSuggestions.has(index)) {
            this.acceptedSuggestions.delete(index);
            this.restoreSuggestion(index);
        }
        this.rejectedSuggestions.add(index);
        this.renderOptimizationSummary();
        this.renderSuggestionsList();
        this.drawOptimizationPreview();
    }

    acceptAllSuggestions() {
        this.rejectedSuggestions.clear();
        for (let i = 0; i < this.colorSuggestions.length; i++) {
            this.acceptedSuggestions.add(i);
            this.applySuggestion(i);
        }
        this.renderOptimizationSummary();
        this.renderSuggestionsList();
        this.drawOptimizationPreview();
    }

    rejectAllSuggestions() {
        for (const index of this.acceptedSuggestions) {
            this.restoreSuggestion(index);
        }
        this.acceptedSuggestions.clear();
        this.rejectedSuggestions = new Set(this.colorSuggestions.map((_, i) => i));
        this.renderOptimizationSummary();
        this.renderSuggestionsList();
        this.drawOptimizationPreview();
    }

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
    }

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
    }

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
    }

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
    }

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
    }
    
    saveUnifiedSnapshot(type, description = '', data = null) {
        let perlerColors;
        if (data) {
            perlerColors = data;
        } else if (type === 'custom' && this.customEditData) {
            perlerColors = this.customEditData;
        } else if (this.perlerColors) {
            perlerColors = this.perlerColors;
        } else {
            return;
        }

        // 检查和上一个同类型快照是否一致，如果一致就不保存
        const lastSnapshotOfType = this.unifiedSnapshots
            .slice()
            .reverse()
            .find(s => s.type === type);
        
        if (lastSnapshotOfType) {
            let isEqual = true;
            // 比较颜色矩阵是否完全一致
            for (let y = 0; y < perlerColors.length; y++) {
                for (let x = 0; x < perlerColors[y].length; x++) {
                    const c1 = perlerColors[y][x];
                    const c2 = lastSnapshotOfType.data[y][x];
                    
                    if ((c1.isTransparent !== c2.isTransparent) ||
                        (c1.name !== c2.name) ||
                        (JSON.stringify(c1.rgb) !== JSON.stringify(c2.rgb))) {
                        isEqual = false;
                        break;
                    }
                }
                if (!isEqual) break;
            }
            
            if (isEqual) {
                // 数据一致，不保存新快照
                return;
            }
        }
        
        const snapshotId = Date.now();
        const timestamp = new Date().toLocaleString();
        
        // 计算颜色数量和总拼豆数
        const colorCounts = {};
        let totalBeans = 0;
        perlerColors.forEach(row => {
            row.forEach(color => {
                if (!color.isTransparent) {
                    const name = color.name || 'unknown';
                    colorCounts[name] = (colorCounts[name] || 0) + 1;
                    totalBeans++;
                }
            });
        });
        const colorCount = Object.keys(colorCounts).length;
        
        // 计算与上一个快照的变化量
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
            width: perlerColors.length > 0 ? perlerColors[0].length : 0,
            height: perlerColors.length,
            colorCount,
            totalBeans,
            colorChange,
            beansChange,
            description,
            data: perlerColors.map(row => [...row])
        });
        
        if (this.unifiedSnapshots.length > 50) {
            this.unifiedSnapshots.shift();
        }
        
        this.renderUnifiedSnapshotsList();
        if (this.snapshotsList) {
            this.snapshotsList.style.display = 'block';
        }
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
        
        // 按倒序显示（最新的在最上面）
        const reversedSnapshots = [...this.unifiedSnapshots].reverse();
        
        reversedSnapshots.forEach((snapshot, index) => {
            const realIndex = this.unifiedSnapshots.length - 1 - index;
            const item = document.createElement('div');
            item.className = 'snapshot-item';
            
            const typeIcon = snapshot.type === 'custom' ? '🎨' : '🔧';
            const typeText = snapshot.type === 'custom' ? getI18nText('snapshotTypeCustom') : getI18nText('snapshotTypeOptimize');
            
            // 兼容旧快照：如果没有 width/height 就从 data 推断
            const snapWidth = snapshot.width != null ? snapshot.width : (snapshot.data.length > 0 ? snapshot.data[0].length : 0);
            const snapHeight = snapshot.height != null ? snapshot.height : snapshot.data.length;
            
            const colorChangeClass = snapshot.colorChange > 0 ? 'change-negative' : 'change-positive';
            const beansChangeClass = snapshot.beansChange > 0 ? 'change-negative' : 'change-positive';
            
            const colorChangeText = snapshot.colorChange !== null 
                ? `<span class="${colorChangeClass}">${snapshot.colorChange > 0 ? `+${snapshot.colorChange}` : snapshot.colorChange}</span>` 
                : '';
            const beansChangeText = snapshot.beansChange !== null 
                ? `<span class="${beansChangeClass}">${snapshot.beansChange > 0 ? `+${snapshot.beansChange}` : snapshot.beansChange}</span>` 
                : '';
            
            const descText = snapshot.description ? `<div class="snapshot-item-desc">${snapshot.description}</div>` : '';
            
            item.innerHTML = `
                <div class="snapshot-item-info">
                    <div class="snapshot-item-title">
                        ${typeIcon} ${typeText} ${realIndex + 1}
                        <span style="font-weight: normal; font-size: 12px; color: #888; margin-left: 8px;">${snapWidth} × ${snapHeight}</span>
                    </div>
                    <div class="snapshot-item-meta">
                        ${snapshot.timestamp}
                    </div>
                    <div class="snapshot-item-meta">
                        颜色: ${snapshot.colorCount}${colorChangeText ? ` (${colorChangeText})` : ''} | 
                        拼豆: ${snapshot.totalBeans}${beansChangeText ? ` (${beansChangeText})` : ''}
                    </div>
                    ${descText}
                </div>
                <div class="snapshot-item-actions">
                    <button class="btn btn-primary" data-snapshot-id="${snapshot.id}" data-action="restore">恢复</button>
                    <button class="btn btn-secondary" data-snapshot-id="${snapshot.id}" data-action="delete">删除</button>
                </div>
            `;
            
            item.querySelector('[data-action="restore"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.restoreUnifiedSnapshot(snapshot.id);
            });
            
            item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteUnifiedSnapshot(snapshot.id);
            });
            
            this.snapshotsContainer.appendChild(item);
        });
    }
    
    toggleSnapshotPanel() {
        if (this.snapshotPanel.classList.contains('show')) {
            this.closePanel();
        } else {
            this.snapshotPanel.classList.add('show');
            this.renderUnifiedSnapshotsList();
        }
    }
    
    closePanel() {
        this.snapshotPanel.classList.remove('show');
    }
    
    restoreUnifiedSnapshot(snapshotId) {
        const snapshot = this.unifiedSnapshots.find(s => s.id === snapshotId);
        if (!snapshot) return;
        
        // 恢复拼豆颜色
        this.perlerColors = snapshot.data.map(row => [...row]);
        
        // 重新计算尺寸
        this.perlerHeight = this.perlerColors.length;
        this.perlerWidth = this.perlerHeight > 0 ? this.perlerColors[0].length : 0;
        
        // 重置画布边界为全部显示
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
        
        // 无论是否在拼豆模式，都同步更新 customEditData 和 customEditHistory
        this.customEditData = this.perlerColors.map(row => [...row]);
        this.customEditHistory = [this.customEditData.map(row => [...row])];
        
        // 重新计算 colorCounts
        this.colorCounts = {};
        this.perlerColors.forEach(row => {
            row.forEach(color => {
                if (!color.isTransparent && color.name) {
                    if (this.colorCounts[color.name]) {
                        this.colorCounts[color.name]++;
                    } else {
                        this.colorCounts[color.name] = 1;
                    }
                }
            });
        });
        
        // 更新拼豆尺寸显示
        this.perlerSize.textContent = `${getI18nText('perlerSize')}: ${this.perlerWidth} × ${this.perlerHeight} ${getI18nText('beans')}`;
        
        // 重新绘制
        this.refreshPerlerChartDisplay();
        this.updateColorUsageList();
        
        // 绘制自定义画布
        if (this.customEditCanvas) {
            this.drawCustomEditCanvas();
        }
    }
    
    deleteUnifiedSnapshot(snapshotId) {
        this.unifiedSnapshots = this.unifiedSnapshots.filter(s => s.id !== snapshotId);
        if (this.unifiedSnapshots.length === 0 && this.snapshotsList) {
            this.snapshotsList.style.display = 'none';
        }
        this.renderUnifiedSnapshotsList();
    }
    
    // ==================== 雕刻分裂核心方法 ====================
    
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
    }
    
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
    }
    
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
    }
    
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
    }
    
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
    }
    
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
    }
    
    mergeSelectedBlocks() {
        console.log('合并功能待实现');
    }
    
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
    }
    
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
    }
    
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
    }

    hideShowcase() {
        if (this.showcaseSection) {
            this.showcaseSection.style.display = 'none';
        }
    }

    showShowcase() {
        if (this.showcaseSection) {
            this.showcaseSection.style.display = '';
        }
    }

    hideAllInitialSections() {
        if (this.uploadSection) {
            this.uploadSection.style.display = 'none';
        }
        if (this.showcaseSection) {
            this.showcaseSection.style.display = 'none';
        }
    }

    showAllInitialSections() {
        if (this.uploadSection) {
            this.uploadSection.style.display = '';
        }
        if (this.showcaseSection) {
            this.showcaseSection.style.display = '';
        }
    }

    setWorkspaceMode(mode) {
        this.isBlankCanvasMode = (mode === 'blank');

        if (this.isBlankCanvasMode) {
            if (this.originalSection) this.originalSection.style.display = 'none';
            if (this.pixelatedSection) this.pixelatedSection.style.display = 'none';
            if (this.modeSwitch) this.modeSwitch.style.display = 'none';
            if (this.perlerSection) this.perlerSection.style.display = '';
            if (this.customEditSection) this.customEditSection.style.display = '';
        } else {
            if (this.originalSection) this.originalSection.style.display = '';
            if (this.pixelatedSection) this.pixelatedSection.style.display = '';
            if (this.modeSwitch) this.modeSwitch.style.display = '';
            if (this.perlerSection) this.perlerSection.style.display = '';
            if (this.customEditSection) this.customEditSection.style.display = '';
        }
    }

    openBlankCanvasModal() {
        if (this.blankCanvasModal) {
            document.querySelectorAll('.blank-size-btn').forEach(b => b.classList.remove('active'));
            this.blankCanvasWidth.value = 52;
            this.blankCanvasHeight.value = 52;
            this.blankCanvasModal.style.display = 'flex';
        }
    }

    closeBlankCanvasModal() {
        if (this.blankCanvasModal) {
            this.blankCanvasModal.style.display = 'none';
        }
    }

    createBlankCanvas(width, height) {
        if (!width || !height || width < 8 || height < 8) {
            alert(getI18nText('alertCanvasTooSmall'));
            return;
        }
        if (width > 256 || height > 256) {
            alert(getI18nText('alertCanvasTooLarge'));
            return;
        }

        this.closeBlankCanvasModal();

        this.hideAllInitialSections();
        if (this.workspace) {
            this.workspace.style.display = 'block';
        }

        this.perlerWidth = width;
        this.perlerHeight = height;

        const transparentColor = {
            name: '',
            rgb: [255, 255, 255],
            isTransparent: true,
            displayName: ''
        };

        this.perlerColors = [];
        for (let y = 0; y < height; y++) {
            const row = [];
            for (let x = 0; x < width; x++) {
                row.push({ ...transparentColor });
            }
            this.perlerColors.push(row);
        }

        this.colorCounts = {};

        const colorSetName = this.colorSetSelect.value;
        this.drawPerlerChart(this.perlerColors, width, height, colorSetName);
        this.drawColorLegend();
        this.perlerSize.textContent = `${getI18nText('perlerSize')}: ${width} × ${height} ${getI18nText('beans')}`;
        this.initCustomEditData();

        this.setWorkspaceMode('blank');
    }

    openStrokePanel() {
        if (this.strokePanel) {
            document.querySelectorAll('input[name="strokeType"][value="outer"]').forEach(r => r.checked = true);
            this.strokeThickness.value = 1;
            this.strokeThicknessValue.textContent = '1';
            this.strokeColor.value = '#000000';
            this.strokeColorValue.textContent = '#000000';
            this.strokePanel.style.display = 'block';
        }
    }

    closeStrokePanel() {
        if (this.strokePanel) {
            this.strokePanel.style.display = 'none';
        }
    }

    openColorRemovePanel() {
        if (this.colorRemovePanel) {
            this.colorRemovePanel.style.display = 'block';
        }
    }

    closeColorRemovePanel() {
        if (this.colorRemovePanel) {
            this.colorRemovePanel.style.display = 'none';
            this.pickRemoveColorMode = false;
            this.pickRemoveColorBtn.classList.remove('color-pick-active');
        }
    }

    openColorConvertPanel() {
        if (this.colorConvertPanel) {
            this.colorConvertPanel.style.display = 'block';
        }
    }

    openNoiseFilterPanel() {
        if (this.noiseFilterPanel) {
            this.noiseFilterPanel.style.display = 'block';
        }
    }

    closeNoiseFilterPanel() {
        if (this.noiseFilterPanel) {
            this.noiseFilterPanel.style.display = 'none';
        }
    }

    /**
     * 初始化选区面板
     */
    initSelectionPanel() {
        if (this.selectionPanel) {
            this.selectionPanel.show();
            return;
        }
        
        if (typeof SelectionPanel === 'undefined') {
            console.error('SelectionPanel 模块未加载');
            return;
        }
        
        this.selectionPanel = new SelectionPanel(this);
        
        // 将自定义编辑器的选区管理器关联到面板
        if (this.customEditor && this.customEditor.selectionManager) {
            this.selectionPanel.setSelectionManager(this.customEditor.selectionManager);
            
            // 设置选区管理器回调
            this.customEditor.selectionManager.onChange = () => {
                this.selectionPanel.updateInfo();
                this.drawCustomEditCanvas();
            };
        }
        
        this.selectionPanel.show();
    }
    
    /**
     * 初始化画笔管理器
     */
    initBrushManager() {
        if (this.brushPanel) {
            this.brushPanel.show();
            return;
        }
        
        if (typeof BrushManager === 'undefined' || typeof BrushPanel === 'undefined') {
            console.error('BrushManager 或 BrushPanel 模块未加载');
            return;
        }
        
        // 创建画笔管理器
        this.brushManager = new BrushManager();
        
        // 设置画笔变更回调 - 触发画布重绘以显示预笔迹
        this.brushManager.onBrushChange = () => {
            // 如果当前使用的是 customBrush 工具，重绘画布
            if (this.currentEditTool === 'customBrush' && this.customEditCanvas) {
                // 触发一次重绘，让预笔迹显示
                if (this.lastCustomEditMouseEvent) {
                    this.drawCustomEditCanvas();
                }
            }
        };
        
        // 创建画笔面板
        this.brushPanel = new BrushPanel(this.brushManager);
        
        // 设置保存选区为画笔的事件监听
        document.addEventListener('saveSelectionAsBrush', (e) => {
            this.handleSaveSelectionAsBrush();
        });
        
        // 设置清除当前画笔按钮事件
        const clearBtn = document.getElementById('clearCurrentBrushBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (this.brushManager) {
                    this.brushManager.clearCurrentBrush();
                }
            });
        }
        
        // 设置画笔面板关闭按钮事件
        const closeBtn = document.getElementById('closeBrushBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (this.brushPanel) {
                    this.brushPanel.hide();
                }
                // 只关闭面板，不切换工具，让用户决定何时切回
            });
        }
        
        this.brushPanel.show();
    }
    
    /**
     * 处理保存选区为画笔
     */
    handleSaveSelectionAsBrush() {
        if (!this.customEditor || !this.customEditor.selectionManager) {
            alert('请先创建选区');
            return;
        }
        
        const selectionManager = this.customEditor.selectionManager;
        if (!selectionManager.hasSelection()) {
            alert('请先在画布上创建选区');
            return;
        }
        
        // 获取选区数据 - 直接使用 customEditData
        if (!this.customEditData) {
            alert('没有画布数据');
            return;
        }
        
        const selectionData = selectionManager.exportSelectionData(this.customEditData);
        
        if (!selectionData) {
            alert('导出选区数据失败，请确认选区内容有效');
            return;
        }
        
        // 让用户输入画笔名称
        const defaultName = `画笔 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
        const brushName = prompt('输入画笔名称：', defaultName);
        
        if (!brushName) return;
        
        // 创建画笔
        const brush = this.brushManager.createBrushFromSelection(selectionData, brushName);
        
        if (brush) {
            // 选中新创建的画笔
            this.brushManager.selectBrush(brush.id);
            alert(`✓ 画笔 "${brushName}" 已保存！\n\n现在可以在画布上点击或拖动使用此画笔。`);
        } else {
            alert('创建画笔失败');
        }
    }
    
    /**
     * 刷新自定义编辑画布
     */
    refreshCustomEditCanvas() {
        this.drawCustomEditCanvas();
    }

    openColorQuantizePanel() {
        if (this.colorQuantizePanel) {
            this.colorQuantizePanel.style.display = 'block';
            this.updateQuantizeColorList();
        }
    }

    closeColorQuantizePanel() {
        if (this.colorQuantizePanel) {
            this.colorQuantizePanel.style.display = 'none';
            this.quantizePickMode = false;
            if (this.quantizePickColorBtn) {
                this.quantizePickColorBtn.classList.remove('color-pick-active');
            }
        }
    }

    updateQuantizeColorList() {
        if (!this.quantizeColorList) return;

        if (!this.customEditData) {
            this.quantizeColorList.innerHTML = '<p style="color: #999; font-size: 0.85em; text-align: center; margin: 20px 0;">' + getI18nText('noImageForQuantize') + '</p>';
            return;
        }

        const colorCounts = {};
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                const color = this.customEditData[y][x];
                if (color.isTransparent) continue;
                if (!colorCounts[color.name]) {
                    colorCounts[color.name] = { color, count: 0 };
                }
                colorCounts[color.name].count++;
            }
        }

        const sortedColors = Object.values(colorCounts).sort((a, b) => b.count - a.count);

        if (sortedColors.length === 0) {
            this.quantizeColorList.innerHTML = '<p style="color: #999; font-size: 0.85em; text-align: center; margin: 20px 0;">' + getI18nText('noColorsInImage') + '</p>';
            return;
        }

        let html = '';
        for (const item of sortedColors) {
            const hex = this.rgbToHex(item.color.rgb[0], item.color.rgb[1], item.color.rgb[2]);
            const textColor = getContrastTextColor(item.color.rgb);
            html += `
                <div class="quantize-color-item" style="display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-radius: 4px; cursor: pointer; transition: opacity 0.2s;" data-color="${item.color.name}">
                    <input type="checkbox" class="quantize-color-checkbox" data-color="${item.color.name}" checked style="cursor: pointer;">
                    <div style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid #ddd; background-color: ${hex}; display: flex; align-items: center; justify-content: center; font-size: 0.7em; font-weight: 600; color: ${textColor};">${item.color.name}</div>
                    <span class="quantize-color-name" style="flex: 1; font-size: 0.85em;">${item.color.name}</span>
                    <span class="quantize-color-count" style="font-size: 0.8em; color: #666;">${item.count}</span>
                </div>
            `;
        }
        this.quantizeColorList.innerHTML = html;

        const updateItemVisual = (item, checked) => {
            const nameEl = item.querySelector('.quantize-color-name');
            const countEl = item.querySelector('.quantize-color-count');
            if (checked) {
                item.style.opacity = '1';
                if (nameEl) nameEl.style.textDecoration = 'none';
                if (countEl) countEl.style.opacity = '1';
            } else {
                item.style.opacity = '0.4';
                if (nameEl) nameEl.style.textDecoration = 'line-through';
                if (countEl) countEl.style.opacity = '0.5';
            }
        };

        this.quantizeColorList.querySelectorAll('.quantize-color-item').forEach(item => {
            const checkbox = item.querySelector('.quantize-color-checkbox');
            updateItemVisual(item, checkbox.checked);

            checkbox.addEventListener('change', () => {
                updateItemVisual(item, checkbox.checked);
            });

            item.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const cb = item.querySelector('.quantize-color-checkbox');
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            });
        });
    }

    applyColorQuantize() {
        if (!this.customEditData || !this.customEditor) {
            alert(getI18nText('alertNoEditableImage'));
            return;
        }

        const checkboxes = this.quantizeColorList.querySelectorAll('.quantize-color-checkbox:checked');
        const keepColors = Array.from(checkboxes).map(cb => cb.dataset.color);

        if (keepColors.length === 0) {
            alert(getI18nText('alertNoKeepColors'));
            return;
        }

        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName];
        const mappingMethod = this.colorMappingMethod.value;

        const isInSelection = (x, y) => {
            if (!this.customEditor.selection) return true;
            return this.customEditor.isInSelection(x, y);
        };

        const hasSelection = this.customEditor.selection !== null;

        let affectedCount = 0;
        const keepSet = new Set(keepColors);
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                if (hasSelection && !this.customEditor.isInSelection(x, y)) continue;
                const color = this.customEditData[y][x];
                if (!color.isTransparent && !keepSet.has(color.name)) {
                    affectedCount++;
                }
            }
        }

        if (affectedCount === 0) {
            alert(getI18nText('alertNoColorsToQuantize'));
            return;
        }

        console.log(`正在进行颜色量化，保留 ${keepColors.length} 种颜色，影响 ${affectedCount} 个色块...`);

        this.saveCustomEditHistory();

        const newData = quantizePerlerColors(
            this.customEditData,
            keepColors,
            colorSet,
            mappingMethod,
            hasSelection ? isInSelection : null
        );

        this.customEditData = newData;
        this.drawCustomEditCanvas();

        this.updateQuantizeColorList();

        console.log('颜色量化完成！');
    }

    closeColorConvertPanel() {
        if (this.colorConvertPanel) {
            this.colorConvertPanel.style.display = 'none';
            this.colorConvertPickMode = null;
            this.pickSourceColorBtn.classList.remove('color-pick-active');
            this.pickTargetColorBtn.classList.remove('color-pick-active');
        }
    }

    initColorConvertPanelDrag() {
        if (!this.colorConvertPanel || !this.colorConvertPanelHeader) return;

        const panel = this.colorConvertPanel;
        const header = this.colorConvertPanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeColorConvertBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.colorConvertPanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.colorConvertPanelDragState || !this.colorConvertPanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.colorConvertPanelDragState) {
                this.colorConvertPanelDragState.dragging = false;
            }
        });
    }

    initStrokePanelDrag() {
        if (!this.strokePanel || !this.strokePanelHeader) return;

        const panel = this.strokePanel;
        const header = this.strokePanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeStrokePanelBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.strokePanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.strokePanelDragState || !this.strokePanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.strokePanelDragState) {
                this.strokePanelDragState.dragging = false;
            }
        });
    }

    initColorRemovePanelDrag() {
        if (!this.colorRemovePanel || !this.colorRemovePanelHeader) return;

        const panel = this.colorRemovePanel;
        const header = this.colorRemovePanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeColorRemoveBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.colorRemovePanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.colorRemovePanelDragState || !this.colorRemovePanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.colorRemovePanelDragState) {
                this.colorRemovePanelDragState.dragging = false;
            }
        });
    }

    initNoiseFilterPanelDrag() {
        if (!this.noiseFilterPanel || !this.noiseFilterPanelHeader) return;

        const panel = this.noiseFilterPanel;
        const header = this.noiseFilterPanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeNoiseFilterBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.noiseFilterPanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.noiseFilterPanelDragState || !this.noiseFilterPanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.noiseFilterPanelDragState) {
                this.noiseFilterPanelDragState.dragging = false;
            }
        });
    }

    initColorQuantizePanelDrag() {
        if (!this.colorQuantizePanel || !this.colorQuantizePanelHeader) return;

        const panel = this.colorQuantizePanel;
        const header = this.colorQuantizePanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeColorQuantizeBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.colorQuantizePanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.colorQuantizePanelDragState || !this.colorQuantizePanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.colorQuantizePanelDragState) {
                this.colorQuantizePanelDragState.dragging = false;
            }
        });
    }

    initShowcase() {
        if (!this.showcaseGrid || !this.showcaseSection) return;

        this.showcaseLoaded = false;
        this.showcaseSkeleton = this.createShowcaseSkeleton(6);
        this.showcaseGrid.appendChild(this.showcaseSkeleton);
        this.loadAndRenderShowcase();
    }

    createShowcaseSkeleton(count) {
        const container = document.createElement('div');
        container.style.cssText = 'display: contents;';

        const skeletonCount = count || 6;
        for (let i = 0; i < skeletonCount; i++) {
            const card = document.createElement('div');
            card.className = 'showcase-card showcase-skeleton-card';

            const preview = document.createElement('div');
            preview.className = 'showcase-preview showcase-skeleton-preview';

            const name = document.createElement('div');
            name.className = 'showcase-name showcase-skeleton-info';
            name.style.height = '20px';
            name.style.lineHeight = '20px';
            name.style.width = '60%';
            name.style.margin = '4px auto 4px';
            name.style.borderRadius = '4px';

            const info = document.createElement('div');
            info.className = 'showcase-info showcase-skeleton-info';
            info.style.height = '18px';
            info.style.lineHeight = '18px';
            info.style.width = '70%';
            info.style.margin = '0 auto';
            info.style.borderRadius = '4px';

            card.appendChild(preview);
            card.appendChild(name);
            card.appendChild(info);
            container.appendChild(card);
        }

        return container;
    }

    async loadAndRenderShowcase() {
        try {
            this.allPackedItems = await this.loadSamplePatternsRaw();
            this.currentShowcasePage = 0;
            this.showcasePageSize = 10;
            if (this.showcaseSkeleton) this.showcaseSkeleton.remove();
            await this.renderShowcasePage();
            this.setupShowcaseScrollListener();
        } catch (err) {
            console.warn('加载示例图纸失败:', err);
            if (this.showcaseSkeleton) this.showcaseSkeleton.remove();
            this.showcaseError();
        }
    }

    async renderShowcasePage() {
        const start = this.currentShowcasePage * this.showcasePageSize;
        const end = start + this.showcasePageSize;
        const items = this.allPackedItems.slice(start, end);

        if (items.length === 0) {
            this.removeShowcaseScrollListener();
            return;
        }

        const cards = await this.createSampleCards(items);
        cards.forEach((card) => this.showcaseGrid.appendChild(card));
        this.currentShowcasePage++;

        if (end >= this.allPackedItems.length) {
            this.removeShowcaseScrollListener();
        }
    }

    async createSampleCards(items) {
        const cards = [];
        for (const item of items) {
            if (!item.packedData) continue;
            try {
                const infoPaper = await this.infoPaperManager.compressor.unpack(item.packedData);
                const sample = this.infoPaperManager.converter.fromInfoPaper(infoPaper);
                if (sample) {
                    const card = this.createSampleCard(sample);
                    cards.push(card);
                }
            } catch (e) {
                console.warn('解码示例图纸失败:', e);
            }
        }
        return cards;
    }

    setupShowcaseScrollListener() {
        this.showcaseScrollHandler = () => {
            const showcase = this.showcaseSection;
            if (!showcase) return;

            const rect = showcase.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            
            if (rect.bottom <= windowHeight + 200) {
                this.renderShowcasePage();
            }
        };

        window.addEventListener('scroll', this.showcaseScrollHandler, { passive: true });
    }

    removeShowcaseScrollListener() {
        if (this.showcaseScrollHandler) {
            window.removeEventListener('scroll', this.showcaseScrollHandler);
            this.showcaseScrollHandler = null;
        }
    }

    createSampleCard(sample) {
        const card = document.createElement('div');
        card.className = 'showcase-card';

        const preview = document.createElement('div');
        preview.className = 'showcase-preview';

        const canvas = document.createElement('canvas');
        this.renderPreviewCanvas(canvas, sample.perlerColors, sample.width, sample.height);
        preview.appendChild(canvas);

        const info = document.createElement('div');
        info.className = 'showcase-info';
        const colorCount = Object.keys(sample.colorCounts).length;
        info.textContent = `${sample.width} × ${sample.height} · ${colorCount} ${getI18nText('colorCountText')}`;

        card.appendChild(preview);
        card.appendChild(info);

        card.addEventListener('click', () => {
            this.launchSampleFocusMode(sample.perlerColors, sample.width, sample.height, sample.colorSet);
        });

        return card;
    }

    async loadSamplePatternsRaw() {
        const url = new URL(`sample-patterns.json?v=${this.APP_VERSION}`, location.href).href;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    showcaseError() {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 20px;';

        const msg = document.createElement('div');
        msg.style.cssText = 'color: #d9534f; margin-bottom: 12px; font-size: 14px;';
        msg.textContent = getI18nText('sampleLoadFailed');

        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn';
        retryBtn.textContent = getI18nText('reloadSample');
        retryBtn.style.cssText = 'background: #667eea; color: #fff; border-color: #667eea; padding: 8px 20px; cursor: pointer;';
        retryBtn.addEventListener('click', () => {
            wrapper.remove();
            this.showcaseLoaded = false;
            this.initShowcase();
        });

        wrapper.appendChild(msg);
        wrapper.appendChild(retryBtn);
        this.showcaseGrid.appendChild(wrapper);
    }

    renderPreviewCanvas(canvas, perlerColors, width, height) {
        const cellSize = Math.max(4, Math.min(16, Math.floor(160 / Math.max(width, height))));
        canvas.width = width * cellSize;
        canvas.height = height * cellSize;
        const ctx = canvas.getContext('2d');

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const color = perlerColors[y][x];
                if (color.isTransparent) continue;
                ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }
    }

    launchSampleFocusMode(perlerColors, width, height, colorSet) {
        this.hideShowcase();
        const container = document.createElement('div');
        container.id = 'focus-mode-container';
        document.body.appendChild(container);

        this.focusModeRenderer.init(
            '#focus-mode-container',
            perlerColors,
            width,
            height,
            colorSet,
            () => {
                this.showShowcase();
                document.body.removeChild(container);
            }
        );
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window._pixelArtGenerator = new PixelArtGenerator();
    initMatrixTimer();
});

function initMatrixTimer() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const uploadSection = document.getElementById('uploadSection');
    const workspace = document.getElementById('workspace');
    const showcaseSection = document.getElementById('showcaseSection');
    const timerSection = document.getElementById('timerSection');
    const myDesignsSection = document.getElementById('myDesignsSection');
    const addTimerBtn = document.getElementById('addTimerBtn');
    const timersGrid = document.getElementById('timersGrid');
    const brandTitle = document.getElementById('brandTitle');

    let myDesignsManager = new MyDesignsManager();
    let timerCount = 0;

    // 我的图纸 - 保存按钮
    const saveToMyDesignsBtn = document.getElementById('saveToMyDesignsBtn');
    if (saveToMyDesignsBtn) {
        const originalText = saveToMyDesignsBtn.innerHTML;
        saveToMyDesignsBtn.addEventListener('click', async () => {
            const gen = window._pixelArtGenerator;
            if (!gen || !gen.perlerColors || !gen.perlerColors.length) {
                alert(getI18nText('alertNoPerlerRendered'));
                return;
            }
            if (!myDesignsManager) myDesignsManager = new MyDesignsManager();
            
            // 显示 loading 状态
            saveToMyDesignsBtn.disabled = true;
            saveToMyDesignsBtn.innerHTML = '⏳ 保存中...';
            
            try {
                let colorSet = gen.colorSetSelect ? gen.colorSetSelect.value : 'mard291';
                if (!colorSets[colorSet]) {
                    colorSet = 'mard291';
                }
                await myDesignsManager.saveDesign(gen.perlerColors, gen.perlerWidth, gen.perlerHeight, colorSet);
                
                // 显示成功状态
                saveToMyDesignsBtn.innerHTML = '✅ 保存成功！';
                setTimeout(() => {
                    const goToMyDesigns = confirm(
                        `${getI18nText('alertSaveSuccess')}\n\n是否立即前往"我的图纸"查看？`
                    );
                    if (goToMyDesigns) {
                        const myDesignsNavBtn = Array.from(navBtns).find(b => b.dataset.section === 'myDesigns');
                        if (myDesignsNavBtn) myDesignsNavBtn.click();
                    }
                }, 300);
            } catch (err) {
                alert(err.message);
            } finally {
                // 恢复按钮状态
                setTimeout(() => {
                    saveToMyDesignsBtn.disabled = false;
                    saveToMyDesignsBtn.innerHTML = originalText;
                }, 1500);
            }
        });
    }

    // 我的图纸 - 导入按钮
    const importDesignBtn = document.getElementById('importDesignBtn');
    const importDesignFile = document.getElementById('importDesignFile');
    if (importDesignBtn && importDesignFile) {
        const originalImportText = importDesignBtn.innerHTML;
        importDesignBtn.addEventListener('click', () => importDesignFile.click());
        importDesignFile.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!myDesignsManager) myDesignsManager = new MyDesignsManager();
            
            importDesignBtn.disabled = true;
            importDesignBtn.innerHTML = '⏳ 导入中...';
            
            try {
                await myDesignsManager.importDesignFromFile(file);
                importDesignBtn.innerHTML = '✅ 导入成功';
                renderMyDesigns();
                alert(getI18nText('alertImportSuccess'));
                setTimeout(() => {
                    importDesignBtn.innerHTML = originalImportText;
                    importDesignBtn.disabled = false;
                }, 1200);
            } catch (err) {
                importDesignBtn.innerHTML = originalImportText;
                importDesignBtn.disabled = false;
                alert(err.message);
            }
            importDesignFile.value = '';
        });
    }

    function formatDate(ts) {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    function renderMyDesigns() {
        if (!myDesignsManager) myDesignsManager = new MyDesignsManager();
        const grid = document.getElementById('myDesignsGrid');
        const empty = document.getElementById('myDesignsEmpty');
        const count = document.getElementById('myDesignsCount');
        if (!grid || !empty || !count) return;

        const designs = myDesignsManager.getAllDesigns();
        count.textContent = `(${designs.length}/${myDesignsManager.maxDesigns})`;

        if (designs.length === 0) {
            grid.innerHTML = '';
            grid.appendChild(empty);
            empty.style.display = 'block';
            return;
        }

        grid.innerHTML = '';
        for (const design of designs) {
            const card = document.createElement('div');
            card.className = 'my-design-card';
            card.dataset.id = design.id;

            const thumbHtml = design.thumbnail
                ? `<img src="${design.thumbnail}" class="my-design-thumb" alt="">`
                : `<div class="my-design-thumb-placeholder">🎨</div>`;

            card.innerHTML = `
                ${thumbHtml}
                <div class="my-design-info">
                    <div class="my-design-size">${design.width} × ${design.height}</div>
                    <div class="my-design-meta">${design.totalColors} ${getI18nText('colors')} · ${formatDate(design.timestamp)}</div>
                </div>
                <div class="my-design-actions">
                    <button class="btn btn-primary my-design-load" data-id="${design.id}" data-i18n="loadDesign">载入</button>
                    <button class="btn btn-secondary my-design-copy" data-id="${design.id}" data-i18n="copyDesign">复制</button>
                    <button class="btn btn-secondary my-design-export" data-id="${design.id}" data-i18n="exportDesign">导出</button>
                    <button class="btn btn-danger my-design-delete" data-id="${design.id}" data-i18n="deleteDesign">删除</button>
                </div>
            `;
            grid.appendChild(card);
        }

        grid.querySelectorAll('.my-design-load').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '⏳ 载入中...';
                
                try {
                    const result = await myDesignsManager.loadDesign(id);
                    const generator = window._pixelArtGenerator;
                    if (generator) {
                        generator.perlerColors = result.perlerColors;
                        generator.perlerWidth = result.width;
                        generator.perlerHeight = result.height;
                        generator.colorCounts = result.colorCounts;
                        if (generator.colorSetSelect) {
                            if (colorSets[result.colorSet]) {
                                generator.colorSetSelect.value = result.colorSet;
                            } else {
                                console.warn(`颜色集 ${result.colorSet} 不存在，使用 mard291`);
                                generator.colorSetSelect.value = 'mard291';
                            }
                        }
                        
                        // 先切换到工作区，再渲染
                        if (generator.workspace) generator.workspace.style.display = 'block';
                        if (generator.uploadSection) generator.uploadSection.style.display = 'none';
                        if (generator.showcaseSection) generator.showcaseSection.style.display = 'none';
                        if (myDesignsSection) myDesignsSection.style.display = 'none';
                        
                        navBtns.forEach(b => b.classList.remove('active'));
                        const homeBtn = Array.from(navBtns).find(b => b.dataset.section === 'imageToPerler');
                        if (homeBtn) homeBtn.classList.add('active');
                        
                        // 更新摘要信息
                        generator.updatePerlerSummary(result.width, result.height, result.colorSet || 'mard291');
                        
                        // 最后渲染图表
                        setTimeout(() => {
                            generator.drawPerlerChart(result.perlerColors, result.width, result.height, result.colorSet || 'mard291');
                        }, 50);
                    }
                    btn.innerHTML = '✅ 载入成功';
                    alert(getI18nText('alertLoadSuccess'));
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }, 1000);
                } catch (err) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    alert(getI18nText('alertLoadFailed') + ': ' + err.message);
                }
            });
        });

        grid.querySelectorAll('.my-design-export').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '⏳ 导出中...';
                
                try {
                    const json = await myDesignsManager.exportDesignToJSON(id);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `perler-design-${id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    btn.innerHTML = '✅ 已导出';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }, 1000);
                    alert(getI18nText('alertExportSuccess'));
                } catch (err) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    alert(err.message);
                }
            });
        });

        grid.querySelectorAll('.my-design-copy').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '⏳ 复制中...';
                
                try {
                    await myDesignsManager.copyCompressedDataToClipboard(id);
                    btn.innerHTML = '✅ 已复制';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }, 1500);
                } catch (err) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    alert(getI18nText('alertCopyFailed') + ': ' + err.message);
                }
            });
        });

        grid.querySelectorAll('.my-design-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                if (!confirm(getI18nText('confirmDeleteDesign'))) return;
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '🗑️';
                try {
                    myDesignsManager.deleteDesign(id);
                    renderMyDesigns();
                } catch (err) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    alert(err.message);
                }
            });
        });
    }

    function goToHomePage() {
        navBtns.forEach(b => b.classList.remove('active'));
        const homeBtn = Array.from(navBtns).find(b => b.dataset.section === 'imageToPerler');
        if (homeBtn) homeBtn.classList.add('active');
        uploadSection.style.display = 'block';
        if (showcaseSection) showcaseSection.style.display = 'none';
        if (workspace) workspace.style.display = 'none';
        if (timerSection) timerSection.style.display = 'none';
        if (myDesignsSection) myDesignsSection.style.display = 'none';
    }

    // 导航切换
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (btn.dataset.section === 'imageToPerler') {
                uploadSection.style.display = 'block';
                if (showcaseSection) showcaseSection.style.display = 'none';
                if (workspace) workspace.style.display = 'none';
                if (timerSection) timerSection.style.display = 'none';
                if (myDesignsSection) myDesignsSection.style.display = 'none';
            } else if (btn.dataset.section === 'circular') {
                window.location.href = 'circular.html';
            } else if (btn.dataset.section === 'myDesigns') {
                uploadSection.style.display = 'none';
                if (showcaseSection) showcaseSection.style.display = 'none';
                workspace.style.display = 'none';
                timerSection.style.display = 'none';
                if (myDesignsSection) {
                    myDesignsSection.style.display = 'block';
                    renderMyDesigns();
                }
            } else if (btn.dataset.section === 'timer') {
                uploadSection.style.display = 'none';
                if (showcaseSection) showcaseSection.style.display = 'none';
                workspace.style.display = 'none';
                timerSection.style.display = 'block';
                if (myDesignsSection) myDesignsSection.style.display = 'none';
            } else if (btn.dataset.section === 'workbench') {
                window.location.href = 'workbench.html';
            }
        });
    });

    if (brandTitle) {
        brandTitle.style.cursor = 'pointer';
        brandTitle.addEventListener('click', goToHomePage);
    }
    
    // 添加计时器
    addTimerBtn.addEventListener('click', () => {
        const modal = document.getElementById('timerModal');
        modal.style.display = 'flex';
        
        // 重置表单
        document.getElementById('modal-hours').value = '0';
        document.getElementById('modal-minutes').value = '0';
        document.getElementById('modal-title').value = '';
    });
    
    // 关闭弹窗
    document.getElementById('closeTimerModalBtn').addEventListener('click', () => {
        document.getElementById('timerModal').style.display = 'none';
    });
    
    // 取消添加
    document.getElementById('cancelAddTimerBtn').addEventListener('click', () => {
        document.getElementById('timerModal').style.display = 'none';
    });
    
    // 确认添加计时器
    document.getElementById('confirmAddTimerBtn').addEventListener('click', () => {
        const hours = parseInt(document.getElementById('modal-hours').value) || 0;
        const minutes = parseInt(document.getElementById('modal-minutes').value) || 1;
        const title = document.getElementById('modal-title').value || `${getI18nText('timerTitlePlaceholder')} ${timerCount + 1}`;
        
        if (hours <= 0 && minutes <= 0) {
            alert(getI18nText('alertTimerNotSet'));
            return;
        }
        
        timerCount++;
        const timerId = `timer-${timerCount}`;
        const timerCard = document.createElement('div');
        timerCard.className = 'timer-card';
        timerCard.innerHTML = `
            <div class="timer-title">${title}</div>
            <div class="timer-display" id="${timerId}-display">${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00</div>
            <div class="timer-controls">
                <button class="timer-btn" id="${timerId}-start">开始</button>
                <button class="timer-btn" id="${timerId}-pause">暂停</button>
                <button class="timer-btn" id="${timerId}-reset">重置</button>
                <button class="timer-btn btn-danger" id="${timerId}-delete">删除</button>
            </div>
        `;
        timersGrid.appendChild(timerCard);
        
        initTimer(timerId, hours, minutes, 0);
        
        document.getElementById('timerModal').style.display = 'none';
    });
    
    // 初始化第一个计时器
    timerCount++;
    const timerId = `timer-${timerCount}`;
    const timerCard = document.createElement('div');
    timerCard.className = 'timer-card';
    timerCard.innerHTML = `
        <div class="timer-title">计时器 1</div>
        <div class="timer-display" id="${timerId}-display">00:00:00</div>
        <div class="timer-controls">
            <button class="timer-btn" id="${timerId}-start">开始</button>
            <button class="timer-btn" id="${timerId}-pause">暂停</button>
            <button class="timer-btn" id="${timerId}-reset">重置</button>
            <button class="timer-btn btn-danger" id="${timerId}-delete">删除</button>
        </div>
    `;
    timersGrid.appendChild(timerCard);
    initTimer(timerId, 0, 0, 0);
}

function initTimer(timerId, initialHours, initialMinutes, initialSeconds) {
    const display = document.getElementById(`${timerId}-display`);
    const startBtn = document.getElementById(`${timerId}-start`);
    const pauseBtn = document.getElementById(`${timerId}-pause`);
    const resetBtn = document.getElementById(`${timerId}-reset`);
    const deleteBtn = document.getElementById(`${timerId}-delete`);
    
    let remainingTime = initialHours * 3600 + initialMinutes * 60 + initialSeconds;
    let originalTime = remainingTime;
    let timerInterval = null;
    let isRunning = false;
    
    function updateDisplay() {
        const hours = Math.floor(remainingTime / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((remainingTime % 3600) / 60).toString().padStart(2, '0');
        const seconds = (remainingTime % 60).toString().padStart(2, '0');
        display.textContent = `${hours}:${minutes}:${seconds}`;
        
        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            isRunning = false;
            startBtn.classList.remove('active');
            pauseBtn.classList.remove('active');
            alert(getI18nText('alertTimerFinished'));
        }
    }
    
    startBtn.addEventListener('click', () => {
        if (!isRunning) {
            if (remainingTime <= 0) {
                remainingTime = originalTime;
            }
            
            if (remainingTime <= 0) {
                alert(getI18nText('alertTimerNotSet'));
                return;
            }
            
            timerInterval = setInterval(() => {
                remainingTime--;
                updateDisplay();
            }, 1000);
            isRunning = true;
            startBtn.classList.add('active');
            pauseBtn.classList.remove('active');
        }
    });
    
    pauseBtn.addEventListener('click', () => {
        if (isRunning) {
            clearInterval(timerInterval);
            isRunning = false;
            pauseBtn.classList.add('active');
            startBtn.classList.remove('active');
        }
    });
    
    resetBtn.addEventListener('click', () => {
        clearInterval(timerInterval);
        remainingTime = originalTime;
        isRunning = false;
        updateDisplay();
        startBtn.classList.remove('active');
        pauseBtn.classList.remove('active');
    });
    
    deleteBtn.addEventListener('click', () => {
        clearInterval(timerInterval);
        const timerCard = document.getElementById(`${timerId}-display`).parentElement;
        timerCard.remove();
    });
}
