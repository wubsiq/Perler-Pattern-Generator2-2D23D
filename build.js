const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const projectRoot = __dirname;

console.log('========== 豆师傅网站构建脚本 ==========\n');

console.log('[0/3] 清理旧的构建文件');
const cleanupDirs = ['js', 'css'];
cleanupDirs.forEach(dir => {
    const dirPath = path.join(projectRoot, dir);
    if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        const oldBundles = files.filter(f => f.match(/^(bundle|style)\..*\.min\.(js|css)$/));
        oldBundles.forEach(file => {
            fs.unlinkSync(path.join(dirPath, file));
            console.log(`  删除: ${dir}/${file}`);
        });
        if (oldBundles.length > 0) {
            console.log(`  共清理 ${oldBundles.length} 个旧文件`);
        } else {
            console.log(`  无旧文件需要清理`);
        }
    }
});
console.log('');

// 步骤 0.5: 更新 BrushLibraryManager.js 中的默认画笔数据
console.log('[0.5] 同步画笔数据');
const brushLibPath = path.join(projectRoot, 'js', 'BrushLibraryManager.js');
const presetBrushesPath = path.join(projectRoot, 'data', 'preset-brushes.json');

if (fs.existsSync(brushLibPath) && fs.existsSync(presetBrushesPath)) {
    const brushLibContent = fs.readFileSync(brushLibPath, 'utf8');
    const presetBrushesData = JSON.parse(fs.readFileSync(presetBrushesPath, 'utf8'));
    
    // 检查是否有自定义画笔
    if (presetBrushesData.brushes && presetBrushesData.brushes.length > 0) {
        // 构建新的 DEFAULT_BRUSHES 常量
        const newDefaultBrushes = JSON.stringify({
            version: presetBrushesData.version || "1.0",
            brushes: presetBrushesData.brushes
        }, null, 2);
        
        // 替换原有的 DEFAULT_BRUSHES 定义
        const updatedContent = brushLibContent.replace(
            /const DEFAULT_BRUSHES = \{[\s\S]*?\};/,
            `const DEFAULT_BRUSHES = ${newDefaultBrushes};`
        );
        
        fs.writeFileSync(brushLibPath, updatedContent, 'utf8');
        console.log(`  ✓ 已更新 BrushLibraryManager.js，包含 ${presetBrushesData.brushes.length} 个预设画笔`);
    } else {
        console.log('  - preset-brushes.json 为空，使用默认画笔');
    }
} else {
    console.log('  - 跳过画笔数据同步（文件不存在）');
}
console.log('');

const jsFiles = [
    // 澡巾织纹 tile（内联 dataURL）。
    // 必须排在 IronPreviewMixin 之前 —— 后者在运行时读 window.IRON_ZAOJIN_TILES。
    // 放这里而不是引外部 PNG，是因为 file:// 协议下加载外部图片会污染画布，
    // 而熨烫预览的像素级浮雕必须 getImageData 读像素 → SecurityError。
    'data/iron-textures/tiles.js',
    'js/colors.js',
    'js/bead-palette.js',
    'js/BrushLibraryManager.js',
    'js/BrushManager.js',
    'js/BrushPanel.js',
    'js/SelectionManager.js',
    'js/SelectionPanel.js',
    'js/colorUtils.js',
    'js/i18n.js',
    'modules/Pixelator.js',
    'modules/PerlerGenerator.js',
    'modules/InfoPaperConverter.js',
    'modules/InfoPaperCompressor.js',
    'modules/InfoPaperManager.js',
    'modules/FocusModeRenderer.js',
    'modules/MyDesignsManager.js',
    'modules/CustomEditor.js',
    'js/app.js',
    'mixins/SmartOptimizeMixin.js',
    'mixins/SmartOptimizeCoreMixin.js',
    'mixins/SnapshotMixin.js',
    'mixins/ShowcaseMixin.js',
    'mixins/ImageCropMixin.js',
    'mixins/CursorBoundsMixin.js',
    'mixins/CarveMixin.js',
    'mixins/PixelArtMixin.js',
    'mixins/PerlerRenderMixin.js',
    'mixins/FileIOMixin.js',
    'mixins/WorkspaceMixin.js',
    'mixins/QuantizeDragMixin.js',
    'mixins/CustomEditMixin.js',
    'mixins/IronPreviewMixin.js'
];

console.log('[1/2] 构建 JS bundle');
console.log(`  输入文件: ${jsFiles.length} 个`);

