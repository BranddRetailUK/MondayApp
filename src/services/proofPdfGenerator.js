const {colourName,printMethod}=require('../../public/proof-display');
const {proofFileName}=require('../../tools/print-worker/proof-filename');
const fs = require('fs/promises');
const path = require('path');
const { PDFDocument, PDFName, StandardFonts, rgb } = require('pdf-lib');
const { createHash } = require('crypto');
const { fetchGarment } = require('./proofImageFetch');
const { findArtwork, resolveDecorations, preferredView, placementFor, fitsRegion, positionName, artworkSize } = require('./proofLayout');
const { prepareArtwork, analyseGarment, coverage, fitSleeve, automaticGarmentProfile } = require('./proofArtwork');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'assets', 'proof-generator', 'template.pdf');
const PAGE_W = 841.89;
const PAGE_H = 595.275;
const NAVY = rgb(0.075, 0.14, 0.23);
const BLUE = rgb(0.035, 0.53, 0.78);
const GREY = rgb(0.39, 0.44, 0.51);
const LIGHT = rgb(0.82, 0.86, 0.89);

function safeText(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7e]/g, '-').trim();
}

function drawText(page, text, x, top, size, font, colour = NAVY, maxWidth = 700) {
  const value = safeText(text);
  if (!value) return;
  let selected = size;
  while (selected > 6 && font.widthOfTextAtSize(value, selected) > maxWidth) selected -= 0.25;
  let fitted = value;
  while (font.widthOfTextAtSize(fitted, selected) > maxWidth && fitted.length > 4) fitted = `${fitted.slice(0, -4)}...`;
  page.drawText(fitted, { x, y: PAGE_H - top - selected, size: selected, font, color: colour });
}

function rect(page, x, top, width, height, colour, border = null) {
  page.drawRectangle({ x, y: PAGE_H - top - height, width, height, color: colour,
    borderColor: border || colour, borderWidth: border ? 0.6 : 0 });
}

function line(page, x1, top1, x2, top2, colour = LIGHT, thickness = 1) {
  page.drawLine({ start: { x: x1, y: PAGE_H - top1 }, end: { x: x2, y: PAGE_H - top2 }, color: colour, thickness });
}

function drawField(page, x, top, width, label, value, regular, bold, split = false) {
  rect(page, x, top, width, 25, rgb(1, 1, 1), rgb(0.65, 0.69, 0.73));
  drawText(page, label, x + 12, top + 6, 10, bold, rgb(0.15, 0.15, 0.15), 80);
  drawText(page, value || 'To confirm', x + (split ? 77 : 91), top + 5.5, 10.5, bold, rgb(0.15, 0.15, 0.15), width - (split ? 86 : 103));
}

function drawHeader(page, brief, product, regular, bold, date) {
  rect(page, 0, 98, PAGE_W, PAGE_H - 98, rgb(1, 1, 1));
  rect(page, 237, 4, 605, 86, rgb(0.83, 0.86, 0.89));
  drawField(page, 238, 12, 377, 'Customer:', brief.customer, regular, bold);
  drawField(page, 238, 37, 377, 'Job title:', brief.jobTitle, regular, bold);
  rect(page, 238, 62, 377, 25, rgb(1, 1, 1), rgb(0.65, 0.69, 0.73));
  line(page, 421, 62, 421, 87, rgb(0.65, 0.69, 0.73), 0.6);
  drawText(page, 'Ref:', 250, 68, 10, bold, rgb(0.15, 0.15, 0.15));
  drawText(page, brief.reference || 'To confirm', 329, 67, 10.5, bold, rgb(0.15, 0.15, 0.15), 85);
  drawText(page, 'Date:', 432, 68, 10, bold, rgb(0.15, 0.15, 0.15));
  drawText(page, date, 485, 67, 10.5, bold, rgb(0.15, 0.15, 0.15), 120);
  drawField(page, 627, 12, 202, 'Garment:', `${product.code} ${product.requestedName || product.name}`, regular, bold);
  drawField(page, 627, 37, 202, 'Colour:', colourName(product.colour), regular, bold);
  drawField(page, 627, 62, 202, 'Version:', '1', regular, bold);
}

function drawAsset(page, asset, x, top, width, height) {
  const scale = Math.min(width / asset.width, height / asset.height);
  const w = asset.width * scale;
  const h = asset.height * scale;
  const options = { x: x + (width - w) / 2, y: PAGE_H - top - (height + h) / 2, width: w, height: h };
  if (asset.kind === 'page') page.drawPage(asset.image, options);
  else page.drawImage(asset.image, options);
  return options;
}

