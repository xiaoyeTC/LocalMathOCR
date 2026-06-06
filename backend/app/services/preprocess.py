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


def read_image(file_bytes: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(file_bytes))
    image = ImageOps.exif_transpose(image).convert("RGB")
    return image


def pil_to_cv(image: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def cv_to_pil(image: np.ndarray) -> Image.Image:
    if len(image.shape) == 2:
        return Image.fromarray(image).convert("RGB")
    return Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)).convert("RGB")


def trim_whitespace(binary: np.ndarray, padding: int = 20) -> np.ndarray:
    inv = 255 - binary
    coords = cv2.findNonZero(inv)
    if coords is None:
        return binary
    x, y, w, h = cv2.boundingRect(coords)
    y0 = max(y - padding, 0)
    x0 = max(x - padding, 0)
    y1 = min(y + h + padding, binary.shape[0])
    x1 = min(x + w + padding, binary.shape[1])
    return binary[y0:y1, x0:x1]


def upscale_if_small(image: np.ndarray, min_long_edge: int = 800) -> np.ndarray:
    h, w = image.shape[:2]
    long_edge = max(h, w)
    if long_edge >= min_long_edge:
        return image
    scale = min_long_edge / max(long_edge, 1)
    return cv2.resize(image, (math.ceil(w * scale), math.ceil(h * scale)), interpolation=cv2.INTER_CUBIC)


def deskew(binary: np.ndarray) -> np.ndarray:
    inv = 255 - binary
    coords = np.column_stack(np.where(inv > 0))
    if coords.size == 0:
        return binary
    rect = cv2.minAreaRect(coords)
    angle = rect[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) < 0.3 or abs(angle) > 10:
        return binary
    h, w = binary.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(binary, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=255)


def image_to_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def preprocess_image(file_bytes: bytes) -> PreprocessResult:
    original = read_image(file_bytes)
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


def make_thumbnail_data_url(file_bytes: bytes, max_size: tuple[int, int] = (320, 180)) -> str:
    image = read_image(file_bytes)
    image.thumbnail(max_size)
    return image_to_data_url(image)
