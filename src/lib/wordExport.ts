import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType,
  PageBreak
} from 'docx';
import { saveAs } from 'file-saver';
import { ExamData, ExamBlock } from './gemini';

export async function exportToWord(exams: ExamData[]) {
  const children: any[] = [];

  exams.forEach((exam, examIndex) => {
    if (examIndex > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    // Add exam title if it exists
    if (exam.title) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: exam.title,
              bold: true,
              size: 26, // 13pt
              font: "Times New Roman"
            })
          ]
        })
      );
    }

    exam.blocks.forEach(block => {
      switch (block.type) {
        case 'title':
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 200 },
              children: [
                new TextRun({
                  text: (block.text || "").toUpperCase(),
                  bold: true,
                  size: 30, // 15pt
                  font: "Times New Roman"
                })
              ]
            })
          );
          break;

        case 'instruction':
          children.push(
            new Paragraph({
              spacing: { before: 100, after: 100 },
              children: [
                new TextRun({
                  text: block.text || "",
                  bold: true,
                  italics: true,
                  size: 26,
                  font: "Times New Roman"
                })
              ]
            })
          );
          break;

        case 'passage':
          children.push(
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { before: 100, after: 100 },
              children: [
                new TextRun({
                  text: block.text || "",
                  size: 26,
                  font: "Times New Roman"
                })
              ]
            })
          );
          break;

        case 'question': {
          const totalOptionsLength = block.options ? block.options.reduce((acc, opt) => acc + (opt.text || "").length + 4, 0) : 0;
          const isInline = block.options && block.options.length > 0 && ((block.text || "").length < 40 || ((block.text || "").length + totalOptionsLength < 100));

          if (isInline && block.options) {
            const inlineChildren = [
              new TextRun({
                text: (block.text || "") + "    ",
                size: 26,
                font: "Times New Roman"
              })
            ];
            
            block.options.forEach((opt, i) => {
              inlineChildren.push(
                new TextRun({
                  text: `${opt.label || ""}. `,
                  bold: true,
                  size: 26,
                  font: "Times New Roman"
                })
              );
              inlineChildren.push(
                new TextRun({
                  text: (opt.text || "") + (i < block.options!.length - 1 ? "      " : ""),
                  size: 26,
                  font: "Times New Roman"
                })
              );
            });

            children.push(
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { before: 100, after: 100 },
                children: inlineChildren
              })
            );
          } else {
            children.push(
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { before: 100, after: 100 },
                children: [
                  new TextRun({
                    text: block.text || "",
                    size: 26,
                    font: "Times New Roman"
                  })
                ]
              })
            );

            if (block.options && block.options.length > 0) {
              children.push(createOptionsTable(block.options));
            }
          }
          break;
        }

        default:
          children.push(
            new Paragraph({
              spacing: { before: 100, after: 100 },
              children: [
                new TextRun({
                  text: block.text || "",
                  size: 26,
                  font: "Times New Roman"
                })
              ]
            })
          );
      }
    });
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 567,    // 1 cm
            bottom: 567, // 1 cm
            left: 1134,  // 2 cm
            right: 737,  // 1.3 cm
          },
          size: {
            width: 11906, // A4 width in twips
            height: 16838 // A4 height in twips
          }
        }
      },
      children: children
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, "Exams.docx");
}

function createOptionsTable(options: { label: string; text: string }[]) {
  const maxLength = Math.max(...options.map(o => (o.text || "").length));
  
  let columns = 1;
  if (maxLength < 15) {
    columns = 4;
  } else if (maxLength < 40) {
    columns = 2;
  }

  const rows: TableRow[] = [];
  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" }
  };

  for (let i = 0; i < options.length; i += columns) {
    const cells: TableCell[] = [];
    for (let j = 0; j < columns; j++) {
      const opt = options[i + j];
      if (opt) {
        cells.push(
          new TableCell({
            borders: noBorder,
            width: { size: 100 / columns, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                spacing: { before: 50, after: 50 },
                children: [
                  new TextRun({
                    text: `${opt.label || ""}. `,
                    bold: true,
                    size: 26,
                    font: "Times New Roman"
                  }),
                  new TextRun({
                    text: opt.text || "",
                    size: 26,
                    font: "Times New Roman"
                  })
                ]
              })
            ]
          })
        );
      } else {
        cells.push(
          new TableCell({
            borders: noBorder,
            width: { size: 100 / columns, type: WidthType.PERCENTAGE },
            children: [new Paragraph("")]
          })
        );
      }
    }
    rows.push(new TableRow({ children: cells }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorder,
    rows: rows
  });
}
