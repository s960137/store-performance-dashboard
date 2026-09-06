import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Info,
  LockKeyhole,
  Printer,
  Search,
  SlidersHorizontal,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { buildReport, columnLabels, readWorkbook } from './parser';
import type { ColumnKey, ColumnMap, ImportPreview, MetricKey, ParsedReport, StoreRow } from './types';

const demoRows: StoreRow[] = [
  { id: 'sample-1', category: '服飾', name: '範例專櫃 A', dailyCurrent: 128000, dailyLast: 115000, dailyDiff: 13000, dailyGrowth: 11.3, mtdCurrent: 1810000, mtdLast: 1740000, mtdDiff: 70000, mtdGrowth: 4, ytdCurrent: 20800000, ytdLast: 19600000, ytdDiff: 1200000, ytdGrowth: 6.1 },
  { id: 'sample-2', category: '服飾', name: '範例專櫃 B', dailyCurrent: 76000, dailyLast: 91000, dailyDiff: -15000, dailyGrowth: -16.5, mtdCurrent: 1320000, mtdLast: 1490000, mtdDiff: -170000, mtdGrowth: -11.4, ytdCurrent: 15900000, ytdLast: 16600000, ytdDiff: -700000, ytdGrowth: -4.2 },
  { id: 'sample-3', category: '配件', name: '範例專櫃 C', dailyCurrent: 0, dailyLast: 32000, dailyDiff: -32000, dailyGrowth: -100, mtdCurrent: 640000, mtdLast: 710000, mtdDiff: -70000, mtdGrowth: -9.9, ytdCurrent: 8400000, ytdLast: 7900000, ytdDiff: 500000, ytdGrowth: 6.3 },
  { id: 'sample-4', category: '生活', name: '範例專櫃 D', dailyCurrent: 54000, dailyLast: 46000, dailyDiff: 8000, dailyGrowth: 17.4, mtdCurrent: 880000, mtdLast: 760000, mtdDiff: 120000, mtdGrowth: 15.8, ytdCurrent: 10100000, ytdLast: 9300000, ytdDiff: 800000, ytdGrowth: 8.6 },
];

const demoReport: ParsedReport = {
  reportDate: '2026-09-07',
  sourceFile: '示範資料（未載入 Excel）',
  sheetName: '示範',
  rows: demoRows,
  warnings: [],
};

const mappingKeys = Object.keys(columnLabels) as ColumnKey[];

const currency = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const compactCurrency = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 });