function drawCallout(page, decoration, asset, regular, bold, index, total) {
  const columns=Math.min(3,total), width=774/columns-16, x=34+(index%columns)*(774/columns);
  const compact=total>3, top=(compact?428:438)+Math.floor(index/columns)*72;
  const displayPosition = positionName(decoration.position);
  const title = `${String(index + 1).padStart(2, '0')}  ${safeText(displayPosition || 'DECORATION').toUpperCase()}`;
  drawText(page, title, x, top, 9, bold, NAVY, width);
  line(page, x, top + 14, x + width, top + 14, BLUE, 1);
  const imageWidth=compact?60:85, imageHeight=compact?43:76, textX=x+imageWidth+10, textWidth=width-imageWidth-10;
  if (asset) drawAsset(page, asset, x, top + 21, imageWidth, imageHeight);
  else drawText(page, 'No artwork', x, top + 27, 8, regular, GREY, imageWidth);
  drawText(page, decoration.artwork || 'Artwork', textX, top + 21, 8, bold, NAVY, textWidth);
  let widthLabel = 'Size to confirm';
  try {
    const size = asset && artworkSize(decoration, asset.width / asset.height);
    if (size?.confirmed) widthLabel = `${Number(size.width.toFixed(1))} x ${Number(size.height.toFixed(1))} mm`;
  } catch (_) { widthLabel = 'Dimensions need review'; }
  drawText(page, `${printMethod(decoration.method)} / ${widthLabel}`, textX, top + 34, 8, regular, GREY, textWidth);
  const colours = [...(decoration.printColours || []), ...(decoration.threadColours || [])];
  if (colours.length) drawText(page, `Colours: ${colours.join(', ')}`, textX, top + 47, 7, regular, GREY, textWidth);
}


