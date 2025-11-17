const fs = require('fs');
const PDFDocument = require('pdfkit');

// Create Letter 1
const doc1 = new PDFDocument();
doc1.pipe(fs.createWriteStream('test-files/letter1.pdf'));
doc1.fontSize(20).text('Test Letter #1', 100, 100);
doc1.fontSize(12).text('From: John Smith', 100, 150);
doc1.fontSize(12).text('To: ABC Construction Ltd', 100, 170);
doc1.fontSize(12).text('Subject: Project Update Request', 100, 190);
doc1.fontSize(12).text('Date: October 15, 2025', 100, 210);
doc1.fontSize(12).text('\nDear Sir/Madam,\n\nThis is a test letter for the AI correspondence system.\n\nBest regards,\nJohn Smith', 100, 240);
doc1.end();

// Create Letter 2
const doc2 = new PDFDocument();
doc2.pipe(fs.createWriteStream('test-files/letter2.pdf'));
doc2.fontSize(20).text('Test Letter #2', 100, 100);
doc2.fontSize(12).text('From: Jane Doe', 100, 150);
doc2.fontSize(12).text('To: ABC Construction Ltd', 100, 170);
doc2.fontSize(12).text('Subject: Contract Review Response', 100, 190);
doc2.fontSize(12).text('Date: October 15, 2025', 100, 210);
doc2.fontSize(12).text('\nDear Sir/Madam,\n\nThis is another test letter for the AI correspondence system.\n\nBest regards,\nJane Doe', 100, 240);
doc2.end();

console.log('PDFs created successfully!');
