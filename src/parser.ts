import type { ColumnKey, ColumnMap, ImportPreview, ParsedReport, StoreRow } from './types';

const REQUIRED_COLUMNS: ColumnKey[] = ['name', 'dailyCurrent', 'dailyLast', 'mtdCurrent', 'ytdCurrent'];

const COLUMN_PATTERNS: Record<ColumnKey, RegExp[]> = {
  category: [/類別/, /分類/, /業種/, /部門/, /品類/, /課別/],
  name: [/中文名稱/, /專櫃名稱/, /櫃位名稱/, /櫃名/, /品牌名稱/, /^名稱$/],
  dailyCurrent: [/(本日|當日|今日).*(業績|銷售)?/, /(業績|銷售).*(本日|當日|今日)/],
  dailyLast: [/(去年|同期).*(本日|當日|日業績)/, /(本日|當日).*(去年|同期)/],
  mtdCurrent: [/月累.*(今年|本年|本期|本月|業績)/, /(今年|本年|本期|本月).*月累/, /^月累$/],
  mtdLast: [/月累.*(去年|同期)/, /(去年|同期).*月累/],
  mtdDiff: [/月累.*(差異|差額|增減額)/, /(差異|差額|增減額).*月累/],
  mtdGrowth: [/月累.*(成長|增減率|同期比|年增)/, /(成長|增減率|同期比|年增).*月累/],
  ytdCurrent: [/(年累|年度累計).*(今年|本年|本期|業績)/, /(今年|本年|本期).*(年累|年度累計)/, /^年累$/],
  ytdLast: [/(年累|年度累計).*(去年|同期)/, /(去年|同期).*(年累|年度累計)/],
  ytdDiff: [/(年累|年度累計).*(差異|差額|增減額)/, /(差異|差額|增減額).*(年累|年度累計)/],
  ytdGrowth: [/(年累|年度累計).*(成長|增減率|同期比|年增)/, /(成長|增減率|同期比|年增).*(年累|年度累計)/],
};

const clean = (value: unknown) =>
  String(value ?? '')
    .replace(/[\s\n\r　]+/g, '')
    .replace(/[（）()]/g, '')
    .trim();

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '')
    .replace(/[$NT＄元,%％,，\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parsePercent = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseNumber(value);
  if (typeof value === 'number' && Math.abs(value) <= 2) return parsed * 100;
  return parsed;
};

const growth = (current: number, last: number): number | null => {
  if (last === 0) return current === 0 ? 0 : null;
  return ((current - last) / Math.abs(last)) * 100;
};

const excelSerialToDate = (value: number) => {
  const date = new Date(Math.round((value - 25569) * 86400 * 1000));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const normalizeDate = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 30000 && value < 70000) return excelSerialToDate(value);
  const text = String(value ?? '').trim();
  const western = text.match(/(20\d{2})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/);
  if (western) return `${western[1]}-${western[2].padStart(2, '0')}-${western[3].padStart(2, '0')}`;
  const roc = text.match(/(?:民國)?(1\d{2})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/);
  if (roc) return `${Number(roc[1]) + 1911}-${roc[2].padStart(2, '0')}-${roc[3].padStart(2, '0')}`;
  return '';
};

const detectReportDate = (rows: unknown[][], fileName: string, fallback: Date) => {
  for (const row of rows.slice(0, 20)) {
    for (let index = 0; index < Math.min(row.length, 20); index += 1) {
      const cell = row[index];
      const context = row.slice(Math.max(0, index - 2), index + 3).map(clean).join('');
      if (typeof cell === 'number' && !/(日期|報表日|業績日)/.test(context)) continue;
      const parsed = normalizeDate(cell);
      if (parsed) return parsed;
    }
  }
  const fileDate = normalizeDate(fileName);
  if (fileDate) return fileDate;
  return new Date(fallback).toISOString().slice(0, 10);
};

