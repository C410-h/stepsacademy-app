import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Download, ExternalLink, AlertCircle } from "lucide-react";

interface PDFViewerProps {
  url: string | null;
  title?: string;
  onClose: () => void;
}

const PDFViewer = ({ url, title = "Material", onClose }: PDFViewerProps) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    if (url) {
      setIframeLoaded(false);
      setIframeError(false);
    }
  }, [url]);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!url) return null;

  const isPdf = url.toLowerCase().includes(".pdf");

  // Use Google Docs Viewer for PDFs (handles CORS / mobile gracefully)
  const viewerUrl = isPdf
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`
    : url;

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0 gap-2">
        <p className="text-sm font-bold truncate flex-1 min-w-0">{title}</p>
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
            title="Baixar arquivo"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Baixar</span>
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
            title="Abrir em nova aba"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">Abrir</span>
          </a>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 ml-1"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden bg-muted/30">
        {/* Loading skeleton */}
        {!iframeLoaded && !iframeError && (
          <div className="absolute inset-0 flex flex-col gap-3 p-4 z-10 bg-background">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="flex-1 w-full" />
          </div>
        )}

        {/* Error fallback */}
        {iframeError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <p className="font-bold text-sm">Não foi possível carregar o material aqui.</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Abra diretamente no navegador ou faça o download.
            </p>
            <div className="flex gap-3 flex-wrap justify-center">
              <Button variant="outline" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir no navegador
                </a>
              </Button>
              <Button asChild>
                <a href={url} download>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <iframe
            src={viewerUrl}
            className={`w-full h-full border-0 transition-opacity duration-300 ${iframeLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeError(true)}
            title={title}
            allow="fullscreen"
          />
        )}
      </div>
    </div>
  );
};

export default PDFViewer;
