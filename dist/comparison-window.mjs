const clamp01=x=>Math.max(0,Math.min(1,x));
// Same geometry is used for drawing and pointer mapping, including zoom and letterboxing.
export function imageBounds(canvas,plane,zoom){
  const factor=Math.min((canvas.width-45)/(plane.w*plane.sx),(canvas.height-65)/(plane.h*plane.sy))*zoom;
  const w=plane.w*plane.sx*factor,h=plane.h*plane.sy*factor;
  return {x:(canvas.width-w)/2,y:(canvas.height-h)/2,w,h};
}
export function pointerToImage(x,y,canvas,plane,zoom){
  const b=imageBounds(canvas,plane,zoom);
  return {x:clamp01((x-b.x)/b.w),y:clamp01((y-b.y)/b.h)};
}
// A is the background; B is revealed only in this unframed rectangular window.
export function isRevealed(u,v,width,height,pos,size){
  return Math.abs(u/width-pos.x)<=size/2&&Math.abs(v/height-pos.y)<=size/2;
}
