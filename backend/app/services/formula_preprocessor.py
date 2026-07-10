"""
工业级数学公式图片预处理模块。

本模块提供 FormulaPreprocessor 类，作为 lightweight preprocess.py 之上的一层高级预处理。
适用场景：深色模式截图、光照不均扫描件、倾斜拍照、带噪点的低质量公式图片。

处理流水线（可通过 config 开关任意步骤）：
  auto_invert → adaptive_binarize → denoise → deskew → auto_crop_and_pad → ensure_min_size

输入输出统一为 PIL.Image.Image，内部使用 numpy ndarray (OpenCV) 处理。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image

MAX_PROCESS_LONG_EDGE = 2048


# ─────────────────────────── 配置 ───────────────────────────


@dataclass
class FormulaPreprocessConfig:
    """预处理流水线配置，允许开关任意步骤并调整参数。"""

    enable_auto_invert: bool = True
    enable_adaptive_binarize: bool = True
    enable_denoise: bool = True
    enable_deskew: bool = True
    enable_crop_pad: bool = True
    enable_ensure_min_size: bool = True

    # auto_invert 参数
    invert_edge_ratio: float = 0.1
    """边缘采样区域占图像宽/高的比例（0~0.5）"""
    invert_brightness_threshold: int = 128
    """边缘平均亮度低于此值时判定为深色背景"""

    # adaptive_binarize 参数
    binarize_block_size: int = 31
    """自适应阈值的邻域块大小，必须为奇数"""
    binarize_c: int = 10
    """从均值/高斯加权均值中减去的常量"""

    # denoise 参数
    denoise_h: int = 10
    """滤波强度，值越大去噪越强（建议 6~15）"""
    denoise_template_window: int = 7
    """模板 patch 大小"""
    denoise_search_window: int = 21
    """搜索窗口大小"""

    # deskew 参数
    deskew_max_angle: float = 15.0
    """最大校正角度（度），超过此角度不做校正"""
    deskew_min_angle: float = 0.3
    """最小校正角度（度），低于此值视为不需要校正"""

    # crop_pad 参数
    crop_padding: int = 20
    """裁剪后四周添加的白色 padding 像素数"""

    # ensure_min_size 参数
    min_height: int = 128
    """最小高度阈值，低于此值时放大"""


# ─────────────────────────── 核心类 ───────────────────────────


class FormulaPreprocessor:
    """工业级数学公式图片预处理器。

    使用方法：
        preprocessor = FormulaPreprocessor()
        config = FormulaPreprocessConfig(enable_deskew=False)
        result = preprocessor.process(pil_image, config)
    """

    def process(
        self,
        image: Image.Image,
        config: FormulaPreprocessConfig | None = None,
    ) -> Image.Image:
        """按流水线顺序执行预处理步骤。

        Args:
            image: 输入的 PIL.Image（RGB 或灰度均可）
            config: 预处理配置，为 None 时使用默认配置（所有步骤开启）

        Returns:
            处理后的 PIL.Image（RGB）
        """
        if config is None:
            config = FormulaPreprocessConfig()

        w, h = image.size
        long_edge = max(w, h)
        if long_edge > MAX_PROCESS_LONG_EDGE:
            scale = MAX_PROCESS_LONG_EDGE / long_edge
            image = image.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        # PIL → OpenCV BGR/Gray
        img = self._pil_to_cv(image)

        # 确保是灰度或 BGR
        is_gray = len(img.shape) == 2

        # 1. 自动反转深色背景
        if config.enable_auto_invert:
            if is_gray:
                img = self._auto_invert_gray(img, config)
            else:
                img = self._auto_invert_bgr(img, config)

        # 转灰度用于后续处理（自适应二值化需要灰度输入）
        if not is_gray:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()

        # 2. 自适应二值化
        if config.enable_adaptive_binarize:
            gray = self._adaptive_binarize(gray, config)

        # 3. 去噪
        if config.enable_denoise:
            gray = self._denoise(gray, config)

        # 4. 倾斜校正
        if config.enable_deskew:
            gray = self._deskew(gray, config)

        # 5. 自动裁剪 + padding
        if config.enable_crop_pad:
            gray = self._auto_crop_and_pad(gray, config)

        # 6. 确保最小尺寸
        if config.enable_ensure_min_size:
            gray = self._ensure_min_size(gray, config)

        # 灰度 → RGB（兼容 OCR 模型输入）
        return Image.fromarray(gray).convert("RGB")

    # ─────────────── 方法 1: 自动反转深色背景 ───────────────

    def _auto_invert_bgr(self, img: np.ndarray, config: FormulaPreprocessConfig) -> np.ndarray:
        """检测 BGR 图像的边缘亮度，深色背景时反转。"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        if self._is_dark_background(gray, config):
            return cv2.bitwise_not(img)
        return img

    def _auto_invert_gray(self, img: np.ndarray, config: FormulaPreprocessConfig) -> np.ndarray:
        """检测灰度图像的边缘亮度，深色背景时反转。"""
        if self._is_dark_background(img, config):
            return cv2.bitwise_not(img)
        return img

    def _is_dark_background(self, gray: np.ndarray, config: FormulaPreprocessConfig) -> bool:
        """通过图像四周边缘区域的平均亮度判断是否为深色背景。

        策略：取图像四边各 edge_ratio 比例宽度的条带，
        计算这些像素的平均亮度。低于阈值则判定为深色背景。
        使用边缘而非全局平均，防止大面积黑色公式笔画干扰判断。
        """
        h, w = gray.shape[:2]
        r = max(config.invert_edge_ratio, 0.02)
        edge_h = max(int(h * r), 1)
        edge_w = max(int(w * r), 1)

        # 四边条带
        top = gray[:edge_h, :]
        bottom = gray[h - edge_h:, :]
        left = gray[:, :edge_w]
        right = gray[:, w - edge_w:]

        all_edges = np.concatenate([
            top.ravel(),
            bottom.ravel(),
            left.ravel(),
            right.ravel(),
        ])

        mean_brightness = float(np.mean(all_edges))
        return mean_brightness < config.invert_brightness_threshold

    # ─────────────── 方法 2: 自适应二值化 ───────────────

    def _adaptive_binarize(self, gray: np.ndarray, config: FormulaPreprocessConfig) -> np.ndarray:
        """使用自适应阈值处理光照不均匀的图片。

        blockSize 越大，对大面积渐变越鲁棒，但可能丢失细笔画。
        C 值越大，输出越白（更多像素被判为背景）。
        """
        # 确保 blockSize 为奇数且 >= 3
        block_size = max(config.binarize_block_size, 3)
        if block_size % 2 == 0:
            block_size += 1

        return cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=block_size,
            C=config.binarize_c,
        )

    # ─────────────── 方法 3: 去噪 ───────────────

    def _denoise(self, gray: np.ndarray, config: FormulaPreprocessConfig) -> np.ndarray:
        """使用非局部均值去噪去除扫描噪点。

        对于二值化后的公式图，h=10 能有效去除残留噪点同时保留笔画边缘。
        templateWindowSize 和 searchWindowSize 是经验调优值。
        """
        return cv2.fastNlMeansDenoising(
            gray,
            None,
            h=config.denoise_h,
            templateWindowSize=config.denoise_template_window,
            searchWindowSize=config.denoise_search_window,
        )

    # ─────────────── 方法 4: 倾斜校正 ───────────────

    def _deskew(self, gray: np.ndarray, config: FormulaPreprocessConfig) -> np.ndarray:
        """检测并校正轻微倾斜（±deskew_max_angle 度以内）。

        使用最小外接矩形法：找到所有前景像素，计算最小面积外接矩形的角度。
        """
        # 前景像素（反转后非零部分）
        inv = 255 - gray
        coords = np.column_stack(np.where(inv > 0))

        if coords.size == 0:
            return gray

        # 最小外接矩形
        rect = cv2.minAreaRect(coords)
        angle = rect[-1]

        # cv2.minAreaRect 返回的角度范围是 [-90, 0)
        # 当矩形"竖着"时角度接近 -90，需要转换为实际倾斜角
        if angle < -45:
            angle = 90 + angle

        # 角度过小或过大时不做校正
        if abs(angle) < config.deskew_min_angle:
            return gray
        if abs(angle) > config.deskew_max_angle:
            return gray

        h, w = gray.shape[:2]
        center = (w // 2, h // 2)
        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)

        # 旋转后填充白色背景
        return cv2.warpAffine(
            gray,
            matrix,
            (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=255,
        )

    # ─────────────── 方法 5: 自动裁剪 + padding ───────────────

    def _auto_crop_and_pad(self, gray: np.ndarray, config: FormulaPreprocessConfig) -> np.ndarray:
        """自动去除多余白边，并在公式四周添加均匀的白色 padding。

        对于二值化图像，前景为黑色（0），背景为白色（255）。
        用 findNonZero 找到前景边界框，裁剪后在四周补齐 padding。
        """
        inv = 255 - gray
        coords = cv2.findNonZero(inv)

        if coords is None:
            # 全白图像，直接返回
            return gray

        x, y, w, h = cv2.boundingRect(coords)
        pad = config.crop_padding

        img_h, img_w = gray.shape[:2]
        y0 = max(y - pad, 0)
        x0 = max(x - pad, 0)
        y1 = min(y + h + pad, img_h)
        x1 = min(x + w + pad, img_w)

        cropped = gray[y0:y1, x0:x1]

        # 如果裁剪后某一边的 padding 被截断（公式贴边），补齐白色
        ch, cw = cropped.shape[:2]
        need_top = max(pad - y, 0)
        need_bottom = max((y + h + pad) - img_h, 0)
        need_left = max(pad - x, 0)
        need_right = max((x + w + pad) - img_w, 0)

        if need_top > 0 or need_bottom > 0 or need_left > 0 or need_right > 0:
            cropped = cv2.copyMakeBorder(
                cropped,
                need_top,
                need_bottom,
                need_left,
                need_right,
                cv2.BORDER_CONSTANT,
                value=255,
            )

        return cropped

    # ─────────────── 方法 6: 确保最小尺寸 ───────────────

    def _ensure_min_size(self, gray: np.ndarray, config: FormulaPreprocessConfig) -> np.ndarray:
        """如果图像高度低于最小阈值，使用 LANCZOS4 插值放大。

        INTER_LANCZOS4 在放大时能最好地保留细小笔画的边缘锐度。
        等比放大，保持宽高比。
        """
        h, w = gray.shape[:2]
        min_h = config.min_height

        if h >= min_h:
            return gray

        scale = min_h / max(h, 1)
        new_w = math.ceil(w * scale)
        new_h = math.ceil(h * scale)
        max_dim = MAX_PROCESS_LONG_EDGE
        if max(new_w, new_h) > max_dim:
            ratio = max_dim / max(new_w, new_h)
            new_w = math.ceil(new_w * ratio)
            new_h = math.ceil(new_h * ratio)

        return cv2.resize(
            gray,
            (new_w, new_h),
            interpolation=cv2.INTER_LANCZOS4,
        )

    # ─────────────── 工具方法 ───────────────

    @staticmethod
    def _pil_to_cv(image: Image.Image) -> np.ndarray:
        """PIL Image → OpenCV ndarray（BGR 或 Gray）。"""
        arr = np.array(image)
        if arr.ndim == 2:
            return arr
        if arr.shape[2] == 4:
            return cv2.cvtColor(arr, cv2.COLOR_RGBA2BGR)
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


# ─────────────────────────── 测试代码 ───────────────────────────

if __name__ == "__main__":
    import sys
    from pathlib import Path

    def _demo(image_path: str) -> None:
        """读取本地图片并调用预处理器，展示各步骤效果。"""
        path = Path(image_path)
        if not path.exists():
            print(f"文件不存在: {path}")
            sys.exit(1)

        img = Image.open(path).convert("RGB")
        print(f"原图尺寸: {img.size}")

        preprocessor = FormulaPreprocessor()
        config = FormulaPreprocessConfig()

        # 全流水线
        result = preprocessor.process(img, config)
        print(f"处理后尺寸: {result.size}")

        out_dir = path.parent / "preprocess_output"
        out_dir.mkdir(exist_ok=True)
        stem = path.stem

        result.save(out_dir / f"{stem}_final.png")
        print(f"结果已保存到: {out_dir / f'{stem}_final.png'}")

        # 逐步骤演示
        steps = {
            "auto_invert": FormulaPreprocessConfig(
                enable_adaptive_binarize=False,
                enable_denoise=False,
                enable_deskew=False,
                enable_crop_pad=False,
                enable_ensure_min_size=False,
            ),
            "binarize": FormulaPreprocessConfig(
                enable_denoise=False,
                enable_deskew=False,
                enable_crop_pad=False,
                enable_ensure_min_size=False,
            ),
            "denoise": FormulaPreprocessConfig(
                enable_deskew=False,
                enable_crop_pad=False,
                enable_ensure_min_size=False,
            ),
            "deskew": FormulaPreprocessConfig(
                enable_crop_pad=False,
                enable_ensure_min_size=False,
            ),
            "crop_pad": FormulaPreprocessConfig(
                enable_ensure_min_size=False,
            ),
        }

        for step_name, step_config in steps.items():
            step_result = preprocessor.process(img, step_config)
            step_result.save(out_dir / f"{stem}_{step_name}.png")
            print(f"  [{step_name}] → {step_result.size}")

        print("\n所有步骤图已保存到:", out_dir)

    if len(sys.argv) > 1:
        _demo(sys.argv[1])
    else:
        print("用法: python formula_preprocessor.py <图片路径>")
        print("示例: python formula_preprocessor.py test.png")
