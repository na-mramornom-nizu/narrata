import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Analysis, ChartSpec, ChatMessage, Dataset } from './types';
import { buildChartData } from './chart';
import { formatNumber } from './table';

export interface ReportSnapshot { dataset: Dataset; analysis: Analysis; messages: ChatMessage[]; createdAt: Date }
const palette = ['#7752D8', '#0891B2', '#B855B7', '#159B76', '#CA8A04', '#DB557F', '#4E7FCB'];
const xml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));
const short = (value: string, length = 24) => value.length > length ? `${value.slice(0, length - 1)}…` : value;

export function reportFilename(snapshot: Pick<ReportSnapshot, 'dataset' | 'createdAt'>): string {
  const name = snapshot.dataset.name.replace(/\.(csv|xlsx|xls)$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().slice(0, 80) || 'данные';
  const date = snapshot.createdAt;
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `Narrata_Отчет_${name}_${day}.pdf`;
}

export function reportChartSvg(spec: ChartSpec, points: { name: string; value: number }[]): string {
  const width = 500;
  const height = spec.type === 'bar' ? Math.max(180, Math.min(330, points.length * 24 + 40)) : 250;
  const text = (x: number, y: number, content: string, anchor = 'start', size = 10) => `<text x="${x}" y="${y}" font-family="Roboto" font-size="${size}" fill="#475569" text-anchor="${anchor}">${xml(content)}</text>`;
  let drawing = '';
  if (!points.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="80">${text(0, 35, 'Нет значений для построения графика')}</svg>`;
  if (spec.type === 'pie' && points.every((point) => point.value >= 0)) {
    const total = points.reduce((sum, point) => sum + point.value, 0);
    let angle = -Math.PI / 2;
    const cx = 250, cy = 122, radius = 102;
    if (total > 0) points.forEach((point, index) => {
      if (!point.value) return;
      const next = angle + point.value / total * Math.PI * 2;
      const x1 = cx + radius * Math.cos(angle), y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(next), y2 = cy + radius * Math.sin(next);
      drawing += point.value === total
        ? `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${palette[index % palette.length]}"/>`
        : `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${next - angle > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z" fill="${palette[index % palette.length]}" stroke="#ffffff" stroke-width="2"/>`;
      angle = next;
    });
    else drawing += text(250, 125, 'Все значения равны нулю', 'middle');
  } else if (spec.type === 'pie') {
    drawing = text(250, 125, 'Круговая диаграмма не поддерживает отрицательные значения', 'middle', 9);
  } else {
    const horizontal = spec.type === 'bar';
    const left = horizontal ? 170 : 60, right = 485, top = 15, bottom = height - 35;
    const min = Math.min(0, ...points.map((point) => point.value));
    const max = Math.max(0, ...points.map((point) => point.value));
    const span = max - min || 1;
    const x = (value: number) => left + (value - min) / span * (right - left);
    const y = (value: number) => bottom - (value - min) / span * (bottom - top);
    for (let tick = 0; tick <= 4; tick++) {
      const value = min + span * tick / 4;
      drawing += horizontal
        ? `<line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${bottom}" stroke="#E2E8F0"/>${text(x(value), height - 10, formatNumber(value), 'middle', 9)}`
        : `<line x1="${left}" y1="${y(value)}" x2="${right}" y2="${y(value)}" stroke="#E2E8F0"/>${text(left - 8, y(value) + 3, formatNumber(value), 'end', 9)}`;
    }
    if (horizontal) {
      const step = (bottom - top) / points.length;
      points.forEach((point, index) => {
        const cy = top + step * (index + 0.5);
        drawing += text(left - 10, cy + 3, short(point.name), 'end', 9);
        drawing += `<rect x="${Math.min(x(0), x(point.value))}" y="${cy - step * 0.3}" width="${Math.max(0.5, Math.abs(x(point.value) - x(0)))}" height="${step * 0.6}" rx="2" fill="${palette[0]}"/>`;
      });
    } else {
      const coords = points.map((point, index) => ({ x: left + (right - left) * index / Math.max(1, points.length - 1), y: y(point.value) }));
      const path = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
      if (spec.type === 'area') drawing += `<path d="${path} L ${coords.at(-1)!.x} ${y(0)} L ${coords[0].x} ${y(0)} Z" fill="#E8E0FA"/>`;
      drawing += `<path d="${path}" fill="none" stroke="${palette[0]}" stroke-width="2.5"/>`;
      coords.forEach((point, index) => {
        drawing += `<circle cx="${point.x}" cy="${point.y}" r="3" fill="${palette[0]}"/>`;
        if (index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2)) drawing += text(point.x, height - 12, short(points[index].name, 15), 'middle', 9);
      });
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${drawing}</svg>`;
}

export function buildReportDocument(snapshot: ReportSnapshot): TDocumentDefinitions {
  const { dataset, analysis, messages, createdAt } = snapshot;
  const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(createdAt);
  const content: Content[] = [
    { text: 'NARRATA / ОТЧЕТ ПО ДАННЫМ', color: '#7752D8', fontSize: 10, bold: true, characterSpacing: 1, margin: [0, 0, 0, 24] },
    { text: 'Аналитический отчет', style: 'title' },
    { text: dataset.name, fontSize: 15, color: '#475569', margin: [0, 6, 0, 10] },
    { text: `Сформирован ${date}${dataset.rows.length ? ` • ${formatNumber(dataset.rows.length)} записей` : ' • Текстовый источник'}`, style: 'muted', margin: [0, 0, 0, 26] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 507, y2: 0, lineWidth: 1, lineColor: '#DDD6FE' }], margin: [0, 0, 0, 24] },
    { text: analysis.headline, style: 'heading' },
    { text: analysis.narrative, margin: [0, 8, 0, 22], lineHeight: 1.3 },
  ];
  for (const insight of analysis.insights) {
    content.push({
      table: { widths: [160, '*'], body: [[
        { text: insight.label, color: '#475569', margin: [10, 10, 8, 10] },
        { stack: [{ text: insight.value, bold: true, fontSize: 18, color: '#33205D' }, ...(insight.hint ? [{ text: insight.hint, style: 'muted', margin: [0, 5, 0, 0] as [number, number, number, number] }] : [])], margin: [8, 8, 10, 10] },
      ]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#F5F2FC' }, margin: [0, 0, 0, 8],
    });
  }
  analysis.charts.forEach((spec, index) => {
    const points = buildChartData(dataset.rows, spec).slice(0, spec.limit ?? 12).filter((point) => Number.isFinite(point.value));
    content.push(
      { text: `График ${index + 1}`, style: 'eyebrow', pageBreak: 'before' },
      { text: spec.title, style: 'heading', margin: [0, 6, 0, 5] },
      { text: spec.subtitle || '', style: 'muted', margin: [0, 0, 0, 16] },
      { svg: reportChartSvg(spec, points), width: 507, margin: [0, 0, 0, 16] },
      { table: { headerRows: 1, widths: ['*', 100], body: [
        [{ text: spec.xKey || 'Категория', bold: true }, { text: spec.yKey || (spec.aggregation === 'count' ? 'Количество' : 'Значение'), bold: true, alignment: 'right' }],
        ...points.map((point, pointIndex) => [
          { text: point.name, color: spec.type === 'pie' ? palette[pointIndex % palette.length] : '#334155' },
          { text: `${formatNumber(point.value)}${spec.valueSuffix ?? ''}`, alignment: 'right' as const },
        ]),
      ] }, layout: { hLineWidth: (row) => row === 1 ? 1 : 0.3, vLineWidth: () => 0, hLineColor: () => '#E2E8F0', paddingTop: () => 6, paddingBottom: () => 6 }, fontSize: 9 },
    );
  });
  content.push({ text: 'История чата', style: 'heading', pageBreak: 'before', margin: [0, 0, 0, 18] });
  if (!messages.length) content.push({ text: 'На момент создания отчета сообщений в чате нет.', style: 'muted' });
  messages.forEach((message) => {
    const user = message.role === 'user';
    content.push({ table: { headerRows: 1, widths: ['*'], body: [
      [{ text: user ? 'Ваш вопрос' : 'Ответ Narrata', bold: true, color: user ? '#6743B1' : '#334155', fontSize: 9, margin: [10, 7, 10, 2] }],
      [{ text: message.content, lineHeight: 1.25, margin: [10, 0, 10, 9] }],
    ] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => user ? '#F3EEFC' : '#F4F6F8' }, margin: [0, 0, 0, 12] });
  });
  return {
    pageSize: 'A4', pageMargins: [44, 48, 44, 48],
    info: { title: `Отчет по данным - ${dataset.name}`, author: 'Narrata', subject: analysis.headline, creator: 'Narrata' },
    defaultStyle: { font: 'Roboto', fontSize: 11, color: '#1E293B' },
    styles: {
      title: { fontSize: 30, bold: true, color: '#24153F' },
      heading: { fontSize: 20, bold: true, color: '#24153F' },
      muted: { fontSize: 9, color: '#64748B' },
      eyebrow: { fontSize: 9, bold: true, color: '#7752D8' },
    },
    footer: (page, pages) => ({ columns: [
      { text: `Narrata • ${short(dataset.name, 55)}`, alignment: 'left' },
      { text: `${page} / ${pages}`, alignment: 'right' },
    ], margin: [44, 18, 44, 0], fontSize: 8, color: '#64748B' }),
    content,
  };
}
