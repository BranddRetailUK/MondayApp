/* Proof Exporter 1.0 - ES3-compatible, coordinate system: [left, top, right, bottom], Y down. */
var ProofCore = (function () {
    function w(b) { return b[2] - b[0]; }
    function h(b) { return b[3] - b[1]; }
    function area(b) { return Math.max(0, w(b)) * Math.max(0, h(b)); }
    function cx(b) { return (b[0] + b[2]) / 2; }
    function cy(b) { return (b[1] + b[3]) / 2; }
    function union(a, b) { if (!a) return b.slice(0); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }
    function intersection(a, b) { var c = [Math.max(a[0],b[0]), Math.max(a[1],b[1]), Math.min(a[2],b[2]), Math.min(a[3],b[3])]; return w(c) > 0 && h(c) > 0 ? c : null; }
    function contains(a, b, pad) { pad = pad || 0; return b[0] >= a[0]-pad && b[1] >= a[1]-pad && b[2] <= a[2]+pad && b[3] <= a[3]+pad; }
    function overlap(a,b) { var r=intersection(a,b); return r ? area(r)/Math.min(area(a),area(b)) : 0; }
    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ''); }
    function norm(s) { return trim(s).replace(/\s+/g, ' ').toUpperCase(); }
    function parseSize(s) {
        var m = norm(s).match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(MM|CM|INCHES|INCH|IN|\")(?:\s*(HIGH|TALL|HEIGHT|WIDE|WIDTH))?(?=\s|$)/);
        if (!m) return null;
        var n=parseFloat(m[1].replace(',','.')), unit=m[2];
        n *= unit==='CM' ? 10 : (/^(IN|\")/.test(unit) ? 25.4 : 1);
        if (!(n>0 && n<=3000)) return null;
        return {mm:n, axis:/^(HIGH|TALL|HEIGHT)$/.test(m[3]||'')?'height':'width', text:trim(m[0])};
    }
    function position(s) {
        s=norm(s).replace(/\s*\(AS WORN\)\s*/g,'');
        return /^(?:(?:LEFT|RIGHT|CENTRE|CENTER|FULL|UPPER|LOWER|SMALL|LARGE)\s+)*(?:BREAST|CHEST|FRONT|BACK|SLEEVE|LEG|THIGH|NAPE|NECK|POCKET|HOOD|SHOULDER)(?:\s+(?:LEFT|RIGHT|FRONT|BACK|CENTRE|CENTER|TOP|BOTTOM))?$/.test(s) ? s : null;
    }
    function reference(texts, filename) {
        var i,j,m,candidates=[],label, best,dist;
        for(i=0;i<texts.length;i++) {
            m=norm(texts[i].text).match(/\bREF(?:ERENCE)?\.?\s*(?:NO\.?\s*)?:?\s*(\d{3,10})\b/);
            if(m) candidates.push(m[1]);
            if (/^REF(?:ERENCE)?\.?\s*(?:NO\.?\s*)?:?$/.test(norm(texts[i].text))) {
                label=texts[i]; best=null; dist=1e10;
                for(j=0;j<texts.length;j++) if (/^\d{3,10}$/.test(trim(texts[j].text))) {
                    var b=texts[j].b, dy=Math.abs(cy(b)-cy(label.b)), dx=b[0]-label.b[2];
                    if(dy<Math.max(h(label.b),h(b))*1.2 && dx>=-3 && dx<200 && dx+dy*4<dist) {best=trim(texts[j].text); dist=dx+dy*4;}
                }
                if(best) candidates.push(best);
            }
        }
        var unique=[]; for(i=0;i<candidates.length;i++) if(!has(unique,candidates[i])) unique.push(candidates[i]);
        m=String(filename||'').match(/^(\d{3,10})(?:\D|$)/);
        return {value:unique.length===1?unique[0]:(unique.length===0&&m?m[1]:''), conflict:unique.length>1 || (unique.length===1&&m&&m[1]!==unique[0]), fromFilename:unique.length===0};
    }
    function has(a,v) { for(var i=0;i<a.length;i++) if(a[i]===v) return true; return false; }
    function labels(texts) {
        var out=[], sizes=[], i,j;
        for(i=0;i<texts.length;i++) {var z=parseSize(texts[i].text); if(z) sizes.push({size:z,b:texts[i].b,id:i});}
        for(i=0;i<texts.length;i++) {
            var p=position(texts[i].text); if(!p) continue;
            var best=null, score=1e10;
            for(j=0;j<sizes.length;j++) {
                var sb=sizes[j].b, dy=cy(sb)-cy(texts[i].b), dx=Math.abs(sb[0]-texts[i].b[0]);
                if(dy>=-3 && dy<90 && dx<100) {var v=dy+dx*2; if(v<score) {best=sizes[j]; score=v;}}
            }
            if(best) out.push({position:p,mm:best.size.mm,axis:best.size.axis,b:union(texts[i].b,best.b),sizeId:best.id});
        }
        // A size must never silently serve two labels.
        for(i=0;i<out.length;i++) for(j=i+1;j<out.length;j++) if(out[i].sizeId===out[j].sizeId) {out[i].ambiguous=true;out[j].ambiguous=true;}
        return out;
    }
    function colourDistance(a,b) { if(!a||!b) return 100; var d=0;for(var i=0;i<3;i++) d+=(a[i]-b[i])*(a[i]-b[i]);return Math.sqrt(d); }
    function folderMatches(name,ref) { if(!/^\d+$/.test(String(ref)))return false;return new RegExp('(^|[^0-9])'+ref+'([^0-9]|$)').test(String(name)) && !/^\d+\s*-\s*\d+(?:\s|$)/.test(name); }
    function px(mm) { return Math.round(mm/25.4*300); }
    function scale(b,mm,axis) { var dimension=axis==='height'?h(b):w(b); if(dimension<=0) throw Error('Empty artwork'); return (mm*72/25.4)/dimension; }
    function detect(items,texts,page) {
        var ls=labels(texts), seeds=[],garments=[],i,j,k,p;
        for(i=0;i<items.length;i++) {
            p=items[i];
            if(p.kind!=='vector'||!p.filled||p.clip||p.points<7) continue;
            if(w(p.b)>w(page)*0.045 && h(p.b)>h(page)*0.18 && area(p.b)>area(page)*0.012 && area(p.b)<area(page)*0.55) {
                var below=false;for(j=0;j<ls.length;j++) if(p.b[1]>ls[j].b[3]-4) below=true;
                if(below) seeds.push(p);
            }
        }
        seeds.sort(function(a,b){return area(b.b)-area(a.b);});
        for(i=0;i<seeds.length;i++) {
            var g=null;
            for(j=0;j<garments.length;j++) if(overlap(seeds[i].b,garments[j].b)>.82 && area(seeds[i].b)/area(garments[j].b)>.52) {g=garments[j];break;}
            if(!g) {g={b:seeds[i].b.slice(0),seeds:[],palette:[],label:null};garments.push(g);}
            g.seeds.push(seeds[i].id);if(seeds[i].colour) g.palette.push(seeds[i].colour);
        }
        // Assign the nearest label above each silhouette, then resolve collisions explicitly.
        for(i=0;i<garments.length;i++) {
            g=garments[i];var best=null,bestScore=1e10;
            for(j=0;j<ls.length;j++) {
                var dy=g.b[1]-ls[j].b[3], dx=Math.abs(cx(g.b)-cx(ls[j].b));
                if(dy>=-8&&dy<h(page)*.25&&dx<Math.max(w(g.b)*.8,w(page)*.12)) {
                    var score=dx+dy*.3;if(score<bestScore){bestScore=score;best=ls[j];}
                }
            }
            g.label=best;
        }
        var results=[];
        for(i=0;i<ls.length;i++) {
            var matches=[];for(j=0;j<garments.length;j++) if(garments[j].label===ls[i]) matches.push(garments[j]);
            var r={label:ls[i],ids:[],excluded:[],b:null,warnings:[],garment:null,format:'EPS',confidence:'REVIEW'};
            if(matches.length!==1||ls[i].ambiguous) {r.warnings.push('No unique garment/size match. Use manual selection.');results.push(r);continue;}
            g=matches[0];r.garment=g.b;
            for(j=0;j<items.length;j++) {
                p=items[j];if(p.clip || !contains(g.b,p.b,1)) continue;
                if(has(g.seeds,p.id)) {r.excluded.push(p.id);continue;}
                var same=false;
                for(k=0;k<g.palette.length;k++) if(colourDistance(p.colour,g.palette[k])<.055) same=true;
                var big=area(p.b)>area(g.b)*.36 || h(p.b)>h(g.b)*.72 || w(p.b)>w(g.b)*.86;
                var seam=p.kind==='vector' && !p.filled && (h(p.b)>h(g.b)*.16||w(p.b)>w(g.b)*.40);
                var edge=(p.b[0]<g.b[0]+w(g.b)*.025 || p.b[2]>g.b[2]-w(g.b)*.025 || p.b[3]>g.b[3]-h(g.b)*.04);
                if(same||big||seam||edge) {
                    r.excluded.push(p.id);
                    if(same&&!big&&!edge&&!seam) r.warnings.push('Small garment-coloured objects excluded; check for matching-colour print.');
                    continue;
                }
                if(p.kind==='text' && (parseSize(p.text)||position(p.text))) continue;
                r.ids.push(p.id);r.b=union(r.b,p.b);
                if(p.kind==='raster'||p.kind==='placed') r.format='PNG';
                if(p.kind==='unsupported') r.warnings.push('Unsupported appearance/object: use manual selection and inspect output.');
                if(p.effect) r.warnings.push('Transparency/blending present; compare preview carefully.');
            }
            if(!r.ids.length) r.warnings.push('No artwork found. Use manual selection.');
            else {
                if(w(r.b)>w(g.b)*.75||h(r.b)>h(g.b)*.65) r.warnings.push('Artwork occupies a large part of the mockup.');
                // Widely separated islands can indicate a stray seam/detail.
                var clusters=[];
                for(j=0;j<r.ids.length;j++) {for(k=0;k<items.length;k++) if(items[k].id===r.ids[j]) {clusters.push(items[k].b.slice(0));break;}}
                var gap=Math.min(w(g.b),h(g.b))*.09,changed=true;
                while(changed) {changed=false;for(j=0;j<clusters.length&&!changed;j++) for(k=j+1;k<clusters.length;k++) {
                    var a=clusters[j],b=clusters[k];if(a[0]-gap<=b[2]&&a[2]+gap>=b[0]&&a[1]-gap<=b[3]&&a[3]+gap>=b[1]) {clusters[j]=union(a,b);clusters.splice(k,1);changed=true;break;}
                }}
                if(clusters.length>1) r.warnings.push('Separated artwork islands: check all belong to this print.');
                if(!r.warnings.length) r.confidence='GOOD MATCH';
            }
            var uniqueWarnings=[];for(j=0;j<r.warnings.length;j++)if(!has(uniqueWarnings,r.warnings[j]))uniqueWarnings.push(r.warnings[j]);r.warnings=uniqueWarnings;
            results.push(r);
        }
        return results;
    }
    return {w:w,h:h,area:area,cx:cx,cy:cy,union:union,intersection:intersection,contains:contains,parseSize:parseSize,position:position,reference:reference,labels:labels,detect:detect,scale:scale,px:px,folderMatches:folderMatches,trim:trim,has:has};
}());
if (typeof module !== 'undefined' && module.exports) module.exports=ProofCore;
