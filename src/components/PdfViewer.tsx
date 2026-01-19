import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

interface PdfViewerProps {
  noteId: string;
}

export default function PdfViewer({ noteId }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string>("");

  useEffect(() => {
    let isActive = true;
    let objectUrl: string | null = null;

    const loadPdf = async () => {
      try {
        const data = await invoke<number[] | Uint8Array>("get_pdf_data", { noteId });
        if (!isActive) {
          return;
        }

        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const blob = new Blob([bytes], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (error) {
        console.error("Failed to load PDF data:", error);
        if (isActive) {
          setBlobUrl("");
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

  return (
    <div className="h-full">
      <embed src={blobUrl} type="application/pdf" className="w-full h-full" />
    </div>
  );
}