async function buildProof(brief, artworks, { fetchImpl = fetch, date = new Date(), strict = false } = {}) {
  if (!Array.isArray(brief?.products) || !brief.products.length || brief.products.length > 20) throw new Error('A proof needs 1-20 products.');
  const ids = artworks.map(a => a.id);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Each uploaded artwork needs a unique ID.');
  const template = await PDFDocument.load(await fs.readFile(TEMPLATE_PATH));
  // Illustrator otherwise reopens the template's private native document and
  // ignores the proof content added below. Remove it before copyPages so its
  // private streams never enter either the combined or per-product PDF.
  for(const page of template.getPages()){
    page.node.delete(PDFName.of('PieceInfo'));
    page.node.delete(PDFName.of('Thumb'));
    page.node.delete(PDFName.of('LastModified'));
  }
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dateLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
  const embedded = new Map(), assetErrors = new Map(), garments = new Map();
  const loadGarment = async (source, provider) => {
    if (!garments.has(source.url)) {
      const bytes = await fetchGarment(source.url, provider, fetchImpl);
      const analysis = await analyseGarment(bytes);
      const image = await pdf.embedPng(analysis.bytes);
      garments.set(source.url, {...analysis, image, kind:'image', sourceHash:createHash('sha256').update(bytes).digest('hex')});
    }
    return garments.get(source.url);
  };
  for (const artwork of artworks) {
    try { embedded.set(artwork.id, await prepareArtwork(pdf, artwork)); }
    catch (error) { assetErrors.set(artwork.id, error.message); }
  }
  const pages = [], issues = [];
  const issue = (productIndex, decorationId, message, blocking = false) => {
    const item = { productIndex, decorationId, message, blocking };
    issues.push(item); return item;
  };
  for (const [productIndex, product] of brief.products.entries()) {
    const decorations = resolveDecorations(brief, product);
    if (decorations.length > 6) throw new Error(`${product.code} has more than six decoration positions.`);
    const views = product.visual?.views || [];
    const lookupIssue = product.visual?.lookupIssue;
    const supplierUnavailable = lookupIssue === 'supplier_unavailable' && !views.some(v => ['front','back','left','right'].includes(v.view));
    const missingCode = lookupIssue === 'missing_code';
    const catalogueMessages = {
      catalogue_unavailable: 'The Ralawise catalogue is temporarily unavailable. Please try again shortly.',
      product_not_found: 'This style code was not found in the active Ralawise catalogue. Include its Ralawise code in the brief.',
      ambiguous_code: 'This manufacturer code matches several Ralawise garments. Include the exact Ralawise style code in the brief.',
      colour_not_found: 'The requested colour does not match this garment in the Ralawise catalogue. Check the colour name in the brief.',
    };
    const catalogueIssue = catalogueMessages[lookupIssue];
    if (supplierUnavailable) issue(productIndex,null,'Garment image lookup is unavailable. The supplier connection needs attention before this proof can be completed. Your artwork and placement settings do not need changing.',true);
    else if (missingCode) issue(productIndex,null,'The garment style code is missing or ambiguous. Include its exact supplier code in the request.',true);
    else if (catalogueIssue) issue(productIndex,null,catalogueIssue,true);
    const groups = new Map();
    decorations.forEach((d, i) => {
      d.id ||= `product-${productIndex}-decoration-${i}`;
      let view;
      try { view = preferredView(d, views); }
      catch (error) { issue(productIndex,d.id,error.message,true); view = 'front'; }
      if (!groups.has(view)) groups.set(view,[]);
      groups.get(view).push(d);
    });
    if (!groups.size) groups.set('front', []);
    const [page] = await pdf.copyPages(template,[0]); pdf.addPage(page);
    drawHeader(page,brief,product,regular,bold,dateLabel);
    const orderedGroups=[...groups].sort((a,b)=>['front','back','left','right'].indexOf(a[0])-['front','back','left','right'].indexOf(b[0]));
    for (const [viewIndex,[view, marks]] of orderedGroups.entries()) {
      const source = views.find(v => v.view === view);
      let garment = null;
      if (source) {
        try {
          garment = {...await loadGarment(source, product.visual?.source), view};
          let referenceGarment;
          const frontSource=views.find(v=>v.view==='front'&&!v.generated);
          if(['left','right'].includes(view)&&frontSource){
            const front=await loadGarment(frontSource,product.visual?.source);
            referenceGarment={...front,...automaticGarmentProfile(product,front,'front')};
          }
          Object.assign(garment, automaticGarmentProfile(product, garment, view, referenceGarment));
        } catch(error) { issue(productIndex,null,error.message,true); }
      } else if (!supplierUnavailable && !missingCode && !catalogueIssue) issue(productIndex,null,`No verified ${view} view for ${product.code || product.name}. The supplier catalogue needs a matching garment view before this position can be shown.`,true);
      if (!product.visual?.matched && !supplierUnavailable && !missingCode && !catalogueIssue) issue(productIndex,null,'The requested garment colour has not been verified.',true);
      let calibration = product.calibrations?.[view] || {};
      if (garment && Object.keys(calibration).length && calibration.sourceHash !== garment.sourceHash) {
        issue(productIndex,null,'Saved calibration belongs to a different supplier image. Recalibrate this view.',true);
        calibration = {};
      }
      const pageData = {productIndex,pdfPageIndex:productIndex,view,sourceHash:garment?.sourceHash || '',width:garment?.width || 400,height:garment?.height || 500,
        image:garment ? `data:image/png;base64,${garment.bytes.toString('base64')}` : '',generatedView:Boolean(source?.generated),calibration,landmarks:garment?.landmarks,placements:[]};
      const cellWidth=774/groups.size, cellX=34+viewIndex*cellWidth;
      const garmentBox = garment ? drawAsset(page,garment,cellX+8,112,cellWidth-16,270) : null;
      drawText(page,`${view.toUpperCase()} VIEW`,cellX+8,398,10,bold,NAVY,cellWidth-16);
      const methods=[...new Set(marks.map(mark=>printMethod(mark.method)))];
      pageData.printMethods=methods;
      drawText(page,`Print method: ${methods.join(' / ')}`,cellX+8,412,8,bold,GREY,cellWidth-16);
      if (!garment) drawText(page,'Matching view unavailable',cellX+8,245,10,bold,GREY,cellWidth-16);
      if (garment && !garment.confident) issue(productIndex,null,'Garment boundary is uncertain. Check printable regions and placement.');
      for (const d of marks) {
        const artwork = findArtwork(d,artworks), asset = artwork && embedded.get(artwork.id);
        if (!asset) {
          issue(productIndex,d.id,assetErrors.get(artwork?.id) || `Select the uploaded artwork for ${d.position || 'this decoration'}.`,true);
          continue;
        }
        for (const message of asset.warnings) issue(productIndex,d.id,message);
        for (const message of d.dimensionIssues || []) issue(productIndex,d.id,message,true);
        if (!garment) continue;
        try {
          let p = placementFor(d,asset,garment,calibration);
          if (/sleeve/.test(positionName(d.position)) && (!d.anchor || d.anchor === 'region') && !Number(d.offsetXmm) && !Number(d.offsetYmm)) p = fitSleeve(garment,p);
          // Both region-anchored and explicit placements keep exactly the same size.
          if (!fitsRegion(p)) issue(productIndex,d.id,`${d.position}: artwork exceeds the printable region. Adjust its placement, region or calibration; its size has been preserved.`,true);
          if (garment.confident && coverage(garment,p) < .96) issue(productIndex,d.id,`${d.position}: artwork crosses the detected garment edge.`,true);
          if (!p.calibrated) issue(productIndex,d.id,'Automatic scale estimate. A saved measured garment template can refine the mockup scale if needed.');
          if (!p.size.confirmed) issue(productIndex,d.id,'Size to confirm: an 80 mm estimated width is used only for the preview.');
          pageData.placements.push({...p,id:d.id,artworkId:artwork.id,preview:asset.preview});
          // Avoid drawing an invalid oversized overlay through the callouts/header.
          // It stays visible in the interactive editor, with a blocking warning.
          if (p.x-p.width/2>=0 && p.x+p.width/2<=1 && p.y>=0 && p.y+p.height<=1) {
            drawAsset(page,asset,garmentBox.x+(p.x-p.width/2)*garmentBox.width,
              PAGE_H-garmentBox.y-garmentBox.height+p.y*garmentBox.height,p.width*garmentBox.width,p.height*garmentBox.height);
          }
        } catch(error) { issue(productIndex,d.id,error.message,true); }
      }
      for (let i=0;i<pageData.placements.length;i++) for (let j=i+1;j<pageData.placements.length;j++) {
        const a=pageData.placements[i], b=pageData.placements[j];
        if (Math.abs(a.x-b.x)<(a.width+b.width)/2 && a.y<b.y+b.height && b.y<a.y+a.height) {
          issue(productIndex,a.id,'Two artworks overlap in this view. Adjust their positions.',true);
        }
      }
      pages.push(pageData);
    }
    decorations.forEach((d,index)=>{const artwork=findArtwork(d,artworks);drawCallout(page,d,artwork&&embedded.get(artwork.id),regular,bold,index,decorations.length);});
    const blocking=issues.some(i=>i.productIndex===productIndex&&i.blocking);
    const placements=pages.filter(p=>p.productIndex===productIndex).flatMap(p=>p.placements);
    drawText(page,blocking?(supplierUnavailable?'DRAFT - GARMENT IMAGES UNAVAILABLE':'DRAFT - PROOF REQUIRES REVIEW'):placements.length&&placements.every(p=>p.calibrated)?'Calibrated garment scale - verify production dimensions':'INDICATIVE SCALE - automatic garment placement',34,568,8,bold,blocking?rgb(.75,.18,.1):GREY,774);
    drawText(page,'Positions as worn. Artwork callouts are enlarged for inspection. Dimensions describe visible artwork.',34,582,7,regular,GREY,774);
  }
  const uniqueIssues=issues.filter((item,index)=>issues.findIndex(other=>JSON.stringify(other)===JSON.stringify(item))===index);
  if(strict && uniqueIssues.some(i=>i.blocking)) {
    const error=new Error(uniqueIssues.filter(i=>i.blocking).map(i=>i.message).join(' ')); error.issues=uniqueIssues; throw error;
  }
  pdf.setTitle(`${brief.reference || brief.customer || 'Clothing'} proof`); pdf.setAuthor('UPC Branding');
  const documents=[];
  for(const [productIndex,product] of brief.products.entries()){
    const document=await PDFDocument.create();const [sheet]=await document.copyPages(pdf,[productIndex]);document.addPage(sheet);
    document.setTitle(`${product.code} ${colourName(product.colour)} proof`);document.setAuthor('UPC Branding');
    documents.push({productIndex,code:product.code,colour:product.colour,fileName:proofFileName(brief),bytes:Buffer.from(await document.save())});
  }
  return {bytes:Buffer.from(await pdf.save()),documents,pages,issues:uniqueIssues};
}

async function createProofPdf(brief, artworks, options = {}) {
  return (await buildProof(brief,artworks,{...options,strict:true})).bytes;
}
module.exports = {createProofPdf,buildProof,findArtwork,safeText,fetchGarment};
