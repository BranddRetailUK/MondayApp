# Proof Exporter 1.0. Local-only Windows PowerShell 5.1 helper. No downloads.
param([Parameter(Mandatory=$true)][string]$JobFile)
$ErrorActionPreference = 'Stop'
$resultFile = $JobFile + '.result'
try {
    [xml]$job = [IO.File]::ReadAllText($JobFile)
    Add-Type -AssemblyName System.Drawing
    Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.IO;
public static class ProofPng {
    public static Rectangle Bounds(Bitmap image) {
        Rectangle all = new Rectangle(0, 0, image.Width, image.Height);
        BitmapData data = image.LockBits(all, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int minX=image.Width, minY=image.Height, maxX=-1, maxY=-1;
        try {
            byte[] row = new byte[image.Width*4];
            for(int y=0;y<image.Height;y++) {
                Marshal.Copy(IntPtr.Add(data.Scan0, y*data.Stride), row, 0, row.Length);
                for(int x=0;x<image.Width;x++) if(row[x*4+3] != 0) {
                    if(x<minX) minX=x; if(x>maxX) maxX=x;
                    if(y<minY) minY=y; if(y>maxY) maxY=y;
                }
            }
        } finally { image.UnlockBits(data); }
        if(maxX<0) throw new Exception("Artwork is completely transparent.");
        return Rectangle.FromLTRB(minX,minY,maxX+1,maxY+1);
    }
    public static Bitmap Load(string path) {
        using(Bitmap original = new Bitmap(path)) {
            // Copy decoded pixels, not a Graphics redraw. Redrawing faint alpha
            // can quantize edge pixels a second time and invalidate a tight crop.
            return original.Clone(new Rectangle(0,0,original.Width,original.Height),PixelFormat.Format32bppArgb);
        }
    }
    static Bitmap Render(Bitmap source, Rectangle crop, int width, int height, InterpolationMode interpolation) {
        // Do not resample an image that only needs its transparent border removed.
        if(crop.Width==width && crop.Height==height) {
            Bitmap exact=source.Clone(crop,PixelFormat.Format32bppArgb);
            exact.SetResolution(300,300);
            return exact;
        }
        Bitmap output=new Bitmap(width,height,PixelFormat.Format32bppArgb);
        output.SetResolution(300,300);
        using(Graphics g=Graphics.FromImage(output)) using(ImageAttributes attrs=new ImageAttributes()) {
            g.Clear(Color.Transparent);
            g.CompositingMode=CompositingMode.SourceCopy;
            g.CompositingQuality=CompositingQuality.HighQuality;
            g.InterpolationMode=interpolation;
            g.PixelOffsetMode=PixelOffsetMode.HighQuality;
            attrs.SetWrapMode(WrapMode.TileFlipXY);
            g.DrawImage(source,new Rectangle(0,0,width,height),crop.X,crop.Y,crop.Width,crop.Height,GraphicsUnit.Pixel,attrs);
        }
        return output;
    }
    public static string FinalizePng(string input,string output,string axis,double mm) {
        using(Bitmap source=Load(input)) {
            Rectangle crop=Bounds(source);
            int pixels=(int)Math.Round(mm/25.4*300,MidpointRounding.AwayFromZero);
            int width=axis=="height"?Math.Max(1,(int)Math.Round(pixels*(double)crop.Width/crop.Height)):pixels;
            int height=axis=="height"?pixels:Math.Max(1,(int)Math.Round(pixels*(double)crop.Height/crop.Width));
            if(width<1||height<1||width>30000||height>30000||(long)width*height>100000000)
                throw new Exception("Requested image exceeds the 100 megapixel / 30,000 pixel limit.");
            Bitmap result=null;
            try {
                using(Bitmap trimmed=source.Clone(crop,PixelFormat.Format32bppArgb))
                    result=Render(trimmed,new Rectangle(0,0,trimmed.Width,trimmed.Height),width,height,InterpolationMode.HighQualityBicubic);
                // Downsampling can round faint boundary alpha to zero. Trim the actual
                // result, then apply one uniform scale to restore the requested axis.
                // Correction is a crop or slight enlargement, never a new downsample.
                for(int pass=0;pass<4;pass++) {
                    Rectangle visible=Bounds(result);
                    if(visible.X==0 && visible.Y==0 && visible.Width==result.Width && visible.Height==result.Height) break;
                    width=axis=="height"?Math.Max(1,(int)Math.Round(pixels*(double)visible.Width/visible.Height)):pixels;
                    height=axis=="height"?pixels:Math.Max(1,(int)Math.Round(pixels*(double)visible.Height/visible.Width));
                    if(width>30000||height>30000||(long)width*height>100000000)
                        throw new Exception("Trimmed image exceeds the output size limit.");
                    Bitmap corrected;
                    using(Bitmap tight=result.Clone(visible,PixelFormat.Format32bppArgb))
                        corrected=Render(tight,new Rectangle(0,0,tight.Width,tight.Height),width,height,InterpolationMode.HighQualityBilinear);
                    result.Dispose();result=corrected;
                }
                Rectangle finalBounds=Bounds(result);
                if(finalBounds.X!=0 || finalBounds.Y!=0 || finalBounds.Width!=width || finalBounds.Height!=height || (axis=="height"?height:width)!=pixels)
                    throw new Exception("Could not settle the final transparent bounds at the requested pixel size.");
                result.Save(output,ImageFormat.Png);
            } finally {if(result!=null)result.Dispose();}
            SetDpi(output);
            // Inspect the decoded file directly; verification must not render it.
            using(Bitmap check=new Bitmap(output)) {
                Rectangle b=Bounds(check);
                if(check.Width!=width||check.Height!=height||b.X!=0||b.Y!=0||b.Width!=width||b.Height!=height)
                    throw new Exception("PNG verification failed. Expected "+width+"x"+height+
                        "; decoded "+check.Width+"x"+check.Height+"; alpha bounds x="+b.X+
                        ", y="+b.Y+", width="+b.Width+", height="+b.Height+".");
            }
            return width+"\n"+height+"\n300\n";
        }
    }
    static void BE(Stream s,uint v) { s.WriteByte((byte)(v>>24));s.WriteByte((byte)(v>>16));s.WriteByte((byte)(v>>8));s.WriteByte((byte)v); }
    static uint ReadBE(byte[] b,int i) {return ((uint)b[i]<<24)|((uint)b[i+1]<<16)|((uint)b[i+2]<<8)|b[i+3];}
    static uint Crc(byte[] b) {
        uint crc=0xffffffff;
        foreach(byte x in b) {crc^=x;for(int j=0;j<8;j++) crc=(crc&1)!=0?(crc>>1)^0xedb88320:crc>>1;}
        return crc^0xffffffff;
    }
    // Explicit PNG pHYs avoids relying on encoder-specific DPI defaults.
    static void SetDpi(string path) {
        byte[] b=File.ReadAllBytes(path);
        using(MemoryStream s=new MemoryStream()) {
            s.Write(b,0,8);
            int at=8; bool written=false;
            while(at<b.Length) {
                int len=checked((int)ReadBE(b,at));
                string type=System.Text.Encoding.ASCII.GetString(b,at+4,4);
                if(type!="pHYs") s.Write(b,at,len+12);
                if(type=="IHDR"&&!written) {
                    using(MemoryStream payload=new MemoryStream()) {
                        byte[] name=System.Text.Encoding.ASCII.GetBytes("pHYs");payload.Write(name,0,4);
                        BE(payload,11811);BE(payload,11811);payload.WriteByte(1);
                        byte[] data=payload.ToArray();BE(s,9);s.Write(data,0,data.Length);BE(s,Crc(data));
                    }
                    written=true;
                }
                at+=len+12;
            }
            File.WriteAllBytes(path,s.ToArray());
        }
    }
}
'@
    $inputPath = [string]$job.job.input
    if ([string]$job.job.mode -eq 'analyze') {
        $bitmap = [ProofPng]::Load($inputPath)
        try {
            $b = [ProofPng]::Bounds($bitmap)
            $response = "OK`n$($b.X)`n$($b.Y)`n$($b.Width)`n$($b.Height)`n$($bitmap.Width)`n$($bitmap.Height)`n"
        } finally { $bitmap.Dispose() }
    } elseif ([string]$job.job.mode -eq 'finalize') {
        $mm = [double]::Parse([string]$job.job.mm, [Globalization.CultureInfo]::InvariantCulture)
        $response = "OK`n" + [ProofPng]::FinalizePng($inputPath,[string]$job.job.output,[string]$job.job.axis,$mm)
    } else { throw 'Unknown helper operation.' }
    [IO.File]::WriteAllText($resultFile+'.tmp',$response,[Text.Encoding]::UTF8)
    [IO.File]::Move($resultFile+'.tmp',$resultFile)
} catch {
    [IO.File]::WriteAllText($resultFile, "ERROR`n" + $_.Exception.Message, [Text.Encoding]::UTF8)
    exit 1
}
