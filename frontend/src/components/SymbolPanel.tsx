import { useState, useEffect } from 'react';

type SymbolGroup = {
  id: string;
  title: string;
  icon: string;
  categories: {
    name: string;
    items: string[];
  }[];
};

const GROUPS: SymbolGroup[] = [
  {
    id: 'greek',
    title: '希腊字母',
    icon: 'αβΔΩ',
    categories: [
      { name: '小写', items: ['α', 'β', 'χ', 'δ', 'ε', 'ε', 'φ', 'φ', 'γ', 'η', 'ι', 'κ', 'λ', 'μ', 'ν', 'π', 'ω', 'θ', 'ϑ', 'ρ', 'σ', 'ς', 'τ', 'υ', 'ω', 'ξ', 'ψ', 'ζ', 'Δ'] },
      { name: '大写', items: ['Φ', 'Γ', 'Λ', 'Π', 'Θ', 'Σ', 'Ω', 'Ξ', 'Ψ', 'γ'] },
    ],
  },
  {
    id: 'math',
    title: '数学运算',
    icon: '√□÷×',
    categories: [
      { name: '运算符', items: ['+', '−', '×', '÷', '±', '∓', '·', '∘', '⊘', '⊕', '⊗'] },
      { name: '关系', items: ['=', '≠', '≈', '≡', '≤', '≥', '<', '>', '≪', '≫', '∝', '∼', '≃', '≍', '≐'] },
      { name: '幂与根', items: ['√', '∛', '∜', 'x²', 'x³', 'xⁿ', 'x⁻¹', 'xᵢ'] },
    ],
  },
  {
    id: 'sets',
    title: '集合逻辑',
    icon: '∈∪∩∀',
    categories: [
      { name: '集合', items: ['∈', '∉', '⊂', '⊃', '⊆', '⊇', '∪', '∩', '∅', '∖', '⊕', '⊎'] },
      { name: '逻辑', items: ['∀', '∃', '∄', '∴', '∵', '↔', '→', '⇐', '⇒', '⇔', '⟸', '⟹', '⟺'] },
    ],
  },
  {
    id: 'arrows',
    title: '箭头',
    icon: '→←↑↓',
    categories: [
      { name: '方向', items: ['→', '←', '↑', '↓', '↔', '↕', '↗', '↘', '↙', '↖'] },
      { name: '长箭头', items: ['⟹', '⟸', '⟺', '↦', '↤', '↧', '↥', '⇏', '⇍', '⇎'] },
      { name: '双向', items: ['↔', '⇌', '⇋', '⇌', '↭', '↹', '↺', '↻'] },
    ],
  },
  {
    id: 'delimiters',
    title: '定界符',
    icon: '()[]{}',
    categories: [
      { name: '括号', items: ['(', ')', '[', ']', '{', '}', '⟨', '⟩', '⌈', '⌉', '⌊', '⌋'] },
      { name: '围栏', items: ['|', '‖', '∣', '‖', '‖', '⌈⌉', '⌊⌋', '⟨⟩', '‖‖', '⌈⌉'] },
      { name: '成对', items: ['()', '[]', '{}', '⟨⟩', '||', '‖‖', '⌈⌉', '⌊⌋'] },
    ],
  },
  {
    id: 'integrals',
    title: '积分',
    icon: '∫∮∯',
    categories: [
      { name: '积分', items: ['∫', '∬', '∭', '∮', '∯', '∰'] },
      { name: '多重积分', items: ['∫∫', '∫∫∫', '∮∮', '∫_a^b', '∮_C'] },
    ],
  },
  {
    id: 'misc',
    title: '其他符号',
    icon: '∇∂∞',
    categories: [
      { name: '微积分', items: ['∂', '∇', '∆', 'ℏ', 'ℓ'] },
      { name: '常用', items: ['∞', 'ℏ', '∠', '⊥', '∥', '∝', '∃', '∀', 'ℝ', 'ℂ'] },
      { name: '省略号', items: ['⋯', '⋮', '⋱', '⋰', '…'] },
    ],
  },
];

