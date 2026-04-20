const ExcelJS = require('exceljs');

const HEADERS = [
  'Spec Section','Submittal Number','Package #','Title','Type','Description',
  'Rev.','Cost Code','Responsible Contractor','Received From','Location',
  'Created At','Updated At','Final Due Date','Received Date','Issue Date',
  'Required On-Site Date','Lead Time','Planned Return Date',
  'Anticipated Delivery Date','Confirmed Delivery Date','Actual Delivery Date',
  'Planned Submit By Date','Approvers','Submit By','Sent Date',
  'Returned Date','Response','WF Due Date','Ball In Court','Status','Distributed Date',
];

const COL_WIDTHS = [
  64.9,15,19.8,61.6,24.2,80,11.5,19.8,41.25,26.4,18.15,
  12,12,12,12,12,12,12,12,20,20,20,25,50,10,12,12,22,12,26.4,22,12,
];

async function buildExcel(submittals, outputPath, projectName) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(projectName.slice(0, 31));
  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const sub of submittals) {
    const row = ws.addRow([sub.specSection, sub.submittalNumber, null, sub.title, sub.type, sub.description, ...Array(26).fill(null)]);
    row.eachCell({ includeEmpty: false }, cell => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });
  }
  ws.columns.forEach((col, i) => { col.width = COL_WIDTHS[i] || 12; });
  await wb.xlsx.writeFile(outputPath);
  return outputPath;
}

module.exports = { buildExcel };
