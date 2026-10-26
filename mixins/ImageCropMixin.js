/**
 * ImageCropMixin — 图片上传/加载/旋转/裁剪/确认-20方法
 * 来源: app.js L1297-L1867
 * 提取时间: 2026-10-02 14:58:03
 */

const ImageCropMixin = {
    loadImage(file) {
        console.log('开始加载图片:', file.name, '类型:', file.type, '大小:', file.size);

        if (!file.type.startsWith('image/')) {
            console.warn('文件类型不标准，尝试继续加载');
        }

        if (file.size > 20 * 1024 * 1024) {
            alert(getI18nText('alertFileTooLarge'));
            return;
        }

        // ============================================================
        //  【为什么必须用 FileReader 而不是 URL.createObjectURL】
        // ============================================================
        //  用 blob: URL 时，双击 index.html 以 file:// 协议打开会报：
        //      SecurityError: Failed to execute 'getImageData' on
        //      'CanvasRenderingContext2D': The canvas has been tainted
        //      by cross-origin data.
        //
        //  原因：file:// 页面的 origin 是"不透明来源"(opaque origin)，
        //  而 blob: URL 继承创建者的 origin → 两者不匹配 →
        //  画布被判定为 tainted，后续所有 getImageData / toDataURL 全被拒。
        //
        //  这条链路上有十几处 getImageData（像素化、颜色统计、画笔、剃刀…），
        //  所以一旦污染，整个编辑器都不能用了。
        //
        //  FileReader 读出来的 dataURL 是纯字符串，不带来源信息 →
        //  任何协议下都同源，画布不会被污染。
        //
        //  代价：多一次 base64 编码（20MB 图约多占 1.3 倍内存、几十毫秒），
        //  换来 file:// 双击也能完整跑通 —— 对这个项目是明确划算的。
        const reader = new FileReader();

        reader.onload = () => {
            const dataURL = reader.result;
            const img = new Image();
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
            };
            img.onerror = (error) => {
                console.error('图片加载失败:', error);
                alert(getI18nText('alertImageLoadFailed'));
            };
            img.src = dataURL;
        };

        reader.onerror = () => {
            console.error('图片读取失败:', reader.error);
            alert(getI18nText('alertImageLoadFailed'));
        };

        reader.readAsDataURL(file);
    },

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
    },

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
    },

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
    },

    toggleCropMode() {
        this.isCropMode = !this.isCropMode;
        if (this.isCropMode) {
            this.enterCropMode();
        } else {
            this.exitCropMode();
        }
    },

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
    },

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
    },

    cancelCrop() {
        this.isCropMode = false;
        this.exitCropMode();
    },

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
    },

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
    },

    getCropEventPos(e) {
        const overlayRect = this.cropOverlay.getBoundingClientRect();
        return {
            x: e.clientX - overlayRect.left,
            y: e.clientY - overlayRect.top,
            containerW: overlayRect.width,
            containerH: overlayRect.height
        };
    },

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
    },

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
    },

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
    },

    cropTouchMove(e) {
        if (!this.isCropMode || e.touches.length !== 1) return;
        const touch = e.touches[0];
        const mouseLikeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => e.preventDefault()
        };
        this.cropMouseMove(mouseLikeEvent);
    },

    cropMouseUp(e) {
        this.isCreatingCrop = false;
        this.isDraggingCrop = false;
        this.isResizingCrop = false;
        this.activeHandle = null;
        this.initialCropBox = null;
    },

    cropTouchEnd(e) {
        this.cropMouseUp(e);
    },

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
    },

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
    },

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
    },
};

// 在 PixelArtGenerator 类定义后执行，覆盖 prototype 上的同名方法
if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, ImageCropMixin);
}

if (typeof window !== 'undefined') {
    window.ImageCropMixin = ImageCropMixin;
}
