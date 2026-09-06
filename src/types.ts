export type MetricKey =
  | 'dailyCurrent'
  | 'dailyLast'
  | 'mtdCurrent'
  | 'mtdDiff'
  | 'ytdCurrent'
  | 'ytdDiff';

export interface StoreRow {
  id: string;
  category: string;
  name: string;
  dailyCurrent: number;
  dailyLast: number;
  dailyDiff: number;
  dailyGrowth: number | null;
  mtdCurrent: number;
  mtdLast: number;
  mtdDiff: number;
  mtdGrowth: number | null;
  ytdCurrent: number;
  ytdLast: number;
  ytdDiff: number;
  ytdGrowth: number | null;
}

export interface ParsedReport {
  reportDate: string;
  sourceFile: string;
  sheetName: string;
  rows: StoreRow[];
  warnings: string[];
}

export type ColumnKey =
  | 'category'
  | 'name'
  | 'dailyCurrent'
  | 'dailyLast'
  | 'mtdCurrent'
  | 'mtdLast'
  | 'mtdDiff'
  | 'mtdGrowth'
  | 'ytdCurrent'
  | 'ytdLast'
  | 'ytdDiff'
  | 'ytdGrowth';

export type ColumnMap = Partial<Record<ColumnKey, number>>;

export interface ImportPreview {
  reportDate: string;
  sourceFile: string;
  sheetName: string;
  headerRow: number;
  headers: string[];
  rows: unknown[][];
  columnMap: ColumnMap;
  warnings: string[];
}
