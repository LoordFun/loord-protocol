import sharp from 'sharp';
import fs from 'node:fs';
for (const f of ['brand/LOGO LOORD PNG.png', 'brand/LOGO LOORD PNG...png']) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, n = W * info.height, pts = [];
  for (let i = 0; i < n; i++) {
    if (data[i*4+3] < 250) continue;
    const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
    if (Math.max(r,g,b) - Math.min(r,g,b) > 90) pts.push(i);
  }
  // hue buckets -> 5 clusters via kmeans on hue-ish RGB
  let cent = [0,1,2,3,4].map(j => pts[Math.floor((j+.5)*pts.length/5)]).map(i => [data[i*4],data[i*4+1],data[i*4+2]]);
  for (let it = 0; it < 15; it++) {
    const s = cent.map(() => [0,0,0,0]);
    for (const i of pts) { const p=[data[i*4],data[i*4+1],data[i*4+2]]; let b=0,bd=1e9; cent.forEach((c,j)=>{const d=(c[0]-p[0])**2+(c[1]-p[1])**2+(c[2]-p[2])**2; if(d<bd){bd=d;b=j}}); s[b][0]+=p[0];s[b][1]+=p[1];s[b][2]+=p[2];s[b][3]++; }
    cent = s.map((x,j)=>x[3]?[x[0]/x[3],x[1]/x[3],x[2]/x[3]]:cent[j]);
  }
  console.log(f, 'saturated px', pts.length);
  for (const c of cent) {
    let bi=0,bd=1e12; for (const i of pts){const d=(data[i*4]-c[0])**2+(data[i*4+1]-c[1])**2+(data[i*4+2]-c[2])**2; if(d<bd){bd=d;bi=i}}
    console.log('#'+[0,1,2].map(k=>data[bi*4+k].toString(16).padStart(2,'0')).join(''), 'at', bi%W, Math.floor(bi/W));
  }
  // ink: darkest dominant & opaque bbox
  let minx=W,miny=W,maxx=0,maxy=0;
  for (let i=0;i<n;i++){ const r=data[i*4],g=data[i*4+1],b=data[i*4+2]; if (r<40&&g<40&&b<40&&data[i*4+3]>250){const x=i%W,y=(i/W)|0; if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;} }
  console.log('ink bbox', minx,miny,maxx,maxy);
}
