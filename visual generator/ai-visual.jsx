/* @ts-nocheck */
#target illustrator

// JSON polyfill (for older AI runtimes)
if (typeof JSON === 'undefined') { JSON = {}; }
if (typeof JSON.parse !== 'function') { JSON.parse = function (s) { return eval('(' + s + ')'); }; }

var ROOT_PATH       = '~/Documents/MondayApp/visual generator';
var JOB_CONFIG_PATH = ROOT_PATH + '/VisualJobs/current-job.json';
var COLORS_PATH     = ROOT_PATH + '/VisualJobs/garment-colors.json';
var TEMPLATE_PATH   = ROOT_PATH + '/VisualTemplates/UPC CLOTHING TEMPLATE.ai';
var ARTWORK_ROOT    = ROOT_PATH + '/VisualArtwork';
var OUTPUT_ROOT     = ROOT_PATH + '/VisualOutput';

// ---- helpers ----
function log(m){ $.writeln('[VISUAL] ' + m); }
function ensureFolder(p){ var f=new Folder(p); if(!f.exists) f.create(); return f; }
function readFileJSON(p){
  var f=new File(p);
  if(!f.exists) throw new Error('Missing file: '+p);
  f.open('r');
  var t=f.read();
  f.close();
  return JSON.parse(t);
}
function readColours(){
  try{ return readFileJSON(COLORS_PATH); }
  catch(e){
    log('⚠️ colours missing, using fallback');
    return { 'Black':{r:0,g:0,b:0}, 'White':{r:255,g:255,b:255} };
  }
}

function toAiColor(rgb){ var c=new RGBColor(); c.red=rgb.r; c.green=rgb.g; c.blue=rgb.b; return c; }
function darken(rgb,p){ var f=1-(p/100); return {
  r:Math.max(0,Math.round(rgb.r*f)),
  g:Math.max(0,Math.round(rgb.g*f)),
  b:Math.max(0,Math.round(rgb.b*f))
}; }
function getDate(){
  var n=new Date(), d=n.getDate(), m=n.getMonth()+1, y=n.getFullYear()%100;
  if(d<10)d="0"+d;
  if(m<10)m="0"+m;
  return d+"/"+m+"/"+y;
}

function setTextFrameByName(doc, name, value){
  try{
    var tf=doc.textFrames.getByName(name);
    tf.contents=String(value);
  }catch(e){}
}

// ---- recolour (excluding shading) ----
function recolourPathItem(pi, col){
  try{ pi.filled=true; pi.fillColor=col; }catch(e){}
}
function recolourGroupDeep(g, col, skipNames){
  for(var i=0;i<g.pageItems.length;i++){
    var it=g.pageItems[i];
    var nm=(it.name||"").toUpperCase();
    if(skipNames[nm]) continue;

    if(it.typename==="PathItem") recolourPathItem(it,col);
    else if(it.typename==="CompoundPathItem"){
      for(var k=0;k<it.pathItems.length;k++) recolourPathItem(it.pathItems[k],col);
    } else if(it.typename==="GroupItem"){
      recolourGroupDeep(it,col,skipNames);
    }
  }
}
function recolourLayerExcluding(doc, layerName, col, excludes){
  var layer=null; try{ layer=doc.layers.getByName(layerName);}catch(e){}
  if(!layer){ log("⚠️ missing layer "+layerName); return; }
  var skip={};
  for(var i=0;i<excludes.length;i++) skip[excludes[i].toUpperCase()]=true;
  recolourGroupDeep(layer,col,skip);
}
function recolourGarment(doc, colourName, map){
  var rgb = map[colourName] || {r:255,g:255,b:255};
  var main = toAiColor(rgb);
  var base = toAiColor(darken(rgb,20));

  recolourLayerExcluding(doc,"front_body",      main, ["SHADING"]);
  recolourLayerExcluding(doc,"back_body",       main, ["SHADING"]);
  recolourLayerExcluding(doc,"base_layer_front",base, ["SHADING"]);
  recolourLayerExcluding(doc,"base_layer_back", base, ["SHADING"]);
}

// ---- artwork placement ----
function resolvePlacement(position){
  var p = String(position || "").toUpperCase();
  if (p.indexOf("CHEST")        !== -1) return { layer: "chest_print_layer",   target: "chest_target" };
  if (p.indexOf("LEFT BREAST")  !== -1) return { layer: "left_breast_layer",   target: "left_breast_target" };
  if (p.indexOf("RIGHT BREAST") !== -1) return { layer: "right_breast_layer",  target: "right_breast_target" };
  if (p.indexOf("LARGE BACK")   !== -1) return { layer: "back_print_layer",    target: "back_target" };
  if (p.indexOf("NAPE")         !== -1) return { layer: "outside_nape_layer",  target: "outside_nape_target" };
  throw new Error("Unknown position: " + p);
}