const makeCompositeHeaders = (rows: unknown[][], headerRow: number) => {
  const maxCols = Math.max(...rows.slice(Math.max(0, headerRow - 2), headerRow + 1).map((row) => row.length), 0);
  const carry = Array<string>(3).fill('');
  return Array.from({ length: maxCols }, (_, col) => {
    const parts: string[] = [];
    for (let offset = 2; offset >= 0; offset -= 1) {
      const rowIndex = headerRow - offset;
      if (rowIndex < 0) continue;
      const value = clean(rows[rowIndex]?.[col]);
      if (value) carry[2 - offset] = value;
      const inherited = value || carry[2 - offset];
      if (inherited && !parts.includes(inherited)) parts.push(inherited);
    }
    return parts.join('／') || `第 ${col + 1} 欄`;
  });
};

const scoreHeaderRow = (row: unknown[]) => {
  const text = row.map(clean).join('|');
  let score = 0;
  if (/(名稱|櫃名|品牌)/.test(text)) score += 4;
  if (/(本日|當日|今日)/.test(text)) score += 2;
  if (/月累/.test(text)) score += 2;
  if (/(年累|年度累計)/.test(text)) score += 2;
  return score;
};

const detectHeaderRow = (rows: unknown[][]) => {
  let best = { index: 0, score: -1 };
  rows.slice(0, 30).forEach((row, index) => {
    const score = scoreHeaderRow(row);
    if (score > best.score) best = { index, score };
  });
  return best.index;
};

export const detectColumnMap = (headers: string[]): ColumnMap => {
  const result: ColumnMap = {};
  (Object.keys(COLUMN_PATTERNS) as ColumnKey[]).forEach((key) => {
    const index = headers.findIndex((header) => COLUMN_PATTERNS[key].some((pattern) => pattern.test(clean(header))));
    if (index >= 0) result[key] = index;
  });

  // 相容原始工具所使用的固定欄位；只有在自動辨識不到時才採用。
  const fallback: ColumnMap = {
    category: 0,
    name: 2,
    dailyCurrent: 3,
    dailyLast: 4,
    mtdCurrent: 6,
    mtdLast: 7,
    mtdGrowth: 8,
    ytdCurrent: 9,
    ytdLast: 10,
    ytdGrowth: 11,
  };
  if (headers.length >= 12) {
    (Object.keys(fallback) as ColumnKey[]).forEach((key) => {
      if (result[key] === undefined && (fallback[key] ?? -1) < headers.length) result[key] = fallback[key];
    });
  }
  return result;
};

export const readWorkbook = async (file: File): Promise<ImportPreview> => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel 檔案內沒有工作表。');
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  if (!rows.length) throw new Error('第一個工作表沒有資料。');
  const headerRow = detectHeaderRow(rows);
  const headers = makeCompositeHeaders(rows, headerRow);
  const columnMap = detectColumnMap(headers);
  const warnings: string[] = [];
  const missing = REQUIRED_COLUMNS.filter((key) => columnMap[key] === undefined);
  if (missing.length) warnings.push('部分必要欄位無法自動辨識，請在匯入確認畫面指定欄位。');
  if (columnMap.dailyLast === undefined) warnings.push('未找到去年當日業績欄，匯入後該欄會顯示為 0。');
  return {
    reportDate: detectReportDate(rows, file.name, new Date(file.lastModified)),
    sourceFile: file.name,
    sheetName,
    headerRow,
    headers,
    rows,
    columnMap,
    warnings,
  };
};

const get = (row: unknown[], map: ColumnMap, key: ColumnKey) => {
  const index = map[key];
  return index === undefined ? null : row[index];
};

