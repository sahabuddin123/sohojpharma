// Simple statistical forecasters for E19.
// - movingAverage: smooths a series.
// - linearForecast: fits y = a + b*x via least squares on a numeric series and projects forward.
// Inputs are arrays of {date, value}. Output preserves the same shape for the forecast horizon.

export type Point = { date: string; value: number };

export function linearForecast(history: Point[], horizonDays: number): Point[] {
  if (history.length < 2 || horizonDays <= 0) return [];
  const xs = history.map((_, i) => i);
  const ys = history.map((p) => p.value);
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  const last = new Date(history[history.length - 1].date);
  const out: Point[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(last);
    d.setDate(d.getDate() + i);
    const projected = intercept + slope * (n - 1 + i);
    out.push({ date: d.toISOString().slice(0, 10), value: Math.max(0, projected) });
  }
  return out;
}

export function movingAverage(history: Point[], window: number): Point[] {
  if (window <= 1) return history;
  const out: Point[] = [];
  for (let i = 0; i < history.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = history.slice(start, i + 1);
    const avg = slice.reduce((s, p) => s + p.value, 0) / slice.length;
    out.push({ date: history[i].date, value: avg });
  }
  return out;
}
