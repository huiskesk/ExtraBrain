import { useEffect, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { invoke } from "@tauri-apps/api/tauri";
import { FileText, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useStore } from "../stores/useStore";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface PdfViewerProps {
  noteId: string;
}

export default function PdfViewer({ noteId }: PdfViewerProps) {
  const note = useStore((state) => state.notes.find((item) => item.id === noteId));
  const title = note?.title ?? "PDF Document";

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    let isActive = true;
    let objectUrl: string | null = null;

    const loadPdf = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setPageNumber(1);

      try {
        const data = await invoke<number[] | Uint8Array>("get_pdf_data", { noteId });
        if (!isActive) {
          return;
        }

        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const blob = new Blob([bytes], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (error) {
        console.error("Failed to load PDF data:", error);
        if (isActive) {
          setErrorMessage("Unable to load the PDF file.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [noteId]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const canGoBack = pageNumber > 1;
  const canGoForward = numPages > 0 && pageNumber < numPages;

  const handlePrevious = () => {
    if (canGoBack) {
      setPageNumber((prev) => Math.max(prev - 1, 1));
    }
  };

  const handleNext = () => {
    if (canGoForward) {
      setPageNumber((prev) => Math.min(prev + 1, numPages));
    }
  };

  const renderBody = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="mt-3 text-sm">Loading PDF…</p>
        </div>
      );
    }

    if (errorMessage) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <FileText size={48} className="text-gray-400" />
          <p className="mt-3 text-sm">{errorMessage}</p>
        </div>
      );
    }

    if (!pdfUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <FileText size={48} className="text-gray-400" />
          <p className="mt-3 text-sm">No PDF data available.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center px-6 py-6">
        <Document
          file={pdfUrl}
          onLoadSuccess={({ numPages: totalPages }) => {
            setNumPages(totalPages);
            setPageNumber(1);
          }}
          onLoadError={(error) => {
            console.error("Failed to render PDF:", error);
            setErrorMessage("Unable to render the PDF preview.");
          }}
          loading={null}
          className="w-full flex justify-center"
        >
          <Page
            pageNumber={pageNumber}
            renderAnnotationLayer
            renderTextLayer
            className="shadow-lg"
          />
        </Document>
      </div>
    );
  }, [errorMessage, isLoading, pageNumber, pdfUrl]);

  return (
    <div className="flex-1 flex flex-col bg-white h-full overflow-hidden">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="text-red-500" />
          {title}
        </h1>
      </div>
      <div className="flex-1 overflow-auto bg-gray-100">{renderBody}</div>
      <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={!canGoBack}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              canGoBack
                ? "border-gray-300 text-gray-700 hover:bg-gray-50"
                : "border-gray-200 text-gray-300 cursor-not-allowed"
            }`}
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {numPages > 0 ? pageNumber : "-"} of {numPages || "-"}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoForward}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              canGoForward
                ? "border-gray-300 text-gray-700 hover:bg-gray-50"
                : "border-gray-200 text-gray-300 cursor-not-allowed"
            }`}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
