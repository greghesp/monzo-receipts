import puppeteer from 'puppeteer'
import { htmlToText } from '@/lib/parsing/claude'
import PDFDocument from 'pdfkit'

// ─── HTML wrapper ─────────────────────────────────────────────────────────────

function wrapEmailHtml(html: string, subject: string, from: string, date: string): string {
  const formattedDate = date
    ? new Date(date).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
    : ''
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #000;
    background: #fff;
    margin: 0;
    padding: 0;
  }
  .email-meta {
    padding: 16px 24px 12px;
    border-bottom: 1px solid #ddd;
    margin-bottom: 16px;
  }
  .email-meta h1 { font-size: 15px; margin: 0 0 4px; }
  .email-meta p  { margin: 2px 0; font-size: 11px; color: #555; }
  .email-body    { padding: 0 24px 24px; }
  img { max-width: 100%; height: auto; }
  /* Force white backgrounds so dark-mode email themes print cleanly */
  table, td, th, div, section { background-color: transparent !important; }
  a { color: #1a73e8; text-decoration: none; }
</style>
</head>
<body>
  <div class="email-meta">
    <h1>${subject.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
    <p>From: ${from.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    ${formattedDate ? `<p>Date: ${formattedDate}</p>` : ''}
  </div>
  <div class="email-body">${html}</div>
</body>
</html>`
}

// ─── Puppeteer HTML → PDF (primary) ──────────────────────────────────────────

async function generateWithPuppeteer(
  html: string,
  subject: string,
  from: string,
  date: string
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',               // required in Docker / CI
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',    // avoids /dev/shm OOM in containers
      '--disable-gpu',
    ],
  })
  try {
    const page = await browser.newPage()

    // Block external requests — tracking pixels, CDN images etc cause networkidle timeouts
    await page.setRequestInterception(true)
    page.on('request', req => {
      const type = req.resourceType()
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort()
      } else {
        req.continue()
      }
    })

    // domcontentloaded is sufficient — we don't need external resources
    await page.setContent(wrapEmailHtml(html, subject, from, date), { waitUntil: 'domcontentloaded', timeout: 10_000 })
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      printBackground: false,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

// ─── pdfkit plain-text fallback ───────────────────────────────────────────────

function generateWithPdfkit(
  subject: string,
  from: string,
  date: string,
  html: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(14).font('Helvetica-Bold').text(subject, { lineBreak: true }).moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor('#555555').text(`From: ${from}`)
    const fd = date
      ? new Date(date).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
      : ''
    if (fd) doc.text(`Date: ${fd}`)
    doc.moveDown(0.8)
      .moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y)
      .strokeColor('#cccccc').stroke().moveDown(0.8)
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
      .text(htmlToText(html), { lineGap: 2, paragraphGap: 6 })
    doc.end()
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateEmailPdf(
  subject: string,
  from: string,
  date: string,
  html: string
): Promise<Buffer> {
  try {
    console.log(`[pdf] Generating PDF via puppeteer`)
    return await generateWithPuppeteer(html, subject, from, date)
  } catch (e) {
    console.warn(`[pdf] Puppeteer failed, falling back to pdfkit: ${e}`)
    return generateWithPdfkit(subject, from, date, html)
  }
}
