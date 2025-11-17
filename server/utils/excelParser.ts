import ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  orderIndex: number;
}

export interface ExcelRow {
  [key: string]: any;
}

export interface ExcelData {
  columns: ExcelColumn[];
  rows: ExcelRow[];
  headerRowNumber?: number;
}

// Auto-detect header row by looking for BOQ-related keywords
export function detectHeaderRow(worksheet: ExcelJS.Worksheet): number {
  const maxRowsToScan = 30;
  const keywords = [
    'item', 'description', 'quantity', 'unit', 'rate', 'amount', 
    'price', 'total', 'qty', 'no', 'number', 'descr'
  ];
  
  let bestScore = 0;
  let bestRow = 1; // Default to first row
  
  // Scan first N rows
  for (let rowNum = 1; rowNum <= Math.min(maxRowsToScan, worksheet.rowCount); rowNum++) {
    const row = worksheet.getRow(rowNum);
    let score = 0;
    let cellCount = 0;
    const cellValues: string[] = [];
    let uniqueCells = 0;
    
    row.eachCell({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value?.toString().trim().toLowerCase() || '';
      if (cellValue) {
        cellCount++;
        cellValues.push(cellValue);
        
        // Check if this cell contains any BOQ keywords
        for (const keyword of keywords) {
          if (cellValue.includes(keyword)) {
            score++;
            break; // Count each cell only once
          }
        }
      }
    });
    
    // Count unique cell values (to avoid merged cell headers)
    uniqueCells = new Set(cellValues).size;
    
    // A good header row should have:
    // 1. Multiple keyword matches (at least 3)
    // 2. At least 4 cells with data
    // 3. Cells with different values (not all the same merged cell)
    // 4. At least 50% of cells should match keywords
    const diversityCheck = uniqueCells >= Math.min(3, cellCount * 0.5);
    const coverageCheck = cellCount >= 4 && score >= 3;
    const ratioCheck = score / cellCount >= 0.4;
    
    if (diversityCheck && coverageCheck && ratioCheck && score > bestScore) {
      bestScore = score;
      bestRow = rowNum;
    }
  }
  
  return bestRow;
}

export async function parseExcelColumns(fileBuffer: Buffer): Promise<ExcelColumn[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  
  const worksheet = workbook.worksheets[0]; // Get first sheet
  if (!worksheet) {
    throw new Error('No worksheet found in Excel file');
  }

  const columns: ExcelColumn[] = [];
  const headerRow = worksheet.getRow(1);
  
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = cell.value?.toString() || `Column ${colNumber}`;
    columns.push({
      header,
      orderIndex: colNumber - 1, // 0-based index
    });
  });

  return columns;
}

// Parse raw rows for header selection
export async function parseRawRows(fileBuffer: Buffer, maxRows: number = 25): Promise<any[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('No worksheet found in Excel file');
  }

  const rawRows: any[] = [];
  
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > maxRows) return; // Limit to first N rows
    
    const rowData: any = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Use .text property for most reliable value extraction (handles formulas, dates, rich text automatically)
      let value = cell.text || cell.value;
      
      // Fallback: handle remaining complex types if .text is empty
      if (!value && cell.value) {
        if (typeof cell.value === 'object' && 'result' in cell.value) {
          value = (cell.value as any).result;
        } else if (typeof cell.value === 'object' && 'richText' in cell.value) {
          value = (cell.value as any).richText.map((t: any) => t.text).join('');
        } else if (cell.value instanceof Date) {
          value = cell.value.toISOString();
        } else {
          value = cell.value;
        }
      }
      
      // Convert to string if not null/undefined
      if (value !== null && value !== undefined) {
        value = value.toString().trim();
      }
      
      rowData[`col${colNumber}`] = value;
    });
    
    rawRows.push(rowData);
  });

  return rawRows;
}

export async function parseExcelData(fileBuffer: Buffer, maxPreviewRows: number = 10): Promise<ExcelData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('No worksheet found in Excel file');
  }

  const columns: ExcelColumn[] = [];
  const rows: ExcelRow[] = [];
  
  // Auto-detect header row
  const headerRowNum = detectHeaderRow(worksheet);
  
  // Parse headers from detected header row
  const headerRow = worksheet.getRow(headerRowNum);
  const headers: string[] = [];
  
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = cell.value?.toString() || `Column ${colNumber}`;
    headers[colNumber - 1] = header;
    columns.push({
      header,
      orderIndex: colNumber - 1,
    });
  });

  // Parse data rows (skip header row, limit to maxPreviewRows for preview)
  let rowCount = 0;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNum) return; // Skip rows up to and including header
    if (rowCount >= maxPreviewRows) return; // Limit preview rows
    
    const rowData: ExcelRow = {};
    let hasData = false;
    
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) {
        const value = cell.value;
        rowData[header] = value;
        if (value !== null && value !== undefined && value !== '') {
          hasData = true;
        }
      }
    });
    
    // Only add rows that have at least some data
    if (hasData) {
      rows.push(rowData);
      rowCount++;
    }
  });

  return { columns, rows, headerRowNumber: headerRowNum };
}