const LATEX_MAP: Record<string, string> = {
  'α': '\\alpha', 'β': '\\beta', 'χ': '\\chi', 'δ': '\\delta', 'ε': '\\varepsilon',
  'φ': '\\varphi', 'γ': '\\gamma', 'η': '\\eta', 'ι': '\\iota', 'κ': '\\kappa',
  'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'π': '\\pi', 'ω': '\\omega', 'θ': '\\theta',
  'ϑ': '\\vartheta', 'ρ': '\\rho', 'σ': '\\sigma', 'ς': '\\varsigma', 'τ': '\\tau',
  'υ': '\\upsilon', 'ξ': '\\xi', 'ψ': '\\psi', 'ζ': '\\zeta', 'Δ': '\\Delta',
  'Φ': '\\Phi', 'Γ': '\\Gamma', 'Λ': '\\Lambda', 'Π': '\\Pi', 'Θ': '\\Theta', 'Σ': '\\Sigma',
  'Ω': '\\Omega', 'Ξ': '\\Xi', 'Ψ': '\\Psi',
  '+': '+', '−': '-', '×': '\\times', '÷': '\\div', '±': '\\pm', '∓': '\\mp',
  '·': '\\cdot', '∘': '\\circ', '⊘': '\\oslash', '⊕': '\\oplus', '⊗': '\\otimes',
  '=': '=', '≠': '\\neq', '≈': '\\approx', '≡': '\\equiv', '≤': '\\leq', '≥': '\\geq',
  '<': '<', '>': '>', '≪': '\\ll', '≫': '\\gg', '∝': '\\propto', '∼': '\\sim',
  '≃': '\\simeq', '≍': '\\cong', '≐': '\\doteq',
  '√': '\\sqrt', '∛': '\\sqrt[3]', '∜': '\\sqrt[4]', 'x²': 'x^{2}', 'x³': 'x^{3}',
  'xⁿ': 'x^{n}', 'x⁻¹': 'x^{-1}', 'xᵢ': 'x_{i}',
  '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq',
  '⊇': '\\supseteq', '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset', '∖': '\\setminus',
  '∀': '\\forall', '∃': '\\exists', '∄': '\\nexists', '∴': '\\therefore', '∵': '\\because',
  '↔': '\\leftrightarrow', '→': '\\to', '⇐': '\\Leftarrow', '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow',
  '⟸': '\\Longleftarrow', '⟹': '\\Longrightarrow', '⟺': '\\Longleftrightarrow',
  '↦': '\\mapsto', '↤': '\\mapsfrom', '↧': '\\downarrow', '↥': '\\uparrow',
  '⇏': '\\nRightarrow', '⇍': '\\nLeftarrow', '⇎': '\\nLeftrightarrow',
  '←': '\\leftarrow', '↑': '\\uparrow', '↓': '\\downarrow', '↗': '\\nearrow',
  '↘': '\\searrow', '↙': '\\swarrow', '↖': '\\nwarrow', '↕': '\\updownarrow',
  '⇌': '\\rightleftharpoons', '⇋': '\\leftrightharpoons', '↭': '\\nleftrightarrow',
  '↺': '\\circlearrowleft', '↻': '\\circlearrowright',
  '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}',
  '⟨': '\\langle', '⟩': '\\rangle', '⌈': '\\lceil', '⌉': '\\rceil', '⌊': '\\lfloor', '⌋': '\\rfloor',
  '|': '|', '‖': '\\|', '∣': '\\mid',
  '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '∯': '\\oiiint', '∰': '\\oiint',
  '∂': '\\partial', '∇': '\\nabla', '∆': '\\Delta', 'ℏ': '\\hbar', 'ℓ': '\\ell',
  '∞': '\\infty', '∠': '\\angle', '⊥': '\\perp', '∥': '\\parallel', 'ℝ': '\\mathbb{R}', 'ℂ': '\\mathbb{C}',
  '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots', '⋰': '\\iddots', '…': '\\dots',
};

const TABS = GROUPS.map((g) => ({ id: g.id, title: g.title, icon: g.icon }));

type Props = { onInsert: (snippet: string) => void };

export function SymbolPanel({ onInsert }: Props) {
  const [activeTab, setActiveTab] = useState('greek');
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const activeGroup = GROUPS.find((g) => g.id === activeTab);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left sm:p-5"
      >
        <h3 className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">常用符号面板</h3>
        <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          {/* Tab bar */}
          <div className="mb-4 flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(activeTab === tab.id ? '' : tab.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span className="font-mono text-xs sm:text-sm">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.title}</span>
              </button>
            ))}
          </div>

          {/* Symbol grid */}
          {activeGroup && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/50 dark:bg-slate-800/50 sm:p-4">
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
        </div>
      )}
    </section>
  );
}