const formatAmount = (value: number) => currency.format(Math.round(value));
const formatSigned = (value: number) => `${value > 0 ? '+' : ''}${formatAmount(value)}`;
const formatPercent = (value: number | null) => (value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`);

const metricOptions: Array<{ key: MetricKey; label: string }> = [
  { key: 'dailyCurrent', label: '當日業績' },
  { key: 'dailyLast', label: '去年當日' },
  { key: 'mtdCurrent', label: '月累業績' },
  { key: 'mtdDiff', label: '月累差異' },
  { key: 'ytdCurrent', label: '年累業績' },
  { key: 'ytdDiff', label: '年累差異' },
];

const sum = (rows: StoreRow[], key: keyof StoreRow) =>
  rows.reduce((total, row) => total + (typeof row[key] === 'number' ? (row[key] as number) : 0), 0);

const classForDiff = (value: number) => (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral');

function Delta({ value, percent }: { value: number; percent?: number | null }) {
  return (
    <span className={`delta ${classForDiff(value)}`}>
      {value > 0 ? <ArrowUp size={13} /> : value < 0 ? <ArrowDown size={13} /> : null}
      <span>{formatSigned(value)}</span>
      {percent !== undefined && <small>{formatPercent(percent)}</small>}
    </span>
  );
}

function ImportDialog({
  preview,
  onClose,
  onConfirm,
}: {
  preview: ImportPreview;
  onClose: () => void;
  onConfirm: (mapping: ColumnMap, date: string) => void;
}) {
  const [mapping, setMapping] = useState<ColumnMap>(preview.columnMap);
  const [date, setDate] = useState(preview.reportDate);
  const requiredReady = ['name', 'dailyCurrent', 'dailyLast', 'mtdCurrent', 'ytdCurrent'].every(
    (key) => mapping[key as ColumnKey] !== undefined,
  ) && (mapping.mtdLast !== undefined || mapping.mtdDiff !== undefined)
    && (mapping.ytdLast !== undefined || mapping.ytdDiff !== undefined);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">匯入前檢查</p>
            <h2 id="import-title">確認 Excel 欄位</h2>
            <p>{preview.sourceFile} · {preview.sheetName} · 第 {preview.headerRow + 1} 列表頭</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="關閉"><X size={20} /></button>
        </div>

        <div className="mapping-note">
          <Info size={18} />
          <span>系統已自動比對欄名。若預覽不正確，請在下方重新指定；星號為必要欄位。</span>
        </div>

        <label className="date-field">
          <span>報表日期</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        <div className="mapping-grid">
          {mappingKeys.map((key) => (
            <label key={key}>
              <span>{columnLabels[key]}</span>
              <div className="select-wrap">
                <select
                  value={mapping[key] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMapping((current) => ({ ...current, [key]: value === '' ? undefined : Number(value) }));
                  }}
                >
                  <option value="">不匯入</option>
                  {preview.headers.map((header, index) => <option key={`${index}-${header}`} value={index}>{header}</option>)}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>
          ))}
        </div>

        <div className="preview-strip">
          <strong>資料預覽</strong>
          <span>{preview.rows.length - preview.headerRow - 1} 列待處理</span>
          <span>{preview.headers.length} 欄</span>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>取消</button>
          <button className="primary-button" disabled={!requiredReady || !date} onClick={() => onConfirm(mapping, date)}>
            <Check size={17} /> 確認匯入
          </button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [report, setReport] = useState<ParsedReport>(demoReport);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [sortKey, setSortKey] = useState<MetricKey>('mtdDiff');
  const [hideZero, setHideZero] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const importFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setNotice('正在讀取 Excel…');
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('請選擇 .xlsx、.xls 或 .csv 檔案。');
      setPreview(await readWorkbook(file));
      setNotice('');
    } catch (caught) {
      setNotice('');
      setError(caught instanceof Error ? caught.message : '無法讀取檔案。');
    }
  };

  const categories = useMemo(
    () => ['全部', ...Array.from(new Set(report.rows.map((row) => row.category))).sort()],
    [report.rows],
  );

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-TW');
    return report.rows
      .filter((row) => category === '全部' || row.category === category)
      .filter((row) => !hideZero || row.dailyCurrent !== 0)
      .filter((row) => !normalized || `${row.name} ${row.category}`.toLocaleLowerCase('zh-TW').includes(normalized))
      .sort((a, b) => b[sortKey] - a[sortKey]);
  }, [report.rows, category, hideZero, query, sortKey]);

  const totals = useMemo(() => ({
    dailyCurrent: sum(report.rows, 'dailyCurrent'),
    dailyLast: sum(report.rows, 'dailyLast'),
    dailyDiff: sum(report.rows, 'dailyDiff'),
    mtdCurrent: sum(report.rows, 'mtdCurrent'),
    mtdLast: sum(report.rows, 'mtdLast'),
    mtdDiff: sum(report.rows, 'mtdDiff'),
    ytdCurrent: sum(report.rows, 'ytdCurrent'),
    ytdLast: sum(report.rows, 'ytdLast'),
    ytdDiff: sum(report.rows, 'ytdDiff'),
  }), [report.rows]);

  const zeroSales = useMemo(() => report.rows.filter((row) => row.dailyCurrent === 0), [report.rows]);
  const declineCount = useMemo(() => report.rows.filter((row) => row.mtdDiff < 0).length, [report.rows]);
  const rankingData = useMemo(
    () => [...filteredRows].sort((a, b) => b[sortKey] - a[sortKey]).slice(0, 12),
    [filteredRows, sortKey],
  );

  const completeImport = (mapping: ColumnMap, date: string) => {
    if (!preview) return;
    try {
      const parsed = buildReport({ ...preview, reportDate: date }, mapping);
      setReport(parsed);
      setPreview(null);
      setQuery('');
      setCategory('全部');
      setNotice(`已匯入 ${parsed.rows.length} 個專櫃。`);
      window.setTimeout(() => setNotice(''), 3500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '匯入失敗。');
    }
  };

  const copyBriefing = async () => {
    const weakest = [...report.rows].sort((a, b) => a.mtdDiff - b.mtdDiff).slice(0, 3);
    const text = [
      `${report.reportDate} 專櫃業績早會摘要`,
      `當日業績 ${formatAmount(totals.dailyCurrent)}，較去年同期 ${formatSigned(totals.dailyDiff)}`,
      `月累業績 ${formatAmount(totals.mtdCurrent)}，差異 ${formatSigned(totals.mtdDiff)}`,
      `年累業績 ${formatAmount(totals.ytdCurrent)}，差異 ${formatSigned(totals.ytdDiff)}`,
      `當日零業績 ${zeroSales.length} 櫃；月累衰退 ${declineCount} 櫃`,
      `月累差異後三名：${weakest.map((row) => `${row.name} ${formatSigned(row.mtdDiff)}`).join('、')}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setNotice('早會摘要已複製。');
    window.setTimeout(() => setNotice(''), 2500);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><BarChart3 size={23} /></div>
          <div>
            <h1>專櫃業績晨會表</h1>
            <p>每日、月累與年累業績總覽</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="privacy"><LockKeyhole size={15} /> 檔案僅在本機瀏覽器解析</span>
          <button className="secondary-button" onClick={() => window.print()}><Printer size={17} /> 列印</button>
          <button className="primary-button" onClick={() => fileInput.current?.click()}><UploadCloud size={17} /> 匯入 Excel</button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(event) => {
              void importFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      </header>

      <main
        className={isDragging ? 'drag-active' : ''}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void importFile(event.dataTransfer.files?.[0]);
        }}
      >
        {isDragging && <div className="drop-overlay"><UploadCloud size={34} /><strong>放開即可匯入 Excel</strong></div>}

        <section className="report-heading">
          <div>
            <p className="eyebrow">業績報表</p>
            <h2>{report.reportDate}</h2>
            <p className="source-line"><FileSpreadsheet size={15} /> {report.sourceFile} · {report.sheetName}</p>
          </div>
          <div className="heading-actions">
            <button className="secondary-button" onClick={() => void copyBriefing()}>複製早會摘要</button>
          </div>
        </section>

        {(error || notice) && (
          <div className={`toast ${error ? 'toast-error' : ''}`}>
            {error ? <AlertTriangle size={18} /> : <Check size={18} />}
            <span>{error || notice}</span>
            <button onClick={() => { setError(''); setNotice(''); }} aria-label="關閉"><X size={16} /></button>
          </div>
        )}

        {report.warnings.length > 0 && (
          <details className="warnings">
            <summary><AlertTriangle size={17} /> 匯入檢查提醒（{report.warnings.length}）</summary>
            <ul>{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </details>
        )}

        <section className="kpi-grid">
          <article className="kpi-card accent-gold">
            <span>當日業績</span>
            <strong>{formatAmount(totals.dailyCurrent)}</strong>
            <Delta value={totals.dailyDiff} percent={totals.dailyLast ? (totals.dailyDiff / Math.abs(totals.dailyLast)) * 100 : null} />
            <small>去年當日 {formatAmount(totals.dailyLast)}</small>
          </article>
          <article className="kpi-card accent-teal">
            <span>月累業績</span>
            <strong>{formatAmount(totals.mtdCurrent)}</strong>
            <Delta value={totals.mtdDiff} percent={totals.mtdLast ? (totals.mtdDiff / Math.abs(totals.mtdLast)) * 100 : null} />
            <small>去年同期 {formatAmount(totals.mtdLast)}</small>
          </article>
          <article className="kpi-card accent-blue">
            <span>年累業績</span>
            <strong>{formatAmount(totals.ytdCurrent)}</strong>
            <Delta value={totals.ytdDiff} percent={totals.ytdLast ? (totals.ytdDiff / Math.abs(totals.ytdLast)) * 100 : null} />
            <small>去年同期 {formatAmount(totals.ytdLast)}</small>
          </article>
          <article className="kpi-card risk-card">
            <span>今日關注</span>
            <div className="risk-line"><strong>{zeroSales.length}</strong><span>櫃零業績</span></div>
            <div className="risk-line"><strong>{declineCount}</strong><span>櫃月累衰退</span></div>
            <small>全表共 {report.rows.length} 個專櫃</small>
          </article>
        </section>

        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">快速比較</p>
              <h3>專櫃排行</h3>
            </div>
            <div className="select-wrap compact-select">
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as MetricKey)}>
                {metricOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              <ChevronDown size={16} />
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rankingData} layout="vertical" margin={{ top: 6, right: 56, bottom: 6, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e4dc" />
                <XAxis type="number" tickFormatter={(value) => compactCurrency.format(Number(value))} tick={{ fill: '#77746d', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={118} tick={{ fill: '#373631', fontSize: 12 }} />
                <Tooltip formatter={(value) => formatAmount(Number(value))} contentStyle={{ borderRadius: 10, borderColor: '#d8d4c9' }} />
                <Bar dataKey={sortKey} radius={[0, 5, 5, 0]}>
                  {rankingData.map((row) => <Cell key={row.id} fill={row[sortKey] < 0 ? '#c45245' : '#2e796d'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading table-heading">
            <div>
              <p className="eyebrow">完整清單</p>
              <h3>專櫃業績明細</h3>
            </div>
            <div className="filters">
              <label className="search-field">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋專櫃或類別" />
              </label>
              <div className="select-wrap compact-select">
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <ChevronDown size={16} />
              </div>
              <button className={`toggle-button ${hideZero ? 'active' : ''}`} onClick={() => setHideZero((current) => !current)}>
                <SlidersHorizontal size={16} /> {hideZero ? '顯示零業績' : '隱藏零業績'}
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>專櫃</th>
                  <th>當日業績</th>
                  <th>去年當日</th>
                  <th>當日差異</th>
                  <th>月累業績</th>
                  <th>月累差異</th>
                  <th>年累業績</th>
                  <th>年累差異</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className={row.dailyCurrent === 0 ? 'zero-row' : ''}>
                    <td><strong>{row.name}</strong><small>{row.category}</small></td>
                    <td>{formatAmount(row.dailyCurrent)}</td>
                    <td>{formatAmount(row.dailyLast)}</td>
                    <td><Delta value={row.dailyDiff} percent={row.dailyGrowth} /></td>
                    <td>{formatAmount(row.mtdCurrent)}</td>
                    <td><Delta value={row.mtdDiff} percent={row.mtdGrowth} /></td>
                    <td>{formatAmount(row.ytdCurrent)}</td>
                    <td><Delta value={row.ytdDiff} percent={row.ytdGrowth} /></td>
                  </tr>
                ))}
                {!filteredRows.length && <tr><td colSpan={8} className="empty-state">沒有符合條件的專櫃。</td></tr>}
              </tbody>
              <tfoot>
                <tr>
                  <td>全部專櫃</td>
                  <td>{formatAmount(totals.dailyCurrent)}</td>
                  <td>{formatAmount(totals.dailyLast)}</td>
                  <td><Delta value={totals.dailyDiff} /></td>
                  <td>{formatAmount(totals.mtdCurrent)}</td>
                  <td><Delta value={totals.mtdDiff} /></td>
                  <td>{formatAmount(totals.ytdCurrent)}</td>
                  <td><Delta value={totals.ytdDiff} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <footer>
          <LockKeyhole size={15} /> Excel 內容不會離開這台電腦；重新整理頁面即清除已匯入資料。
        </footer>
      </main>

      {preview && <ImportDialog preview={preview} onClose={() => setPreview(null)} onConfirm={completeImport} />}
    </div>
  );
}

export default App;
