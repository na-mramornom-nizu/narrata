import { buildReportDocument, reportFilename, type ReportSnapshot } from './report-document';

export async function downloadReport(snapshot: ReportSnapshot): Promise<void> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  const document = pdfMake.createPdf(buildReportDocument(snapshot), undefined, undefined, fonts as unknown as Record<string, string>);
  await new Promise<void>((resolve, reject) => {
    try { document.download(reportFilename(snapshot), resolve); }
    catch (error) { reject(error); }
  });
}
