/*!
 * editor3d.js —— 编辑器的 3D 视图（多实例）
 *
 * 跟 ironPreview3d.js 是两套东西，别混：
 *   ironPreview3d  = 「预览成品」弹窗里的单块拟真特效（澡巾包边、熔融、晶体闪粉），
 *                    几何是照着那一张成品图一次性烘出来的，塞不进第二块。
 *   本文件        = 主画布的 3D 视图。一个区域 = 一块板，多块并排，
 *                    每块有自己的位置/旋转/镜像（region.local）。
 *
 * 数据流（单向）：
 *   region.cells(色号字符串[]) ──bakeRegionTexture（在 editor.js 里，能用 PAL_MAP）──▶ canvas + shape
 *   canvas+shape ──setInstance──▶ GL 纹理 + 按「有豆的格子」生成的几何
 *   每帧：model = T(世界位置) · Rz · Ry · Rx · S(flipX)     （Blender 的 XYZ Euler）
 *
 * 四条关键约定：
 *
 *   1) 一格 = 1 世界单位，**z 轴朝上**（跟 Blender 一套）。
 *      2D 的 (x, y) 直接是 3D 的 (x, y)，z 是离桌面的高度。
 *      于是每个实例都有自己唯一的 XYZ —— 面板上不再是一片 0。
 *      local.pos 是叠在「2D 摆放位置」之上的偏移；面板显示的是两者相加的世界坐标。
 *
 *   2) 形状来自格子掩码，不是外接矩形。
 *      只有 mask=1 的格子才生成顶面/侧壁/底面，空格子什么都不生成。
 *      于是「不规则配件」在 3D 里就是它本来的形状，不是一个把整块画布
 *      都包进去的长方形 —— 配件分割要的就是这个。
 *
 *   3) 相机手感按「抓取」而不是「飞」：
 *      平移 1:1 跟手（光标下的那个点不动），旋转灵敏度按视口高度归一，
 *      滚轮按 delta 指数缩放。早期版本旋转 0.008 rad/px、平移按 dist 的
 *      千分之一硬套，两者都严重超速，用户反馈「太滑了」。
 *
 *   4) 机位在 -y 一侧看向 +y（也就是"从图纸下边缘往里看"），
 *      配合"网格第 0 行摆在 +y"，俯视图里图纸方向跟 2D 完全一致
 *      （x 向右、第 0 行在上）。换别的轴组合就会左右镜像或上下翻，
 *      看着像 bug —— 这三个方向是唯一不镜像的组合。
 */
