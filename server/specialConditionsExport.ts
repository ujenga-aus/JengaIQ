import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';
import { db } from './db';
import { specialConditionDrafts, specialConditionBlocks, projects, subcontractTemplates } from '@shared/schema';
import { eq } from 'drizzle-orm';

export async function generateSpecialConditionsWord(draftId: string): Promise<Buffer> {
  // Fetch draft
  const [draft] = await db
    .select()
    .from(specialConditionDrafts)
    .where(eq(specialConditionDrafts.id, draftId))
    .limit(1);

  if (!draft) {
    throw new Error('Draft not found');
  }

  // Fetch project
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, draft.projectId))
    .limit(1);

  // Fetch template (if any)
  let template = null;
  if (draft.templateId) {
    [template] = await db
      .select()
      .from(subcontractTemplates)
      .where(eq(subcontractTemplates.id, draft.templateId))
      .limit(1);
  }

  // Fetch blocks
  const blocks = await db
    .select()
    .from(specialConditionBlocks)
    .where(eq(specialConditionBlocks.draftId, draftId))
    .orderBy(specialConditionBlocks.sort);

  // Build document
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      text: draft.title || 'Special Conditions',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Project info
  if (project) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Project: ', bold: true }),
          new TextRun({ text: project.name }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // Template info
  if (template) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Template: ', bold: true }),
          new TextRun({ text: template.title }),
        ],
        spacing: { after: 400 },
      })
    );
  }

  // Add blocks with role-based styling
  for (const block of blocks) {
    const lines = block.content.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) {
        paragraphs.push(new Paragraph({ text: '' }));
        continue;
      }

      // Check if line is a heading
      const isHeading = /^(\d+\.?\d*)\s+[A-Z]/.test(line.trim());

      if (isHeading) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                bold: true,
                color: block.role === 'ai' ? '2563EB' : '000000', // Blue for AI, black for user
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
          })
        );
      } else {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                color: block.role === 'ai' ? '2563EB' : '000000', // Blue for AI, black for user
              }),
            ],
            spacing: { after: 100 },
          })
        );
      }
    }

    // Add spacing between blocks
    paragraphs.push(new Paragraph({ text: '' }));
  }

  // Create document
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  // Generate buffer
  return await Packer.toBuffer(doc);
}

// PDF export note: The DOCX export is the primary format as it provides proper role-based styling
// Users can convert DOCX to PDF using their Word processor
// Future enhancement: Implement native PDF generation with pdfkit or similar library
export async function generateSpecialConditionsPDF(draftId: string): Promise<{ message: string; docxUrl: string }> {
  return {
    message: 'PDF export is not yet available. Please use DOCX export and convert to PDF using your word processor.',
    docxUrl: `/api/special-conditions/${draftId}/export/docx`
  };
}
