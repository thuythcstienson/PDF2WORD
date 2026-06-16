import React from 'react';
import { ExamBlock, ExamData } from '../lib/gemini';

export function A4Page({ data }: { data: ExamData[] }) {
  return (
    <div className="flex flex-col gap-8">
      {data.map((exam, examIndex) => (
        <div key={examIndex} className="a4-page bg-white shadow-xl print:shadow-none print:break-after-page">
          {exam.title && (
            <h1 className="text-center font-bold text-[15pt] uppercase mb-6">{exam.title}</h1>
          )}
          {exam.blocks.map((block, index) => (
            <ExamBlockRenderer key={index} block={block} />
          ))}
        </div>
      ))}
    </div>
  );
}

const ExamBlockRenderer: React.FC<{ block: ExamBlock }> = ({ block }) => {
  switch (block.type) {
    case 'title':
      return <h1 className="text-center font-bold text-[15pt] uppercase mb-4 break-after-avoid">{block.text || ""}</h1>;
    case 'instruction':
      return <p className="font-bold italic mb-2 break-after-avoid">{block.text || ""}</p>;
    case 'passage':
      return <p className="mb-4 text-left">{block.text || ""}</p>;
    case 'question': {
      const totalOptionsLength = block.options ? block.options.reduce((acc, opt) => acc + (opt.text || "").length + 4, 0) : 0;
      const isInline = block.options && block.options.length > 0 && ((block.text || "").length < 40 || ((block.text || "").length + totalOptionsLength < 100));

      if (isInline && block.options) {
        return (
          <div className="mb-2 break-inside-avoid flex flex-wrap items-baseline">
            <span className="mr-4">{block.text || ""}</span>
            <div className="flex-1 flex flex-wrap gap-x-6 gap-y-2">
              {block.options.map((opt, i) => (
                <div key={i} className="flex whitespace-nowrap">
                  <span className="font-bold mr-1">{opt.label || ""}.</span>
                  <span>{opt.text || ""}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      return (
        <div className="mb-4 break-inside-avoid">
          <p className="mb-2 text-left">{block.text || ""}</p>
          {block.options && block.options.length > 0 && (
            <OptionsRenderer options={block.options} />
          )}
        </div>
      );
    }
    default:
      return <p className="mb-2">{block.text || ""}</p>;
  }
}

function OptionsRenderer({ options }: { options: { label: string; text: string }[] }) {
  const maxLength = Math.max(...options.map(o => (o.text || "").length));
  
  let gridClass = "grid-cols-1";
  if (maxLength < 15) {
    gridClass = "grid-cols-4";
  } else if (maxLength < 40) {
    gridClass = "grid-cols-2";
  }

  return (
    <div className={`grid ${gridClass} gap-y-2 gap-x-4`}>
      {options.map((opt, i) => (
        <div key={i} className="flex">
          <span className="font-bold mr-1">{opt.label || ""}.</span>
          <span>{opt.text || ""}</span>
        </div>
      ))}
    </div>
  );
}