function placeArtworkAt(doc, artworkFile, position){
  if (!artworkFile || !position) return;

  var file = new File(ARTWORK_ROOT + '/' + artworkFile);
  if (!file.exists){
    log('⚠️ artwork missing '+file.fsName);
    return;
  }

  var m = resolvePlacement(position);
  var layer  = doc.layers.getByName(m.layer);
  var target = doc.pageItems.getByName(m.target);

  var placed = layer.placedItems.add();
  placed.file = file; // works for PNG, JPG, AI, EPS, SVG, PDF...

  var scaleX = (target.width  / placed.width)  * 100;
  var scaleY = (target.height / placed.height) * 100;
  var scale  = Math.min(scaleX, scaleY);
  placed.resize(scale, scale);

  placed.left = target.left + (target.width - placed.width) / 2;
  placed.top  = target.top;
  log('Placed ' + position + ' → ' + artworkFile);
}

// Extract original filenames from job.front_art_url / job.back_art_url
function getArtworkNameFromField(field){
  if (!field) return null;
  try {
    var o = JSON.parse(field); // {"files":[{"name":"xyz.svg",...}]}
    if (o.files && o.files.length && o.files[0].name) return o.files[0].name;
  } catch(e) {
    log('⚠️ failed to parse artwork field: ' + e.message);
  }
  return null;
}

// ---- main routine ----
function main(){
  try{
    log('--- Start ---');

    var job     = readFileJSON(JOB_CONFIG_PATH);
    var colours = readColours();
    var doc     = app.open(new File(TEMPLATE_PATH));

    // Header
    setTextFrameByName(doc, "customer",  job.customer || "");
    setTextFrameByName(doc, "job_title", job.job_title || "");
    setTextFrameByName(doc, "ref",       job.job_no || "");
    setTextFrameByName(doc, "date",      getDate());
    if (job.quantity) setTextFrameByName(doc, "job_qty", String(job.quantity));

    // Garment colour
    recolourGarment(doc, job.garment_colour, colours);

    // Print positions & sizes
    var frontPos = (job.front_pos || "").toUpperCase();
    var backPos  = (job.back_pos  || "").toUpperCase();
    setTextFrameByName(doc, "print_position_front", frontPos);
    setTextFrameByName(doc, "print_position_back",  backPos);

    function sizeFor(pos){
      if (pos.indexOf("CHEST")   !== -1) return "280mm";
      if (pos.indexOf("BREAST")  !== -1) return "100mm";
      if (pos.indexOf("BACK")    !== -1) return "300mm";
      if (pos.indexOf("NAPE")    !== -1) return "70mm";
      return "—";
    }
    setTextFrameByName(doc, "print_size_front", sizeFor(frontPos));
    setTextFrameByName(doc, "print_size_back",  sizeFor(backPos));

    // Artwork filenames based on original uploads (supports vector files)
    var frontArtName = getArtworkNameFromField(job.front_art_url);
    var backArtName  = getArtworkNameFromField(job.back_art_url);

    if (frontArtName) placeArtworkAt(doc, frontArtName, job.front_pos);
    if (backArtName)  placeArtworkAt(doc, backArtName,  job.back_pos);

    // ---- EXPORT: compressed but still editable ----
    ensureFolder(OUTPUT_ROOT);
    var proofFile = new File(
      OUTPUT_ROOT + '/' +
      String(job.customer).replace(/[^\w\d_-]+/g, '_') + '_' +
      String(job.job_title).replace(/[^\w\d_-]+/g, '_') + '_proof.pdf'
    );

    var opt = new PDFSaveOptions();

    // Keep visual editable in Illustrator
    opt.preserveEditability = true;

    // Reasonable modern PDF version
    opt.compatibility = PDFCompatibility.ACROBAT6;

    // Compress bitmaps as much as we can without killing quality
    opt.optimization = true;              // fast web view
    opt.generateThumbnails = false;       // smaller file
    opt.compressArt = true;               // compress vector art too

    // Colour images
    opt.colorDownsamplingMethod           = DownsampleMethod.BICUBICDOWNSAMPLE;
    opt.colorDownsampling                 = 150;   // target dpi
    opt.colorDownsamplingImageThreshold   = 225;   // only downsample above this
    opt.colorCompression                  = CompressionQuality.AUTOMATICJPEGMEDIUM;

    // Greyscale images
    opt.grayscaleDownsamplingMethod       = DownsampleMethod.BICUBICDOWNSAMPLE;
    opt.grayscaleDownsampling             = 150;
    opt.grayscaleDownsamplingImageThreshold = 225;
    opt.grayscaleCompression              = CompressionQuality.AUTOMATICJPEGMEDIUM;

    // Monochrome images
    opt.monochromeDownsamplingMethod      = DownsampleMethod.BICUBICDOWNSAMPLE;
    opt.monochromeDownsampling            = 300;
    opt.monochromeDownsamplingImageThreshold = 450;
    opt.monochromeCompression             = MonochromeCompression.CCIT4;

    doc.saveAs(proofFile, opt);
    log('Exported → ' + proofFile.fsName);

    doc.close(SaveOptions.DONOTSAVECHANGES);
    log('--- Done ---');

  } catch(e){
    alert('Error: ' + e.message);
    log('ERROR: ' + e.message);
  }
}

main();
