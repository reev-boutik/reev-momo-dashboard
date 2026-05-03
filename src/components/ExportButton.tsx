import { useState, useRef, useEffect } from "react";
import {
  exportCsv,
  exportJson,
  exportXlsx,
  exportPdf,
  defaultBaseName,
  type ExportColumn,
} from "../lib/exports";

interface Props {
  rows: any[];
  cols: ExportColumn[];
  filenamePrefix: string;
  pdfTitle?: string;
  pdfSubtitle?: string;
  pdfOrientation?: "p" | "l";
}

export default function ExportButton({
  rows,
  cols,
  filenamePrefix,
  pdfTitle,
  pdfSubtitle,
  pdfOrientation,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function run(fn: () => void) {
    fn();
    setOpen(false);
  }

  const base = defaultBaseName(filenamePrefix);
  const disabled = rows.length === 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="text-sm rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Exporter ▼
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 min-w-[160px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
          <button
            onClick={() => run(() => exportXlsx(rows, cols, base))}
            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            📊 Excel (.xlsx)
          </button>
          <button
            onClick={() => run(() => exportCsv(rows, cols, base))}
            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            📋 CSV
          </button>
          <button
            onClick={() => run(() => exportJson(rows, cols, base))}
            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            📁 JSON
          </button>
          <button
            onClick={() =>
              run(() =>
                exportPdf(rows, cols, base, {
                  title: pdfTitle,
                  subtitle: pdfSubtitle,
                  orientation: pdfOrientation,
                })
              )
            }
            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            📄 PDF
          </button>
        </div>
      )}
    </div>
  );
}
