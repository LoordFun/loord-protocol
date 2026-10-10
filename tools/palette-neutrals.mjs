import sharp from 'sharp';
const f = 'reference/LOORD 1.jpg.jpeg';
const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
const W = info.width, ch = info.channels;
const px = (x, y) => [0,1,2].map(k => data[(y*W+x)*ch+k]);
const hx = c => '#' + c.map(v => v.toString(16).padStart(2,'0')).join('');
function region(x0,y0,x1,y1,lo,hi) {
  const arr = [];
  for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++){ const p=px(x,y), l=(p[0]+p[1]+p[2])/3; if (l>=lo&&l<hi) arr.push([x,y,p]); }
  if (!arr.length) return null;
  const m=[0,1,2].map(k=>arr.reduce((s,a)=>s+a[2][k],0)/arr.length);
  let b=arr[0],bd=1e9; for(const a of arr){const d=a[2].reduce((s,v,k)=>s+(v-m[k])**2,0); if(d<bd){bd=d;b=a}}
  return { n: arr.length, snapped: hx(b[2]), at:[b[0],b[1]] };
}
console.log('body text mono (dark band)', region(76,515,815,615,60,110));
console.log('body text darkest', region(76,515,815,615,0,60));
console.log('divider', region(335,800,345,845,150,225));
console.log('solana wordmark grey', region(170,810,290,835,60,150));
console.log('url text', region(385,810,525,840,60,130));
console.log('card/light', region(0,0,1600,900,246,256));
const f2='reference/SAMPUL LOORD JPG.jpg.jpeg';
const s2 = await sharp(f2).raw().toBuffer({resolveWithObject:true}); const W2=s2.info.width, c2=s2.info.channels;
const p2=(x,y)=>[0,1,2].map(k=>s2.data[(y*W2+x)*c2+k]);
console.log('sampul subtitle', hx(p2(40,345)), 'sampul bg', hx(p2(0,0)));
