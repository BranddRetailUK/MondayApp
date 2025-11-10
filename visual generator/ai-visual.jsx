/* @ts-nocheck */
#target illustrator

// JSON polyfill
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
function readJob(){ var j=readFileJSON(JOB_CONFIG_PATH); log('Loaded job '+j.itemId); return j; }
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
function recolourGroupDeep(g, col, excludeCI){
  for(var i=0;i<g.pageItems.length;i++){
    var it=g.pageItems[i]; var nm=(it.name||"").toLowerCase();
    if(excludeCI[nm]) continue;
    if(it.typename==="PathItem") recolourPathItem(it,col);
    else if(it.typename==="CompoundPathItem"){ for(var k=0;k<it.pathItems.length;k++) recolourPathItem(it.pathItems[k], col); }
    else if(it.typename==="GroupItem") recolourGroupDeep(it,col,excludeCI);
  }
}
function recolourLayerByNameExcluding(doc, layerName, aiColor, excluded){
  var layer=null; try{ layer=doc.layers.getByName(layerName);}catch(e){}
  if(!layer){ log("⚠️ missing layer "+layerName); return; }
  var ex={}; for(var i=0;i<excluded.length;i++){ ex[String(excluded[i]).toLowerCase()]=true; }

  for(var p=0;p<layer.pageItems.length;p++){ var it=layer.pageItems[p]; var nm=(it.name||"").toLowerCase(); if(ex[nm]) continue;
    if(it.typename==="PathItem") recolourPathItem(it, aiColor);
    else if(it.typename==="CompoundPathItem"){ for(var q=0;q<it.pathItems.length;q++) recolourPathItem(it.pathItems[q], aiColor); }
    else if(it.typename==="GroupItem") recolourGroupDeep(it, aiColor, ex);
  }
  for(var s=0;s<layer.layers.length;s++){ var sub=layer.layers[s]; var sn=(sub.name||"").toLowerCase(); if(ex[sn]) continue;
    for(var sp=0;sp<sub.pageItems.length;sp++){ var si=sub.pageItems[sp]; var sn2=(si.name||"").toLowerCase(); if(ex[sn2]) continue;
      if(si.typename==="PathItem") recolourPathItem(si, aiColor);
      else if(si.typename==="CompoundPathItem"){ for(var t=0;t<si.pathItems.length;t++) recolourPathItem(si.pathItems[t], aiColor); }
      else if(si.typename==="GroupItem") recolourGroupDeep(si, aiColor, ex);
    }
  }
}

function recolourGarment(doc, colourName, map){
  var rgb = map[colourName] || {r:255,g:255,b:255};
  var main = toAiColor(rgb);
  var base = toAiColor(darken(rgb,20));
  recolourLayerByNameExcluding(doc, "front_body", main, []);
  recolourLayerByNameExcluding(doc, "back_body",  main, []);
  recolourLayerByNameExcluding(doc, "base_layer_front", base, ["SHADING"]);
  recolourLayerByNameExcluding(doc, "base_layer_back",  base, ["SHADING"]);
}

// position mapping → {layer, target}
function resolvePlacement(position){
  var p = String(position || "");
  if (p === "Chest")        return { layer: "chest_print_layer",   target: "chest_target" };
  if (p === "Left Breast")  return { layer: "left_breast_layer",   target: "left_breast_target" };
  if (p === "Right Breast") return { layer: "right_breast_layer",  target: "right_breast_target" };
  if (p === "Large Back")   return { layer: "back_print_layer",    target: "back_target" };
  if (p === "Outside Nape") return { layer: "outside_nape_layer",  target: "outside_nape_target" };
  throw new Error("Unknown position: " + p);
}

