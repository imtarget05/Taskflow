import { useEffect, useRef, useState } from 'react';
import { BarChart3, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import { useExportCsv, useExportSheets, useExportTxt, useExportProgress } from '@/hooks/useProjects';
import { useToast } from '@/store/toast';
import { Button } from '@/components/ui';

function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface ExportMenuProps {
  projectId: string;
  projectName: string;
}

export default function ExportMenu({ projectId, projectName }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sheets = useExportSheets(projectId);
  const csv = useExportCsv(projectId);
  const txt = useExportTxt(projectId);
  const progress = useExportProgress(projectId);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function handleSheets() {
    try {
      const url = await sheets.mutateAsync();
      setOpen(false);
      window.open(url, '_blank', 'noopener,noreferrer');
      toast('success', 'Google Sheet created', 'The sheet is shared with your email and opened in a new tab.');
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast('error', 'Export failed', message || 'Google Sheets export is not configured.');
    }
  }

  function handleCsv() {
    csv.mutate(undefined, {
      onSuccess: (text) => {
        setOpen(false);
        downloadText(text, `taskflow_${projectName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'project'}.csv`, 'text/csv;charset=utf-8');
        toast('success', 'CSV downloaded');
      },
      onError: () => toast('error', 'Export failed', 'Unable to generate the CSV file.'),
    });
  }

  function handleTxt() {
    txt.mutate(undefined, {
      onSuccess: (text) => {
        setOpen(false);
        downloadText(text, `taskflow_${projectName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'project'}.txt`, 'text/plain;charset=utf-8');
        toast('success', 'Text file downloaded');
      },
      onError: () => toast('error', 'Export failed', 'Unable to generate the text file.'),
    });
  }

  function handleProgress() {
    progress.mutate(undefined, {
      onSuccess: (text) => {
        setOpen(false);
        downloadText(text, `baocao_${projectName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'project'}.txt`, 'text/plain;charset=utf-8');
        toast('success', 'Đã tải báo cáo tiến độ');
      },
      onError: () => toast('error', 'Export failed', 'Unable to generate the progress report.'),
    });
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-label="Export project data"
        aria-expanded={open}
        disabled={sheets.isPending || csv.isPending || txt.isPending || progress.isPending}
      >
        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-card shadow-modal">
          <button
            type="button"
            onClick={() => void handleSheets()}
            disabled={sheets.isPending}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium">Export to Google Sheets</span>
              <span className="block text-xs text-ink-muted">Creates a live sheet shared with you</span>
            </span>
          </button>
          <button
            type="button"
            onClick={handleCsv}
            disabled={csv.isPending}
            className="flex w-full items-center gap-2.5 border-t border-line px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            <FileText className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium">Download CSV</span>
              <span className="block text-xs text-ink-muted">Open it in Excel or Google Sheets</span>
            </span>
          </button>
          <button
            type="button"
            onClick={handleTxt}
            disabled={txt.isPending}
            className="flex w-full items-center gap-2.5 border-t border-line px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            <FileText className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium">Download TXT</span>
              <span className="block text-xs text-ink-muted">Readable plain-text project summary</span>
            </span>
          </button>
          <button
            type="button"
            onClick={handleProgress}
            disabled={progress.isPending}
            className="flex w-full items-center gap-2.5 border-t border-line px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            <BarChart3 className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium">Báo cáo tiến độ</span>
              <span className="block text-xs text-ink-muted">Tổng quan % hoàn thành + task quá hạn</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}