#!/usr/bin/env python3
"""FormulaPreprocessor demo script — demonstrates each processing step."""

import sys
from pathlib import Path

from app.services.formula_preprocessor import FormulaPreprocessor, FormulaPreprocessConfig
from PIL import Image


def _demo(image_path: str) -> None:
    path = Path(image_path)
    if not path.exists():
        print(f"文件不存在: {path}")
        sys.exit(1)

    img = Image.open(path).convert("RGB")
    print(f"原图尺寸: {img.size}")

    preprocessor = FormulaPreprocessor()
    config = FormulaPreprocessConfig()

    result = preprocessor.process(img, config)
    print(f"处理后尺寸: {result.size}")

    out_dir = path.parent / "preprocess_output"
    out_dir.mkdir(exist_ok=True)
    stem = path.stem

    result.save(out_dir / f"{stem}_final.png")
    print(f"结果已保存到: {out_dir / f'{stem}_final.png'}")

    steps = {
        "auto_invert": FormulaPreprocessConfig(
            enable_adaptive_binarize=False, enable_denoise=False,
            enable_deskew=False, enable_crop_pad=False, enable_ensure_min_size=False,
        ),
        "binarize": FormulaPreprocessConfig(
            enable_denoise=False, enable_deskew=False,
            enable_crop_pad=False, enable_ensure_min_size=False,
        ),
        "denoise": FormulaPreprocessConfig(
            enable_deskew=False, enable_crop_pad=False, enable_ensure_min_size=False,
        ),
        "deskew": FormulaPreprocessConfig(
            enable_crop_pad=False, enable_ensure_min_size=False,
        ),
        "crop_pad": FormulaPreprocessConfig(enable_ensure_min_size=False),
    }

    for step_name, step_config in steps.items():
        step_result = preprocessor.process(img, step_config)
        step_result.save(out_dir / f"{stem}_{step_name}.png")
        print(f"  [{step_name}] → {step_result.size}")

    print("\n所有步骤图已保存到:", out_dir)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        _demo(sys.argv[1])
    else:
        print("用法: python scripts/demo_preprocessor.py <图片路径>")