function placeArtworkAt(doc, artworkFileName, position){
  if (!artworkFileName) throw new Error("Missing artwork file for " + position);
  var file = new File(ARTWORK_ROOT + '/' + artworkFileName);
  if (!file.exists) throw new Error('Artwork not found: ' + file.fsName);

  var m = resolvePlacement(position);
  var layer = doc.layers.getByName(m.layer);
  var target = doc.pageItems.getByName(m.target);

  var placed = layer.placedItems.add();
  placed.file = file;

  var maxW = target.width, maxH = target.height;
  var scaleX = (maxW / placed.width) * 100;
  var scaleY = (maxH / placed.height) * 100;
  var scale = Math.min(scaleX, scaleY);
  placed.resize(scale, scale);

  // center horizontally; align top to target top
  placed.left = target.left + (target.width - placed.width) / 2;
  placed.top  = target.top;

  log('Placed ' + position + ' → ' + artworkFileName);
}

// --- NEW: classic trim/polyfill + filename helpers ---
function sTrim(v){ return String(v).replace(/^\s+|\s+$/g, ""); }
function safeName(s){
  s = String(s).replace(/[\/\\:*?"<>|]+/g, "");
  return s.replace(/\s+/g, "_");
}

// --- print info updater (positions uppercased) ---
function updatePrintInfo(doc, job){
  var placements = job.placements || [];

  function findPos(names){
    for (var i=0;i<placements.length;i++){
      var p = placements[i] && String(placements[i].position || "");
      for (var j=0;j<names.length;j++){
        if (p === names[j]) return p;
      }
    }
    return null;
  }

  var frontPos = findPos(["Chest","Left Breast","Right Breast"]);
  var backPos  = findPos(["Large Back","Outside Nape"]);

  function sizeFor(position){
    if (!position) return null;
    if (position === "Chest") return "280mm";
    if (position === "Left Breast" || position === "Right Breast") return "100mm";
    if (position === "Large Back") return "300mm";
    if (position === "Outside Nape") return "70mm";
    return null;
  }

  setTextFrameByName(doc, "print_position_front", frontPos ? frontPos.toUpperCase() : "—");
  setTextFrameByName(doc, "print_size_front",     sizeFor(frontPos) || "—");

  setTextFrameByName(doc, "print_position_back",  backPos ? backPos.toUpperCase() : "—");
  setTextFrameByName(doc, "print_size_back",      sizeFor(backPos) || "—");
}

function exportProof(doc, job){
  ensureFolder(OUTPUT_ROOT);

  var customer = job.customer || job.customerName || "";
  var title    = job.jobTitle || job.job_title || "";
  var fromJob  = (job.outputFilename != null) ? sTrim(job.outputFilename) : "";

  var filename = fromJob
    ? fromJob
    : safeName(customer) + "_" + safeName(title) + "_proof.pdf";

  var out = new File(OUTPUT_ROOT + '/' + filename);
  var opt = new PDFSaveOptions();
  opt.preserveEditability = false;
  doc.saveAs(out, opt);
  log('Exported → ' + out.fsName);
}

function main(){
  try{
    log('--- Start ---');
    var job = readJob();
    var colours = readColours();
    var doc = app.open(new File(TEMPLATE_PATH));

    // header text
    var customer = job.customer || job.customerName || "";
    var jobTitle = job.jobTitle || "";
    var ref      = job.ref || "";
    var qty      = job.quantity != null ? String(job.quantity) : "";
    setTextFrameByName(doc, "customer",  customer);
    setTextFrameByName(doc, "job_title", jobTitle);
    setTextFrameByName(doc, "ref",       ref);
    setTextFrameByName(doc, "job_qty",   qty);
    setTextFrameByName(doc, "date",      getDate());

    // garment colours
    recolourGarment(doc, job.garmentColour, colours);

    // placements (artwork)
    for (var i=0; i<(job.placements||[]).length; i++){
      var p = job.placements[i];
      if (!p || !p.position || p.position === "None") continue;
      placeArtworkAt(doc, p.artworkFile, p.position);
    }

    // print info tables
    updatePrintInfo(doc, job);

    // export & close
    exportProof(doc, job);
    doc.close(SaveOptions.DONOTSAVECHANGES);
    log('--- Done ---');
  }catch(e){
    alert('Error: ' + e.message);
    log('ERROR: ' + e.message);
  }
}

main();