(function () {
    'use strict';

    var THICK = 1.1;            // 板厚（格）
    var MAX_TEX = 2048;         // 单边纹理上限，超了就降烘焙分辨率
    var FLOATS = 12;            // pos(3) normal(3) uv(2) color(3) texFlag(1)
    var STRIDE = FLOATS * 4;    // 字节步长
    var HALF_PI = Math.PI / 2;

    /* ============================ 矩阵（列主序） ============================ */

    function identity() {
        var m = new Float32Array(16);
        m[0] = m[5] = m[10] = m[15] = 1;
        return m;
    }

    function mul(a, b) {
        // 返回 a·b：先应用 b，再应用 a
        var m = new Float32Array(16);
        for (var c = 0; c < 4; c++) {
            for (var r = 0; r < 4; r++) {
                m[c * 4 + r] =
                    a[r] * b[c * 4] +
                    a[4 + r] * b[c * 4 + 1] +
                    a[8 + r] * b[c * 4 + 2] +
                    a[12 + r] * b[c * 4 + 3];
            }
        }
        return m;
    }

    function mTranslate(x, y, z) {
        var m = identity();
        m[12] = x; m[13] = y; m[14] = z;
        return m;
    }

    function mScale(x, y, z) {
        var m = identity();
        m[0] = x; m[5] = y; m[10] = z;
        return m;
    }

    function mRotX(a) {
        var c = Math.cos(a), s = Math.sin(a), m = identity();
        m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
        return m;
    }

    function mRotY(a) {
        var c = Math.cos(a), s = Math.sin(a), m = identity();
        m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
        return m;
    }

    function mRotZ(a) {
        var c = Math.cos(a), s = Math.sin(a), m = identity();
        m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
        return m;
    }

    function mPerspective(fovy, aspect, near, far) {
        var f = 1 / Math.tan(fovy / 2);
        var nf = 1 / (near - far);
        var m = new Float32Array(16);
        m[0] = f / aspect;
        m[5] = f;
        m[10] = (far + near) * nf;
        m[11] = -1;
        m[14] = 2 * far * near * nf;
        return m;
    }

    /** 正交投影：切"平视/俯视"这类轴向视图时用，边才真正平行、看着才像平面图 */
    function mOrtho(l, r, b, t, n, f) {
        var m = identity();
        m[0] = 2 / (r - l);
        m[5] = 2 / (t - b);
        m[10] = -2 / (f - n);
        m[12] = -(r + l) / (r - l);
        m[13] = -(t + b) / (t - b);
        m[14] = -(f + n) / (f - n);
        return m;
    }

    function mLookAt(eye, center, up) {
        var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
        var l = Math.hypot(zx, zy, zz) || 1;
        zx /= l; zy /= l; zz /= l;

        var xx = up[1] * zz - up[2] * zy;
        var xy = up[2] * zx - up[0] * zz;
        var xz = up[0] * zy - up[1] * zx;
        l = Math.hypot(xx, xy, xz) || 1;
        xx /= l; xy /= l; xz /= l;

        var yx = zy * xz - zz * xy;
        var yy = zz * xx - zx * xz;
        var yz = zx * xy - zy * xx;

        var m = identity();
        m[0] = xx; m[1] = yx; m[2] = zx;
        m[4] = xy; m[5] = yy; m[6] = zy;
        m[8] = xz; m[9] = yz; m[10] = zz;
        m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
        m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
        m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
        return m;
    }

    /** 4×4 求逆（glMatrix 那套伴随矩阵展开）。拾取要把射线送进局部空间，必须用真的逆。 */
    function mInvert(m) {
        var o = new Float32Array(16);
        o[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
        o[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
        o[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
        o[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
        o[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
        o[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
        o[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
        o[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
        o[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
        o[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
        o[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
        o[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
        o[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
        o[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
        o[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
        o[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
        var det = m[0] * o[0] + m[1] * o[4] + m[2] * o[8] + m[3] * o[12];
        if (!det) return identity();
        det = 1 / det;
        for (var i = 0; i < 16; i++) o[i] *= det;
        return o;
    }

    function xformPoint(m, p) {
        return [
            m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
        ];
    }

    /** 方向向量只要 3×3 那部分（本场景的 model 只有旋转 + 单位缩放） */
    function xformDir(m, d) {
        return [
            m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
            m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
            m[2] * d[0] + m[6] * d[1] + m[10] * d[2]
        ];
    }

    function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

    function cross3(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    function norm3(a) {
        var l = Math.hypot(a[0], a[1], a[2]) || 1;
        return [a[0] / l, a[1] / l, a[2] / l];
    }

    /* ============================== 着色器 ============================== */

    // 顶点自带颜色 + 是否采样贴图，于是「顶面贴图 / 侧面纯色 / 底面暗色」
    // 可以合并成一次 drawArrays —— 少一次状态切换，也不用再分 topCount/sideCount。
    var VS = [
        'attribute vec3 aPos;',
        'attribute vec3 aNormal;',
        'attribute vec2 aUV;',
        'attribute vec3 aColor;',
        'attribute float aTexFlag;',
        'uniform mat4 uProj;',
        'uniform mat4 uView;',
        'uniform mat4 uModel;',
        'uniform mat3 uNormalMat;',
        'varying vec2 vUV;',
        'varying vec3 vN;',
        'varying vec3 vWorld;',
        'varying vec3 vCol;',
        'varying float vTex;',
        'void main() {',
        '  vec4 wp = uModel * vec4(aPos, 1.0);',
        '  vWorld = wp.xyz;',
        '  vN = normalize(uNormalMat * aNormal);',
        '  vUV = aUV;',
        '  vCol = aColor;',
        '  vTex = aTexFlag;',
        '  gl_Position = uProj * uView * wp;',
        '}'
    ].join('\n');

    var FS = [
        'precision mediump float;',
        'varying vec2 vUV;',
        'varying vec3 vN;',
        'varying vec3 vWorld;',
        'varying vec3 vCol;',
        'varying float vTex;',
        'uniform sampler2D uTex;',
        'uniform float uHasTex;',
        'uniform vec3 uColor;',
        'uniform vec3 uEye;',
        'uniform float uHover;',
        'uniform float uFlat;',
        'void main() {',
        '  float ft = vTex * uHasTex;',
        '  vec3 base = mix(uColor * vCol, texture2D(uTex, vUV).rgb, ft);',
        // 主光从左上前方来
        '  vec3 L = normalize(vec3(-0.45, 0.55, 0.86));',
        '  float diff = max(dot(normalize(vN), L), 0.0);',
        // 顶面贴的是图纸本身：颜色必须跟 2D 看到的完全一致，所以几乎不打光
        // （早期版本让它跟侧面一起吃光照，白底被压成灰底、豆子全暗一档，
        //   用户拿 3D 判断颜色就会判错——这个视图的第一职责是看清，不是好看）
        '  float lit = mix(0.62 + 0.38 * diff, 1.0, ft);',
        // 侧面越远越淡一点，给一点纵深
        '  float d = length(vWorld - uEye);',
        '  lit *= 1.0 - clamp((d - 200.0) / 900.0, 0.0, 0.10);',
        '  vec3 col = base * lit;',
        '  col += uHover * vec3(0.10, 0.13, 0.22);',
        // uFlat=1：选中框那种纯色线，不吃光照
        '  col = mix(col, uColor, uFlat);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');

    function compile(gl, type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error('shader: ' + gl.getShaderInfoLog(s));
        }
        return s;
    }

    /* ============================== 几何 ============================== */

    function rgbOf(n) {
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    /**
     * 沿 x 合并连续段（行内）。
     * inside(x,y) 为真且颜色相同才并成一段 —— 分段按颜色切，侧壁才能带上各自的豆色。
     * 返回 [{ y, x0, x1 }]，x1 不含。
     */
    function hRuns(w, h, inside, colors, split) {
        var out = [];
        for (var y = 0; y < h; y++) {
            var x = 0;
            while (x < w) {
                if (!inside(x, y)) { x++; continue; }
                var x0 = x;
                var c0 = split ? colors[y * w + x] : 0;
                x++;
                while (x < w && inside(x, y) && (!split || colors[y * w + x] === c0)) x++;
                out.push({ y: y, x0: x0, x1: x });
            }
        }
        return out;
    }

    /** 沿 y 合并连续段（列内），给左右侧壁用。返回 [{ x, y0, y1 }]，y1 不含。 */
    function vRuns(w, h, inside, colors, split) {
        var out = [];
        for (var x = 0; x < w; x++) {
            var y = 0;
            while (y < h) {
                if (!inside(x, y)) { y++; continue; }
                var y0 = y;
                var c0 = split ? colors[y * w + x] : 0;
                y++;
                while (y < h && inside(x, y) && (!split || colors[y * w + x] === c0)) y++;
                out.push({ x: x, y0: y0, y1: y });
            }
        }
        return out;
    }

    /**
     * 一块板的几何 —— 只沿着 mask=1 的格子生成。**z 朝上**。
     *
     * 本地空间：x∈[-w/2,w/2]，y∈[-h/2,h/2]，z∈[0,THICK]；原点在板中心的地面。
     * 网格第 0 行摆在 +y 一侧（配合机位在 -y：俯视时第 0 行正好在屏幕上方）。
     * 贴图 v=1 对应第 0 行，所以 v = (ly + h/2) / h。
     *
     * @param {number} w,h 区域格数
     * @param {{mask:Uint8Array, colors:Uint32Array}} shape
     * @param {number} texW,texH 贴图像素尺寸（用来把 UV 内缩半个纹素，避免边缘渗出底色）
     * @returns {{data:Float32Array, count:number, lines:Float32Array, lineCount:number}}
     */
    function buildBoard(w, h, shape, texW, texH) {
        var hw = w / 2, hh = h / 2, t = THICK;
        var mask = shape && shape.mask;
        var colors = (shape && shape.colors) || new Uint32Array(w * h);
        var v = [];
        var iu = texW ? 0.5 / texW : 0;
        var iv = texH ? 0.5 / texH : 0;

        function vert(p, n, uv, c, tf) {
            v.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], c[0], c[1], c[2], tf);
        }

        // 四点面：绕序按给定法线自动纠正。
        // 手写绕序踩过一次 ——「顶面全被背面剔除，只剩一圈侧壁」且不报错，
        // 所以这里一律算一遍叉积再决定顺序，不给它出错的机会。
        function quad(P, N, UV, C, TF) {
            var ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2];
            var bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
            var cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
            var order = (cx * N[0] + cy * N[1] + cz * N[2]) < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
            for (var k = 0; k < 6; k++) {
                var i = order[k];
                vert(P[i], N, UV[i], C, TF);
            }
        }

        if (!mask) {
            return { data: new Float32Array(0), count: 0, lines: new Float32Array(0), lineCount: 0 };
        }

        // ---- 轮廓线（选中时贴形描一圈）----
        // 只沿「有豆 ↔ 空格」的交界画，于是框住的是图形本身，不是区域外接矩形。
        var lv = [];
        function edge(x1, y1, x2, y2) {
            lv.push(x1, y1, t + 0.03, 0, 0, 1, 0, 0, 1, 1, 1, 0);
            lv.push(x2, y2, t + 0.03, 0, 0, 1, 0, 0, 1, 1, 1, 0);
        }

        var filled = function (x, y) {
            return x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1;
        };

        var UP = [0, 0, 1], DOWN = [0, 0, -1];
        var WHITE = [1, 1, 1];

        // 第 0 行在 +y：ly 从 (hh - y - 1) 到 (hh - y)
        function rowY(y) { return hh - y - 1; }

        // ---- 顶面（贴图）：行内合并成段 ----
        hRuns(w, h, filled, null, false).forEach(function (r) {
            var y = r.y;
            var lx0 = r.x0 - hw, lx1 = r.x1 - hw;
            var ly0 = rowY(y), ly1 = rowY(y) + 1;
            var u0 = r.x0 / w + iu, u1 = r.x1 / w - iu;
            var vB = (ly0 + hh) / h + iv;       // v 小的一侧（第 y+1 行）
            var vA = (ly1 + hh) / h - iv;       // v 大的一侧（第 y 行）
            quad(
                [[lx0, ly0, t], [lx0, ly1, t], [lx1, ly1, t], [lx1, ly0, t]],
                UP,
                [[u0, vB], [u0, vA], [u1, vA], [u1, vB]],
                WHITE, 1
            );
        });

        // ---- 底面（纯色，压暗）：翻到下面看时不至于空着 ----
        hRuns(w, h, filled, colors, true).forEach(function (r) {
            var y = r.y;
            var lx0 = r.x0 - hw, lx1 = r.x1 - hw;
            var ly0 = rowY(y), ly1 = rowY(y) + 1;
            var c = rgbOf(colors[y * w + r.x0]).map(function (q) { return q * 0.55; });
            quad(
                [[lx0, ly0, 0], [lx0, ly1, 0], [lx1, ly1, 0], [lx1, ly0, 0]],
                DOWN,
                [[0, 0], [0, 0], [0, 0], [0, 0]],
                c, 0
            );
        });

        // ---- 四条侧壁：只在「这一格的邻格是空的」那一面生成 ----
        var SIDE = 0.80;
        var NY = [0, -1, 0], PY = [0, 1, 0], NX = [-1, 0, 0], PX = [1, 0, 0];

        // 前侧（y 最小那一面，靠观众）
        hRuns(w, h, function (x, y) { return filled(x, y) && !filled(x, y + 1); }, colors, true)
            .forEach(function (r) {
                var y = r.y;
                var lx0 = r.x0 - hw, lx1 = r.x1 - hw, ly = rowY(y);
                var c = rgbOf(colors[y * w + r.x0]).map(function (q) { return q * SIDE; });
                quad([[lx0, ly, 0], [lx1, ly, 0], [lx1, ly, t], [lx0, ly, t]], NY,
                    [[0, 0], [0, 0], [0, 0], [0, 0]], c, 0);
            });

        // 后侧（y 最大那一面，远）
        hRuns(w, h, function (x, y) { return filled(x, y) && !filled(x, y - 1); }, colors, true)
            .forEach(function (r) {
                var y = r.y;
                var lx0 = r.x0 - hw, lx1 = r.x1 - hw, ly = rowY(y) + 1;
                var c = rgbOf(colors[y * w + r.x0]).map(function (q) { return q * SIDE; });
                quad([[lx0, ly, 0], [lx1, ly, 0], [lx1, ly, t], [lx0, ly, t]], PY,
                    [[0, 0], [0, 0], [0, 0], [0, 0]], c, 0);
            });

        // 左侧（x 最小那一面）
        vRuns(w, h, function (x, y) { return filled(x, y) && !filled(x - 1, y); }, colors, true)
            .forEach(function (r) {
                var x = r.x, lx = x - hw;
                var ly0 = rowY(r.y1 - 1), ly1 = rowY(r.y0) + 1;
                var c = rgbOf(colors[r.y0 * w + x]).map(function (q) { return q * SIDE; });
                quad([[lx, ly0, 0], [lx, ly1, 0], [lx, ly1, t], [lx, ly0, t]], NX,
                    [[0, 0], [0, 0], [0, 0], [0, 0]], c, 0);
            });

        // 右侧（x 最大那一面）
        vRuns(w, h, function (x, y) { return filled(x, y) && !filled(x + 1, y); }, colors, true)
            .forEach(function (r) {
                var x = r.x, lx = x + 1 - hw;
                var ly0 = rowY(r.y1 - 1), ly1 = rowY(r.y0) + 1;
                var c = rgbOf(colors[r.y0 * w + x]).map(function (q) { return q * SIDE; });
                quad([[lx, ly0, 0], [lx, ly1, 0], [lx, ly1, t], [lx, ly0, t]], PX,
                    [[0, 0], [0, 0], [0, 0], [0, 0]], c, 0);
            });

        // ---- 描边：沿「有豆 ↔ 空格」的每条交界画一段 ----
        for (var yy = 0; yy < h; yy++) {
            for (var xx = 0; xx < w; xx++) {
                if (mask[yy * w + xx] !== 1) continue;
                var ex = xx - hw, ey = rowY(yy);
                if (!filled(xx, yy + 1)) edge(ex, ey, ex + 1, ey);
                if (!filled(xx, yy - 1)) edge(ex, ey + 1, ex + 1, ey + 1);
                if (!filled(xx - 1, yy)) edge(ex, ey, ex, ey + 1);
                if (!filled(xx + 1, yy)) edge(ex + 1, ey, ex + 1, ey + 1);
            }
        }

        return {
            data: new Float32Array(v),
            count: v.length / FLOATS,
            lines: new Float32Array(lv),
            lineCount: lv.length / FLOATS
        };
    }

    /** 单位立方体的 12 条棱（选中框 / 空区域轮廓）。跟板同一套顶点布局。 */
    function buildUnitBoxLines() {
        var c = [
            [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5],
            [-.5, .5, -.5], [.5, .5, -.5], [.5, .5, .5], [-.5, .5, .5]
        ];
        var E = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];
        var v = [];
        E.forEach(function (e) {
            [c[e[0]], c[e[1]]].forEach(function (p) {
                v.push(p[0], p[1], p[2], 0, 0, 1, 0, 0, 1, 1, 1, 0);
            });
        });
        return v;
    }

    /* ============================== 主体 ============================== */
    function Editor3D(canvas, gizmo) {
        // preserveDrawingBuffer 必须开：这个视图是按需渲染（静止时不出帧），
        // 关掉的话浏览器合成完就把缓冲丢了，任何像素级回读（readPixel / 导出 / 测试）
        // 都会读到一片 0，而且不报错。
        var opts = { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true };
        var gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
        if (!gl) throw new Error('no webgl');

        this.canvas = canvas;
        this.gl = gl;
        this.gizmo = gizmo || null;      // 右上角坐标轴小画布（可点）

        var p = gl.createProgram();
        gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
        gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            throw new Error('link: ' + gl.getProgramInfoLog(p));
        }
        this.prog = p;
        this.loc = {
            aPos: gl.getAttribLocation(p, 'aPos'),
            aNormal: gl.getAttribLocation(p, 'aNormal'),
            aUV: gl.getAttribLocation(p, 'aUV'),
            aColor: gl.getAttribLocation(p, 'aColor'),
            aTexFlag: gl.getAttribLocation(p, 'aTexFlag'),
            uProj: gl.getUniformLocation(p, 'uProj'),
            uView: gl.getUniformLocation(p, 'uView'),
            uModel: gl.getUniformLocation(p, 'uModel'),
            uNormalMat: gl.getUniformLocation(p, 'uNormalMat'),
            uTex: gl.getUniformLocation(p, 'uTex'),
            uHasTex: gl.getUniformLocation(p, 'uHasTex'),
            uColor: gl.getUniformLocation(p, 'uColor'),
            uEye: gl.getUniformLocation(p, 'uEye'),
            uHover: gl.getUniformLocation(p, 'uHover'),
            uFlat: gl.getUniformLocation(p, 'uFlat')
        };

        this.boxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(buildUnitBoxLines()), gl.STATIC_DRAW);

        this.items = new Map();     // id -> { id, w, h, buf, tex, hasTex, local, cx, cy, shape, ... }
        this.hoverId = null;
        this.selectedId = null;

        // 相机：绕 target 的球面机位，z 朝上。默认斜上方俯视，能同时看见顶面和一点厚度
        this.yaw = -0.42;
        this.pitch = 0.62;
        this.dist = 120;
        this.target = [0, 0, 0];
        this.fov = 34 * Math.PI / 180;
        this.ortho = false;         // 轴向视图（平视/俯视）切正交，边才是真的平行

        // 旋转灵敏度：整屏高度拖过去大约转 155°。
        // 以前是固定 0.008 rad/px（同样一屏转 400°+），这就是「太滑」的主因。
        this.rotSpan = 2.7;     // 弧度 / 视口高度

        this._raf = 0;
        this._last = 0;
        this._dirty = true;
        this.onPick = null;
        this.onCamera = null;       // 相机变了通知外面（坐标轴要重画）

        this._bindEvents();
        this._bindGizmo();
        this.resize();
    }

    Editor3D.prototype = {

        /* ---------------- 实例管理 ---------------- */

        /**
         * 增/改一块板。
         * @param {number} id
         * @param {{w:number,h:number,cx:number,cy:number,local:object,
         *          shape:{mask:Uint8Array,colors:Uint32Array,hash:number,filled:number},
         *          texW:number,texH:number}} info  cx/cy = 世界坐标里的板中心（含 2D 摆放）
         * @param {HTMLCanvasElement} [texture] 传同一个 canvas 对象时不会重复上传
         */
        setInstance(id, info, texture) {
            var gl = this.gl;
            var it = this.items.get(id);
            if (!it) {
                it = {
                    id: id, w: 0, h: 0,
                    buf: gl.createBuffer(), lineBuf: gl.createBuffer(),
                    tex: gl.createTexture(), hasTex: false
                };
                this.items.set(id, it);
            }

            var hash = info.shape ? info.shape.hash : 0;
            if (it.w !== info.w || it.h !== info.h || it.shapeHash !== hash) {
                var g = buildBoard(info.w, info.h, info.shape, info.texW, info.texH);
                gl.bindBuffer(gl.ARRAY_BUFFER, it.buf);
                gl.bufferData(gl.ARRAY_BUFFER, g.data, gl.STATIC_DRAW);
                gl.bindBuffer(gl.ARRAY_BUFFER, it.lineBuf);
                gl.bufferData(gl.ARRAY_BUFFER, g.lines, gl.STATIC_DRAW);
                it.count = g.count;
                it.lineCount = g.lineCount;
                it.w = info.w;
                it.h = info.h;
                it.shapeHash = hash;
            }

            it.cx = info.cx;
            it.cy = info.cy;
            it.shape = info.shape || null;
            it.local = info.local || { pos: [0, 0, 0], rot: [0, 0, 0], flipX: false };

            // 世界矩阵/逆矩阵在 setInstance 里算好：拾取要拿逆矩阵把射线送进局部空间，
            // 每次点击再重算一遍纯属浪费
            it.model = this._modelOf(it);
            it.inv = mInvert(it.model);

            if (texture && it.texStamp !== texture) {
                this._uploadTex(it, texture);
                it.texStamp = texture;
            }
            this._dirty = true;
            return it;
        },

        removeInstance(id) {
            var it = this.items.get(id);
            if (!it) return;
            this.gl.deleteBuffer(it.buf);
            this.gl.deleteBuffer(it.lineBuf);
            this.gl.deleteTexture(it.tex);
            this.items.delete(id);
            this._dirty = true;
        },

        clear() {
            Array.from(this.items.keys()).forEach(id => this.removeInstance(id));
            this._dirty = true;
        },

        _uploadTex(it, src) {
            var gl = this.gl;
            gl.bindTexture(gl.TEXTURE_2D, it.tex);
            // canvas 第一行在上 → 翻过来，让 v=1 对应顶面画面上方
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            // 缩小时必须走 mipmap，否则 104 格的板缩到屏幕一两百像素会满屏摩尔纹
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            // 斜看时靠各向异性把细节拉回来，没有就退回三线性
            var aniso = gl.getExtension('EXT_texture_filter_anisotropic') ||
                gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
            if (aniso) {
                var max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
                gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
            }
            it.hasTex = true;
        },

        /** 调试/测试用：一块板的网格规模 */
        meshStats(id) {
            var it = this.items.get(id);
            if (!it) return null;
            return {
                w: it.w, h: it.h, verts: it.count || 0, tris: (it.count || 0) / 3,
                lineCount: it.lineCount || 0, edges: (it.lineCount || 0) / 2,
                filled: it.shape ? it.shape.filled : 0,
                hasTex: it.hasTex, shapeHash: it.shapeHash
            };
        },

        /** 调试/测试用：读一个 CSS 像素（gl 原点在左下，这里接屏幕坐标） */
        readPixel(cssX, cssY) {
            var c = this.canvas, dpr = this.dpr || 1;
            var px = new Uint8Array(4);
            var x = Math.round(cssX * dpr);
            var y = Math.round((c.clientHeight - cssY) * dpr);
            // 越界/非数时 readPixels 不报错、直接给 0，跟"那里是透明的"分不开 → 明确告诉调用方
            if (!isFinite(x) || !isFinite(y)) return null;
            if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
            this.gl.readPixels(x, y, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, px);
            return [px[0], px[1], px[2], px[3]];
        },

        /* ---------------- 相机 ---------------- */

        frameAll() {
            var items = Array.from(this.items.values()).filter(it => !it.shape || it.shape.filled > 0);
            if (!items.length) items = Array.from(this.items.values());
            if (!items.length) {
                this.target = [0, 0, 0];
                this.dist = 90;
                this._dirty = true;
                return;
            }
            var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            items.forEach(it => {
                var p = it.local && it.local.pos ? it.local.pos : [0, 0, 0];
                var cx = it.cx + p[0], cy = it.cy + p[1];
                // 用长边的一半（不用对角线）：对角线会把包围盒撑大 40%，
                // 多块板一起 frame 时整组会缩得比实际小一圈，画面四周全是空的
                var r = Math.max(it.w, it.h) / 2 * 1.08;   // 1.08 给旋转留点余量
                x0 = Math.min(x0, cx - r); x1 = Math.max(x1, cx + r);
                y0 = Math.min(y0, cy - r); y1 = Math.max(y1, cy + r);
            });
            this.target = [(x0 + x1) / 2, (y0 + y1) / 2, 0];
            var span = Math.max(x1 - x0, y1 - y0, 12);
            // 竖屏时水平视野更窄，按宽高比放大距离
            var aspect = Math.max(0.45, (this.canvas.width || 1) / (this.canvas.height || 1));
            var fitH = span / (2 * Math.tan(this.fov / 2));
            var fitW = span / (2 * Math.tan(this.fov / 2) * Math.min(1, aspect));
            this.dist = Math.max(fitH, fitW) * 1.14 + 8;
            this._dirty = true;
            this.render();
        },

        focusItem(id) {
            var it = this.items.get(id);
            if (!it) return;
            var p = it.local && it.local.pos ? it.local.pos : [0, 0, 0];
            this.target = [it.cx + p[0], it.cy + p[1], p[2]];
            var span = Math.max(it.w, it.h, 8);
            this.dist = span / (2 * Math.tan(this.fov / 2)) * 1.55 + 6;
            this._dirty = true;
            this.render();
        },

        resetCamera() {
            this.yaw = -0.42;
            this.pitch = 0.62;
            this.ortho = false;
            this.frameAll();
        },

        /** 轴向视图：正的 X / 正面（-Y）/ 俯视（+Z）。这三个方向都不会把图纸镜像翻转。 */
        setAxisView(axis) {
            if (axis === 'x') { this.yaw = HALF_PI; this.pitch = 0; }
            else if (axis === 'y') { this.yaw = 0; this.pitch = 0; }
            else { this.yaw = 0; this.pitch = HALF_PI; }
            this.ortho = true;      // 平视 = 正交，边才是真的平行，像一张平面图
            this._dirty = true;
            this.render();
        },

        /** 回到透视斜视（Blender 里点小方块回到透视视角） */
        setPerspectiveView() {
            this.yaw = -0.42;
            this.pitch = 0.62;
            this.ortho = false;
            this._dirty = true;
            this.render();
        },

        axisView() {
            if (!this.ortho) return null;
            if (Math.abs(this.pitch - HALF_PI) < 1e-3) return 'z';
            if (Math.abs(this.pitch) < 1e-3) return Math.abs(this.yaw) < 1e-3 ? 'y' : 'x';
            return null;
        },

        _up() {
            // 俯视时 (0,0,1) 跟视线平行，mLookAt 会退化成 0 长度 → 换 +y 当屏幕上方
            return Math.abs(this.pitch) > 1.5 ? [0, 1, 0] : [0, 0, 1];
        },

        /** 相机基向量：视线/右/上。拾取、坐标轴、平移都用这一套，别各推各的。 */
        _basis() {
            var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
            var eye = [
                this.target[0] + this.dist * cp * Math.sin(this.yaw),
                this.target[1] - this.dist * cp * Math.cos(this.yaw),
                this.target[2] + this.dist * sp
            ];
            var f = norm3([-Math.sin(this.yaw) * cp, Math.cos(this.yaw) * cp, -sp]);
            var up = this._up();
            var r = norm3(cross3(f, up));
            var u = cross3(r, f);
            return { eye: eye, f: f, r: r, u: u, up: up };
        },

        _proj(aspect) {
            if (this.ortho) {
                var hh = this.dist * Math.tan(this.fov / 2);
                var hw = hh * aspect;
                return mOrtho(-hw, hw, -hh, hh, -4000, 8000);
            }
            return mPerspective(this.fov, aspect, 0.5, 6000);
        },

        /* ---------------- 事件 ---------------- */

        /** 一转一像素多少弧度：按视口高度归一，换屏幕尺寸手感不变 */
        _rotPerPx() {
            return this.rotSpan / Math.max(320, this.canvas.clientHeight || 800);
        },

        /** 目标深度上一像素等于多少世界单位：平移要 1:1 跟手就靠它 */
        _worldPerPx() {
            var hPx = Math.max(1, this.canvas.clientHeight || 800);
            return 2 * this.dist * Math.tan(this.fov / 2) / hPx;
        },

        _bindEvents() {
            var c = this.canvas;
            var self = this;
            var mode = null;        // 'orbit' | 'pan'
            var lastX = 0, lastY = 0, moved = 0;

            c.style.touchAction = 'none';
            c.style.cursor = 'grab';

            c.addEventListener('contextmenu', e => e.preventDefault());

            c.addEventListener('pointerdown', e => {
                c.setPointerCapture && c.setPointerCapture(e.pointerId);
                lastX = e.clientX; lastY = e.clientY;
                moved = 0;
                // 右/中键平移；左键旋转
                mode = (e.button === 1 || e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
                c.style.cursor = mode === 'pan' ? 'move' : 'grabbing';
            });

            c.addEventListener('pointermove', e => {
                if (!mode) {
                    self._hoverAt(e);
                    return;
                }
                var dx = e.clientX - lastX, dy = e.clientY - lastY;
                lastX = e.clientX; lastY = e.clientY;
                moved += Math.abs(dx) + Math.abs(dy);

                if (mode === 'orbit') {
                    // 拖拽量按视口高度归一：小窗口不再"一动就飞"。
                    // 一旦开始拖，轴向视图自动退回自由视角（正交保留，别再切线）
                    var k = self._rotPerPx();
                    self.yaw += dx * k;
                    self.pitch = Math.max(0.02, Math.min(1.52, self.pitch + dy * k));
                    self._dirty = true;
                } else {
                    self._panBy(dx, dy);
                }
            });

            var end = function (e) {
                if (!mode) return;
                var wasPanning = mode === 'pan';
                mode = null;
                c.style.cursor = 'grab';
                // 没拖动 = 一次点击 → 拾取
                if (moved < 5 && !wasPanning && e && typeof e.clientX === 'number') {
                    self._pickAt(e.clientX, e.clientY);
                }
            };
            c.addEventListener('pointerup', end);
            c.addEventListener('pointercancel', () => { mode = null; c.style.cursor = 'grab'; });

            c.addEventListener('pointerleave', () => {
                if (self.hoverId !== null) { self.hoverId = null; self._dirty = true; }
            });

            c.addEventListener('wheel', e => {
                e.preventDefault();
                // 按 delta 指数缩放，并限幅：老版本一档 1.12 倍，
                // 一格滚轮就跳到半个场景之外，也是"滑"的一部分
                var d = e.deltaY * (e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 100 : 1));
                var k = Math.pow(1.0016, -d);
                k = Math.max(0.75, Math.min(1.34, k));
                self.dist = Math.max(4, Math.min(4000, self.dist * k));
                self._dirty = true;
            }, { passive: false });

            c.addEventListener('dblclick', () => self.resetCamera());
        },

        /** 右上角坐标轴：点轴切平视/俯视，点中心回透视 */
        _bindGizmo() {
            var g = this.gizmo;
            if (!g) return;
            var self = this;
            g.style.touchAction = 'none';
            g.addEventListener('pointerdown', e => {
                e.preventDefault();
                e.stopPropagation();
                const box = g.getBoundingClientRect();
                const mx = e.clientX - box.left, my = e.clientY - box.top;
                const hit = self._gizmoHit(mx, my);
                if (hit === 'center') { self.setPerspectiveView(); return; }
                if (hit) self.setAxisView(hit);
            });
            g.addEventListener('pointermove', e => {
                const box = g.getBoundingClientRect();
                const hit = self._gizmoHit(e.clientX - box.left, e.clientY - box.top);
                g.style.cursor = hit ? 'pointer' : 'default';
                if (hit !== self._gizmoHot) {
                    self._gizmoHot = hit;
                    self._paintGizmo();
                }
            });
            g.addEventListener('pointerleave', () => {
                if (self._gizmoHot) { self._gizmoHot = null; self._paintGizmo(); }
            });
        },

        /** 坐标轴命中：返回 'x'|'y'|'z'|'center'|null */
        _gizmoHit(mx, my) {
            const g = this.gizmo;
            if (!g) return null;
            const w = g.clientWidth || 96, h = g.clientHeight || 96;
            const cx = w / 2, cy = h / 2;
            if (Math.hypot(mx - cx, my - cy) <= 12) return 'center';
            const ax = this._gizmoAxes();
            for (const a of ax) {
                if (Math.hypot(mx - a.x, my - a.y) <= 13) return a.key;
            }
            return null;
        },

        /** 三个轴在坐标轴小画布上的落点（屏幕坐标） */
        _gizmoAxes() {
            const g = this.gizmo;
            const w = (g && g.clientWidth) || 96, h = (g && g.clientHeight) || 96;
            const cx = w / 2, cy = h / 2;
            const b = this._basis();
            const L = Math.min(w, h) * 0.34;
            return [
                { key: 'x', v: [1, 0, 0], color: '#CE6A63', label: 'X' },
                { key: 'y', v: [0, 1, 0], color: '#5CA36E', label: 'Y' },
                { key: 'z', v: [0, 0, 1], color: '#5B84C9', label: 'Z' }
            ].map(a => {
                const sx = dot3(a.v, b.r), sy = -dot3(a.v, b.u);
                const depth = dot3(a.v, b.f);       // 越大越朝观众
                return { ...a, x: cx + sx * L, y: cy + sy * L, sx, sy, depth };
            });
        },

        /**
         * 1:1 跟手平移：屏幕移多少像素，铺在目标平面上的内容就跟着移多少像素。
         * 拖动方向 → 内容跟手（所以 target 往反方向走）。
         */
        _panBy(dx, dy) {
            var k = this._worldPerPx();
            var b = this._basis();
            // 屏幕上方向在水平面上的投影（俯视时退化，这时用相机 up 的投影兜底）
            var upH = [-Math.sin(this.yaw), Math.cos(this.yaw), 0];
            if (Math.hypot(upH[0], upH[1]) < 1e-4) upH = [0, 1, 0];
            this.target[0] += (-b.r[0] * dx + upH[0] * dy) * k;
            this.target[1] += (-b.r[1] * dx + upH[1] * dy) * k;
            this._dirty = true;
        },

        /**
         * 屏幕点 → 世界射线 {o, d}。透视走相机原点，正交走屏幕平面偏移。
         * 拾取和测试都靠它。
         */
        _ray(clientX, clientY) {
            var r = this.canvas.getBoundingClientRect();
            var nx = ((clientX - r.left) / r.width) * 2 - 1;
            var ny = 1 - ((clientY - r.top) / r.height) * 2;

            var b = this._basis();
            var aspect = (this.canvas.width || 1) / (this.canvas.height || 1);
            var th = Math.tan(this.fov / 2);

            if (this.ortho) {
                var hh = this.dist * th;
                var hw = hh * aspect;
                // 起点要退到"眼睛那一层"再往前打：留在 target 平面上就会把
                // 目标平面之后的板全漏掉（俯视时 z=0 起手，板全在它上面 → 一个都点不中）
                var back = -this.dist;
                return {
                    o: [
                        this.target[0] + b.r[0] * nx * hw + b.u[0] * ny * hh + b.f[0] * back,
                        this.target[1] + b.r[1] * nx * hw + b.u[1] * ny * hh + b.f[1] * back,
                        this.target[2] + b.r[2] * nx * hw + b.u[2] * ny * hh + b.f[2] * back
                    ],
                    d: b.f
                };
            }
            return {
                o: b.eye,
                d: norm3([
                    b.f[0] + b.r[0] * nx * th * aspect + b.u[0] * ny * th,
                    b.f[1] + b.r[1] * nx * th * aspect + b.u[1] * ny * th,
                    b.f[2] + b.r[2] * nx * th * aspect + b.u[2] * ny * th
                ])
            };
        },

        /**
         * 把屏幕点投成射线，跟每块板做射线-OBB 求交，取最近命中的那块。
         * 命中后再按格子掩码判一次：不规则配件的空位是点不中的（那里没有实体）。
         * @param {boolean} [silent] 只返回命中 id，不改选中态、不触发回调（悬停用）
         */
        _pickAt(clientX, clientY, silent) {
            if (!this.onPick && !silent) return null;
            var ray = this._ray(clientX, clientY);
            var eye = ray.o, dir = ray.d;

            var best = null, bestT = Infinity;
            this.items.forEach(function (it) {
                var o = xformPoint(it.inv, eye);
                var d = xformDir(it.inv, dir);

                // 局部包围盒：[±w/2] × [±h/2] × [0,THICK]
                var lo = [-it.w / 2, -it.h / 2, 0];
                var hi = [it.w / 2, it.h / 2, THICK];
                var t0 = -Infinity, t1 = Infinity;
                for (var a = 0; a < 3; a++) {
                    if (Math.abs(d[a]) < 1e-9) {
                        if (o[a] < lo[a] || o[a] > hi[a]) return;
                        continue;
                    }
                    var ta = (lo[a] - o[a]) / d[a];
                    var tb = (hi[a] - o[a]) / d[a];
                    if (ta > tb) { var tmp = ta; ta = tb; tb = tmp; }
                    if (ta > t0) t0 = ta;
                    if (tb < t1) t1 = tb;
                    if (t0 > t1) return;
                }
                if (t1 <= 0) return;
                var th = t0 > 0 ? t0 : 0;
                if (th >= bestT) return;

                // 命中点 → 格子 → 有没有豆（第 0 行在 +y）
                var hx = o[0] + d[0] * th;
                var hy = o[1] + d[1] * th;
                var gx = Math.floor(hx + it.w / 2);
                var gy = Math.floor(it.h / 2 - hy);
                var mask = it.shape && it.shape.mask;
                if (mask && it.shape.filled > 0) {
                    if (gx < 0 || gx >= it.w || gy < 0 || gy >= it.h) return;
                    if (!mask[gy * it.w + gx]) return;      // 空位 = 没有实体，点不中
                }
                bestT = th;
                best = it.id;
            });

            if (silent) return best;
            this.selectedId = best;
            if (this.onPick) this.onPick(best);
            this._dirty = true;
            return best;
        },

        _hoverAt(e) {
            if (!this.onPick) return;
            var before = this.hoverId;
            var id = this._pickAt(e.clientX, e.clientY, true);
            this.hoverId = id;
            if (id !== before) this._dirty = true;
        },

        /* ---------------- 渲染 ---------------- */

        resize() {
            var c = this.canvas;
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var w = Math.max(1, Math.round(c.clientWidth * dpr));
            var h = Math.max(1, Math.round(c.clientHeight * dpr));
            if (c.width !== w || c.height !== h) {
                c.width = w;
                c.height = h;
            }
            this.dpr = dpr;
        },

        start() {
            if (this._raf) return;
            var self = this;
            // 没有持续动画（自转已去掉）：只在 dirty 时出一帧。
            // 静止时这个 rAF 几乎是空转，比按 60fps 重画整场景省得多。
            var tick = function () {
                if (self._dirty) self.render();
                self._raf = requestAnimationFrame(tick);
            };
            this._raf = requestAnimationFrame(tick);
        },

        stop() {
            if (this._raf) cancelAnimationFrame(this._raf);
            this._raf = 0;
            this._last = 0;
        },

        dispose() {
            this.stop();
            this.clear();
            var gl = this.gl;
            gl.deleteBuffer(this.boxBuf);
            gl.deleteProgram(this.prog);
        },

        _bindAttribs(buf) {
            var gl = this.gl, L = this.loc;
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.enableVertexAttribArray(L.aPos);
            gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, STRIDE, 0);
            gl.enableVertexAttribArray(L.aNormal);
            gl.vertexAttribPointer(L.aNormal, 3, gl.FLOAT, false, STRIDE, 12);
            gl.enableVertexAttribArray(L.aUV);
            gl.vertexAttribPointer(L.aUV, 2, gl.FLOAT, false, STRIDE, 24);
            gl.enableVertexAttribArray(L.aColor);
            gl.vertexAttribPointer(L.aColor, 3, gl.FLOAT, false, STRIDE, 32);
            gl.enableVertexAttribArray(L.aTexFlag);
            gl.vertexAttribPointer(L.aTexFlag, 1, gl.FLOAT, false, STRIDE, 44);
        },

        render() {
            var gl = this.gl;
            var c = this.canvas;
            if (!c.clientWidth || !c.clientHeight) { this._dirty = false; return; }
            this.resize();

            gl.viewport(0, 0, c.width, c.height);
            // 清成全透明：3D 里没有「纸张」，背景就是页面本身。
            // 空位也不生成几何，所以主体外轮廓就是图形本身的形状。
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.disable(gl.BLEND);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);

            var b = this._basis();
            var proj = this._proj(c.width / c.height);
            var view = mLookAt(b.eye, this.target, b.up);

            gl.useProgram(this.prog);
            var L = this.loc;
            gl.uniformMatrix4fv(L.uProj, false, proj);
            gl.uniformMatrix4fv(L.uView, false, view);
            gl.uniform3fv(L.uEye, new Float32Array(b.eye));
            gl.uniform1i(L.uTex, 0);
            gl.activeTexture(gl.TEXTURE0);

            var self = this;
            gl.uniform1f(L.uFlat, 0.0);
            gl.uniform3f(L.uColor, 1, 1, 1);

            this.items.forEach(function (it) {
                var model = it.model || self._modelOf(it);
                gl.uniformMatrix4fv(L.uModel, false, model);
                // model 只有旋转 + 单位镜像，法线直接用左上 3×3（即 R·S）就是对的
                var nm = new Float32Array([
                    model[0], model[1], model[2],
                    model[4], model[5], model[6],
                    model[8], model[9], model[10]
                ]);
                gl.uniformMatrix3fv(L.uNormalMat, false, nm);

                var hover = (it.id === self.selectedId) ? 0.34 :
                    (it.id === self.hoverId ? 0.18 : 0.0);
                gl.uniform1f(L.uHover, hover);
                gl.uniform1f(L.uHasTex, it.hasTex ? 1 : 0);

                self._bindAttribs(it.buf);
                gl.bindTexture(gl.TEXTURE_2D, it.tex);
                if (it.count) gl.drawArrays(gl.TRIANGLES, 0, it.count);
            });

            // ---- 空区域：只剩一圈虚框 ----
            // 全空的区域按「空位不生成几何」就没有任何东西了，用户会以为区域丢了；
            // 用很淡的轮廓标出它还在，也不影响别的板。
            var boxColor = [0.62, 0.64, 0.70];
            this.items.forEach(function (it) {
                if (it.shape && it.shape.filled === 0) {
                    self._drawBox(it, boxColor, 1.0);
                }
            });

            // ---- 选中：贴着形状描一圈紫边 ----
            // 只靠给板加一点自发光根本看不出来（尤其白底图纸），
            // 套外接矩形又会把不规则配件的框套得老大 —— 所以沿掩码描边。
            if (this.selectedId !== null) {
                var sit = this.items.get(this.selectedId);
                if (sit) self._drawSelect(sit);
            }

            this._paintGizmo();
            this._dirty = false;
            if (this.onCamera) this.onCamera();
        },

        /** 选中：沿形状交界描一圈（贴顶面略抬高，正常吃深度遮挡） */
        _drawSelect(it) {
            var gl = this.gl, L = this.loc;
            if (!it.lineCount) {                  // 空区域没有形状，退回外框
                this._drawBox(it, [0.42, 0.30, 0.95], 1.6);
                return;
            }
            var model = it.model || this._modelOf(it);
            gl.uniformMatrix4fv(L.uModel, false, model);
            gl.uniformMatrix3fv(L.uNormalMat, false, new Float32Array([
                model[0], model[1], model[2],
                model[4], model[5], model[6],
                model[8], model[9], model[10]
            ]));
            gl.uniform1f(L.uHover, 0.0);
            gl.uniform1f(L.uHasTex, 0.0);
            gl.uniform1f(L.uFlat, 1.0);
            gl.uniform3f(L.uColor, 0.42, 0.30, 0.95);

            this._bindAttribs(it.lineBuf);
            // 这条线在顶面之上 0.03，开深度测试 → 远处的板能把它正常挡住，
            // 不会像外框那样"透视"到后面去
            gl.drawArrays(gl.LINES, 0, it.lineCount);

            gl.uniform1f(L.uFlat, 0.0);
            gl.uniform3f(L.uColor, 1, 1, 1);
        },

        /** 在板上套一圈线框（空区域提示用） */
        _drawBox(it, color, grow) {
            var gl = this.gl, L = this.loc;
            var model = it.model || this._modelOf(it);
            // 单位立方体是以原点为中心的：板的 z 范围是 [0,THICK]，
            // 所以得先抬 THICK/2 再缩放，不是简单放大就行
            var boxModel = mul(model, mTranslate(0, 0, THICK / 2));
            boxModel = mul(boxModel, mScale(it.w * 1.016, it.h * 1.016, THICK * grow));
            gl.uniformMatrix4fv(L.uModel, false, boxModel);
            gl.uniformMatrix3fv(L.uNormalMat, false, new Float32Array([
                boxModel[0], boxModel[1], boxModel[2],
                boxModel[4], boxModel[5], boxModel[6],
                boxModel[8], boxModel[9], boxModel[10]
            ]));
            gl.uniform1f(L.uHover, 0.0);
            gl.uniform1f(L.uHasTex, 0.0);
            gl.uniform1f(L.uFlat, 1.0);
            gl.uniform3f(L.uColor, color[0], color[1], color[2]);

            this._bindAttribs(this.boxBuf);
            // 线框不该被板自己挡住后面那几条棱 → 关掉深度测试反而更像"套框"
            gl.disable(gl.DEPTH_TEST);
            gl.drawArrays(gl.LINES, 0, 24);
            gl.enable(gl.DEPTH_TEST);
            gl.uniform1f(L.uFlat, 0.0);
            gl.uniform3f(L.uColor, 1, 1, 1);
        },

        /**
         * 右上角坐标轴：画三个轴，顺便把当前是「透视 / 正视 / 俯视」写在下沿。
         * 这是纯 2D 画布，跟 GL 无关 —— 它只是个指示灯 + 按钮。
         */
        _paintGizmo() {
            const g = this.gizmo;
            if (!g) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = g.clientWidth || 96, h = g.clientHeight || 96;
            if (g.width !== Math.round(w * dpr) || g.height !== Math.round(h * dpr)) {
                g.width = Math.round(w * dpr);
                g.height = Math.round(h * dpr);
            }
            const ctx = g.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            const cx = w / 2, cy = h / 2 - 5;
            const axes = this._gizmoAxes();
            // 远的先画，近的后画，叠起来才有前后感
            axes.slice().sort((a, b) => a.depth - b.depth).forEach(a => {
                const len = Math.hypot(a.x - cx, a.y - cy);
                const hot = this._gizmoHot === a.key;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + (a.x - cx) * (len > 6 ? 1 : 0.2), cy + (a.y - cy) * (len > 6 ? 1 : 0.2));
                ctx.strokeStyle = a.color;
                ctx.lineWidth = hot ? 2.6 : 1.8;
                ctx.stroke();

                const bx = cx + (a.x - cx) * (len > 6 ? 1 : 0.2);
                const by = cy + (a.y - cy) * (len > 6 ? 1 : 0.2);
                ctx.beginPath();
                ctx.arc(bx, by, hot ? 9 : 7.5, 0, Math.PI * 2);
                ctx.fillStyle = a.color;
                ctx.globalAlpha = a.depth < -0.35 ? 0.55 : 1;   // 朝背面画淡一点
                ctx.fill();
                ctx.globalAlpha = 1;

                ctx.fillStyle = '#fff';
                ctx.font = '700 9.5px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(a.label, bx, by + 0.5);
            });

            // 中心小方块：点它回透视
            const hotC = this._gizmoHot === 'center';
            ctx.beginPath();
            ctx.arc(cx, cy, hotC ? 5 : 4, 0, Math.PI * 2);
            ctx.fillStyle = hotC ? '#6B4EF2' : 'rgba(90,96,108,.55)';
            ctx.fill();

            const mode = this.axisView();
            ctx.font = '600 9.5px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(90,96,108,.85)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(mode === 'z' ? '俯视' : mode === 'y' ? '正视' : mode === 'x' ? '侧视'
                : this.ortho ? '正交' : '透视', cx, h - 8);
        },

        /** 实例的世界矩阵：T(世界位置) · Rz · Ry · Rx · 镜像（Blender 的 XYZ Euler） */
        _modelOf(it) {
            var p = (it.local && it.local.pos) || [0, 0, 0];
            var rot = (it.local && it.local.rot) || [0, 0, 0];
            var model = mTranslate(it.cx + (p[0] || 0), it.cy + (p[1] || 0), p[2] || 0);
            model = mul(model, mRotZ(rot[2] || 0));
            model = mul(model, mRotY(rot[1] || 0));
            model = mul(model, mRotX(rot[0] || 0));
            if (it.local && it.local.flipX) model = mul(model, mScale(-1, 1, 1));
            return model;
        },

        /** 世界点 → 屏幕像素（相对 canvas 左上角，CSS px）。_ray 的反向，测试和标签都用它。 */
        project(p) {
            var c = this.canvas;
            var b = this._basis();
            var proj = this._proj((c.width || 1) / (c.height || 1));
            var view = mLookAt(b.eye, this.target, b.up);
            var m = mul(proj, view);
            var x = p[0], y = p[1], z = p[2];
            var cx = m[0] * x + m[4] * y + m[8] * z + m[12];
            var cy = m[1] * x + m[5] * y + m[9] * z + m[13];
            var cw = m[3] * x + m[7] * y + m[11] * z + m[15];
            if (Math.abs(cw) < 1e-9) return null;
            var dpr = this.dpr || 1;
            return {
                x: (cx / cw + 1) / 2 * (c.width / dpr),
                y: (1 - cy / cw) / 2 * (c.height / dpr),
                z: cw
            };
        }
    };

    Editor3D.THICK = THICK;
    Editor3D.MAX_TEX = MAX_TEX;
    Editor3D.FLOATS = FLOATS;
    window.Editor3D = Editor3D;
})();
