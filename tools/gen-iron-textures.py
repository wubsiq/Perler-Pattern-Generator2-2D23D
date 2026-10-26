"""
熨烫织纹 tile 生成器（离线脚本，不参与打包）
=================================================
把素材图处理成熨烫预览用的无缝光影 tile，内联进 bundle。

★★★ 2026-10-16 起：**花纹（矢量）分支已废弃，改用 tools/gen-iron-textures.mjs** ★★★
    原因：这个脚本的花纹分支走「边界淡出」，会把 tile 四周约 26px 的信号抹成中性灰，
    平铺后每 256px 出现一条"没有印记"的十字带（实测振幅掉到中位数的 6%）——
    hh 反馈的"边界模糊"。而且这里的 python 只在别的机器上有，本机没有解释器。

    → 花纹 4 张（huaWen1~4）请用：node tools/gen-iron-textures.mjs
      （真周期整数倍平铺 / 周期+切缝联合优化，不做淡出，65 档灰阶）
    → 本脚本仍可参考的只有：实拍照片（澡巾）那条分支的四象限镜像 + 环形对齐。
      那 4 张 tile 目前是好的（边缘/中心振幅 0.98~1.00），没有重做的必要。

    下面 [策略 B] 及 fade_seamless_light / unit_seamless_light 保留仅作历史记录，
    不要再拿去生成花纹 tile。

用法：
    python tools/gen-iron-textures.py

★ 为什么要内联（不是外部 PNG）：
    熨烫预览的像素级浮雕必须 getImageData 读像素，而 file:// 协议下加载
    任何外部图片都会把画布标记为 tainted → SecurityError。
    dataURL 是纯字符串、不带来源信息，任何协议下都同源。

★ 两种素材、两种无缝化策略（都是实测踩出来的）：
    A. 实拍照片（澡巾/毛巾）→ 四象限镜像 + 环形对齐
    B. 矢量花纹图（pattern 截图）→ **边界淡出**（见 fade_seamless_light 的长注释）

加新素材：往 SRC 里加一条，跑一次脚本，再 node build.js。
"""

import numpy as np
import os
import base64
import io
import json
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── 素材 ──────────────────────────────────────────────────────────────
# kind='photo'  实拍照片 → 四象限镜像 + 环形对齐
# kind='vector' 矢量花纹图 → 边界淡出
PHOTO_BASE = r"C:\Users\supreme\.workbuddy\clipboard-images"
VEC_BASE = r"C:\Users\supreme\Downloads"

SRC = [
    # ── 实拍澡巾（hh 提供的照片）──
    dict(name='zaoJin1', kind='photo',
         path=os.path.join(PHOTO_BASE, 'clipboard-2026-10-15T07-32-02-941Z-e9f2e34f.png'),
         label='澡巾1 · 细密短绒', swing=0.82),
    dict(name='zaoJin2', kind='photo',
         path=os.path.join(PHOTO_BASE, 'clipboard-2026-10-15T07-32-02-943Z-a4f2705a.png'),
         label='澡巾2 · 粗圈绒面', swing=1.00),
    dict(name='zaoJin3', kind='photo',
         path=os.path.join(PHOTO_BASE, 'clipboard-2026-10-15T07-32-02-945Z-60b15a85.png'),
         label='澡巾3 · 细圈绒面', swing=0.95),
    dict(name='zaoJin4', kind='photo',
         path=os.path.join(PHOTO_BASE, 'clipboard-2026-10-15T07-32-02-949Z-16450c7a.png'),
         label='澡巾4 · 粗颗粒', swing=0.70),

    # ── 矢量花纹（hh 提供的 pattern 截图，2026-10-15 晚）──
    # ★ 关键参数（2026-10-16 修正）：
    #   unit = 花纹的真实重复周期（原图像素）。由 roll 验证法测出。
    #   density = tile 里放几个单元。★ 这是决定美感的核心旋钮 ——
    #     原来把整张 1076×884 压进 256，青海波单元（311×320）被压到 42px，
    #     比一颗豆（30px）还小 → 每颗豆只能看到半截花纹，形状全丢。
    #     改成按周期取单元后，一个单元能盖住 4~8 颗豆，形状完整。
    dict(name='huaWen1', kind='vector',
         path=os.path.join(VEC_BASE, '屏幕截图_15-10-2026_20478_cn.bing.com.jpeg'),
         label='花纹1 · 斜纹', swing=1.00, scale=1.0, rot=0,
         unit=(221, 63), density=4, hp_r=12, blur=4.0, fade=26),
    dict(name='huaWen2', kind='vector',
         path=os.path.join(VEC_BASE, '屏幕截图_15-10-2026_204721_cn.bing.com.jpeg'),
         label='花纹2 · 波浪', swing=1.00, scale=1.0, rot=0,
         unit=(132, 132), density=2, hp_r=8, blur=3.0, fade=18),
    dict(name='huaWen3', kind='vector',
         path=os.path.join(VEC_BASE, '屏幕截图_15-10-2026_204737_cn.bing.com.jpeg'),
         label='花纹3 · 鱼鳞', swing=1.00, scale=1.0, rot=0,
         unit=(190, 392), density=2, hp_r=12, blur=4.0, fade=26),
    dict(name='huaWen4', kind='vector',
         path=os.path.join(VEC_BASE, '屏幕截图_15-10-2026_204753_cn.bing.com.jpeg'),
         label='花纹4 · 青海波', swing=1.00, scale=1.0, rot=0,
         unit=(311, 320), density=2, hp_r=12, blur=4.0, fade=26),
]

