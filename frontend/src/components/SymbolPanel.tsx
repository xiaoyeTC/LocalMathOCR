import { useState, useEffect } from 'react';

type SymbolGroup = {
  id: string;
  title: string;
  icon: string;
  color: string;
  categories: {
    name: string;
    items: string[];
  }[];
};

const GROUPS: SymbolGroup[] = [
  {
    id: 'greek',
    title: '希腊字母',
    icon: 'αβ',
    color: 'bg-blue-50 dark:bg-blue-950/30',
    categories: [
      { name: '小写', items: ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'] },
      { name: '大写', items: ['Γ', 'Δ', 'Θ', 'Λ', 'Ξ', 'Π', 'Σ', 'Φ', 'Ψ', 'Ω'] },
    ],
  },
  {
    id: 'math',
    title: '数学运算',
    icon: '√□',
    color: 'bg-purple-50 dark:bg-purple-950/30',
    categories: [
      { name: '运算符', items: ['+', '−', '×', '÷', '±', '∓', '·', '∘'] },
      { name: '关系', items: ['=', '≠', '≈', '≡', '≤', '≥', '<', '>', '≪', '≫', '∝', '∼'] },
    ],
  },
  {
    id: 'sets',
    title: '集合逻辑',
    icon: '∈∪∩',
    color: 'bg-emerald-50 dark:bg-emerald-950/30',
    categories: [
      { name: '集合', items: ['∈', '∉', '⊂', '⊃', '⊆', '⊇', '∪', '∩', '∅', '∧', '∨', '¬'] },
      { name: '逻辑', items: ['∀', '∃', '∄', '∴', '∵', '↔', '→', '⇐', '⇒', '⇔'] },
    ],
  },
  {
    id: 'arrows',
    title: '箭头',
    icon: '→⇌',
    color: 'bg-amber-50 dark:bg-amber-950/30',
    categories: [
      { name: '方向', items: ['→', '←', '↑', '↓', '↔', '↕', '↗', '↘', '↙', '↖'] },
      { name: '关系', items: ['⟹', '⟸', '⟺', '↦', '↧', '↗', '↘', '⇐', '⇒', '⇔'] },
    ],
  },
  {
    id: 'delimiters',
    title: '定界符',
    icon: '()[]',
    color: 'bg-rose-50 dark:bg-rose-950/30',
    categories: [
      { name: '括号', items: ['(', ')', '[', ']', '{', '}', '⌈', '⌉', '⌊', '⌋', '⟨', '⟩'] },
      { name: '定界', items: ['|', '‖', '⌈', '⌉', '⌊', '⌋', '⟨', '⟩', '‖', '∣'] },
    ],
  },
  {
    id: 'misc',
    title: '其他符号',
    icon: '∇∂∞',
    color: 'bg-cyan-50 dark:bg-cyan-950/30',
    categories: [
      { name: '微积分', items: ['∂', '∇', '∫', '∬', '∮', '∑', '∏', '∏', '∐'] },
      { name: '常用', items: ['∞', 'ℏ', 'ℏ', 'ℓ', 'ℏ', '∂', '∇', '∆', 'ℏ'] },
    ],
  },
];

const LATEX_MAP: Record<string, string> = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\epsilon',
  'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota', 'κ': '\\kappa',
  'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi',
  'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
  'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi',
  'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
  '+': '+', '−': '-', '×': '\\times', '÷': '\\div', '±': '\\pm', '∓': '\\mp',
  '·': '\\cdot', '∘': '\\circ',
  '=': '=', '≠': '\\neq', '≈': '\\approx', '≡': '\\equiv', '≤': '\\leq', '≥': '\\geq',
  '<': '<', '>': '>', '≪': '\\ll', '≫': '\\gg', '∝': '\\propto', '∼': '\\sim',
  '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq',
  '⊇': '\\supseteq', '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset',
  '∧': '\\wedge', '∨': '\\vee', '¬': '\\neg',
  '∀': '\\forall', '∃': '\\exists', '∄': '\\nexists', '∴': '\\therefore', '∵': '\\because',
  '↔': '\\leftrightarrow', '⇐': '\\Leftarrow', '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow',
  '→': '\\to', '←': '\\leftarrow', '↑': '\\uparrow', '↓': '\\downarrow',
  '↗': '\\nearrow', '↘': '\\searrow', '↙': '\\swarrow', '↖': '\\nwarrow',
  '⟹': '\\Longrightarrow', '⟸': '\\Longleftarrow', '⟺': '\\Longleftrightarrow',
  '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}',
  '⌈': '\\lceil', '⌉': '\\rceil', '⌊': '\\lfloor', '⌋': '\\rfloor', '⟨': '\\langle', '⟩': '\\rangle',
  '|': '|', '‖': '\\|',
  '∂': '\\partial', '∇': '\\nabla', '∫': '\\int', '∬': '\\iint', '∮': '\\oint',
  '∑': '\\sum', '∏': '\\prod',
  '∞': '\\infty', 'ℏ': '\\hbar', 'ℓ': '\\ell', '∆': '\\Delta',
};

const TABS = GROUPS.map((g) => ({ id: g.id, title: g.title, icon: g.icon }));

type Props = { onInsert: (snippet: string) => void };

export function SymbolPanel({ onInsert }: Props) {
  const [activeTab, setActiveTab] = useState('greek');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveTab('');
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const activeGroup = GROUPS.find((g) => g.id === activeTab);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white sm:text-base">常用符号面板</h3>

      {/* Tab bar */}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(activeTab === tab.id ? '' : tab.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <span className="font-mono text-sm">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.title}</span>
          </button>
        ))}
      </div>

      {/* Symbol grid */}
      {activeGroup && (
        <div className={`rounded-2xl ${activeGroup.color} p-3 sm:p-4`}>
          {activeGroup.categories.map((cat) => (
            <div key={cat.name} className="mb-3 last:mb-0">
              <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{cat.name}</div>
              <div className="flex flex-wrap gap-1">
                {cat.items.map((item) => {
                  const latex = LATEX_MAP[item] || item;
                  return (
                    <button
                      key={item + cat.name}
                      onClick={() => onInsert(latex)}
                      className="rounded-lg bg-white px-2 py-1.5 font-mono text-sm text-slate-700 shadow-sm transition hover:bg-primary hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-primary sm:px-3 sm:py-2 sm:text-base"
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
