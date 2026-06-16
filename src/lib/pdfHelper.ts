import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Use bundled worker to avoid CORS and version mismatch issues
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function convertPdfToImages(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const images: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    // Scale 2.0 provides a good balance between quality and size for OCR
    const viewport = page.getViewport({ scale: 2.0 });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not create canvas context");
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    
    // Extract base64 (remove data URL prefix)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    images.push(dataUrl.split(',')[1]);
  }

  return images;
}