let totalInputSize = 0;
let combined = '';
for (const file of jsFiles) {
    const fullPath = path.join(projectRoot, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    totalInputSize += content.length;
    console.log(`    + ${file} (${(content.length / 1024).toFixed(1)} KB)`);
    combined += content + '\n';
}

console.log(`  原始大小: ${(totalInputSize / 1024).toFixed(1)} KB`);

const jsHash = crypto.createHash('md5').update(combined).digest('hex').substring(0, 8);
const jsOutputName = `bundle.${jsHash}.min.js`;
const jsOutputPath = path.join(projectRoot, 'js', jsOutputName);

esbuild.buildSync({
    stdin: {
        contents: combined,
        loader: 'js',
        resolveDir: projectRoot,
    },
    outfile: jsOutputPath,
    minify: true,
    target: ['es2018'],
    charset: 'utf8',
    logLevel: 'error',
});

const jsOutputSize = fs.statSync(jsOutputPath).size;
const jsRatio = ((jsOutputSize / totalInputSize) * 100).toFixed(1);
console.log(`  输出文件: js/${jsOutputName} (${(jsOutputSize / 1024).toFixed(1)} KB)`);
console.log(`  压缩比: ${jsRatio}% (节省 ${(100 - parseFloat(jsRatio)).toFixed(1)}%)`);
console.log(`  HTTP 请求数: ${jsFiles.length} → 1\n`);

console.log('[2/2] 构建 CSS bundle');
const cssFiles = ['css/style.css', 'css/style-new.css'];
let totalCssSize = 0;
let cssCombined = '';
for (const file of cssFiles) {
    const fullPath = path.join(projectRoot, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    totalCssSize += content.length;
    cssCombined += content + '\n';
}
console.log(`  输入文件: ${cssFiles.length} 个 (${(totalCssSize / 1024).toFixed(1)} KB)`);

const cssHash = crypto.createHash('md5').update(cssCombined).digest('hex').substring(0, 8);
const cssOutputName = `style.${cssHash}.min.css`;
const cssOutputPath = path.join(projectRoot, 'css', cssOutputName);

fs.writeFileSync(path.join(projectRoot, 'css', '_combined.css'), cssCombined, 'utf8');
esbuild.buildSync({
    entryPoints: [path.join(projectRoot, 'css', '_combined.css')],
    outfile: cssOutputPath,
    minify: true,
    charset: 'utf8',
    logLevel: 'error',
});
fs.unlinkSync(path.join(projectRoot, 'css', '_combined.css'));

const cssOutputSize = fs.statSync(cssOutputPath).size;
const cssRatio = ((cssOutputSize / totalCssSize) * 100).toFixed(1);
console.log(`  输出文件: css/${cssOutputName} (${(cssOutputSize / 1024).toFixed(1)} KB)`);
console.log(`  压缩比: ${cssRatio}% (节省 ${(100 - parseFloat(cssRatio)).toFixed(1)}%)\n`);

const totalInput = (totalInputSize + totalCssSize) / 1024;
const totalOutput = (jsOutputSize + cssOutputSize) / 1024;
const totalRatio = ((totalOutput / totalInput) * 100).toFixed(1);

console.log('[3/3] 更新 HTML 文件引用');
const htmlFiles = ['index.html', 'circular.html'];
for (const htmlFile of htmlFiles) {
    const htmlPath = path.join(projectRoot, htmlFile);
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    htmlContent = htmlContent.replace(
        /css\/style\.[a-f0-9]{8}\.min\.css/g,
        `css/${cssOutputName}`
    );
    htmlContent = htmlContent.replace(
        /css\/style\.min\.css/g,
        `css/${cssOutputName}`
    );
    
    htmlContent = htmlContent.replace(
        /js\/bundle\.[a-f0-9]{8}\.min\.js/g,
        `js/${jsOutputName}`
    );
    htmlContent = htmlContent.replace(
        /js\/bundle\.min\.js/g,
        `js/${jsOutputName}`
    );
    
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`    + ${htmlFile}`);
}

console.log('\n========== 构建完成 ==========');
console.log(`总原始大小: ${totalInput.toFixed(1)} KB`);
console.log(`总压缩后大小: ${totalOutput.toFixed(1)} KB`);
console.log(`总压缩比: ${totalRatio}% (节省 ${(100 - parseFloat(totalRatio)).toFixed(1)}%)`);
console.log(`HTTP 请求数: ${jsFiles.length + cssFiles.length} → 2`);
console.log('===============================');
