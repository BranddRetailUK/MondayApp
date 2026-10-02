#target illustrator
/* Proof Artwork Exporter 1.14 - Windows Illustrator desktop.
   Keep proof-core.js and png-helper.ps1 beside this file. Source documents are never saved/edited.
*/
(function () {
    var home=File($.fileName).parent, source=null, proofFile=null, work=null, busy=null, temporary=null, errors=[], exported=[], trace=null, snapshotCount=0, preparedDocuments=[];
    var hubJob=$.global.__ultimatePrintJob||null,hubOpened=false,hubFiles=[],hubOutcome='needs_attention',hubMessage='Export cancelled or incomplete.';
    $.global.__ultimatePrintJob=null;
    function hubProgress(phase,message) {
        if(!hubJob)return;
        write(new File(hubJob.progressPath),phase+'\n'+message);
    }
    function checkHubCancellation() {
        if(hubJob && new File(hubJob.cancelPath).exists)throw Error('Export cancelled: approval changed or worker lost contact.');
    }
    function hubConfig(ref) {
        if(!/^\d{5,10}$/.test(hubJob.reference)||Number(hubJob.reference)<28300)throw Error('Ineligible queued reference.');
        // Hub DES/PSG is authoritative: reused proofs may retain old references and filenames.
        // Validate the resolved design folder, never substitute the proof's printed reference.
        var folder=new Folder(hubJob.designFolder);
        if(!folder.exists||!ProofCore.folderMatches(folder.name,hubJob.reference))throw Error('Invalid queued design folder.');
        if(proofFile.parent.fsName.toLowerCase()!==folder.fsName.toLowerCase())throw Error('Proof is outside the queued design folder.');
        return {ref:hubJob.reference,root:folder,manual:false};
    }
    function ensureSourceReady() {
        if(hubJob) {
            // Imported PDFs can appear unsaved in Illustrator. The queued source
            // file is already on disk and is what the snapshot exporter copies.
            if(!proofFile.exists)throw Error('The queued proof is no longer available on disk.');
        } else {
            if(!source.saved)throw Error('Save the proof in Illustrator before running this version. It processes a temporary copy of the saved file.');
            proofFile=source.fullName;
            if(!proofFile.exists)throw Error('The saved proof is not available on disk.');
        }
    }
    var originalInteraction=app.userInteractionLevel, originalCoordinates=app.coordinateSystem, originalPdfPage=app.preferences.PDFFileOptions.pageToOpen, stage='Starting';
    function openProof(file,page) {
        if(/\.pdf$/i.test(file.name))app.preferences.PDFFileOptions.pageToOpen=page;
        return app.open(file);
    }
    function failure(e) {return stage+': '+e.message+(e.line?' (line '+e.line+')':'');}
    function read(f) {f.encoding='UTF-8';if(!f.open('r'))throw Error('Cannot read '+f.fsName);var s=f.read();f.close();return s.replace(/^\uFEFF/,'').replace(/\u0000/g,'');}
    function write(f,s) {f.encoding='UTF-8';if(!f.open('w')) throw Error('Cannot write '+f.fsName);f.write(s);f.close();}
    function xml(s) {return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}
    function safe(s) {return String(s).replace(/[^A-Za-z0-9_.-]+/g,'_').replace(/^_+|_+$/g,'');}
    function vb(s) {return '"'+String(s).replace(/"/g,'""')+'"';}
    function quoted(s) {if(/["\r\n]/.test(s)) throw Error('Unsupported quote/newline in file path');return '"'+s+'"';}
    function bounds(item) {var b=item.visibleBounds;return [b[0],-b[1],b[2],-b[3]];}
    function aiRect(b) {return [b[0],-b[1],b[2],-b[3]];}
    function clipItem(p) {try {if(p.typename==='PathItem') return p.clipping;if(p.typename==='CompoundPathItem'&&p.pathItems.length) return p.pathItems[0].clipping;}catch(e){}return false;}
    function hidden(p) {try {return p.hidden || (p.typename==='Layer'&&!p.visible);}catch(e){return false;}}
    function children(parent) {
        var out=[],i;if(!parent.pageItems) return out;
        for(i=0;i<parent.pageItems.length;i++) if(parent.pageItems[i].parent===parent) out.push(parent.pageItems[i]);
        return out;
    }
    function colour(c) {
        if(!c) return null;
        if(c.typename==='RGBColor') return [c.red/255,c.green/255,c.blue/255];
        if(c.typename==='CMYKColor') return [(1-c.cyan/100)*(1-c.black/100),(1-c.magenta/100)*(1-c.black/100),(1-c.yellow/100)*(1-c.black/100)];
        if(c.typename==='GrayColor') return [1-c.gray/100,1-c.gray/100,1-c.gray/100];
        if(c.typename==='SpotColor') {var base=colour(c.spot.color);if(base) for(var i=0;i<3;i++) base[i]=1-(1-base[i])*c.tint/100;return base;}
        return null;
    }
    function model(doc) {
        var roots=[],leaves=[],texts=[],next=0;
        function node(p,inheritedEffect,inheritedClip,inheritedMask) {
            if(hidden(p)) return null;
            var n={item:p,id:next++,kids:[],clip:clipItem(p)},t=p.typename;
            var effect=inheritedEffect;
            try {effect=effect||p.opacity!==100||p.blendingMode!==BlendModes.NORMAL;}catch(e){}
            if(t==='GroupItem') {
                var cc=children(p),mask=inheritedMask;
                if(p.clipped)for(var k=0;k<cc.length;k++)if(clipItem(cc[k])) {
                    var gb=cc[k].geometricBounds,localMask=[gb[0],-gb[1],gb[2],-gb[3]];
                    mask=mask?ProofCore.intersection(mask,localMask):localMask;
                    if(!mask)return null;
                    break;
                }
                for(var i=0;i<cc.length;i++) {var sub=node(cc[i],effect,inheritedClip||p.clipped,mask);if(sub) n.kids.push(sub);}
            } else {
                var b;try {b=bounds(p);}catch(e){return null;}
                if(inheritedMask)b=ProofCore.intersection(b,inheritedMask);
                if(!b)return null;
                var sample=p, kind='unsupported',filled=false,points=0,col=null;
                if(t==='CompoundPathItem'&&p.pathItems.length) sample=p.pathItems[0];
                if(t==='PathItem'||t==='CompoundPathItem') {
                    kind='vector';try {if(sample.guides) return null;filled=sample.filled;col=colour(filled?sample.fillColor:sample.strokeColor);points=sample.pathPoints.length;if(!filled&&!sample.stroked&&!n.clip)return null;}catch(e){}
                } else if(t==='TextFrame') kind='text';
                else if(t==='RasterItem') kind='raster';
                else if(t==='PlacedItem') kind='placed';
                var entry={id:n.id,b:b,kind:kind,filled:filled,points:points,colour:col,clip:n.clip,clipGroup:!!inheritedClip,effect:effect,text:t==='TextFrame'?p.contents:''};
                n.entry=entry;leaves.push(entry);
                if(t==='TextFrame') {
                    var lines=p.contents.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
                    for(var k=0;k<lines.length;k++) if(ProofCore.trim(lines[k])) texts.push({text:lines[k],b:[b[0],b[1]+ProofCore.h(b)*k/lines.length,b[2],b[1]+ProofCore.h(b)*(k+1)/lines.length]});
                }
            }
            return n;
        }
        function layer(l) {
            if(!l.visible) return;
            var cc=children(l);for(var j=0;j<cc.length;j++) {var n=node(cc[j],false,false,null);if(n) roots.push(n);}
            for(j=0;j<l.layers.length;j++) layer(l.layers[j]);
        }
        for(var i=0;i<doc.layers.length;i++) layer(doc.layers[i]);
        return {roots:roots,leaves:leaves,texts:texts};
    }
    function mark(n,ids) {
        n.keep=!!ids['i'+n.id];
        for(var i=0;i<n.kids.length;i++) if(mark(n.kids[i],ids)) n.keep=true;
        return n.keep;
    }
    function retain(n) {
        try {n.item.locked=false;}catch(e){}
        for(var i=n.kids.length-1;i>=0;i--) {
            var child=n.kids[i];
            if(child.keep || (n.item.clipped && child.clip)) retain(child);
            else {try{child.item.locked=false;}catch(e){}child.item.remove();}
        }
    }
    function checkpoint(s) {
        stage=s;
        checkHubCancellation();hubProgress('processing',s);
        if(busy){busy.message.text=s;busy.update();}
        if(trace) {trace.encoding='UTF-8';if(trace.open('a')){trace.writeln(new Date().toString()+' | '+s);trace.close();}}
    }
    function snapshotIds(original,reopened,ids) {
        if(original.leaves.length!==reopened.leaves.length)throw Error('Saved proof differs from the open proof. Save as an AI file, reopen it and rerun.');
        var selected={},i,j;
        for(i=0;i<original.leaves.length;i++) {
            var a=original.leaves[i],b=reopened.leaves[i];
            if(a.kind!==b.kind || a.text!==b.text)throw Error('Saved proof object order differs. Save as AI, reopen it and rerun.');
            for(j=0;j<4;j++)if(Math.abs(a.b[j]-b.b[j])>.1)throw Error('Saved proof geometry differs. Save as AI, reopen it and rerun.');
            if(ProofCore.has(ids,a.id))selected['i'+b.id]=true;
        }
        return selected;
    }
    function painted(p) {
        if(p._proofDocument){var all=null;for(var q=0;q<p._proofDocument.layers.length;q++){var lb=layerBounds(p._proofDocument.layers[q]);if(lb)all=ProofCore.union(all,lb);}return all;}
        if(hidden(p)||clipItem(p)) return null;
        if(p.typename!=='GroupItem') return bounds(p);
        var cc=children(p),b=null,mask=null;
        for(var i=0;i<cc.length;i++) {
            if(clipItem(cc[i])) {var z=cc[i].geometricBounds;mask=[z[0],-z[1],z[2],-z[3]];}
            else {var c=painted(cc[i]);if(c)b=ProofCore.union(b,c);}
        }
        return b&&p.clipped&&mask ? ProofCore.intersection(b,mask) : b;
    }
    function layerBounds(l) {
        if(!l.visible)return null;
        var b=null,cc=children(l),i;
        for(i=0;i<cc.length;i++){var v=painted(cc[i]);if(v)b=ProofCore.union(b,v);}
        for(i=0;i<l.layers.length;i++){var z=layerBounds(l.layers[i]);if(z)b=ProofCore.union(b,z);}
        return b;
    }
    function transformDocument(doc,scale) {
        // Transform top-level objects around ONE origin. No duplicate/move/group operations.
        function layer(l){if(!l.visible)return;var cc=children(l);for(var i=0;i<cc.length;i++)cc[i].resize(scale,scale,true,true,true,true,scale,Transformation.DOCUMENTORIGIN);for(i=0;i<l.layers.length;i++)layer(l.layers[i]);}
        for(var i=0;i<doc.layers.length;i++)layer(doc.layers[i]);
    }
    function makeArtwork(m,r) {
        checkpoint('Copying saved proof bytes for '+r.label.position);
        var extension=proofFile.name.match(/\.[^.]+$/)[0];
        var snap=new File(temporary.fsName+'/snapshot-'+(++snapshotCount)+extension);
        if(!proofFile.copy(snap.fsName))throw Error('Could not create temporary proof snapshot.');
        checkpoint('Opening temporary proof for '+r.label.position);
        var doc=openProof(snap,r.pageNumber||1);work=doc;doc.activate();
        checkpoint('Checking saved proof matches open proof');
        var local=model(doc),ids=snapshotIds(m,local,r.ids),i;
        function unlock(l){l.locked=false;for(var j=0;j<l.layers.length;j++)unlock(l.layers[j]);}
        for(i=0;i<doc.layers.length;i++)unlock(doc.layers[i]);
        checkpoint('Removing non-print objects for '+r.label.position);
        for(i=0;i<local.roots.length;i++)mark(local.roots[i],ids);
        for(i=local.roots.length-1;i>=0;i--){var root=local.roots[i];try{root.item.locked=false;}catch(e){}if(root.keep)retain(root);else root.item.remove();}
        checkpoint('Embedding retained links');
        // Check retained links before embedding the snapshot.
        for(i=doc.placedItems.length-1;i>=0;i--){var placed=doc.placedItems[i];try{if(!placed.file.exists)throw Error('missing');}catch(e){throw Error('A linked file is unavailable in the snapshot. Embed it in a saved AI proof first.');}placed.embed();}
        r.format=doc.rasterItems.length?'PNG':'EPS';
        var group={_proofDocument:doc,resize:function(scale){checkpoint('Scaling '+r.label.position);transformDocument(doc,scale);}};
        checkpoint('Measuring isolated '+r.label.position);
        var b=painted(group);if(!b||ProofCore.w(b)<=0||ProofCore.h(b)<=0)throw Error('Artwork has empty bounds.');
        // Keep the selected AI artboard's page geometry when removing the others.
        var chosen=doc.artboards[r.artboardIndex||0].artboardRect;
        doc.artboards[0].artboardRect=chosen;
        while(doc.artboards.length>1)doc.artboards[doc.artboards.length-1].remove();
        doc.artboards.setActiveArtboardIndex(0);
        return {doc:doc,group:group,b:b};
    }
    function closeWork() {if(work) {try {work.close(SaveOptions.DONOTSAVECHANGES);}catch(e){}work=null;}}
    function capture(a,file,b,res,transparent) {
        checkpoint('Setting PNG capture bounds');a.doc.activate();
        if(!b||!isFinite(ProofCore.w(b))||!isFinite(ProofCore.h(b))||ProofCore.w(b)<=0||ProofCore.h(b)<=0)throw Error('Invalid PNG bounds');
        a.doc.artboards[0].artboardRect=aiRect(b);
        checkpoint('Rendering PNG using exportFile');
        var options=new ExportOptionsPNG24();options.antiAliasing=true;options.transparency=transparent;options.artBoardClipping=true;
        options.horizontalScale=res/72*100;options.verticalScale=res/72*100;
        options.matte=!transparent;var c=new RGBColor();c.red=88;c.green=88;c.blue=88;options.matteColor=c;
        try {a.doc.exportFile(file,ExportType.PNG24,options);}
        catch(firstError) {
            checkpoint('Rendering PNG using imageCapture fallback');
            var fallback=new ImageCaptureOptions();fallback.resolution=res;fallback.antiAliasing=true;fallback.transparency=transparent;fallback.matte=!transparent;fallback.matteColor=c;
            try {a.doc.imageCapture(file,aiRect(b),fallback);}catch(secondError){throw Error('exportFile: '+firstError.message+'; imageCapture: '+secondError.message);}
        }
        if(!file.exists) throw Error('Illustrator did not create the PNG.');
    }
    function status(s) {if(busy){busy.message.text=s;busy.update();}app.redraw();}
    function helper(mode,input,output,axis,mm) {
        var ps=new File(home.fsName+'/png-helper.ps1');if(!ps.exists) throw Error('png-helper.ps1 is missing. Keep all files together.');
        var stem=temporary.fsName+'/job-'+new Date().getTime()+'-'+Math.floor(Math.random()*100000),job=new File(stem+'.xml'),result=new File(job.fsName+'.result');
        write(job,'<job><mode>'+xml(mode)+'</mode><input>'+xml(input.fsName)+'</input><output>'+xml(output?output.fsName:'')+'</output><axis>'+xml(axis||'width')+'</axis><mm>'+xml(mm||1)+'</mm></job>');
        var shell=new File(stem+'.vbs');
        var win=$.getenv('SystemRoot')||'C:\\Windows';
        var command=quoted(win+'\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')+' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File '+quoted(ps.fsName)+' -JobFile '+quoted(job.fsName);
        shell.encoding='UTF-16';if(!shell.open('w'))throw Error('Cannot write PNG helper launcher.');
        // Exec exposes stderr; Run only returned the generic process exit code.
        var launch='On Error Resume Next\r\nDim sh, proc, code, fso, errorFile, launchError, stderrText, stdoutText, stream\r\nSet sh = CreateObject("WScript.Shell")\r\nSet proc = sh.Exec('+vb(command)+')\r\nlaunchError = Err.Description\r\nIf Err.Number = 0 Then\r\nstderrText = proc.StdErr.ReadAll\r\nstdoutText = proc.StdOut.ReadAll\r\ncode = proc.ExitCode\r\nEnd If\r\nSet fso = CreateObject("Scripting.FileSystemObject")\r\nIf Not fso.FileExists('+vb(result.fsName)+') Then\r\nlaunchError = "ERROR" & vbLf & "PowerShell exit code: " & code & vbLf & launchError & vbLf & stderrText & vbLf & stdoutText\r\nSet stream = CreateObject("ADODB.Stream")\r\nstream.Type = 2\r\nstream.Charset = "utf-8"\r\nstream.Open\r\nstream.WriteText launchError\r\nstream.SaveToFile '+vb(result.fsName+'.tmp')+', 2\r\nstream.Close\r\nIf Not fso.FileExists('+vb(result.fsName+'.tmp')+') Then\r\nSet errorFile = fso.CreateTextFile('+vb(result.fsName+'.tmp')+', True, False)\r\nerrorFile.Write launchError\r\nerrorFile.Close\r\nEnd If\r\nfso.MoveFile '+vb(result.fsName+'.tmp')+', '+vb(result.fsName)+'\r\nEnd If\r\n';
        shell.write('\uFEFF'+launch);shell.close();
        if(!shell.execute()) throw Error('Windows could not launch the PNG helper. See README.');
        var start=new Date().getTime();while(!result.exists) {if(new Date().getTime()-start>45000) throw Error('PNG helper exceeded 45 seconds. See the progress log and README.');$.sleep(100);if(busy)busy.update();}
        var lines=read(result).split(/\r?\n/);if(lines[0]!=='OK') throw Error('PNG helper: '+lines.slice(1).join('\n'));return lines;
    }
    function preview(r,index) {
        var a=makeArtwork(r.model,r),b=a.b,pad=Math.max(ProofCore.w(b),ProofCore.h(b))*.06;
        b=[b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad];
        // Change raster sampling density, not the imported vector/clipping geometry.
        var res=Math.min(2400,Math.max(72,550*72/Math.max(ProofCore.w(b),ProofCore.h(b))));
        var f=new File(temporary.fsName+'/preview-'+index+'.png');capture(a,f,b,res,false);
        if(/windows/i.test($.os))try {
            var fingerprintFile=new File(temporary.fsName+'/fingerprint-'+index+'.png');capture(a,fingerprintFile,b,res,true);
            r.fingerprint=helper('fingerprint',fingerprintFile,null,r.label.axis,r.label.mm)[1];
        } catch(fingerprintError) {r.fingerprint=null;}
        r.prepared=a;preparedDocuments.push(a.doc);work=null;return f;
    }
    function selectedIds(m) {
        var ids=[], selection=source.selection;if(!selection||typeof selection.length==='undefined') return ids;
        function check(n,included) {
            for(var j=0;j<selection.length;j++) if(selection[j]===n.item) included=true;
            // Direct-selected compound subpaths should select the complete compound path (holes preserved).
            if(n.item.typename==='CompoundPathItem') for(j=0;j<selection.length;j++) if(selection[j].parent===n.item) included=true;
            if(!n.kids.length && included && !n.clip) ids.push(n.id);
            for(var i=0;i<n.kids.length;i++) check(n.kids[i],included);
        }
        for(var i=0;i<m.roots.length;i++) check(m.roots[i],false);return ids;
    }
    function manualRow(m,ls) {
        var ids=selectedIds(m);if(!ids.length) throw Error('Select the print artwork in Illustrator, then run again and choose Selected artwork.');
        var d=new Window('dialog','Selected artwork'),p=d.add('dropdownlist',undefined,[]);p.minimumSize.width=350;
        for(var i=0;i<ls.length;i++) p.add('item',ls[i].position+' - '+ls[i].mm+'mm '+ls[i].axis);
        p.add('item','Enter position and size manually');p.selection=0;
        var row=d.add('group');row.add('statictext',undefined,'Position');var name=row.add('edittext',undefined,ls.length?ls[0].position:'FRONT');name.characters=24;
        row=d.add('group');row.add('statictext',undefined,'Size');var size=row.add('edittext',undefined,ls.length?String(ls[0].mm):'100');size.characters=8;row.add('statictext',undefined,'mm');var axis=row.add('dropdownlist',undefined,['width','height']);axis.selection=ls.length&&ls[0].axis==='height'?1:0;
        p.onChange=function(){if(p.selection.index<ls.length){var l=ls[p.selection.index];name.text=l.position;size.text=String(l.mm);axis.selection=l.axis==='height'?1:0;}};
        row=d.add('group');row.add('button',undefined,'Cancel',{name:'cancel'});var ok=row.add('button',undefined,'Continue',{name:'ok'});
        ok.onClick=function(){if(!safe(name.text)||!/^\d+(?:[.,]\d+)?$/.test(size.text)||!ProofCore.parseSize(size.text+'mm')) {alert('Enter a position and a size greater than 0 and no more than 3000mm.');return;}d.close(1);};
        if(d.show()!==1) return null;
        var r={ids:ids,label:{position:name.text,mm:parseFloat(size.text.replace(',','.')),axis:axis.selection.text},format:'EPS',warnings:['Manual selection: check that only the print is included.'],confidence:'MANUAL',enabled:true};
        for(i=0;i<m.leaves.length;i++) if(ProofCore.has(ids,m.leaves[i].id)&&(m.leaves[i].kind==='raster'||m.leaves[i].kind==='placed')) r.format='PNG';
        return r;
    }
    function settings(ref) {
        var config=new File(Folder.userData.fsName+'/ProofArtworkExporter-root.txt'),root='';
        if(config.exists)try{root=ProofCore.trim(read(config));}catch(e){}
        if(!root) root='E:/OneDrive - ultimate promotions/DESIGN FILES';
        var d=new Window('dialog','Proof Artwork Exporter 1.14');d.alignChildren='fill';
        d.add('statictext',undefined,'Open proof: '+source.name);
        var g=d.add('group');g.add('statictext',undefined,'Design reference');var refField=g.add('edittext',undefined,ref.value);refField.characters=14;
        if(ref.conflict||ref.fromFilename) d.add('statictext',undefined,ref.conflict?'Reference mismatch: check against the proof.':'Reference was taken from the filename: check it.');
        d.add('statictext',undefined,'DESIGN FILES root (searched for the exact design number)');
        g=d.add('group');var path=g.add('edittext',undefined,root);path.characters=48;var browse=g.add('button',undefined,'Browse');
        browse.onClick=function(){var f=Folder.selectDialog('Choose your DESIGN FILES root');if(f)path.text=f.fsName;};
        var mode=d.add('dropdownlist',undefined,['Detect artwork automatically','Selected artwork only']);mode.selection=0;
        d.add('statictext',undefined,'No layer naming required. Every export is previewed before saving.');
        g=d.add('group');g.add('button',undefined,'Cancel',{name:'cancel'});var ok=g.add('button',undefined,'Find artwork',{name:'ok'});
        ok.onClick=function(){if(!/^\d{3,10}$/.test(refField.text)) {alert('Enter the exact numeric reference.');return;}if(!new Folder(path.text).exists){alert('Choose an existing DESIGN FILES folder.');return;}d.close(1);};
        if(d.show()!==1) return null;
        write(config,path.text);return {ref:refField.text,root:new Folder(path.text),manual:mode.selection.index===1};
    }
    function findDestination(root,ref) {
        var found=[],seen={},count=0;
        function scan(folder,depth) {
            if(depth>6)return;
            if(++count>30000)throw Error('Folder search exceeded 30,000 folders. Choose a narrower root.');
            var key=folder.fsName.toLowerCase();if(seen[key])return;seen[key]=true;
            if(ProofCore.folderMatches(folder.name,ref)) {found.push(folder);return;}
            var list=folder.getFiles();for(var i=0;i<list.length;i++) if(list[i] instanceof Folder && !list[i].alias) scan(list[i],depth+1);
        }
        scan(root,0);if(!found.length)throw Error('No folder containing the exact design number '+ref+' was found under '+root.fsName+'. No output saved.');
        if(found.length===1)return found[0];
        var d=new Window('dialog','Several matching design folders');d.add('statictext',undefined,'Choose the correct destination for '+ref);var l=d.add('listbox',undefined,[]);l.preferredSize=[650,180];for(var i=0;i<found.length;i++)l.add('item',found[i].fsName);l.selection=0;
        var g=d.add('group');g.add('button',undefined,'Cancel',{name:'cancel'});g.add('button',undefined,'Use folder',{name:'ok'});if(d.show()!==1)return null;return found[l.selection.index];
    }
    function review(rows,dest,ref) {
        var d=new Window('dialog','Review isolated print artwork - exporter 1.14 / core '+(ProofCore.version||'unversioned'));d.orientation='column';d.alignChildren='fill';
        var top=d.add('statictext',undefined,'Ref '+ref+'  |  '+dest.fsName);top.maximumSize.width=820;
        var body=d.add('group');body.alignChildren='top';
        var list=body.add('listbox',undefined,[]);list.preferredSize=[340,340];
        var right=body.add('group');right.orientation='column';right.alignChildren='fill';
        var canvas=right.add('panel');canvas.preferredSize=[440,300];canvas.minimumSize=[440,300];canvas.maximumSize=[440,300];canvas.margins=0;canvas.alignChildren=['fill','fill'];
        function showPreview(file) {
            // Replace the native image control: notify('onDraw') did not invalidate the old panel on Windows.
            while(canvas.children.length)canvas.remove(canvas.children[0]);
            var imageControl=canvas.add('image',undefined,file?ScriptUI.newImage(file):undefined);
            imageControl.preferredSize=[438,298];
            imageControl.onDraw=function(){var gr=this.graphics;gr.rectPath(0,0,this.size.width,this.size.height);gr.fillPath(gr.newBrush(gr.BrushType.SOLID_COLOR,[.345,.345,.345,1]));if(this.image){var ratio=Math.min((this.size.width-8)/this.image.size[0],(this.size.height-8)/this.image.size[1]);var w=this.image.size[0]*ratio,h=this.image.size[1]*ratio;gr.drawImage(this.image,(this.size.width-w)/2,(this.size.height-h)/2,w,h);}};
            d.layout.layout(true);
        }
        var include=right.add('checkbox',undefined,'Export this artwork');var notes=right.add('edittext',undefined,'',{multiline:true,readonly:true});notes.preferredSize=[440,90];
        for(var i=0;i<rows.length;i++){rows[i].enabled=rows[i].enabled===true||(!rows[i].warnings.length&&rows[i].ids.length>0);list.add('item','');}
        function title(i){var r=rows[i];list.items[i].text=(r.enabled?'[EXPORT] ':'[SKIP] ')+'Page '+r.displayPage+' '+r.label.position+' | '+r.label.mm+'mm '+r.label.axis+' | '+r.format;}
        for(i=0;i<rows.length;i++)title(i);
        function refresh(){if(!list.selection)return;var r=rows[list.selection.index];include.value=r.enabled;include.enabled=!!r.preview&&r.ids.length>0;notes.text=r.confidence+'\n'+(r.warnings.length?r.warnings.join('\n'):'Check the preview contains the entire print and no garment.');showPreview(r.preview||null);}
        list.onChange=refresh;include.onClick=function(){rows[list.selection.index].enabled=include.value;title(list.selection.index);};list.selection=0;
        d.add('statictext',undefined,'Grey is the preview background only. PNG transparency and EPS artwork are preserved.');
        d.add('statictext',undefined,'Wrong selection? Cancel, select the print in Illustrator, then rerun in Selected artwork mode.');
        var g=d.add('group');g.alignment='right';g.add('button',undefined,'Cancel',{name:'cancel'});var exportButton=g.add('button',undefined,'Export checked artwork',{name:'ok'});
        exportButton.onClick=function(){var n=0;for(var j=0;j<rows.length;j++)if(rows[j].enabled)n++;if(!n){alert('Choose at least one artwork to export.');return;}d.close(1);};
        d.onShow=refresh;return d.show()===1;
    }
    function uniqueFile(folder,stem,extension) {
        var f=new File(folder.fsName+'/'+stem+'.'+extension),n=2;
        while(f.exists){f=new File(folder.fsName+'/'+stem+'_v'+n+'.'+extension);n++;}return f;
    }
    function printFolder(designFolder) {
        var output=new Folder(designFolder.fsName+'/PRINT');
        if(!output.exists && !output.create())throw Error('Could not create PRINT folder inside '+designFolder.fsName);
        return output;
    }
    function saveRow(r,dest,ref,index) {
        checkpoint('Reusing prepared '+r.label.position);
        var a=r.prepared||makeArtwork(r.model,r);work=a.doc;a.doc.activate();var b=painted(a.group),target=r.label.mm,axis=r.label.axis;
        var stem=ref+'_'+safe(r.label.position)+'_'+String(target).replace('.','p')+'mm-'+(axis==='height'?'HIGH':'WIDE');
        var output=uniqueFile(dest,stem,r.format==='PNG'?'png':'eps'),staged=new File(temporary.fsName+'/export-'+index+'.'+(r.format==='PNG'?'png':'eps'));
        if(r.format==='PNG') {
            if(!/windows/i.test($.os))throw Error('The PNG helper requires Windows. EPS export can run without it.');
            var probe=new File(temporary.fsName+'/probe-'+index+'.png'),res=Math.min(2400,Math.max(72,1000*72/Math.max(ProofCore.w(b),ProofCore.h(b))));
            capture(a,probe,b,res,true);checkpoint('Measuring transparent pixels: '+r.label.position);var info=helper('analyze',probe),unit=72/res;
            var tight=[b[0]+Number(info[1])*unit,b[1]+Number(info[2])*unit,b[0]+(Number(info[1])+Number(info[3]))*unit,b[1]+(Number(info[2])+Number(info[4]))*unit];
            var s=ProofCore.scale(tight,target,axis);a.group.resize(s*100,s*100,true,true,true,true,s*100,Transformation.TOPLEFT);
            // Rebase tight coordinates using the actual group's before/after bounds.
            var after=painted(a.group),crop=[after[0]+(tight[0]-b[0])*s,after[1]+(tight[1]-b[1])*s,after[0]+(tight[2]-b[0])*s,after[1]+(tight[3]-b[1])*s];
            // The probe runs at lower resolution than the final render. Preserve a
            // transparent safety margin so Illustrator cannot clip faint edge ink.
            var pad=Math.max(unit*s*4,72/25.4*2);crop=[crop[0]-pad,crop[1]-pad,crop[2]+pad,crop[3]+pad];
            var pixelsW=ProofCore.w(crop)/72*600,pixelsH=ProofCore.h(crop)/72*600;
            if(pixelsW*pixelsH>100000000||pixelsW>30000||pixelsH>30000)throw Error('PNG render exceeds the size limit.');
            var raw=new File(temporary.fsName+'/raw-'+index+'.png'),edgeInfo,guard=0;
            do {
                capture(a,raw,crop,600,true);
                edgeInfo=helper('analyze',raw);
                if(Number(edgeInfo[1])>2 && Number(edgeInfo[2])>2 &&
                   Number(edgeInfo[1])+Number(edgeInfo[3])<Number(edgeInfo[5])-2 &&
                   Number(edgeInfo[2])+Number(edgeInfo[4])<Number(edgeInfo[6])-2)break;
                var extra=72/25.4*2;crop=[crop[0]-extra,crop[1]-extra,crop[2]+extra,crop[3]+extra];
            } while(++guard<3);
            if(guard>=3)throw Error('PNG artwork reaches the capture edge; inspect clipping before export.');
            checkpoint('Trimming and encoding final PNG: '+r.label.position);var finalInfo=helper('finalize',raw,staged,axis,target);r.pixelSize=finalInfo[1]+' x '+finalInfo[2];
            r.finalMM=[Number(finalInfo[1])/300*25.4,Number(finalInfo[2])/300*25.4];
        } else {
            checkpoint('Outlining temporary artwork text: '+r.label.position);
            // Outline only the temporary copy. Original editable type is untouched.
            for(var t=a.doc.textFrames.length-1;t>=0;t--)a.doc.textFrames[t].createOutline();
            for(var pass=0;pass<3;pass++){b=painted(a.group);var factor=ProofCore.scale(b,target,axis);if(Math.abs(factor-1)<0.000001)break;a.group.resize(factor*100,factor*100,true,true,true,true,factor*100,Transformation.CENTER);}
            b=painted(a.group);var actual=(axis==='height'?ProofCore.h(b):ProofCore.w(b))*25.4/72;
            if(Math.abs(actual-target)>.02)throw Error('EPS size could not be verified within 0.02mm.');
            a.doc.artboards[0].artboardRect=aiRect(b);
            var eps=new EPSSaveOptions();eps.compatibility=Compatibility.ILLUSTRATOR17;eps.embedAllFonts=true;eps.embedLinkedFiles=true;eps.includeDocumentThumbnails=false;eps.saveMultipleArtboards=false;
            checkpoint('Saving EPS: '+r.label.position);a.doc.saveAs(staged,eps);r.finalMM=[ProofCore.w(b)*25.4/72,ProofCore.h(b)*25.4/72];
        }
        checkpoint('Closing prepared document: '+r.label.position);closeWork();r.prepared=null;if(!staged.exists||staged.length===0)throw Error('Export file is missing/empty.');
        // Recheck before copying, never replace an existing production file.
        if(output.exists)output=uniqueFile(dest,stem,r.format==='PNG'?'png':'eps');
        checkpoint('Copying finished '+r.format+' to design folder');
        if(!staged.copy(output.fsName))throw Error('Could not save to design folder: '+output.fsName);
        if(!output.exists||output.length!==staged.length)throw Error('Saved output could not be verified: '+output.fsName);
        hubFiles.push(output.fsName);
        exported.push(output.name+' | '+r.finalMM[0].toFixed(2)+' x '+r.finalMM[1].toFixed(2)+' mm'+(r.pixelSize?' | '+r.pixelSize+' px @ 300ppi':''));
    }
    function cleanTemp() {if(!temporary)return;var f=temporary.getFiles();for(var i=0;i<f.length;i++)if(f[i] instanceof File)try{f[i].remove();}catch(e){}try{temporary.remove();}catch(e){}}
    try {
        var core=new File(home.fsName+'/proof-core.js');if(!core.exists)throw Error('Extract the full ZIP first. proof-core.js must be beside this JSX.');$.evalFile(core);
        if(hubJob) {
            checkHubCancellation();hubProgress('processing','Opening proof');
            var proof=new File(hubJob.proofPath);
            if(!proof.exists || !/proof\.(pdf|ai)$/i.test(proof.name))throw Error('Queued proof is missing or has an unexpected filename.');
            for(var openIndex=0;openIndex<app.documents.length;openIndex++) {
                var existingPath='';try{existingPath=app.documents[openIndex].fullName.fsName;}catch(ignored){}
                if(existingPath.toLowerCase()===proof.fsName.toLowerCase())throw Error('Proof is already open. Close it before retrying the queued export.');
            }
            proofFile=proof;source=openProof(proof,1);hubOpened=true;
        } else {
            if(!app.documents.length)throw Error('Open your proof PDF or AI file in Illustrator first.');source=app.activeDocument;
        }
        app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        ensureSourceReady();
        var firstModel=model(source),ref=ProofCore.reference(firstModel.texts,source.name),config=hubJob?hubConfig(ref):settings(ref);if(!config)return;
        busy=new Window('palette','Proof Artwork Exporter');busy.message=busy.add('statictext',undefined,'Reading proof...');busy.message.preferredSize.width=580;busy.show();
        status('Finding design folder '+config.ref+'...');var designFolder=hubJob?config.root:findDestination(config.root,config.ref);if(!designFolder)return;
        var dest=printFolder(designFolder);
        // Optional diagnostics stay disabled during normal production use.
        var enableDiagnosticLog=false;
        if(enableDiagnosticLog)trace=uniqueFile(dest,config.ref+'_EXPORT_PROGRESS','txt');checkpoint('Starting snapshot exporter 1.14');
        temporary=new Folder(Folder.temp.fsName+'/ProofExporter-'+new Date().getTime()+'-'+Math.floor(Math.random()*100000));if(!temporary.create())throw Error('Cannot create temporary folder.');
        var rows=[],i,pageCount=hubJob&&/\.pdf$/i.test(proofFile.name)?Number(hubJob.pdfPages)||1:1,duplicateCount=0;
        if(config.manual){
            var manualModel=firstModel,active=source.artboards.getActiveArtboardIndex(),row=manualRow(manualModel,ProofCore.labels(manualModel.texts));
            if(!row)return;row.model={leaves:manualModel.leaves};row.pageNumber=/\.pdf$/i.test(proofFile.name)?originalPdfPage:1;row.artboardIndex=active;row.displayPage=row.pageNumber;rows=[row];
        } else {
            // Illustrator may import a PDF as separate artboards or expose one
            // selected PDF page per open(). Handle both without visiting a page twice.
            if(pageCount>1 && source.artboards.length>1) {
                if(source.artboards.length!==pageCount)throw Error('PDF page/artboard counts disagree; inspect this proof in Illustrator.');
                pageCount=1;
            }
            for(var pdfPage=1;pdfPage<=pageCount;pdfPage++) {
                if(pdfPage>1){source.close(SaveOptions.DONOTSAVECHANGES);source=openProof(proofFile,pdfPage);}
                var m=pdfPage===1?firstModel:model(source);
                for(var board=0;board<source.artboards.length;board++) {
                    var art=source.artboards[board].artboardRect,page=[art[0],-art[1],art[2],-art[3]],onPage=[],textOnPage=[];
                    for(i=0;i<m.leaves.length;i++)if(ProofCore.intersection(page,m.leaves[i].b))onPage.push(m.leaves[i]);
                    for(i=0;i<m.texts.length;i++)if(ProofCore.intersection(page,m.texts[i].b))textOnPage.push(m.texts[i]);
                    var pageRows=ProofCore.detect(onPage,textOnPage,page);
                    for(i=0;i<pageRows.length;i++){
                        pageRows[i].model={leaves:m.leaves};pageRows[i].pageNumber=pdfPage;pageRows[i].artboardIndex=board;
                        pageRows[i].displayPage=pageCount===1&&source.artboards.length>1?board+1:pdfPage;
                        rows.push(pageRows[i]);
                    }
                }
            }
        }
        if(!rows.length)throw Error('No print positions with readable size labels found in the proof. Embroidery positions are ignored.');
        for(i=0;i<rows.length;i++)if(rows[i].ids.length){status('Preparing preview '+(i+1)+' of '+rows.length+'...');try{rows[i].preview=preview(rows[i],i);}catch(e){var detail=failure(e);checkpoint('FAILED '+detail);closeWork();rows[i].warnings.push('Preview failed: '+detail);rows[i].confidence='REVIEW';for(var rest=i+1;rest<rows.length;rest++){rows[rest].warnings.push('Not attempted after an earlier preview failed. See export progress log.');rows[rest].confidence='REVIEW';}break;}}
        var uniqueRows=ProofCore.deduplicate(rows);
        duplicateCount=rows.length-uniqueRows.length;
        for(i=0;i<rows.length;i++)if(rows[i].duplicateOf&&rows[i].prepared)try{rows[i].prepared.doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignored){}
        rows=uniqueRows;
        busy.close();busy=null;source.activate();
        if(ProofCore.canAutoExport(rows)) {
            for(i=0;i<rows.length;i++)rows[i].enabled=true;
            hubProgress('processing','Confident match: exporting automatically');
        } else {
            hubProgress('awaiting_review','Artwork needs review in Illustrator');
            if(!review(rows,dest,config.ref))return;
        }
        checkHubCancellation();hubProgress('processing','Exporting artwork');
        busy=new Window('palette','Exporting print artwork');busy.message=busy.add('statictext',undefined,'Exporting...');busy.message.preferredSize.width=580;busy.show();
        for(i=0;i<rows.length;i++)if(rows[i].enabled){status('Exporting '+rows[i].label.position+'...');try{saveRow(rows[i],dest,config.ref,i);}catch(e){closeWork();errors.push(rows[i].label.position+': '+failure(e));checkpoint('FAILED '+errors[errors.length-1]);}}
        if(busy){busy.close();busy=null;}
        var skipped=0;for(i=0;i<rows.length;i++)if(!rows[i].enabled)skipped++;
        hubOutcome=errors.length||skipped?'needs_attention':'exported';
        hubMessage='Exported '+exported.length+' artwork(s).'+(duplicateCount?' '+duplicateCount+' identical view(s) reused.':'')+(skipped?' '+skipped+' view(s) skipped.':'')+(errors.length?' '+errors.join(' | '):'');
        if(exported.length) {
            var openedFolder=false;try{openedFolder=dest.execute();}catch(folderError){}
            if(!openedFolder)alert('Artwork was saved, but the PRINT folder could not be opened:\n'+dest.fsName);
        }
        if(errors.length)alert('Some exports failed:\n'+errors.join('\n')+'\n\nSuccessfully saved files were kept in:\n'+dest.fsName);
    } catch(e) {hubMessage=e.message;hubOutcome='needs_attention';alert('Proof Artwork Exporter\n\n'+e.message+(e.line?'\nLine '+e.line:''));}
    finally {for(var cleanup=0;cleanup<preparedDocuments.length;cleanup++)try{preparedDocuments[cleanup].close(SaveOptions.DONOTSAVECHANGES);}catch(ignored){}if(trace)try{checkpoint('Script finished or cancelled');}catch(e){}closeWork();if(busy)try{busy.close();}catch(e){}if(source)try{source.activate();}catch(e){}app.userInteractionLevel=originalInteraction;if(originalCoordinates!==undefined)app.coordinateSystem=originalCoordinates;app.preferences.PDFFileOptions.pageToOpen=originalPdfPage;cleanTemp();
        if(hubJob){
            if(hubOpened&&source)try{source.close(SaveOptions.DONOTSAVECHANGES);}catch(ignored){}
            var report='<result><status>'+xml(hubOutcome)+'</status><message>'+xml(hubMessage)+'</message>';
            for(var f=0;f<hubFiles.length;f++)report+='<output>'+xml(hubFiles[f])+'</output>';
            report+='</result>';write(new File(hubJob.resultPath),report);
        }
    }
}());
