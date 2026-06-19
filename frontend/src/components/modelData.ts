import type { OcrModelMetadata } from '../services/api';

export const fallbackCopy: Record<string, Pick<OcrModelMetadata, 'display_name' | 'description' | 'vram_requirement' | 'strengths'>> = {
  pix2text: {
    display_name: '基础版 (Pix2Text)',
    description: '🚀 轻量高效，支持 CPU 运行。基于 P2T MFR 模型，适合单行公式和清晰截图。',
    vram_requirement: '<1GB',
    strengths: ['CPU 友好', '单行公式', '清晰截图', '快速识别'],
  },
  latex_ocr: {
    display_name: '高精度版 (LaTeX_OCR)',
    description: '🎯 准确率大幅提升。适合包含上下标、希腊字母的常规复杂公式。推荐 GPU 运行。',
    vram_requirement: '2GB+',
    strengths: ['上下标', '希腊字母', '常规复杂公式', 'GPU 推荐'],
  },
  uni_equation: {
    display_name: '专业版 (Uni-Equation)',
    description: '🧠 复杂结构克星。专为多层嵌套分数、大型矩阵、物理/化学长公式优化。',
    vram_requirement: '6GB+',
    strengths: ['嵌套分数', '大型矩阵', '长公式', '物理/化学公式'],
  },
};

export function displayModel(model: OcrModelMetadata) {
  const fallback = fallbackCopy[model.id];
  return {
    ...model,
    display_name: model.display_name || fallback?.display_name || model.id,
    description: model.description || fallback?.description || '本地公式识别模型',
    vram_requirement: model.vram_requirement || fallback?.vram_requirement || '未知',
    strengths: model.strengths?.length ? model.strengths : fallback?.strengths || [],
  };
}
