import { GoogleGenAI, Type } from '@google/genai';
import { jsonrepair } from 'jsonrepair';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ExamBlock {
  type: 'title' | 'instruction' | 'passage' | 'question';
  text: string;
  options?: { label: string; text: string }[];
}

export interface ExamData {
  title: string;
  blocks: ExamBlock[];
}

export async function extractExam(files: { base64: string; mimeType: string }[]): Promise<ExamData[]> {
  const parts = files.map(f => ({
    inlineData: {
      data: f.base64,
      mimeType: f.mimeType,
    }
  }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: {
      parts: [
        ...parts,
        {
          text: `You are an expert at digitizing exam papers. Extract all text from the provided images.
CRITICAL: The provided images may contain a full exam, multiple exams, or just a PART of an exam.
You MUST extract EVERY SINGLE EXAM or PARTIAL EXAM present in the images. Do not stop until all text is extracted.
DO NOT summarize. Transcribe EVERY word, EVERY question, EVERY option exactly as it appears.
Separate them into distinct exam objects in the JSON array.
If the text continues from a previous page and does not have a clear new title, leave the 'title' field empty ("").
For each exam, classify each part into one of the following types:
- 'title': Main titles or headers (e.g., "ĐỀ THI THỬ", "MÔN TOÁN").
- 'instruction': Instructions for a section (e.g., "Mark the letter A, B, C, or D...", "Chọn đáp án đúng").
- 'passage': A reading passage or long text.
- 'question': A question, which may include multiple-choice options.

For questions with multiple-choice options (A, B, C, D), separate the options into the 'options' array.
Do not include the 'A.', 'B.', 'C.', 'D.' prefix in the option text, put the letter in the 'label' field (e.g., 'A', 'B', 'C', 'D').
Ensure the text is accurately transcribed, preserving math formulas or special characters if possible.
Maintain the exact order of the exam.`
        }
      ]
    },
    config: {
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Title of the exam, e.g., 'Đề số 1'" },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: "Block type: 'title', 'instruction', 'passage', 'question'" },
                  text: { type: Type.STRING, description: "The main text content" },
                  options: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING, description: "A, B, C, or D" },
                        text: { type: Type.STRING, description: "The option text" }
                      }
                    }
                  }
                },
                required: ["type", "text"]
              }
            }
          },
          required: ["title", "blocks"]
        }
      }
    }
  });

  const jsonStr = response.text?.trim() || '[]';
  try {
    return JSON.parse(jsonStr) as ExamData[];
  } catch (e) {
    console.warn("Failed to parse JSON directly, attempting to repair...", e);
    try {
      const repairedJson = jsonrepair(jsonStr);
      return JSON.parse(repairedJson) as ExamData[];
    } catch (repairError) {
      console.error("Failed to repair JSON", repairError);
      throw new Error("Dữ liệu trả về quá lớn và bị cắt ngang, không thể khôi phục. Vui lòng chia nhỏ file PDF ra thành các phần nhỏ hơn (ví dụ: 1-2 đề mỗi file) và thử lại.");
    }
  }
}
