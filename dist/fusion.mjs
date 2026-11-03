import {boojumColor} from './clut-boojum.mjs';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const fusionColor=boojumColor;
export function composeGrayFusion(fixed,moving,opacity,threshold,variable=true){
  if(!Number.isFinite(fixed))return Math.round(clamp(moving,0,1)*255);
  if(!Number.isFinite(moving))return Math.round(clamp(fixed,0,1)*255);
  const alpha=fusionAlpha(moving,opacity,threshold,variable);
  return Math.round(clamp(fixed*(1-alpha)+moving*alpha,0,1)*255);
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
  return fusionColor(moving).map(channel=>Math.round(gray*(1-alpha)+channel*alpha));
}