export async function parseExcelDataFull(
  fileBuffer: Buffer,
  columnMapping: Record<string, string>,
  headerRowNumber: number = 1
): Promise<ExcelRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('No worksheet found in Excel file');
  }

  const rows: ExcelRow[] = [];
  const headers: string[] = [];
  
  // Use provided header row number
  const headerRowNum = headerRowNumber;
  
  console.log(`[BOQ Import] Total rows in Excel: ${worksheet.rowCount}`);
  console.log(`[BOQ Import] Header row number: ${headerRowNum}`);
  console.log(`[BOQ Import] Column mapping:`, columnMapping);
  
  // Parse headers from detected header row
  const headerRow = worksheet.getRow(headerRowNum);
  
  // Find actual max column by checking which cells have content
  let maxCol = 0;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber > maxCol) maxCol = colNumber;
  });
  
  console.log(`[BOQ Import] Max column detected from eachCell: ${maxCol}`);
  
  // Build headers array by reading each cell directly
  // Only go up to a reasonable maximum (not the full Excel sheet width)
  const reasonableMax = Math.min(maxCol, 100);
  
  console.log(`[BOQ Import] Reading headers from columns 1 to ${reasonableMax}`);
  
  for (let colNum = 1; colNum <= reasonableMax; colNum++) {
    const cell = headerRow.getCell(colNum);
    const value = cell.value;
    let headerText = '';
    
    // Debug first 10 columns
    if (colNum <= 10) {
      console.log(`[BOQ Import] Col ${colNum} raw value:`, value, `type:`, typeof value);
    }
    
    if (value) {
      // Handle different cell value types
      if (typeof value === 'string') {
        headerText = value.trim();
      } else if (typeof value === 'number') {
        headerText = value.toString().trim();
      } else if (typeof value === 'object' && 'result' in value) {
        headerText = (value as any).result?.toString().trim() || '';
      } else if (typeof value === 'object' && 'richText' in value) {
        headerText = (value as any).richText.map((t: any) => t.text).join('').trim();
      } else {
        headerText = value.toString().trim();
      }
    }
    
    headers[colNum - 1] = headerText || `Column ${colNum}`;
  }
  
  console.log(`[BOQ Import] Parsed headers (first 20):`, headers.slice(0, 20));

  // Parse all data rows (skip rows up to and including header)
  let processedRows = 0;
  let skippedRows = 0;
  
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNum) return; // Skip rows up to and including header
    
    const rowData: ExcelRow = {};
    let hasData = false;
    
    // IMPORTANT: includeEmpty: true ensures we iterate ALL columns, even empty ones
    // This keeps column numbers aligned with the headers array
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const excelHeader = headers[colNumber - 1];
      const mappedField = columnMapping[excelHeader];
      
      if (mappedField && mappedField !== '_ignore') {
        // Use .text first (most reliable for formulas, dates, rich text)
        // Falls back to .value for raw types
        let value = cell.text || cell.value;
        
        // If still empty, try extracting from complex cell value types
        if (!value && cell.value) {
          if (typeof cell.value === 'object' && 'result' in cell.value) {
            value = (cell.value as any).result;
          } else if (typeof cell.value === 'object' && 'richText' in cell.value) {
            value = (cell.value as any).richText.map((t: any) => t.text).join('');
          } else if (cell.value instanceof Date) {
            value = cell.value.toISOString();
          }
        }
        
        // Clean up the value
        if (value !== null && value !== undefined && typeof value === 'string') {
          value = value.trim();
        }
        
        rowData[mappedField] = value;
        if (value !== null && value !== undefined && value !== '') {
          hasData = true;
        }
      }
    });
    
    // Only add row if it has at least one mapped field with actual data
    if (hasData && Object.keys(rowData).length > 0) {
      rows.push(rowData);
      processedRows++;
      if (processedRows <= 3) {
        console.log(`[BOQ Import] Row ${rowNumber} data:`, rowData);
      }
    } else {
      skippedRows++;
    }
  });

  console.log(`[BOQ Import] Total data rows processed: ${processedRows}, skipped: ${skippedRows}`);
  return rows;
}
