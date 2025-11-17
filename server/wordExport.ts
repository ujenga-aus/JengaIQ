import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, Footer } from 'docx';

/**
 * Generates a Word document from letter text
 * @param letterContent - The letter text content
 * @param projectName - Name of the project
 * @returns Buffer containing the Word document
 */
export async function generateLetterWordDocument(
  letterContent: string,
  projectName: string
): Promise<Buffer> {
  // Parse the letter content into structured sections
  const lines = letterContent.split('\n');
  const bodyParagraphs: Paragraph[] = [];
  const footerParagraphs: Paragraph[] = [];
  
  // Add document title
  bodyParagraphs.push(
    new Paragraph({
      text: projectName,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 400,
      },
    })
  );
  
  // Process each line of the letter
  let inReferenceNotes = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines but add spacing (only in body if not in reference notes)
    if (!line) {
      if (!inReferenceNotes) {
        bodyParagraphs.push(new Paragraph({ text: '' }));
      } else {
        footerParagraphs.push(new Paragraph({ text: '' }));
      }
      continue;
    }
    
    // Detect reference notes section
    if (line === 'Reference Notes' || line.startsWith('Reference Notes')) {
      inReferenceNotes = true;
      // Add "Reference Notes" heading to footer
      footerParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Reference Notes',
              bold: true,
            }),
          ],
          spacing: {
            before: 200,
            after: 100,
          },
        })
      );
      continue;
    }
    
    // Check if line is a heading-like pattern
    const isHeading = /^(Background|Contractual [Pp]osition|Request and [Nn]ext [Ss]teps|Opening|Closing|Subject:|Our reference:|Their reference:|Date:|To:|Project:)/i.test(line);
    
    if (inReferenceNotes) {
      // Add to footer paragraphs
      if (line.startsWith('[Ref')) {
        // Reference note - format with bold reference marker
        const refMatch = line.match(/^(\[Ref \d+\])(.*)/);
        if (refMatch) {
          footerParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: refMatch[1],
                  bold: true,
                }),
                new TextRun({
                  text: refMatch[2],
                }),
              ],
              spacing: {
                after: 80,
              },
            })
          );
        } else {
          footerParagraphs.push(
            new Paragraph({
              text: line,
              spacing: {
                after: 80,
              },
            })
          );
        }
      } else {
        footerParagraphs.push(
          new Paragraph({
            text: line,
            spacing: {
              after: 80,
            },
          })
        );
      }
    } else if (isHeading) {
      // Body headings
      bodyParagraphs.push(
        new Paragraph({
          text: line,
          heading: HeadingLevel.HEADING_2,
          spacing: {
            before: 200,
            after: 100,
          },
        })
      );
    } else {
      // Regular body paragraph
      bodyParagraphs.push(
        new Paragraph({
          text: line,
          spacing: {
            after: 100,
          },
        })
      );
    }
  }
  
  // Create footer with reference notes (if any exist)
  const footer = footerParagraphs.length > 0 ? new Footer({
    children: footerParagraphs,
  }) : undefined;
  
  // Create the document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,  // 1 inch in twips (1440 = 1 inch)
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: bodyParagraphs,
        footers: footer ? {
          default: footer,
        } : undefined,
      },
    ],
  });
  
  // Generate the buffer
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
