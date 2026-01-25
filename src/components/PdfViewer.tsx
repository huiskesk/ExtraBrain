import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

interface PdfViewerProps {
  noteId: string;
}

export default function PdfViewer({ noteId }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string>("");
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let isActive = true;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setBlobUrl("");

    const loadPdf = async () => {
      try {
        const data = await invoke<number[] | Uint8Array>("get_pdf_data", { noteId });
        if (!isActive) {
          return;
        }

        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const blob = new Blob([bytes], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
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
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [noteId]);

  return (
    <div className="h-full">
      {blobUrl && (
        <embed src={blobUrl} type="application/pdf" className="w-full h-full" />
      )}
    </div>
  );
}