export const buildReport = (preview: ImportPreview, columnMap: ColumnMap): ParsedReport => {
  const missing = REQUIRED_COLUMNS.filter((key) => columnMap[key] === undefined);
  if (missing.length) throw new Error('請指定：專櫃名稱、當日業績、去年當日、月累業績與年累業績。');
  if (columnMap.mtdLast === undefined && columnMap.mtdDiff === undefined) {
    throw new Error('月累資料請至少指定「去年月累」或「月累差異」。');
  }
  if (columnMap.ytdLast === undefined && columnMap.ytdDiff === undefined) {
    throw new Error('年累資料請至少指定「去年年累」或「年累差異」。');
  }

  let currentCategory = '未分類';
  const rows: StoreRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  preview.rows.slice(preview.headerRow + 1).forEach((source, sourceIndex) => {
    const name = String(get(source, columnMap, 'name') ?? '').trim();
    if (!name || /(小計|合計|總計|中文名稱|專櫃名稱)/.test(name)) return;

    const categoryValue = String(get(source, columnMap, 'category') ?? '').trim();
    if (categoryValue) currentCategory = categoryValue;

    const dailyCurrent = parseNumber(get(source, columnMap, 'dailyCurrent'));
    const dailyLast = parseNumber(get(source, columnMap, 'dailyLast'));
    const mtdCurrent = parseNumber(get(source, columnMap, 'mtdCurrent'));
    const ytdCurrent = parseNumber(get(source, columnMap, 'ytdCurrent'));
    const mtdDiffRaw = get(source, columnMap, 'mtdDiff');
    const ytdDiffRaw = get(source, columnMap, 'ytdDiff');
    const parsedMtdDiff = parseNumber(mtdDiffRaw);
    const parsedYtdDiff = parseNumber(ytdDiffRaw);
    const mtdLast = columnMap.mtdLast === undefined ? mtdCurrent - parsedMtdDiff : parseNumber(get(source, columnMap, 'mtdLast'));
    const ytdLast = columnMap.ytdLast === undefined ? ytdCurrent - parsedYtdDiff : parseNumber(get(source, columnMap, 'ytdLast'));

    const hasAnyNumber = [dailyCurrent, dailyLast, mtdCurrent, mtdLast, ytdCurrent, ytdLast].some((value) => value !== 0);
    if (!hasAnyNumber && source.filter((value) => value !== null && value !== '').length < 3) {
      skipped += 1;
      return;
    }

    const mtdDiff = columnMap.mtdDiff === undefined || mtdDiffRaw === null || mtdDiffRaw === '' ? mtdCurrent - mtdLast : parsedMtdDiff;
    const ytdDiff = columnMap.ytdDiff === undefined || ytdDiffRaw === null || ytdDiffRaw === '' ? ytdCurrent - ytdLast : parsedYtdDiff;

    rows.push({
      id: `${name}-${sourceIndex}`,
      category: currentCategory,
      name,
      dailyCurrent,
      dailyLast,
      dailyDiff: dailyCurrent - dailyLast,
      dailyGrowth: growth(dailyCurrent, dailyLast),
      mtdCurrent,
      mtdLast,
      mtdDiff,
      mtdGrowth: parsePercent(get(source, columnMap, 'mtdGrowth')) ?? growth(mtdCurrent, mtdLast),
      ytdCurrent,
      ytdLast,
      ytdDiff,
      ytdGrowth: parsePercent(get(source, columnMap, 'ytdGrowth')) ?? growth(ytdCurrent, ytdLast),
    });
  });

  if (!rows.length) throw new Error('沒有讀到專櫃資料，請確認表頭列與欄位對應。');
  if (skipped) warnings.push(`略過 ${skipped} 列空白或非資料列。`);
  const duplicated = rows.filter((row, index) => rows.findIndex((candidate) => candidate.name === row.name) !== index);
  if (duplicated.length) warnings.push(`發現 ${new Set(duplicated.map((row) => row.name)).size} 個重複專櫃名稱，明細仍分列保留。`);

  return {
    reportDate: preview.reportDate,
    sourceFile: preview.sourceFile,
    sheetName: preview.sheetName,
    rows,
    warnings: [...new Set(warnings)],
  };
};

export const columnLabels: Record<ColumnKey, string> = {
  category: '類別／業種',
  name: '專櫃名稱 *',
  dailyCurrent: '當日業績 *',
  dailyLast: '去年當日業績 *',
  mtdCurrent: '月累業績 *',
  mtdLast: '去年月累業績',
  mtdDiff: '月累差異',
  mtdGrowth: '月累成長率',
  ytdCurrent: '年累業績 *',
  ytdLast: '去年年累業績',
  ytdDiff: '年累差異',
  ytdGrowth: '年累成長率',
};
