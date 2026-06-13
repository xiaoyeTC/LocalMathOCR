type Props = {
  confidence: number | null;
};

export function ConfidenceBanner({ confidence }: Props) {
  if (confidence === null) return null;
  if (confidence >= 0.8) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
      <span className="text-base">⚠️</span>
      <span className="font-medium">识别置信度较低（{(confidence * 100).toFixed(0)}%），可能存在错误，请人工核对</span>
    </div>
  );
}
