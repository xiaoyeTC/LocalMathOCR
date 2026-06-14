const groups = [
  { title: '希腊字母', items: ['\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\theta', '\\lambda', '\\mu', '\\pi', '\\sigma', '\\omega'] },
  { title: '运算关系', items: ['\\pm', '\\times', '\\div', '\\neq', '\\leq', '\\geq', '\\approx', '\\infty'] },
  { title: '微积分', items: ['\\sum_{i=1}^{n}', '\\int_{a}^{b}', '\\partial', '\\nabla', '\\lim_{x \\to 0}', '\\frac{d}{dx}'] },
  { title: '结构', items: ['\\frac{}{}', '\\sqrt{}', 'x^{2}', 'x_{i}', '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}'] },
];

type Props = { onInsert: (snippet: string) => void };

export function SymbolPanel({ onInsert }: Props) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <h3 className="mb-3 font-bold text-slate-900 dark:text-white sm:mb-4">常用符号面板</h3>
      <div className="space-y-3 sm:space-y-4">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:mb-2">{group.title}</div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {group.items.map((item) => (
                <button
                  key={item}
                  onClick={() => onInsert(item)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 hover:border-primary hover:text-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
