import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportColumn {
  key: string;
  label: string;
  /** Optionnel : transforme la valeur brute pour l'export (ex: formater un nombre) */
  transform?: (v: any, row: any) => string | number | null;
}

/**
 * Convertit une ligne en objet exportable en appliquant transform sur chaque colonne.
 */
function projectRow(row: any, cols: ExportColumn[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const c of cols) {
    const raw = row[c.key];
    out[c.label] = c.transform ? c.transform(raw, row) : raw ?? "";
  }
  return out;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** CSV avec BOM UTF-8 pour qu'Excel ouvre correctement les accents */
export function exportCsv(rows: any[], cols: ExportColumn[], baseName: string) {
  const header = cols.map((c) => c.label).join(",");
  const lines = [header];
  for (const r of rows) {
    const vals = cols.map((c) => {
      const v = c.transform ? c.transform(r[c.key], r) : r[c.key];
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    });
    lines.push(vals.join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, `${baseName}.csv`);
}

export function exportJson(rows: any[], cols: ExportColumn[], baseName: string) {
  const projected = rows.map((r) => projectRow(r, cols));
  const blob = new Blob([JSON.stringify(projected, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${baseName}.json`);
}

export function exportXlsx(rows: any[], cols: ExportColumn[], baseName: string) {
  const projected = rows.map((r) => projectRow(r, cols));
  const ws = XLSX.utils.json_to_sheet(projected);
  // Largeurs auto basées sur la longueur du contenu
  const maxLen: Record<string, number> = {};
  for (const r of projected) {
    for (const k of Object.keys(r)) {
      const v = r[k] == null ? "" : String(r[k]);
      maxLen[k] = Math.max(maxLen[k] ?? k.length, v.length);
    }
  }
  ws["!cols"] = cols.map((c) => ({ wch: Math.min(50, (maxLen[c.label] ?? c.label.length) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  XLSX.writeFile(wb, `${baseName}.xlsx`);
}

export function exportPdf(
  rows: any[],
  cols: ExportColumn[],
  baseName: string,
  options?: { title?: string; subtitle?: string; orientation?: "p" | "l" }
) {
  const doc = new jsPDF({
    orientation: options?.orientation ?? "l",
    unit: "pt",
    format: "a4",
  });
  if (options?.title) {
    doc.setFontSize(14);
    doc.text(options.title, 40, 40);
  }
  if (options?.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(options.subtitle, 40, 58);
    doc.setTextColor(0);
  }
  const head = [cols.map((c) => c.label)];
  const body = rows.map((r) =>
    cols.map((c) => {
      const v = c.transform ? c.transform(r[c.key], r) : r[c.key];
      return v == null ? "" : String(v);
    })
  );
  autoTable(doc, {
    head,
    body,
    startY: options?.title ? 70 : 40,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [25, 118, 210] },
    margin: { left: 40, right: 40 },
  });
  doc.save(`${baseName}.pdf`);
}

/** Renvoie un nom de fichier propre avec timestamp */
export function defaultBaseName(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