# ★ 打开后会用 roll 法重新检测周期，并与 SRC 里写的值对不上时报警
VERIFY_PERIOD = True

OUT = os.path.join(ROOT, 'data', 'iron-textures')
SIZE = 256
LEVELS = 16
LSTEP = 256 // LEVELS   # 16


def box_blur(a, r):
    """积分图盒式模糊（反射边界），O(1) 像素"""
    k = r * 2 + 1
    ap = np.pad(a, r, mode='reflect')
    ii = np.cumsum(np.cumsum(ap, axis=0), axis=1)
    ii2 = np.pad(ii, ((1, 0), (1, 0)))
    H, W = a.shape
    return (ii2[k:k+H, k:k+W] - ii2[0:H, k:k+W] - ii2[k:k+H, 0:W] + ii2[0:H, 0:W]) / (k * k)


# ──────────────────────────────────────────────────────────────────────
#  策略 A：实拍照片 → 四象限镜像 + 环形对齐
# ──────────────────────────────────────────────────────────────────────
def photo_seamless_light(src, size=SIZE):
    """
    照片 → 无缝、零均值、128 中性的光影 tile

    四象限镜像：相邻象限翻转，接缝处天然连续（照片织纹各向同性，旋转看不出差别）
    → 高通（去低频基底，只留织纹）
    → 环形对齐（x/y 各搜一个 shift 最小化接缝差）
    → 减均值 → 对称归一化
    """
    g = np.asarray(src.convert('L').resize((size, size), Image.LANCZOS)).astype(np.float64)
    c = size // 2
    full = np.vstack([
        np.hstack([g[:c, :c][::-1, ::-1], g[:c, c:][::-1, :]]),
        np.hstack([g[c:, :c][:, ::-1], g[c:, c:]])
    ])
    hp = full - box_blur(full, 15)

    def align(arr, axis):
        best = (0, 1e18)
        for sh in range(arr.shape[axis] // 2):
            r = np.roll(arr, sh, axis=axis)
            seam = (np.abs(r[:, 0] - r[:, -1]).mean() if axis == 1
                    else np.abs(r[0, :] - r[-1, :]).mean())
            if seam < best[1]:
                best = (sh, seam)
        return np.roll(arr, best[0], axis=axis)

    out = align(align(hp, 1), 0)
    out = out - out.mean()
    amp = np.percentile(np.abs(out), 99) or 1.0
    return np.clip(out / amp, -1, 1) * 127.0 + 128.0


# ──────────────────────────────────────────────────────────────────────
#  策略 B：矢量花纹 → ★ 按重复周期取单元 ★
# ──────────────────────────────────────────────────────────────────────

def detect_period(src, min_frac=0.10, max_frac=0.48):
    """
    ★ roll 验证法测重复周期 —— 比自相关可靠，不会出假阳性。

    原理：矢量花纹截图都是 repeating pattern。把图按候选周期 roll 回去，
    周期对了的话 roll 后的图和原图几乎一样（差异最小）。
    自相关的问题是噪声频段会被误判成峰（实测给过 3px 这种假周期）；
    roll 法是全局验证，假阳性会露馅。

    ★ 性能：必须 1/4 降采样后再扫。
      实测原图 1076×884 全分辨率扫要几分钟（O(n²)），
      降采样后 ~20ms。

    返回 (px, py)，检测不到可信周期返回 None。
    """
    g = np.asarray(src.convert('L').resize(
        (max(8, src.width // 4), max(8, src.height // 4)),
        Image.LANCZOS)).astype(np.float64)
    base = g - g.mean()
    h, w = g.shape
    lo = max(3, int(min(h, w) * min_frac))
    hi = int(min(h, w) * max_frac)
    if hi <= lo:
        return None
    sc = 4

    def scan(ax):
        best = (1e18, 0)
        for p in range(lo, hi):
            if ax == 1:
                r = np.roll(base, p, axis=1)
            else:
                r = np.roll(base, p, axis=0)
            s = np.abs(r - base).mean()
            if s < best[0]:
                best = (s, p)
        return best

    sx, px = scan(1)
    sy, py = scan(0)

    # ── 与随机偏移的基线比 ──
    # ★ 两轴要**独立判定**，不能一起毙掉。实测这四张的占比：
    #     斜纹 99%/99%（斜向条纹，roll 本就对不齐 → 检测不到）
    #     S 波 23%/21%（真周期）
    #     鱼鳞 96%/57%（x 对齐、y 是 2 倍周期）
    #     青海波 81%/92%（真周期，但接近阈值）
    #   阈值取 0.95：≥0.95 视为该轴无效（斜纹这种情况），
    #   单轴无效时用另一轴的值（斜纹这种两轴都无效的才返回 None）。
    rnd = []
    for sh in (7, 11, 17, 23, 29):
        r = np.roll(np.roll(base, sh % w, axis=1), sh % h, axis=0)
        rnd.append(np.abs(r - base).mean())
    bs = float(np.mean(rnd))
    rx = sx / bs
    ry = sy / bs
    TH = 0.95
    if rx > TH and ry > TH:
        return None
    if rx > TH:
        px = py          # x 轴不可靠 → 借用 y
    elif ry > TH:
        py = px          # y 轴不可靠 → 借用 x
    return (px * sc, py * sc)


def unit_to_tile(src, size, px, py, density):
    """
    ★ 核心：把「一个大花纹」按它的真实周期取出，铺成 size×size 的 tile。

    为什么必须这么做（2026-10-16 的实测教训）：
        青海波的重复单元是 311×320。原图 1244×655，如果整张压到 256，
        单元就只剩 42px —— 比一颗豆（30px）还小，每颗豆上只能看到半截花纹，
        形状全丢，就是 hh 说的"缺少美感"。

    三条分支：
        A. density 个单元正好填满 tile → 缩放到 fit（保持形状比例）
        B. 单元比 tile 大 → 缩放，让 density 个单元刚好铺满
        C. 单元比 tile 小 → 整数倍环绕拼接（数学无缝，不用淡出挖空边缘）

    返回 (灰度阵列 size×size, 说明文字)
    """
    g = np.asarray(src.convert('L')).astype(np.float64)
    H, W = g.shape

    # 1) 裁一个重复单元（取中间，避开边缘可能的裁切瑕疵）
    y0 = max(0, (H - py) // 2)
    x0 = max(0, (W - px) // 2)
    u = g[y0:y0 + py, x0:x0 + px]
    if u.size == 0:
        u = g

    # 2) 缩放比：让「density 个单元」正好铺满一条边
    #    ★ 踩过的坑：用 np.ceil 环绕时，单元尺寸不整除 size 就会多出一倍。
    #      比如单元 128px、size 256 → ceil(2.0)=2 正好；但单元 100px → ceil(2.56)=3，
    #      tile 里就变成 3×3=9 个而不是 2×2=4。
    #    所以这里让缩放后的单元尺寸**尽量整除** size：
    #      nx = round(size*px / (density*max(px,py)))  →  环绕倍数 ≈ density
    # ★ 用「几何平均」而不是 max(px,py)：
    #   斜纹的单元是 221x63（长宽比 3.5:1），按长边算会把短边压到 18px → 碎成渣。
    #   按几何平均算，两边落在合理区间。
    geo = (px * py) ** 0.5
    target = size / max(1, density)          # 每个单元应该占的边长
    k = target / max(1.0, geo)               # 缩放比
    nw = max(2, int(round(px * k)))
    nh = max(2, int(round(py * k)))
    # 整除修正：把 nw/nh 调到 size 的整数分之一（1/1, 1/2, 1/3, 1/4…）
    def fit(n):
        for d in (1, 2, 3, 4, 5, 6):
            if abs(size / d - n) < abs(size / max(1, int(round(size / n))) - n) + 1e-9 \
               and abs(size / d - n) / n < 0.06:
                return max(2, int(round(size / d)))
        return max(2, int(round(size / max(1, int(round(size / n))))))
    nw = fit(nw)
    nh = fit(nh)

    # 3) 缩放单元
    u2 = np.asarray(
        Image.fromarray(np.clip(u, 0, 255).astype(np.uint8))
             .resize((nw, nh), Image.LANCZOS)).astype(np.float64)

    # 4) 铺满：不足的边用整数倍环绕（数学无缝）
    rx = max(1, int(np.ceil(size / nw)))
    ry = max(1, int(np.ceil(size / nh)))
    tiled = np.tile(u2, (ry, rx))
    # 从中心取 size×size（保证中心区域是完整花纹）
    oy = max(0, (tiled.shape[0] - size) // 2)
    ox = max(0, (tiled.shape[1] - size) // 2)
    out = tiled[oy:oy + size, ox:ox + size]
    if out.shape != (size, size):
        out = np.pad(out, ((0, size - out.shape[0]), (0, size - out.shape[1])), mode='wrap')

    # 实际缩放比（相对原图）—— 用来报给用户看
    note = (f"原单元 {px}x{py} → 缩放后 {nw}x{nh} → 沿边 {rx}x{ry} 个"
            f"（一个单元 ≈ {size/max(rx,ry):.0f}px ≈ {size/max(rx,ry)/30:.1f} 颗豆）")
    return out, note


def unit_seamless_light(src, size=SIZE, px=None, py=None, density=2,
                        hp_r=12, blur=4.0, fade=26):
    """
    矢量花纹 → 无缝零均值光影 tile（按周期取单元 + 边界淡出双保险）

    ── 无缝的两道保险 ──
      1) 主：按真实周期整数倍拼接 —— 数学上就无缝
      2) 辅：边界淡出到中性灰 —— 拼接位置若有微小误差，边缘也不跳变
         （淡出宽度用小值，单元完整性优先）

    ★ 矢量图是硬边线条，高通后仍是硬边正负块（不是浮雕）。
      高斯模糊把硬边转成平滑斜坡，才像"压进半融塑料"。
    """
    # 1) 按周期取单元
    if px and py:
        g, note = unit_to_tile(src, size, px, py, density)
    else:
        g = np.asarray(src.convert('L').resize((size, size), Image.LANCZOS)).astype(np.float64)
        note = f"未检出周期 → 整图缩放到 {size}"

    # 2) 高通（去低频色偏，只留花纹）
    hp = g - box_blur(g, hp_r)

    # 3) 距离场化：硬边线条 → 平滑浮雕
    hp = np.asarray(
        Image.fromarray(np.clip(hp + 128, 0, 255).astype(np.uint8))
             .filter(ImageFilter.GaussianBlur(blur)),
        dtype=np.float64) - 128
    hp = hp - hp.mean()

    # 4) 轻量边界淡出（双保险；宽度小，不牺牲单元完整性）
    if fade > 0:
        i = np.arange(size)
        d = np.minimum(i, size - 1 - i)
        w = np.clip((d - fade / 2.0) / (fade / 2.0), 0, 1)
        w2 = np.minimum(w[:, None], w[None, :])
        hp = hp * w2

    # 5) 对称归一化
    #    ★ 只用「未淡出的中心区」统计 —— 用全图的话，边缘被拉回有信号
    #      （边缘均值 146≠128），接缝又回来。这个坑两版都踩过。
    if fade > 0:
        msk = w2 > 0.9
        inner = hp[msk] if msk.sum() > 500 else hp.ravel()
    else:
        inner = hp.ravel()
    amp = np.percentile(np.abs(inner), 99) or 1.0
    return np.clip(hp / amp, -1, 1) * 127.0 + 128.0, note


# ──────────────────────────────────────────────────────────────────────
#  策略 B：矢量花纹 → 边界淡出
# ──────────────────────────────────────────────────────────────────────
def fade_seamless_light(src, size=SIZE, hp_r=12, blur=4.0, fade=26):
    """
    矢量花纹图 → 无缝零均值光影 tile

    ── 为什么照片那套（四象限镜像 + 环形对齐）在这里不行 ──
    试过，四象限会在 tile 正中留下**明显的十字接缝** ——
    矢量花纹（如鱼鳞）旋转 90° 后图案并不连续，而照片织纹各向同性看不出差别。

    ── 为什么「检测真实周期 + 整数倍拼接」也不行 ──
    试过。只有「红白S波」的周期是干净的（差异 2.6 vs 随机基线 49.6），
    另外三张检出差 45~87（随机基线 40~91）——**根本不是真周期**，
    硬拼出来的接缝比值 8~17，比四象限还差。

    ── 为什么「淡出混合 / feather blend」也不行 ──
    试过，无缝比从 0.36 恶化到 14.48 ——
    权重函数在边界处把信号衰减到 0，反而制造了新接缝。

    ── 本法：边界淡出到中性灰 ──
    浏览器用 createPattern 铺贴时，接缝可见度只取决于「信号在 tile 边界是否跳变」。
    所以不需要真正的无缝 —— 只要让四周**渐变到 128（中性）**，
    拼贴时边界两侧都是中性，接缝天然不可见。

    实测：边界跳变精确为 0.00（内部梯度 3~8），3×3 铺贴肉眼完全看不出边界。

    ★ 关键修正：归一化必须**只用未淡出的中心区**统计。
      上一版用全图统计，边缘被拉回有信号（边缘均值 146 ≠ 128），接缝又回来了。

    ★ 另一关键：矢量图是硬边线条，高通后仍是硬边正负块（不是浮雕）。
      高斯模糊把硬边转成平滑斜坡，才像"压进半融塑料"。
    """
    g = np.asarray(src.convert('L').resize((size, size), Image.LANCZOS)).astype(np.float64)
    hp = g - box_blur(g, hp_r)

    # 距离场化：硬边线条 → 平滑浮雕
    hp = np.asarray(
        Image.fromarray(np.clip(hp + 128, 0, 255).astype(np.uint8))
             .filter(ImageFilter.GaussianBlur(blur)),
        dtype=np.float64) - 128
    hp = hp - hp.mean()

    # 淡出：距边界 fade 像素内线性降到 0
    i = np.arange(size)
    d = np.minimum(i, size - 1 - i)
    w = np.clip((d - fade / 2.0) / (fade / 2.0), 0, 1)
    w2 = np.minimum(w[:, None], w[None, :])
    hp = hp * w2

    # ★ 只用未淡出区做归一化
    msk = w2 > 0.9
    inner = hp[msk] if msk.sum() > 500 else hp.ravel()
    amp = np.percentile(np.abs(inner), 99) or 1.0
    return np.clip(hp / amp, -1, 1) * 127.0 + 128.0


def quantize_16(light):
    """
    16 级量化，灰阶空间对齐中性点。

    ★ 教训（踩了两次）：不要在"级数"空间（0~15）减均值 —— 级数均值约 7.5，
      减完 clip 到 [0,15] 会整体塌到低端。必须在最终灰阶（8..248）空间里平移。
    ★ 也不要用 Floyd–Steinberg 误差扩散：它会破坏零均值，还得再拉回来。
      16 级 + 对称归一化的噪声 std 只有 4.6 灰阶（摆幅 145 的 3%），肉眼看不出。
    """
    gray = np.clip(np.round(light / LSTEP), 0, LEVELS - 1) * LSTEP + LSTEP // 2
    shift = 128.0 - gray.mean()
    gray = np.clip(gray + round(shift / LSTEP) * LSTEP, 8, 248)
    return gray.astype(np.uint8)


def build_meta():
    """给前端用的元数据（label / 摆幅 / 默认大小 / 默认旋转 / 类别）"""
    meta = {}
    for it in SRC:
        meta[it['name']] = dict(
            label=it.get('label', it['name']),
            swing=it.get('swing', 1.0),
            scale=it.get('scale', 1.0),
            rot=it.get('rot', 0),
            kind=it['kind'])
    return json.dumps(meta, ensure_ascii=False, separators=(',', ':'))


def main():
    os.makedirs(OUT, exist_ok=True)
    print("=" * 86)
    print("素材 → 无缝零均值光影 → 16 级量化 → PNG → base64")
    print("=" * 86)

    lines = [
        "/* 熨烫织纹 tile —— 内联为 dataURL（由 tools/gen-iron-textures.py 生成）",
        " *",
        " * 为什么不用外部 PNG：熨烫预览的像素级浮雕必须 getImageData 读像素，",
        " * 而 file:// 协议下加载任何外部图片都会把画布标记为 tainted → SecurityError。",
        " * dataURL 是纯字符串、不带来源信息，任何协议下都同源。",
        " */",
        "window.IRON_ZAOJIN_TILES = {"
    ]

    total = 0.0
    ok = 0
    bad = 0
    for it in SRC:
        name, path = it['name'], it['path']
        if not os.path.exists(path):
            print(f"  跳过 {name}: 素材不存在 {path}")
            continue

        img = Image.open(path)
        note = ''
        if it['kind'] == 'vector':
            px, py = it.get('unit', (None, None))
            # ★ 周期自检：SRC 里写的 unit 与自动检测对得上吗？
            #   对不上就用检测值（roll 法比自相关可靠）
            if VERIFY_PERIOD:
                det = detect_period(img)
                if det:
                    if px and py and (abs(det[0]-px) > px*0.15 or abs(det[1]-py) > py*0.15):
                        print(f"  {name}: ⚠ SRC 写的周期 {px}x{py} 与检测值 "
                              f"{det[0]}x{det[1]} 不符 → 采用检测值")
                    px, py = det
                elif px and py:
                    print(f"  {name}: 周期检测失败，沿用 SRC 的 {px}x{py}")
            light, note = unit_seamless_light(
                img, px=px, py=py, density=it.get('density', 2),
                hp_r=it.get('hp_r', 12), blur=it.get('blur', 4.0),
                fade=it.get('fade', 26))
        else:
            light = photo_seamless_light(img)

        png_arr = quantize_16(light)

        # 校验：边界跳变 + 量化误差 + 零均值
        err = np.abs(light - png_arr.astype(np.float64))
        a = png_arr.astype(float)
        jump_lr = np.abs(a[:, 0] - a[:, -1]).mean()
        jump_ud = np.abs(a[0, :] - a[-1, :]).mean()
        ilr = max(np.abs(np.diff(a, axis=1)).mean(), 1e-9)
        iud = max(np.abs(np.diff(a, axis=0)).mean(), 1e-9)
        ratio = max(jump_lr / ilr, jump_ud / iud)
        # 阈值 1.0：接缝跳变不超过内部纹理梯度 → 肉眼不可见
        #   （矢量花纹是淡出法，精确 0.00；照片是镜像+对齐法，实测 0.6~0.9 也没问题）
        flag = '无缝OK' if ratio < 1.0 else '接缝可疑'
        if ratio >= 1.0:
            bad += 1

        buf = io.BytesIO()
        Image.fromarray(png_arr, 'L').save(buf, 'PNG', optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode()
        kb = len(b64) / 1024
        total += kb
        ok += 1

        print(f"  {name:8s} {it['kind']:6s} 灰阶 {png_arr.min():3d}~{png_arr.max():3d} "
              f"均值 {png_arr.mean():6.1f} 误差std {err.std():4.1f} "
              f"接缝 {ratio:5.2f} {flag}  {kb:5.1f}KB")
        if note:
            print(f"           └ {note}")
        lines.append('  "%s": "data:image/png;base64,%s",' % (name, b64))

    lines.append("};")
    lines.append("/* 变体元数据：label / 摆幅 / 默认大小 / 默认旋转 / 类别 */")
    lines.append("window.IRON_ZAOJIN_META = %s;" % build_meta())

    out_path = os.path.join(OUT, 'tiles.js')
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))

    print()
    print(f"{ok}/{len(SRC)} 个变体（接缝可疑 {bad} 个），总计 {total:.1f}KB → {out_path} "
          f"({os.path.getsize(out_path)/1024:.0f}KB)")
    print("接下来跑 node build.js")


if __name__ == '__main__':
    main()
