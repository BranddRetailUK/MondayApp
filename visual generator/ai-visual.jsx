/* @ts-nocheck */
#target illustrator

// JSON polyfill (safe for ExtendScript)
if (typeof JSON === 'undefined') { JSON = {}; }
if (typeof JSON.parse !== 'function') { JSON.parse = function (s) { return eval('(' + s + ')'); }; }
if (typeof JSON.stringify !== 'function') {
  JSON.stringify = function (o) {
    var t = typeof o;
    if (t !== "object" || o === null) {
      if (t === "string") o = '"' + o + '"';
      return String(o);
    } else {
      var json = [], isArr = (o && o.constructor === Array);
      for (var n in o) {
        var v = o[n]; t = typeof v;
        if (t === "string") v = '"' + v + '"';
        else if (t === "object" && v !== null) v = JSON.stringify(v);
        json.push((isArr ? "" : '"' + n + '":') + String(v));
      }
      return (isArr ? "[" : "{") + String(json) + (isArr ? "]" : "}");
    }
  };
}

// ---- PATHS ----
var ROOT_PATH       = '~/Documents/MondayApp/visual generator';
var JOB_CONFIG_PATH = ROOT_PATH + '/VisualJobs/current-job.json';
var COLORS_PATH     = ROOT_PATH + '/VisualJobs/garment-colors.json';
var TEMPLATE_PATH   = ROOT_PATH + '/VisualTemplates/UPC CLOTHING TEMPLATE.ai';
var ARTWORK_ROOT    = ROOT_PATH + '/VisualArtwork';
var OUTPUT_ROOT     = ROOT_PATH + '/VisualOutput';

// ---- helpers ----
function log(m){ $.writeln('[VISUAL] ' + m); }
function ensureFolder(p){ var f=new Folder(p); if(!f.exists) f.create(); return f; }
function readFileJSON(p){ var f=new File(p); if(!f.exists) throw new Error('Missing file: '+p); f.open('r'); var t=f.read(); f.close(); return JSON.parse(t); }
function readColours(){ try{ return readFileJSON(COLORS_PATH); }catch(e){ log('⚠️ colours missing'); return { 'Black':{r:0,g:0,b:0}, 'White':{r:255,g:255,b:255} }; } }

function toAiColor(rgb){ var c=new RGBColor(); c.red=rgb.r; c.green=rgb.g; c.blue=rgb.b; return c; }
function darken(rgb,p){ var f=1-(p/100); return { r:Math.max(0,Math.round(rgb.r*f)), g:Math.max(0,Math.round(rgb.g*f)), b:Math.max(0,Math.round(rgb.b*f)) }; }

function setTextFrameByName(doc, name, value){
  try{ var tf=doc.textFrames.getByName(name); tf.contents=String(value); }catch(e){ log("skip text "+name); }
}
function getDate(){
  var n=new Date(), d=n.getDate(), m=n.getMonth()+1, y=n.getFullYear()%100;
  if(d<10)d="0"+d; if(m<10)m="0"+m; return d+"/"+m+"/"+y;
}

function recolourPathItem(pi, col){ try{ pi.filled=true; pi.fillColor=col; }catch(e){} }
function recolourGroupDeep(g, col){
  for(var i=0;i<g.pageItems.length;i++){
    var it=g.pageItems[i];
    if(it.typename==="PathItem") recolourPathItem(it,col);
    else if(it.typename==="CompoundPathItem"){ for(var k=0;k<it.pathItems.length;k++) recolourPathItem(it.pathItems[k], col); }
    else if(it.typename==="GroupItem") recolourGroupDeep(it,col);
  }
}
function recolourLayer(doc, layerName, aiColor){
  var layer=null; try{ layer=doc.layers.getByName(layerName);}catch(e){}
  if(!layer){ log("⚠️ missing layer "+layerName); return; }
  recolourGroupDeep(layer, aiColor);
}
function recolourGarment(doc, colourName, map){
  var rgb = map[colourName] || {r:255,g:255,b:255};
  var main = toAiColor(rgb);
  var base = toAiColor(darken(rgb,20));
  recolourLayer(doc, "front_body", main);
  recolourLayer(doc, "back_body",  main);
  recolourLayer(doc, "base_layer_front", base);
  recolourLayer(doc, "base_layer_back",  base);
}

