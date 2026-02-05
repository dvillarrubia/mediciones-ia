/**
 * report.js - Generador de informe markdown para AI Overview Share of Voice
 *
 * Lee results/share_of_voice.json y genera results/report.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'results');
const SOV_PATH = join(RESULTS_DIR, 'share_of_voice.json');

function padR(str, len) { const s = String(str); return s + ' '.repeat(Math.max(0, len - s.length)); }
function padL(str, len) { const s = String(str); return ' '.repeat(Math.max(0, len - s.length)) + s; }

function makeTable(headers, rows, alignRight = []) {
  const colWidths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, String(row[i] ?? '').length), 0);
    return Math.max(h.length, maxRow, 3);
  });
  const headerLine = '| ' + headers.map((h, i) => padR(h, colWidths[i])).join(' | ') + ' |';
  const sepLine = '| ' + headers.map((_, i) => {
    const dash = '-'.repeat(colWidths[i]);
    return alignRight.includes(i) ? dash.slice(0, -1) + ':' : dash;
  }).join(' | ') + ' |';
  const dataLines = rows.map(row =>
    '| ' + row.map((cell, i) => {
      const s = String(cell ?? '-');
      return alignRight.includes(i) ? padL(s, colWidths[i]) : padR(s, colWidths[i]);
    }).join(' | ') + ' |'
  );
  return [headerLine, sepLine, ...dataLines].join('\n');
}

function fmtVol(v) {
  if (v == null) return '-';
  const n = Number(v);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export function report() {
  if (!existsSync(SOV_PATH)) {
    console.error('Error: results/share_of_voice.json no existe. Ejecuta analyze.js primero.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(SOV_PATH, 'utf-8'));
  const { metadata, share_of_voice, overlap_matrix, gap_analysis, target_exclusive,
          exclusive_keywords, intent_distribution, volume_distribution,
          top_keywords, top_pages } = data;

  const lines = [];
  const ln = (s = '') => lines.push(s);

  // === Header ===
  ln(`# AI Overview - Share of Voice Report`);
  ln();
  ln(`**Target:** ${metadata.target_domain}`);
  ln(`**Competidores:** ${metadata.competitors.join(', ')}`);
  ln(`**Fecha:** ${metadata.analyzed_at.split('T')[0]}`);
  ln(`**Keywords unicas analizadas:** ${metadata.unique_keywords.toLocaleString()}`);
  ln();
  ln('---');
  ln();

  // === 1. Share of Voice ===
  ln(`## 1. Share of Voice en AI Overviews`);
  ln();
  ln(`Basado en las top 1000 keywords (por search volume) donde cada dominio es citado como referencia en AI Overviews de Google (mercado: Spain, idioma: es).`);
  ln();

  const sovRows = share_of_voice.map(s => [
    s.is_target ? `**${s.domain}**` : s.domain,
    s.keywords_count,
    s.share_by_count_pct + '%',
    fmtVol(s.total_search_volume),
    s.share_by_volume_pct + '%',
    fmtVol(s.total_etv),
    s.share_by_etv_pct + '%',
  ]);

  ln(makeTable(
    ['Dominio', 'Keywords', 'SoV (kw)', 'Search Vol.', 'SoV (vol)', 'ETV', 'SoV (etv)'],
    sovRows,
    [1, 2, 3, 4, 5, 6]
  ));
  ln();

  // Visual bar chart
  ln('### Visualizacion Share of Voice (por search volume)');
  ln('```');
  for (const s of share_of_voice) {
    const bar = '█'.repeat(Math.round(s.share_by_volume_pct / 2));
    const label = s.domain.padEnd(18);
    ln(`${label} ${bar} ${s.share_by_volume_pct}%`);
  }
  ln('```');
  ln();

  // === 2. Overlap matrix ===
  ln(`## 2. Overlap de Keywords entre Dominios`);
  ln();
  ln('Cuantas keywords comparten cada par de dominios en AI Overviews:');
  ln();

  const domains = [metadata.target_domain, ...metadata.competitors];
  const shortNames = domains.map(d => d.replace(/\.(es|com)$/, ''));
  const overlapHeaders = ['', ...shortNames];
  const overlapRows = domains.map((d1, i) => {
    return [shortNames[i], ...domains.map(d2 => overlap_matrix[d1]?.[d2] ?? 0)];
  });
  ln(makeTable(overlapHeaders, overlapRows, [...Array(domains.length).keys()].map(i => i + 1)));
  ln();

  // === 3. Gap Analysis ===
  ln(`## 3. Gap Analysis - Keywords donde ${metadata.target_domain} NO aparece`);
  ln();
  ln(`Total gaps: **${gap_analysis.total_gaps}** keywords (vol. total: ${fmtVol(gap_analysis.total_gap_volume)})`);
  ln();
  ln('### Top 30 gaps por search volume:');
  ln();

  const gapRows = gap_analysis.top_gaps.slice(0, 30).map((g, i) => [
    i + 1,
    g.keyword,
    fmtVol(g.search_volume),
    g.search_intent || '-',
    g.keyword_difficulty ?? '-',
    g.competitors_present.map(c => c.domain.replace(/\.(es|com)$/, '')).join(', '),
    g.total_competitors,
  ]);

  ln(makeTable(
    ['#', 'Keyword', 'Vol.', 'Intent', 'KD', 'Competidores presentes', 'N'],
    gapRows,
    [0, 2, 4, 6]
  ));
  ln();

  // === 4. Keywords exclusivas del target ===
  ln(`## 4. Ventaja Competitiva - Keywords exclusivas de ${metadata.target_domain}`);
  ln();
  ln(`Keywords donde ${metadata.target_domain} aparece en AI Overview pero **ningun competidor** lo hace:`);
  ln();
  ln(`Total: **${target_exclusive.count}** keywords (vol. total: ${fmtVol(target_exclusive.total_volume)})`);
  ln();

  if (target_exclusive.top.length > 0) {
    ln('### Top 25:');
    ln();
    const exclRows = target_exclusive.top.slice(0, 25).map((e, i) => [
      i + 1,
      e.keyword,
      fmtVol(e.search_volume),
      e.search_intent || '-',
      fmtVol(e.etv),
    ]);
    ln(makeTable(['#', 'Keyword', 'Vol.', 'Intent', 'ETV'], exclRows, [0, 2, 4]));
    ln();
  }

  // === 5. Distribucion por Intent ===
  ln(`## 5. Distribucion por Search Intent`);
  ln();

  const intents = ['informational', 'commercial', 'transactional', 'navigational'];
  const intentHeaders = ['Dominio', ...intents.map(i => i.slice(0, 5) + '.')];
  const intentRows = domains.map(d => {
    const dist = intent_distribution[d] || {};
    return [
      d.replace(/\.(es|com)$/, ''),
      ...intents.map(intent => {
        const data = dist[intent];
        return data ? `${data.count} (${fmtVol(data.total_volume)})` : '-';
      })
    ];
  });
  ln(makeTable(intentHeaders, intentRows));
  ln();

  // === 6. Distribucion por volumen ===
  ln(`## 6. Distribucion por Volumen de Busqueda`);
  ln();

  const buckets = ['100k+', '10k-100k', '1k-10k', '100-1k', '<100'];
  const volHeaders = ['Dominio', ...buckets];
  const volRows = domains.map(d => {
    const dist = volume_distribution[d] || {};
    return [d.replace(/\.(es|com)$/, ''), ...buckets.map(b => dist[b] || 0)];
  });
  ln(makeTable(volHeaders, volRows, [1, 2, 3, 4, 5]));
  ln();

  // === 7. Top keywords por dominio ===
  ln(`## 7. Top 15 Keywords por Dominio`);
  ln();

  for (const domain of domains) {
    const kws = top_keywords[domain] || [];
    if (kws.length === 0) continue;

    ln(`### ${domain}`);
    ln();
    const kwRows = kws.slice(0, 15).map((k, i) => [
      i + 1,
      k.keyword,
      fmtVol(k.search_volume),
      k.search_intent || '-',
      fmtVol(k.etv),
      k.ai_ref_position ?? '-',
    ]);
    ln(makeTable(['#', 'Keyword', 'Vol.', 'Intent', 'ETV', 'Pos. AI'], kwRows, [0, 2, 4, 5]));
    ln();
  }

  // === 8. Top Pages ===
  ln(`## 8. URLs mas citadas en AI Overviews`);
  ln();

  for (const domain of domains) {
    const pages = top_pages[domain] || [];
    if (pages.length === 0) continue;

    ln(`### ${domain} (top 10 URLs)`);
    ln();
    const pageRows = pages.slice(0, 10).map((p, i) => {
      const shortUrl = p.url ? p.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) : '-';
      return [i + 1, shortUrl, p.count, fmtVol(p.total_volume), fmtVol(p.total_etv)];
    });
    ln(makeTable(['#', 'URL', 'Keywords', 'Vol. total', 'ETV total'], pageRows, [0, 2, 3, 4]));
    ln();
  }

  // === Conclusiones ===
  ln(`## Conclusiones`);
  ln();

  const targetSoV = share_of_voice.find(s => s.is_target);
  const leader = share_of_voice.reduce((a, b) => a.share_by_volume_pct > b.share_by_volume_pct ? a : b);

  if (targetSoV) {
    ln(`1. **${metadata.target_domain}** tiene un Share of Voice del **${targetSoV.share_by_volume_pct}%** por search volume en AI Overviews (${targetSoV.keywords_count} keywords)`);

    if (leader.domain !== metadata.target_domain) {
      ln(`2. **Lider actual:** ${leader.domain} con ${leader.share_by_volume_pct}% por volumen`);
    } else {
      ln(`2. **${metadata.target_domain} es lider** en Share of Voice por search volume`);
    }

    ln(`3. **Gaps:** ${gap_analysis.total_gaps} keywords donde competidores aparecen y ${metadata.target_domain} no (vol: ${fmtVol(gap_analysis.total_gap_volume)})`);
    ln(`4. **Ventaja exclusiva:** ${target_exclusive.count} keywords donde solo ${metadata.target_domain} aparece (vol: ${fmtVol(target_exclusive.total_volume)})`);
  }

  ln();
  ln('---');
  ln(`*Generado automaticamente por ai-overview-analysis pipeline - ${metadata.analyzed_at.split('T')[0]}*`);

  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const reportPath = join(RESULTS_DIR, 'report.md');
  writeFileSync(reportPath, lines.join('\n'), 'utf-8');
  console.log(`Reporte: ${reportPath} (${lines.length} lineas)`);
  return reportPath;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  report();
}
