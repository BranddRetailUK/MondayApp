const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const money = n => `£${(n / 100).toFixed(2)}`;
const COMPANY_NAME = 'The Ultimate Promotion Company Ltd';
const invoiceNumber = order => `HINV-${String(order.po_number).padStart(6, '0')}`;
async function generateHamperInvoice(order) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await fs.readFile(path.join(__dirname, '../assets/invoices/logo.png')));
  const q = order.snapshot, d = order.delivery;
  const lines = [...(q.items || [q]), { name: 'UK mainland delivery (per hamper)', quantity: q.quantity, unitPence: q.deliveryUnitPence, subtotalPence: q.shippingPence, productVatPence: q.shippingVatPence, vatPercent: 20 }];
  const mm = n => n * 72 / 25.4;
  const width = mm(210), height = mm(297), left = mm(28.5), tableWidth = mm(153);
  let page, y;
  // Standard PDF fonts cover the existing database's Latin invoice typography.
  const printable = value => [...String(value ?? '').replace(/[\r\n\t]+/g, ' ')].map(c => { try { regular.encodeText(c); return c; } catch { return '-'; } }).join('');
  function text(value, x, top, size = 8.25, heavy = false) { page.drawText(printable(value), { x, y: height - top - size, size, font: heavy ? bold : regular, color: rgb(0, 0, 0) }); }
  function wrap(value, maxWidth, size = 8.25) {
    const out = []; let line = '';
    for (let word of printable(value).split(/\s+/)) {
      if (line && regular.widthOfTextAtSize(`${line} ${word}`, size) <= maxWidth) { line += ` ${word}`; continue; }
      if (line) { out.push(line); line = ''; }
      while (regular.widthOfTextAtSize(word, size) > maxWidth) {
        let length = 1;
        while (length < word.length && regular.widthOfTextAtSize(word.slice(0, length + 1), size) <= maxWidth) length++;
        out.push(word.slice(0, length)); word = word.slice(length);
      }
      line = word;
    }
    if (line) out.push(line); return out.length ? out : [''];
  }
  function rule(top, thickness = .6) { page.drawLine({ start: {x:left,y:height-top}, end:{x:left+tableWidth,y:height-top}, thickness }); }
  function newPage(first = false) {
    page = pdf.addPage([width,height]);
    const logoWidth = mm(60.5); page.drawImage(logo,{x:width-mm(24)-logoWidth,y:height-mm(12)-logoWidth*logo.height/logo.width,width:logoWidth,height:logoWidth*logo.height/logo.width});
    // Replace the old company wording embedded in the logo's lower caption.
    const logoX = width-mm(24)-logoWidth, logoBottom = height-mm(12)-logoWidth*logo.height/logo.width;
    page.drawRectangle({x:logoX+logoWidth*.335,y:logoBottom,width:logoWidth*.665,height:logoWidth*logo.height/logo.width*.235,color:rgb(1,1,1)});
    const captionSize = Math.min(6.5, logoWidth*.665 / regular.widthOfTextAtSize(COMPANY_NAME,1));
    page.drawText(COMPANY_NAME,{x:logoX+logoWidth*.335,y:logoBottom+2,size:captionSize,font:regular});
    const footerLines = [
      ['Bank details: Account No. 12279919 | Sort Code: 60-10-33 | email: accounts@ultimatepromotions.co.uk', 270, false],
      [`${COMPANY_NAME}, Unicorn House, Northbridge Road, Berkhamsted, Herts, HP4 1EH`, 280, true],
      ['Tel: 01442 264 288 / 0845 199 778 | sales@ultimatepromotions.co.uk | www.ultimatepromotions.co.uk', 284, true],
      ['VAT No. 984 5655 65 | Registered in England: 7009087 | Registered office: Abbey House, 342 Regents Park Road, London N3 2LJ', 293, true]
    ];
    for (const [line, top, muted] of footerLines) {
      const size = Math.min(7.5, mm(146) / regular.widthOfTextAtSize(line,1));
      page.drawText(line,{x:(width-regular.widthOfTextAtSize(line,size))/2,y:height-mm(top)-size,size,font:regular,color:muted?rgb(.68,.68,.7):rgb(0,0,0)});
    }
    text(order.status === 'paid' ? 'INVOICE' : 'PRO-FORMA INVOICE',mm(21),mm(12),18.75,true);
    text(`Page ${pdf.getPageCount()}`,left,mm(263),7);
    if (order.mode === 'sandbox') text('SANDBOX - TEST DOCUMENT - NOT A VAT INVOICE',left,mm(255),8,true);
    y = mm(first ? 46 : 40);
  }
  newPage(true);
  for (const line of [d.name,d.line1,d.line2,d.city,d.postcode].filter(Boolean)) for (const part of wrap(line,tableWidth,9)) { text(part,left,y,9); y+=11; }
  y=Math.max(y+12,mm(81));
  const meta = [['Invoice No.',invoiceNumber(order)],['ULT Ref:',`PO-${String(order.po_number).padStart(6,'0')}`],['VAT No.:','984 5655 65'],['Invoice date:',new Date(order.created_at).toLocaleDateString('en-GB',{timeZone:'Europe/London'})],['Payment terms:',order.status === 'paid' ? 'Paid via Stripe' : 'Payment required'],['Delivery address:','(as above)']];
  for(const [label,value] of meta){text(label,left,y);text(value,left+mm(33),y);y+=mm(4.5);}
  y+=mm(6);rule(y,2);text('Job title:',left+mm(6),y+8,9,true);text('Christmas hampers',left+mm(30),y+8,9);y+=mm(10);rule(y,2);y+=mm(6);
  const widths=[mm(65),mm(12),mm(20),mm(21),mm(20),mm(15)];
  function tableRow(values, headings=false) {
    const chunks=values.map((v,i)=>wrap(v,widths[i]-8,8));
    const rh=Math.max(...chunks.map(a=>a.length))*10+10;
    if(y+rh>mm(242)){newPage();tableRow(['Description','Qty','Price','Total','VAT','Rate'],true);}
    let x=left;
    values.forEach((v,i)=>{page.drawRectangle({x,y:height-y-rh,width:widths[i],height:rh,borderWidth:.5,borderColor:rgb(.2,.2,.2)});chunks[i].forEach((part,j)=>text(part,x+4,y+5+j*10,8,headings));x+=widths[i];}); y+=rh;
  }
  if(q.discountLabel) { text(`${q.discountLabel}: saved ${money(q.discountPence)} including VAT.`,left,y,8,true); y+=14; text('All line prices below include this discount.',left,y,8); y+=18; }
  tableRow(['Description','Qty','Price','Total','VAT','Rate'],true);
  for(const item of lines)tableRow([item.name,item.quantity,money(item.unitPence),money(item.subtotalPence),money(item.productVatPence),`${item.vatPercent}%`]);
  if(y+86>mm(245))newPage();
  y+=18;
  const net=q.subtotalPence+q.shippingPence,vat=q.productVatPence+q.shippingVatPence;
  for(const [label,value] of [['TOTAL EXCLUDING VAT',net],['VAT',vat],['TOTAL',q.totalPence]]){text(label,left+mm(65),y+5,8,true);page.drawRectangle({x:left+mm(118),y:height-y-22,width:mm(35),height:22,borderWidth:.6,color:rgb(1,1,1),borderColor:rgb(.2,.2,.2)});text(money(value),left+mm(121),y+5,10,true);y+=22;}
  pdf.setTitle(`${COMPANY_NAME} ${invoiceNumber(order)}`);pdf.setAuthor(COMPANY_NAME);
  return Buffer.from(await pdf.save());
}
module.exports = { generateHamperInvoice, invoiceNumber };