// placement mapping
function resolvePlacement(position){
  var p = String(position || "").toUpperCase();
  if (p.indexOf("CHEST") !== -1)        return { layer: "chest_print_layer",   target: "chest_target" };
  if (p.indexOf("LEFT BREAST") !== -1)  return { layer: "left_breast_layer",   target: "left_breast_target" };
  if (p.indexOf("RIGHT BREAST") !== -1) return { layer: "right_breast_layer",  target: "right_breast_target" };
  if (p.indexOf("LARGE BACK") !== -1)   return { layer: "back_print_layer",    target: "back_target" };
  if (p.indexOf("NAPE") !== -1)         return { layer: "outside_nape_layer",  target: "outside_nape_target" };
  throw new Error("Unknown position: " + p);
}

function placeArtworkAt(doc, artworkFile, position){
  if (!artworkFile || !position) return;
  var file = new File(ARTWORK_ROOT + '/' + artworkFile);
  if (!file.exists){ log('⚠️ artwork missing '+file.fsName); return; }

  var m = resolvePlacement(position);
  var layer = doc.layers.getByName(m.layer);
  var target = doc.pageItems.getByName(m.target);
  var placed = layer.placedItems.add();
  placed.file = file;

  var scaleX = (target.width / placed.width) * 100;
  var scaleY = (target.height / placed.height) * 100;
  var scale = Math.min(scaleX, scaleY);
  placed.resize(scale, scale);
  placed.left = target.left + (target.width - placed.width) / 2;
  placed.top  = target.top;
  log('Placed ' + position + ' → ' + artworkFile);
}

// ---- main routine ----
function main(){
  try{
    log('--- Start ---');
    var job = readFileJSON(JOB_CONFIG_PATH);
    var colours = readColours();
    var doc = app.open(new File(TEMPLATE_PATH));

    // Header info
    setTextFrameByName(doc, "customer",  job.customer || "");
    setTextFrameByName(doc, "job_title", job.job_title || "");
    setTextFrameByName(doc, "ref",       job.job_no || "");
    setTextFrameByName(doc, "date",      getDate());
    if (job.quantity) setTextFrameByName(doc, "job_qty", String(job.quantity));

    // Garment colour
    recolourGarment(doc, job.garment_colour, colours);

    // Print positions and sizes
    var frontPos = (job.front_pos || "").toUpperCase();
    var backPos  = (job.back_pos  || "").toUpperCase();
    setTextFrameByName(doc, "print_position_front", frontPos);
    setTextFrameByName(doc, "print_position_back",  backPos);

    function sizeFor(pos){
      if (pos.indexOf("CHEST") !== -1) return "280mm";
      if (pos.indexOf("BREAST") !== -1) return "100mm";
      if (pos.indexOf("BACK")   !== -1) return "300mm";
      if (pos.indexOf("NAPE")   !== -1) return "70mm";
      return "—";
    }
    setTextFrameByName(doc, "print_size_front", sizeFor(frontPos));
    setTextFrameByName(doc, "print_size_back",  sizeFor(backPos));

    // Artwork placement from downloaded files
    if (File(ARTWORK_ROOT + '/front_art.png').exists)
      placeArtworkAt(doc, 'front_art.png', job.front_pos);
    if (File(ARTWORK_ROOT + '/back_art.png').exists)
      placeArtworkAt(doc, 'back_art.png', job.back_pos);

    // Export proof
    ensureFolder(OUTPUT_ROOT);
    var proofFile = new File(
      OUTPUT_ROOT + '/' +
      String(job.customer).replace(/[^\w\d_-]+/g, '_') + '_' +
      String(job.job_title).replace(/[^\w\d_-]+/g, '_') + '_proof.pdf'
    );
    var opt = new PDFSaveOptions();
    opt.preserveEditability = false;
    doc.saveAs(proofFile, opt);
    log('Exported → ' + proofFile.fsName);

    doc.close(SaveOptions.DONOTSAVECHANGES);
    log('--- Done ---');
  }catch(e){
    alert('Error: ' + e.message);
    log('ERROR: ' + e.message);
  }
}

main();
