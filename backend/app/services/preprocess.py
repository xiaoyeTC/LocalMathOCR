import base64
import io
import math
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps


@dataclass
class PreprocessResult:
    image: Image.Image
    data_url: str


MAX_IMAGE_PIXELS = 4096 * 4096
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

_MAGIC_SIGNATURES = {
    b'\xff\xd8\xff': 'image/jpeg',
    b'\x89PNG\r\n\x1a\n': 'image/png',
    b'RIFF': 'image/webp',
}


def validate_image_magic(file_bytes: bytes) -> str:
    """通过文件头 magic bytes 验证真实图片类型，防止伪造 content-type。"""
    for sig, mime in _MAGIC_SIGNATURES.items():
        if file_bytes[:len(sig)] == sig:
            if mime == 'image/webp' and file_bytes[8:12] != b'WEBP':
                continue
            return mime
    raise ValueError("文件头不是有效的图片格式（仅支持 JPG/PNG/WebP）")


def read_image(file_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(file_bytes))
    except Exception as exc:
        raise ValueError(f"无法识别图片格式: {exc}") from exc
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass
    w, h = image.size
    if w * h > MAX_IMAGE_PIXELS:
        raise ValueError(f"图片分辨率过大: {w}x{h}（最大 {int(MAX_IMAGE_PIXELS/1024/1024)}MP）")
    return image.convert("RGB")


def pil_to_cv(image: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def cv_to_pil(image: np.ndarray) -> Image.Image:
    if len(image.shape) == 2:
        return Image.fromarray(image).convert("RGB")
    return Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)).convert("RGB")


def upscale_if_small(image: np.ndarray, min_long_edge: int = 800) -> np.ndarray:
    h, w = image.shape[:2]
    long_edge = max(h, w)
    if long_edge >= min_long_edge:
        return image
    scale = min_long_edge / max(long_edge, 1)
    return cv2.resize(image, (math.ceil(w * scale), math.ceil(h * scale)), interpolation=cv2.INTER_CUBIC)


def image_to_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def preprocess_image(file_bytes: bytes, predecoded: Image.Image | None = None) -> PreprocessResult:
    original = predecoded if predecoded is not None else read_image(file_bytes)
    cv_image = pil_to_cv(original)
    gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)

    # Use a threshold only to find the formula bounding box. Feeding a heavily
    # binarized image to pix2tex can destroy thin strokes and often produces
    # hallucinated array/table LaTeX for simple formulas.
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Re-crop the original RGB image with the same bounding box idea, then keep
    # natural anti-aliased edges. This is much safer for handwritten/printed
    # screenshots such as the quadratic formula.
    inv = 255 - mask
    coords = cv2.findNonZero(inv)
    if coords is not None:
        x, y, w, h = cv2.boundingRect(coords)
        pad = 28
        y0 = max(y - pad, 0)
        x0 = max(x - pad, 0)
        y1 = min(y + h + pad, cv_image.shape[0])
        x1 = min(x + w + pad, cv_image.shape[1])
        cv_image = cv_image[y0:y1, x0:x1]

    # Only upscale small crops; do not deskew unless the threshold mask is used
    # for display. Excessive deskewing is another common source of OCR errors.
    cv_image = upscale_if_small(cv_image, min_long_edge=900)
    processed = cv_to_pil(cv_image)
    return PreprocessResult(image=processed, data_url=image_to_data_url(processed))


def enhance_formula_image(image: Image.Image) -> Image.Image:
    """对公式图像进行增强预处理，提升低质量图片的识别准确率。

    适用场景：
    - 带有浅色背景的 PPT 截图
    - 模糊的 PDF 截图
    - 低对比度的打印/手写公式照片

    处理流程：
    1. 转灰度图
    2. 自适应二值化去除浅色背景干扰
    3. 非局部均值去噪去除噪点
    4. 卷积核锐化增强符号边缘
    5. 2倍放大提升上下标识别召回率

    如果任何步骤失败，返回原图，确保不会导致服务崩溃。
    """
    try:
        w, h = image.size
        long_edge = max(w, h)
        if long_edge > 2048:
            scale = 2048 / long_edge
            image = image.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        # 第1步：PIL Image -> OpenCV ndarray (灰度)
        gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)

        # 第2步：自适应二值化去除浅色背景干扰
        # blockSize=31 给出较大的局部窗口，适合处理光照不均匀的截图
        # C=15 稍高的常量偏移，确保浅灰色背景被压成白色
        binary = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=31,
            C=15,
        )

        # 第3步：非局部均值去噪
        # h=12 控制滤波强度，对二值化后的残留噪点效果好
        # templateWindowSize=7 / searchWindowSize=21 是经验值
        denoised = cv2.fastNlMeansDenoising(
            binary,
            None,
            h=12,
            templateWindowSize=7,
            searchWindowSize=21,
        )

        # 第4步：卷积核锐化增强符号边缘
        # 3x3 锐化核，中心权重 5，周围 -1，轻度锐化不会产生过多振铃
        sharpen_kernel = np.array(
            [[0, -1, 0],
             [-1, 5, -1],
             [0, -1, 0]],
            dtype=np.float32,
        )
        sharpened = cv2.filter2D(denoised, -1, sharpen_kernel)

        # 第5步：2倍放大，使用 INTER_CUBIC 插值提升上下标细节
        h, w = sharpened.shape[:2]
        upscaled = cv2.resize(
            sharpened,
            (w * 2, h * 2),
            interpolation=cv2.INTER_CUBIC,
        )

        # OpenCV ndarray -> PIL Image（灰度 -> RGB，兼容 pix2tex 输入要求）
        return Image.fromarray(upscaled).convert("RGB")

    except Exception:
        # 预处理任意步骤失败时，回退到原图，避免服务中断
        return image


def make_thumbnail_data_url(file_bytes: bytes, max_size: tuple[int, int] = (320, 180), predecoded: Image.Image | None = None) -> str:
    image = predecoded.copy() if predecoded is not None else read_image(file_bytes)
    image.thumbnail(max_size)
    return image_to_data_url(image)
