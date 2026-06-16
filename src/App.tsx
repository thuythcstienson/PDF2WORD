import React, { useState, useRef } from 'react';
import { Upload, FileImage, FileText, Loader2, Printer, Trash2, FileDown } from 'lucide-react';
import { extractExam, ExamData } from './lib/gemini';
import { A4Page } from './components/A4Page';
import { exportToWord } from './lib/wordExport';
import { convertPdfToImages } from './lib/pdfHelper';

const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
    };
    reader.onerror = error => reject(error);
});

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Max dimension to prevent OOM and reduce payload
      const MAX_DIM = 2048;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(objectUrl);
      reject(e);
    };
    img.src = objectUrl;
  });
};

const processFile = async (file: File): Promise<{ base64: string; mimeType: string }> => {
  if (file.type.startsWith('image/')) {
    try {
      const base64 = await compressImage(file);
      return { base64, mimeType: 'image/jpeg' };
    } catch (e) {
      console.warn("Image compression failed, falling back to raw base64", e);
      const base64 = await toBase64(file);
      return { base64, mimeType: file.type };
    }
  } else {
    const base64 = await toBase64(file);
    return { base64, mimeType: file.type };
  }
};

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [examData, setExamData] = useState<ExamData[] | null>(null);
  const [selectedExams, setSelectedExams] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    
    // Check file sizes (Max 50MB per file for PDFs)
    const MAX_SIZE = 50 * 1024 * 1024; 
    const oversizedFiles = files.filter(f => !f.type.startsWith('image/') && f.size > MAX_SIZE);
    if (oversizedFiles.length > 0) {
      alert(`Một số file PDF quá lớn (tối đa 50MB/file): ${oversizedFiles.map(f => f.name).join(', ')}`);
      return;
    }

    setIsProcessing(true);
    setProgressText("Đang chuẩn bị file...");
    try {
      // Process sequentially to avoid memory spikes
      let allImages: { base64: string; mimeType: string }[] = [];
      for (const file of files) {
        if (file.type === 'application/pdf') {
          setProgressText(`Đang tách trang PDF: ${file.name}...`);
          const pdfImages = await convertPdfToImages(file);
          allImages.push(...pdfImages.map(b => ({ base64: b, mimeType: 'image/jpeg' })));
        } else if (file.type.startsWith('image/')) {
          const processed = await processFile(file);
          allImages.push(processed);
        } else {
          // Fallback for unknown types
          const processed = await processFile(file);
          allImages.push(processed);
        }
      }
      
      // Batch processing (1 image per batch to ensure AI doesn't skip content)
      const BATCH_SIZE = 1;
      let combinedExams: ExamData[] = [];
      
      for (let i = 0; i < allImages.length; i += BATCH_SIZE) {
        setProgressText(`Đang trích xuất dữ liệu: Trang ${i + 1} / ${allImages.length}...`);
        const batch = allImages.slice(i, i + BATCH_SIZE);
        const data = await extractExam(batch);
        
        // Merge logic
        data.forEach(exam => {
          if (combinedExams.length > 0) {
            const lastExam = combinedExams[combinedExams.length - 1];
            // If this exam has no title, or same title, merge blocks
            if (!exam.title || exam.title.trim() === '' || exam.title === lastExam.title) {
              lastExam.blocks.push(...exam.blocks);
            } else {
              combinedExams.push(exam);
            }
          } else {
            combinedExams.push(exam);
          }
        });
      }

      setExamData(combinedExams);
      setSelectedExams(combinedExams.map((_, i) => i)); // Select all by default
    } catch (error: any) {
      console.error("Error processing files", error);
      alert(error.message || "Đã xảy ra lỗi khi xử lý file. Có thể file quá lớn hoặc định dạng không được hỗ trợ.");
    } finally {
      setIsProcessing(false);
      setProgressText("");
    }
  };

  const handleExportWord = () => {
    if (!examData) return;
    const selectedData = examData.filter((_, i) => selectedExams.includes(i));
    if (selectedData.length === 0) {
      alert("Vui lòng chọn ít nhất một đề thi để xuất.");
      return;
    }
    exportToWord(selectedData);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Sidebar - hidden when printing */}
      <div className="w-full md:w-80 bg-white shadow-md p-6 flex flex-col gap-6 no-print z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Exam Digitizer</h1>
          <p className="text-sm text-gray-500">Upload exam images or PDFs to digitize and format them into A4 size.</p>
        </div>

        <div className="flex flex-col gap-4">
          <div 
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-600">Click to upload files</span>
            <span className="text-xs text-gray-400 mt-1">Images or PDF (Max 50MB)</span>
            <input 
              type="file" 
              multiple 
              accept="image/*,application/pdf" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
          </div>

          {files.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">{files.length} file(s) selected</span>
                <button onClick={() => setFiles([])} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <ul className="text-xs text-gray-600 space-y-1 max-h-32 overflow-y-auto">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 truncate">
                    {f.type.includes('image') ? <FileImage className="w-3 h-3 flex-shrink-0" /> : <FileText className="w-3 h-3 flex-shrink-0" />}
                    <span className="truncate">{f.name} ({(f.size / 1024 / 1024).toFixed(1)}MB)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleProcess}
            disabled={files.length === 0 || isProcessing}
          >
            {isProcessing ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> {progressText || "Processing..."}</>
            ) : (
              <><FileText className="w-5 h-5" /> Digitize Exam</>
            )}
          </button>
        </div>

        {examData && (
          <div className="mt-auto pt-6 border-t border-gray-200 flex flex-col gap-3">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Select Exams</h3>
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                {examData.map((exam, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedExams.includes(i)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedExams([...selectedExams, i]);
                        } else {
                          setSelectedExams(selectedExams.filter(idx => idx !== i));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate">{exam.title || `Exam ${i + 1}`}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between">
                <button 
                  onClick={() => setSelectedExams(examData.map((_, i) => i))}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Select All
                </button>
                <button 
                  onClick={() => setSelectedExams([])}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
              onClick={handleExportWord}
            >
              <FileDown className="w-5 h-5" /> Export to Word
            </button>

            <button 
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
              onClick={handlePrint}
            >
              <Printer className="w-5 h-5" /> Print / Save as PDF
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center bg-gray-200 print:bg-white print:p-0 print:overflow-visible">
        {examData ? (
          <A4Page data={examData.filter((_, i) => selectedExams.includes(i))} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 no-print">
            <FileText className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">No exam data yet</p>
            <p className="text-sm">Upload files and click Digitize to see the result here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
