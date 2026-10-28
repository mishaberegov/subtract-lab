const stops=[[0,0,0,0],[.25,150,0,0],[.5,204,102,0],[.75,255,214,0],[1,255,255,255]];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Built-in warm CLUT for display only; not an OsiriX table.
export function hotColor(value){
  const t=clamp(Number.isFinite(value)?value:0,0,1);
  for(let i=1;i<stops.length;i++){
    const high=stops[i];if(t>high[0])continue;
    const low=stops[i-1],f=(t-low[0])/(high[0]-low[0]);
    return [1,2,3].map(channel=>Math.round(low[channel]+f*(high[channel]-low[channel])));
  }
  return [255,255,255];
}
export function fusionAlpha(value,opacity,threshold,variable=true){
  if(!Number.isFinite(value))return 0;
  const maximum=clamp(Number.isFinite(opacity)?opacity:0,0,1);
  if(!variable)return maximum;
  const low=clamp(Number.isFinite(threshold)?threshold:0,0,.8),high=Math.min(1,low+.55);
  const x=clamp((value-low)/(high-low),0,1);
  return maximum*x*x*(3-2*x);
}
export function composeFusion(fixed,moving,opacity,threshold,variable=true){
  const gray=Math.round(clamp(Number.isFinite(fixed)?fixed:0,0,1)*255);
  const alpha=fusionAlpha(moving,opacity,threshold,variable);
  if(!alpha)return [gray,gray,gray];
  return hotColor(moving).map(channel=>Math.round(gray*(1-alpha)+channel*alpha));
}
