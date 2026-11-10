const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const money = n => `£${(n / 100).toFixed(2)}`;
const invoiceNumber = order => `HINV-${String(order.po_number).padStart(6, '0')}`;
async function generateHamperInvoice(order) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await fs.readFile(path.join(__dirname, '../assets/invoices/logo.png')));
  const footer = await pdf.embedPng(await fs.readFile(path.join(__dirname, '../assets/invoices/footer.png')));
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
    const fw = mm(146), fh = fw*footer.height/footer.width;
    page.drawImage(footer,{x:(width-fw)/2,y:mm(5),width:fw,height:fh});
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
  tableRow(['Description','Qty','Price','Total','VAT','Rate'],true);
  for(const item of lines)tableRow([item.name,item.quantity,money(item.unitPence),money(item.subtotalPence),money(item.productVatPence),`${item.vatPercent}%`]);
  if(y+86>mm(245))newPage();
  y+=18;
  const net=q.subtotalPence+q.shippingPence,vat=q.productVatPence+q.shippingVatPence;
  for(const [label,value] of [['TOTAL EXCLUDING VAT',net],['VAT',vat],['TOTAL',q.totalPence]]){text(label,left+mm(65),y+5,8,true);page.drawRectangle({x:left+mm(118),y:height-y-22,width:mm(35),height:22,borderWidth:.6,color:rgb(1,1,1),borderColor:rgb(.2,.2,.2)});text(money(value),left+mm(121),y+5,10,true);y+=22;}
  pdf.setTitle(`Ultimate Promotions ${invoiceNumber(order)}`);pdf.setAuthor('Ultimate Promotions');
  return Buffer.from(await pdf.save());
}
module.exports = { generateHamperInvoice, invoiceNumber };
