import { useState, useEffect, useCallback, useRef } from 'react';

type SettingsData = Record<string, unknown>;

type Props = {
  onClose: () => void;
};

const MODEL_OPTIONS = [
  { value: 'pix2text', label: '基础版 (Pix2Text)' },
  { value: 'latex_ocr', label: '高精度版 (LaTeX_OCR)' },
  { value: 'uni_equation', label: '专业版 (Uni-Equation)' },
];

export function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasAdminPassword, setHasAdminPassword] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success'>('error');
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (msgTimerRef.current) clearTimeout(msgTimerRef.current); }, []);

  const showMessage = (text: string, type: 'error' | 'success' = 'error') => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    setMessage(text);
    setMessageType(type);
    msgTimerRef.current = setTimeout(() => setMessage(''), 3000);
  };

  const fetchSettings = useCallback(async (token?: string) => {
    try {
      const sessionId = localStorage.getItem('localmathocr-session-id') || 'default';
      const headers: Record<string, string> = { 'X-Session-ID': sessionId };
      if (token) headers['X-Admin-Token'] = token;
      const res = await fetch('/api/settings', { headers });
      if (!res.ok) { showMessage('API 错误: ' + res.status); setSettings({}); return; }
      const data = await res.json();
      if (data.code === 200 && data.data?.settings) {
        setSettings(data.data.settings);
        setIsAdmin(data.data.is_admin ?? false);
        setHasAdminPassword(data.data.has_admin_password ?? false);
      } else {
        showMessage(data.message || '加载失败');
        setSettings({});
      }
    } catch {
      showMessage('后端未连接');
      setSettings({});
    }
  }, []);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('localmathocr-admin-token');
    if (savedToken) { setAdminToken(savedToken); fetchSettings(savedToken); }
    else { fetchSettings(); }
  }, [fetchSettings]);

  const handleAdminLogin = async () => {
    if (!adminPassword.trim()) return;
    try {
      const sessionId = localStorage.getItem('localmathocr-session-id') || 'default';
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-ID': sessionId },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (data.code === 200) {
        const token = data.data.token;
        setAdminToken(token);
        sessionStorage.setItem('localmathocr-admin-token', token);
        setAdminPassword('');
        showMessage('管理员登录成功', 'success');
        await fetchSettings(token);
      } else { showMessage('密码错误'); }
    } catch { showMessage('验证失败'); }
  };

  const handleAdminLogout = () => {
    setAdminToken('');
    setIsAdmin(false);
    sessionStorage.removeItem('localmathocr-admin-token');
    showMessage('已退出管理员模式', 'success');
    fetchSettings();
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const sessionId = localStorage.getItem('localmathocr-session-id') || 'default';
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Session-ID': sessionId };
      if (adminToken) headers['X-Admin-Token'] = adminToken;
      const res = await fetch('/api/settings', { method: 'PUT', headers, body: JSON.stringify(settings) });
      const data = await res.json();
      if (data.code === 200) showMessage('设置已保存，部分设置需重启后端生效', 'success');
      else showMessage(data.message || '保存失败');
    } catch { showMessage('保存失败'); }
    finally { setSaving(false); }
  };

  const isLoading = settings === null;
  const isEmpty = settings !== null && Object.keys(settings).length === 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900 animate-slide-in sm:max-w-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">设置</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">配置应用参数</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className="text-sm text-slate-400">加载中...</span>
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <span className="text-4xl">⚠️</span>
              <span className="text-sm text-slate-500">无法加载设置</span>
              <span className="text-xs text-slate-400">请确认后端已启动</span>
              <button onClick={() => { setSettings(null); fetchSettings(adminToken || undefined); }} className="mt-2 rounded-xl bg-blue-50 px-5 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400">重试</button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* General Settings */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
                <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">通用设置</h3>
                <div className="space-y-3">
                  <SettingRow label="默认模型" desc="启动时自动选择的 OCR 模型" icon="🧠">
                    <select
                      value={String(settings.default_model_id ?? 'pix2text')}
                      onChange={(e) => setSettings((s) => s ? { ...s, default_model_id: e.target.value } : s)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    >
                      {MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </SettingRow>
                  <SettingRow label="轻度预处理" desc="对输入图像做灰度化、二值化等处理" icon="🖼️">
                    <Toggle value={!!settings.preprocess} onChange={(v) => setSettings((s) => s ? { ...s, preprocess: v } : s)} />
                  </SettingRow>
                  <SettingRow label="高级预处理" desc="深色反转、自适应二值化、去噪、倾斜校正" icon="⚙️">
                    <Toggle value={!!settings.enable_formula_preprocessing} onChange={(v) => setSettings((s) => s ? { ...s, enable_formula_preprocessing: v } : s)} />
                  </SettingRow>
                  <SettingRow label="历史记录条数" desc="每页最多保存的历史记录数量" icon="📋">
                    <input type="number" value={Number(settings.history_limit ?? 50)} onChange={(e) => setSettings((s) => s ? { ...s, history_limit: Number(e.target.value) } : s)} className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
                  </SettingRow>
                  <SettingRow label="运行模式" desc="当前计算运行模式" icon="💻">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{String(settings.app_device ?? 'auto')}</span>
                  </SettingRow>
                </div>
              </section>

              {/* Admin Login */}
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800 sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">🔒</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">管理员</span>
                </div>
                {isAdmin ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-green-600 dark:text-green-400">已登录管理员模式</span>
                    <button onClick={handleAdminLogout} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">退出</button>
                  </div>
                ) : hasAdminPassword ? (
                  <>
                    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">输入密码解锁高级设置</p>
                    <div className="flex gap-2">
                      <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="密码" className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()} />
                      <button onClick={handleAdminLogin} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">登录</button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">未设置管理员密码，在 `.env` 中配置 `ADMIN_PASSWORD` 后可登录</p>
                )}
              </section>

              {/* Admin Settings */}
              {isAdmin && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">管理员设置</h3>
                    <button onClick={handleAdminLogout} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">退出管理</button>
                  </div>
                  <div className="space-y-3">
                    <SettingRow label="启用 Pix2Text" desc="基础版公式识别引擎" icon="🚀">
                      <Toggle value={!!settings.enable_pix2text} onChange={(v) => setSettings((s) => s ? { ...s, enable_pix2text: v } : s)} />
                    </SettingRow>
                    <SettingRow label="启用 LaTeX_OCR" desc="高精度版公式识别引擎" icon="🎯">
                      <Toggle value={!!settings.enable_latex_ocr} onChange={(v) => setSettings((s) => s ? { ...s, enable_latex_ocr: v } : s)} />
                    </SettingRow>
                    <SettingRow label="启用 Uni-Equation" desc="专业版复杂公式识别引擎" icon="🧠">
                      <Toggle value={!!settings.enable_uni_equation} onChange={(v) => setSettings((s) => s ? { ...s, enable_uni_equation: v } : s)} />
                    </SettingRow>
                    <SettingRow label="预加载模型" desc="启动时自动加载的模型列表" icon="⚡">
                      <select
                        value={String(settings.preload_models ?? 'pix2text')}
                        onChange={(e) => setSettings((s) => s ? { ...s, preload_models: e.target.value } : s)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      >
                        <option value="pix2text">Pix2Text</option>
                        <option value="pix2text,latex_ocr">Pix2Text + LaTeX_OCR</option>
                        <option value="pix2text,latex_ocr,uni_equation">全部模型</option>
                      </select>
                    </SettingRow>
                    <SettingRow label="最大加载数" desc="同时保留在显存中的模型数量" icon="📊">
                      <input type="number" value={Number(settings.max_loaded_models ?? 1)} onChange={(e) => setSettings((s) => s ? { ...s, max_loaded_models: Number(e.target.value) } : s)} className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
                    </SettingRow>
                    <SettingRow label="下载超时" desc="模型下载超时时间（秒）" icon="⏱️">
                      <input type="number" value={Number(settings.model_download_timeout_sec ?? 1800)} onChange={(e) => setSettings((s) => s ? { ...s, model_download_timeout_sec: Number(e.target.value) } : s)} className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
                    </SettingRow>
                    <SettingRow label="P2T 模型版本" desc="Pix2Text 公式识别模型版本" icon="🔧">
                      <input type="text" value={String(settings.p2t_mfr_model ?? '')} onChange={(e) => setSettings((s) => s ? { ...s, p2t_mfr_model: e.target.value } : s)} className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
                    </SettingRow>
                    <SettingRow label="HF 镜像" desc="HuggingFace 镜像地址" icon="🌐">
                      <input type="text" value={String(settings.hf_endpoint ?? '')} onChange={(e) => setSettings((s) => s ? { ...s, hf_endpoint: e.target.value } : s)} className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 sm:w-48 sm:text-sm" />
                    </SettingRow>
                    <SettingRow label="启用 Pandoc" desc="支持 Word/PDF/HTML 格式导出" icon="📄">
                      <Toggle value={!!settings.enable_pandoc} onChange={(v) => setSettings((s) => s ? { ...s, enable_pandoc: v } : s)} />
                    </SettingRow>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {!isLoading && !isEmpty && (
          <div className="border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
            {message && (
              <div className={`mb-3 rounded-xl px-3 py-2 text-sm ${messageType === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                {message}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">取消</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? '保存中...' : '保存设置'}</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SettingRow({ label, desc, icon, children }: { label: string; desc: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-3 dark:border-slate-700/50 dark:bg-slate-800/50 sm:px-4">
      <span className="text-base sm:text-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</div>
        <div className="text-xs text-slate-400 dark:text-slate-500">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={`h-6 w-11 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${value ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
    </button>
  );
}
