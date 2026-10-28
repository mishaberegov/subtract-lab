import {clamp,world,center,rotation,samplingMap,mapped,sample,windowValue,difference,makeDemo} from './core.mjs';
import {gridSpacing} from './resampling.mjs';
import {makeNiftiHeader} from './nifti.mjs';
import {sourcePlane,planeMapping} from './orientation.mjs';
import {imageBounds,pointerToImage,isRevealed} from './comparison-window.mjs';
import {dragTranslation,rotateInPlane} from './manual-alignment.mjs';
import {nextRegistrationState,registrationStatusText} from './registration-status.mjs?v=1.1.0-l10n5';
import {languageFromUrl,languageUrl,localizeDocument,localizeMessage} from './localization.mjs?v=1.1.0-l10n5';
const $=id=>document.getElementById(id);
const language=languageFromUrl(location.href);
localizeDocument(document,language);
for(const [id,lang] of [['langEn','en'],['langRu','ru']]){$(id).href=languageUrl(location.href,lang);if(lang===language)$(id).setAttribute('aria-current','page');}
// Only application-owned output is translated; patient series names and DICOM metadata stay intact.
const translatedIds=new Set(['toast','regStatus','resampleStatus','gridA','gridB','gridTarget','gridAMeta','gridBMeta','gridTargetMeta','labelA','labelB','metaA','metaB','grayNote','scanSummary','registrationReport','positionLabel','gainLabel','warningNotice','nameA','nameB','registerBtn','exportNifti']);
const uiObserver=new MutationObserver(records=>{if(language==='ru')return;for(const record of records){const el=record.target.nodeType===3?record.target.parentElement:record.target;const root=el?.closest?.('[id]');if(!root||!translatedIds.has(root.id))continue;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(root.id.startsWith('name')&&!/^(Чтение файлов|Чтение DICOM|Сборка объёма|Перетащи DICOM)/.test(node.nodeValue))continue;const text=localizeMessage(node.nodeValue,language);if(text!==node.nodeValue)node.nodeValue=text;}}});
uiObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
const state={a:null,b:null,bOnA:null,resampleWorker:null,resampleTimer:null,resampleBusy:false,manualDragging:false,params:[0,0,0,0,0,0],windows:{a:{level:500,width:1000},b:{level:500,width:1000}},plane:'axial',slice:0,display:'difference',reveal:{x:.5,y:.5},zoom:1,registration:null,registrationStage:'not-run',hasCompletedRegistration:false,regWorker:null,loadWorkers:{},loading:new Set(),demo:false};
for(const [id,lang] of [['langEn','en'],['langRu','ru']])$(id).addEventListener('click',event=>{
  if(lang===language){event.preventDefault();return;}
  const unsaved=!!(state.loading.size||(state.a&&!state.a?.synthetic)||(state.b&&!state.b?.synthetic)||state.registration||state.params.some(x=>x!==0));
  if(unsaved&&!confirm(language==='ru'?'Смена языка перезагрузит страницу и удалит загруженные серии и несохранённое совмещение. Продолжить?':'Switching language reloads the page and clears loaded series and unsaved alignment. Continue?'))event.preventDefault();
});
let toastTimer,renderFrame,pickSlot='a',activeScan=null,niftiUrl=null;
const format=(x,n=1)=>Number.isFinite(x)?Number(x.toFixed(n)).toLocaleString(language==='ru'?'ru-RU':'en-US'):'—';
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?16000:6000);}
function regStatus(text,type=''){const e=$('regStatus');e.replaceChildren();const dot=document.createElement('span');dot.className='status-dot '+type;const label=document.createElement('span');label.textContent=text;e.append(dot,label);}
function setRegistrationStage(event,quality){state.registrationStage=nextRegistrationState(state.registrationStage,event,state.hasCompletedRegistration);if(event==='volume')state.hasCompletedRegistration=false;if(event==='success')state.hasCompletedRegistration=true;regStatus(registrationStatusText(state.registrationStage),quality||(state.registrationStage==='complete'?'success':state.registrationStage==='not-run'?'':'warning'));}
function updateButtons(){const both=!!(state.a&&state.b),loading=state.loading.size>0,ready=both&&!!state.bOnA&&!state.resampleBusy&&!state.manualDragging; $('registerBtn').disabled=!both||loading||state.manualDragging;$('metric').disabled=!!state.regWorker;$('manualMode').disabled=!ready||loading||!!state.regWorker;$('rotateLeft').disabled=$('rotateRight').disabled=!ready||loading||!$('manualMode').checked||!!state.regWorker;$('exportPng').disabled=!ready||loading||!!state.regWorker;$('exportTransform').disabled=!ready||loading||!!state.regWorker;$('exportNifti').disabled=!ready||loading||!!state.regWorker;document.querySelectorAll('[data-auto]').forEach(b=>b.disabled=!state[b.dataset.auto]);}
function updateGridInfo(){
  const both=!!(state.a&&state.b);$('geometryStrip').hidden=!both;
  for(const slot of ['a','b']){
    const v=state[slot],up=slot.toUpperCase();if(!v)continue;
    $('grid'+up).textContent=gridSpacing(v).map(x=>format(x,2)).join(' × ')+' мм';
    $('grid'+up+'Meta').textContent=v.dims.join(' × ')+' · толщина '+(v.sliceThicknessMm>0?format(v.sliceThicknessMm,2)+' мм':'не указана');
  }
  if(both){
    $('gridTarget').textContent=gridSpacing(state.a).map(x=>format(x,2)).join(' × ')+' мм';
    $('gridTargetMeta').textContent=state.a.dims.join(' × ')+' · '+(state.bOnA?'готово':'рассчитывается');
    $('labelB').textContent=state.bOnA?'Сетка A · '+state.a.dims[2]+' срезов':'Предпросмотр B → A';
    const source=gridSpacing(state.b),target=gridSpacing(state.a);
    $('resolutionNote').hidden=!source.some((s,i)=>s>target[i]*1.1);
  }
}
function stopResampling(){
  clearTimeout(state.resampleTimer);state.resampleTimer=null;state.resampleWorker?.terminate();state.resampleWorker=null;state.resampleBusy=false;
}
function scheduleResampling(delay=0){
  stopResampling();state.bOnA=null;updateGridInfo();
  if(!(state.a&&state.b)){$('resampleStatus').textContent='Автоматически после загрузки A и B';updateButtons();return;}
  state.resampleBusy=true;$('resampleStatus').textContent='Подготовка сетки A…';updateButtons();requestRender();
  state.resampleTimer=setTimeout(()=>{
    state.resampleTimer=null;const worker=new Worker('./resample-worker.mjs?v=1.1.0',{type:'module'});state.resampleWorker=worker;
    const fail=message=>{
      if(state.resampleWorker!==worker)return;stopResampling();$('resampleStatus').textContent='Ресэмплинг не выполнен';$('gridTargetMeta').textContent='Нет готового объёма';updateButtons();toast(message,true);
    };
    worker.onmessage=({data})=>{
      if(state.resampleWorker!==worker)return;
      if(data.type==='progress')$('resampleStatus').textContent=data.phase+' · '+Math.round(data.fraction*100)+'%';
      if(data.type==='error')fail(data.message);
      if(data.type==='done'){
        state.bOnA=data.volume;stopResampling();const info=state.bOnA.resampling;
        $('resampleStatus').textContent='B в сетке A · перекрытие '+format(info.validFraction*100,1)+'%'+(info.filterApplied?' · со сглаживанием':'');
        updateGridInfo();updateButtons();requestRender();
      }
    };
    worker.onerror=e=>fail(e.message||'Ошибка ресэмплинга.');
    const a=state.a,reference={dims:a.dims,matrix:a.matrix,origin:a.origin,frameUID:a.frameUID,sliceThicknessMm:a.sliceThicknessMm};
    worker.postMessage({reference,moving:state.b,params:[...state.params],antiAlias:$('antiAlias').checked});
  },delay);
}
function invalidateRegistration(){
  state.registration=null;$('registrationReport').hidden=true;setRegistrationStage('manual');
}
function cancelManualMode(){state.manualDragging=false;$('manualMode').checked=false;canvases.r.parentElement.classList.remove('manual-active');updateButtons();}
function resetRegistration(event='reset'){
  cancelManualMode();
  if(state.regWorker)stopRegistration(false);
  state.params=[0,0,0,0,0,0];state.registration=null;$('registrationReport').hidden=true;
  setRegistrationStage(event);
  scheduleResampling();
}
function updateWarnings(){
  const warnings=[...(state.a?.warnings||[]),...(state.b?.warnings||[])];
  if(state.a&&state.b&&!state.demo&&state.a.frameUID!==state.b.frameUID)warnings.push('Frame of Reference серий различается. Проверь начальное совмещение и выполни корегистрацию.');
  $('warningNotice').hidden=!warnings.length;$('warningNotice').textContent=[...new Set(warnings)].join(' ');
}
function setVolume(slot,volume){
  state[slot]=volume;state.demo=!!(state.a?.synthetic&&state.b?.synthetic);$('demoMarker').hidden=$('clearBtn').hidden=!state.demo;
  state.plane=sourcePlane(state.a||state.b);
  document.querySelectorAll('[data-plane]').forEach(b=>b.classList.toggle('active',b.dataset.plane===state.plane));
  state.windows[slot]={...volume.window};const up=slot.toUpperCase();
  $('wl'+up).value=Number(volume.window.level.toFixed(2));$('ww'+up).value=Number(volume.window.width.toFixed(2));
  $('name'+up).textContent=volume.synthetic?localizeMessage(volume.name,language):volume.name;$('meta'+up).textContent=volume.modality+' · '+volume.dims.join(' × ')+' · '+(volume.synthetic?'синтетический':'DICOM');$('dot'+up).classList.add('loaded');$('label'+up).textContent=volume.modality+' · '+volume.dims[2]+' срезов';
  resetRegistration('volume');resetView();updateWarnings();updateButtons();
  if(state.a&&state.b){const scale=Math.max(1,(state.a.stats.hi-state.a.stats.lo)*.3);$('rawScale').value=Number(scale.toFixed(2));}

}
function resetView(){state.zoom=1;const v=state.a||state.b;if(v)state.slice=Math.floor(sliceCount(v)/2);configureSlice();requestRender();}
function sliceCount(v){return v.dims[planeMapping(v,state.plane,0).normalAxis];}
function configureSlice(){const v=state.a||state.b;if(!v){$('sliceSlider').disabled=true;$('sliceSlider').max=0;$('sliceNumber').textContent='— / —';return;}const n=sliceCount(v);state.slice=clamp(Math.round(state.slice),0,n-1);$('sliceSlider').disabled=false;$('sliceSlider').max=n-1;$('sliceSlider').value=state.slice;$('sliceNumber').textContent=(state.slice+1)+' / '+n;}
function stepSlice(delta){if(!(state.a||state.b))return;state.slice+=delta;configureSlice();requestRender();}
function requestRender(){if(!renderFrame)renderFrame=requestAnimationFrame(()=>{renderFrame=null;render();});}
function planeInfo(v){
  return planeMapping(v,state.plane,state.slice);
}
function orientationLabel(direction){const names=[['R','L'],['A','P'],['I','S']];return direction.map((v,i)=>({v:Math.abs(v),s:names[i][v>=0?1:0]})).filter(o=>o.v>Math.max(...direction.map(Math.abs))*.2).sort((a,b)=>b.v-a.v).map(o=>o.s).join('');}
const canvases={a:$('canvasA'),b:$('canvasB'),r:$('canvasR')},offscreen={};
let manualFrame=0,previewShift={x:0,y:0};
for(const key of ['a','b','r'])offscreen[key]=document.createElement('canvas');
function renderManualPreview(){
  manualFrame=0;
  if(!state.manualDragging||!state.bOnA)return;
  const canvas=canvases.r,ctx=canvas.getContext('2d'),bounds=imageBounds(canvas,planeInfo(state.a),state.zoom);
  ctx.fillStyle='#090909';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.beginPath();ctx.rect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.clip();
  ctx.imageSmoothingEnabled=true;ctx.drawImage(offscreen.a,bounds.x,bounds.y,bounds.w,bounds.h);
  ctx.globalAlpha=clamp(Number($('resultGain').value)/4,0,1);
  ctx.drawImage(offscreen.b,bounds.x+previewShift.x,bounds.y+previewShift.y,bounds.w,bounds.h);
  ctx.restore();
}
function render(){
  const base=state.a||state.b;
  for(const key of ['a','b','r']){
    const canvas=canvases[key],wrap=canvas.parentElement,dpr=Math.min(devicePixelRatio||1,2),width=Math.round(wrap.clientWidth*dpr),height=Math.round(wrap.clientHeight*dpr);
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle=key==='r'?'#090909':'#090c0e';ctx.fillRect(0,0,width,height);
    wrap.querySelector('.empty-view').hidden=key==='r'?!!(state.a&&state.b):key==='a'?!!state.a:!!state.b;
    wrap.querySelectorAll('.orientation,.canvas-corner,.scale-mark').forEach(e=>e.style.visibility=base&&(key==='r'?state.a&&state.b:state[key])?'visible':'hidden');
  }
  if(!base)return;
  const pi=planeInfo(base),[nx,ny]=base.dims,map=state.a&&state.b?samplingMap(state.a,state.b,state.params):null;
  const images={};for(const key of ['a','b','r']){offscreen[key].width=pi.w;offscreen[key].height=pi.h;images[key]=offscreen[key].getContext('2d').createImageData(pi.w,pi.h);}
  const raw=$('subtractionMode').value==='raw',weight=clamp(Number($('weight').value)||0,0,10),sign=Number($('sign').value),gain=Number($('resultGain').value),scale=Math.max(.001,Number($('rawScale').value)||1),palette=$('palette').value,windowSize=Number($('windowSize').value)/100;
  for(let v=0;v<pi.h;v++)for(let u=0;u<pi.w;u++){
    const p=pi.voxel(u,v),i=(v*pi.w+u)*4,ai=(p[2]*ny+p[1])*nx+p[0],av=state.a?state.a.data[ai]:NaN,bv=state.bOnA?state.bOnA.data[ai]:state.b?(map?sample(state.b,...mapped(map,...p)):state.b.data[ai]):NaN;
    const wa=windowValue(av,state.windows.a.level,state.windows.a.width),wb=windowValue(bv,state.windows.b.level,state.windows.b.width);
    for(const [key,value]of [['a',wa],['b',wb]]){const d=images[key].data,g=Number.isFinite(value)?Math.round(value*255):9;d[i]=d[i+1]=d[i+2]=g;d[i+3]=255;}
    const d=images.r.data;d[i+3]=255;
    if(state.display==='window'){
      const inside=isRevealed(u,v,pi.w,pi.h,state.reveal,windowSize),value=inside?wb:wa;
      const g=Number.isFinite(value)?Math.round(value*255):((u>>3)+(v>>3))%2?13:18;
      d[i]=d[i+1]=d[i+2]=g;
      continue;
    }
    if(!Number.isFinite(av)||!Number.isFinite(bv)){const c=((u>>3)+(v>>3))%2?13:18;d[i]=d[i+1]=d[i+2]=c;continue;}
    if(state.display==='blend'){
      const alpha=clamp(gain/4,0,1),g=(wa*(1-alpha)+wb*alpha)*255;d[i]=d[i+1]=d[i+2]=g;
    }else{
      const delta=sign*difference(av,bv,state.windows.a,state.windows.b,raw,weight),t=clamp(delta/(raw?scale:1)*gain,-1,1);
      const g=palette==='absolute'?Math.abs(t)*255:(t+1)*127.5;d[i]=d[i+1]=d[i+2]=g;
    }
  }
  for(const key of ['a','b','r']){
    const canvas=canvases[key],ctx=canvas.getContext('2d'),off=offscreen[key];if((key==='a'&&!state.a)||(key==='b'&&!state.b)||(key==='r'&&!(state.a&&state.b)))continue;
    off.getContext('2d').putImageData(images[key],0,0);
    const bounds=imageBounds(canvas,pi,state.zoom);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(off,bounds.x,bounds.y,bounds.w,bounds.h);
    for(const [label,axis]of [['Top',pi.v.map(x=>-x)],['Bottom',pi.v],['Left',pi.u.map(x=>-x)],['Right',pi.u]])$(key+label).textContent=orientationLabel(axis);
    if(key!=='r')$('info'+key.toUpperCase()).textContent=pi.w+' × '+pi.h+'\n'+format(pi.sx,2)+' × '+format(pi.sy,2)+' mm';
  }
  const coord=world(base,pi.voxel((pi.w-1)/2,(pi.h-1)/2));$('positionLabel').textContent='L '+format(coord[0])+' · P '+format(coord[1])+' · S '+format(coord[2])+' mm';
  $('resultTitle').textContent=state.display==='difference'?(sign===1?'A − B':'B − A'):state.display==='window'?'A / B':'A + B';

  $('grayNote').textContent=palette==='absolute'?'Модуль разницы: ноль — чёрный.':'Нулевая разница — средний серый.';
}
function loadFiles(slot,files){
  if(!files.length)return;if(state.a?.synthetic||state.b?.synthetic)clearAll(false);if(state.regWorker)stopRegistration(false);
  state.loadWorkers[slot]?.terminate();const worker=new Worker('./io-worker.js?v=1.1.0');state.loadWorkers[slot]=worker;state.loading.add(slot);updateButtons();
  const up=slot.toUpperCase();$('name'+up).textContent='Чтение файлов…';$('meta'+up).textContent=files.length+' файлов';
  worker.onmessage=({data})=>{
    if(data.type==='progress'){$('name'+up).textContent=data.text+' · '+Math.round(data.fraction*100)+'%';}
    if(data.type==='groups'){
      const choose=key=>{worker.postMessage({type:'build',key});};
      if(data.skipped)toast('Пропущено файлов: '+data.skipped+'. '+(data.errors[0]||'Объекты без PixelData.'));
      if(data.groups.length===1)choose(data.groups[0].key);
      else {
        // A second scan replaces the chooser, but does not discard either volume.
        if(activeScan){const old=activeScan.slot;state.loadWorkers[old]?.terminate();delete state.loadWorkers[old];state.loading.delete(old);restoreSlotLabel(old);}
        activeScan={slot,choose};$('scanSummary').textContent='Для серии '+up+' найдено объёмов: '+data.groups.length+'. Выбери нужный.';$('seriesList').replaceChildren();
        for(const group of data.groups){const btn=document.createElement('button');btn.className='series-choice';const text=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent=group.name;meta.textContent=group.modality+' · серия '+group.series+' · '+group.dims.join(' × ')+(group.echo?' · эхо '+group.echo:'');text.append(title,meta);btn.append(text);btn.addEventListener('click',()=>{activeScan=null;$('seriesDialog').close();choose(group.key);});$('seriesList').append(btn);}
        if(!$('seriesDialog').open)$('seriesDialog').showModal();
      }
    }
    if(data.type==='volume'){state.loading.delete(slot);setVolume(slot,data.volume);worker.terminate();delete state.loadWorkers[slot];toast('Серия '+up+' загружена: '+data.volume.dims.join(' × '));}
    if(data.type==='error'){finishError(data.message);}
  };
  function finishError(message){state.loading.delete(slot);worker.terminate();delete state.loadWorkers[slot];restoreSlotLabel(slot);updateButtons();toast(message,true);}
  worker.onerror=e=>finishError('Ошибка чтения DICOM: '+(e.message||'проверь формат файлов.'));
  worker.postMessage({type:'scan',slot,files:Array.from(files)});
}
function restoreSlotLabel(slot){const v=state[slot],up=slot.toUpperCase();$('name'+up).textContent=v?.name||'Перетащи DICOM сюда';$('meta'+up).textContent=v?v.modality+' · '+v.dims.join(' × '):'Папка, файлы или ZIP-архив';}
function cancelScan(){if(activeScan){const slot=activeScan.slot;state.loadWorkers[slot]?.terminate();delete state.loadWorkers[slot];state.loading.delete(slot);restoreSlotLabel(slot);activeScan=null;updateButtons();}if($('seriesDialog').open)$('seriesDialog').close();}
function startRegistration(){
  if(state.regWorker){stopRegistration();return;}if(!(state.a&&state.b))return;
  cancelManualMode();
  const worker=new Worker('./register-worker.mjs',{type:'module'});state.regWorker=worker;
  $('registerBtn').classList.add('running');$('registerBtn').textContent='Остановить';$('regProgress').hidden=false;$('regProgress').firstElementChild.style.width='0%';regStatus('Поиск смещения и вращения…');updateButtons();
  worker.onmessage=({data})=>{
    if(data.type==='progress'){$('regProgress').firstElementChild.style.width=Math.max(2,Math.round(data.fraction*100))+'%';regStatus('Уровень '+data.level+' / '+data.levels+' · '+Math.round(data.fraction*100)+'%');}
    if(data.type==='done'){
      state.params=data.result.params;state.registration=data.result;stopRegistration(false);scheduleResampling();const r=data.result,good=r.after.overlap>.65&&r.after.ncc>.75;
      setRegistrationStage('success',good?'success':'warning');
      $('registrationReport').hidden=false;$('registrationReport').textContent='Корегистрация '+r.method.toUpperCase()+' · метрика '+format(r.before.score,4)+' → '+format(r.after.score,4)+' · перекрытие выборки '+format(r.after.overlap*100,1)+'%. Смещение A → B: '+r.params.slice(0,3).map(x=>format(x,2)).join(' / ')+' мм; вращение: '+r.params.slice(3).map(x=>format(x,2)).join(' / ')+'°. '+(good?'Проверь границы в режиме «Форточка».':'Совмещение требует визуальной проверки; при необходимости уточни вручную.');
      requestRender();
    }
    if(data.type==='error'){stopRegistration();toast(data.message,true);}
  };
  worker.onerror=e=>{stopRegistration();toast(e.message||'Ошибка вычисления.',true);};
  worker.postMessage({a:state.a,b:state.b,method:$('metric').value,initial:state.params});
}
function stopRegistration(announce=true){state.regWorker?.terminate();state.regWorker=null;$('registerBtn').classList.remove('running');$('registerBtn').innerHTML='<svg><use href="#i-cross"/></svg>Корегистрировать';$('regProgress').hidden=true;if(announce)setRegistrationStage('stop');updateButtons();}
function demo(){
  clearAll(false);const pair=makeDemo();setVolume('a',pair.a);setVolume('b',pair.b);state.demo=true;$('demoMarker').hidden=$('clearBtn').hidden=false;state.slice=Math.round(pair.a.dims[2]/2+1);configureSlice();requestRender();
}
function clearAll(announce=true){
  cancelManualMode();
  stopRegistration(false);stopResampling();state.bOnA=null;for(const worker of Object.values(state.loadWorkers))worker.terminate();state.loadWorkers={};state.loading.clear();cancelScan();state.a=state.b=null;state.demo=false;state.slice=0;state.zoom=1;state.params=[0,0,0,0,0,0];state.registration=null;state.registrationStage='not-run';state.hasCompletedRegistration=false;
  for(const slot of ['a','b']){restoreSlotLabel(slot);$('label'+slot.toUpperCase()).textContent='Не загружен';$('dot'+slot.toUpperCase()).classList.remove('loaded');}
  $('demoMarker').hidden=$('clearBtn').hidden=true;$('warningNotice').hidden=true;$('registrationReport').hidden=true;setRegistrationStage('volume');$('positionLabel').textContent='Синхронная прокрутка';configureSlice();updateButtons();requestRender();if(announce)toast('Рабочая область очищена.');
  $('geometryStrip').hidden=true;$('resampleStatus').textContent='Автоматически после загрузки A и B';
}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);}
function settings(){return {mode:$('subtractionMode').value,sign:Number($('sign').value),weightB:clamp(Number($('weight').value)||0,0,10),windows:structuredClone(state.windows),resampling:state.bOnA?.resampling||null};}
function exportTransform(){
  if(!(state.a&&state.b))return;const r=rotation(state.params),c=center(state.a),rc=[r[0]*c[0]+r[1]*c[1]+r[2]*c[2],r[3]*c[0]+r[4]*c[1]+r[5]*c[2],r[6]*c[0]+r[7]*c[1]+r[8]*c[2]],t=c.map((v,i)=>v-rc[i]+state.params[i]);
  const meta=v=>({name:v.name,dims:v.dims,originLPS:v.origin,voxelToLPS3x3:v.matrix,frameOfReferenceUID:v.frameUID,modality:v.modality,sliceThicknessMm:v.sliceThicknessMm??null});
  const payload={format:'subtract-lab-transform-v1',createdAt:new Date().toISOString(),coordinateSystem:'DICOM LPS, millimetres',mapping:'fixed A patient coordinate -> moving B patient coordinate; resample B on A',parameters:{translationLPSmm:state.params.slice(0,3),rotationXYZdegrees:state.params.slice(3),rotationOrder:'Rz * Ry * Rx',rotationCenterLPSmm:c},matrixAtoB4x4:[...r.slice(0,3),t[0],...r.slice(3,6),t[1],...r.slice(6),t[2],0,0,0,1],reference:meta(state.a),moving:meta(state.b),subtraction:settings(),registration:state.registration,syntheticDemo:state.demo};
  saveBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'subtract-transform.json');
}
async function exportNifti(){
  if(!(state.a&&state.b&&state.bOnA)||state.regWorker||state.resampleBusy)return;const button=$('exportNifti'),old=button.innerHTML;button.disabled=true;button.textContent='Экспорт…';
  try{
    const {a,bOnA}=state,[nx,ny,nz]=a.dims,config=settings(),n=a.data.length;
    if(n>60000000)throw Error('Экспорт ограничен 60 млн вокселей в этой версии.');
    const header=makeNiftiHeader(a,config.mode);
    const output=new Float32Array(n);
    for(let z=0;z<nz;z++){for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=(z*ny+y)*nx+x;output[i]=config.sign*difference(a.data[i],bOnA.data[i],config.windows.a,config.windows.b,config.mode==='raw',config.weightB);}if(z%4===0){button.textContent=Math.round((z+1)/nz*100)+'%';await new Promise(r=>setTimeout(r,0));}}
    let blob=new Blob([header,output],{type:'application/octet-stream'}),filename='subtract-'+config.mode+'.nii';
    if(typeof CompressionStream!=='undefined'){button.textContent='Сжатие…';blob=await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();blob=new Blob([blob],{type:'application/gzip'});filename+='.gz';}
    if(niftiUrl)URL.revokeObjectURL(niftiUrl);niftiUrl=URL.createObjectURL(blob);$('niftiDownloadLink').href=niftiUrl;$('niftiDownloadLink').download=filename;$('downloadDialog').showModal();
  }catch(e){toast(e.message||String(e),true);}finally{button.innerHTML=old;updateButtons();}
}
document.querySelectorAll('[data-pick]').forEach(btn=>btn.addEventListener('click',()=>{pickSlot=btn.dataset.pick;const input=$(btn.dataset.kind==='folder'?'folderInput':'fileInput');input.value='';input.click();}));
for(const id of ['fileInput','folderInput'])$(id).addEventListener('change',e=>loadFiles(pickSlot,e.target.files));
for(const slot of ['a','b']){
  const target=$('drop'+slot.toUpperCase());target.addEventListener('dragover',e=>{e.preventDefault();target.classList.add('drag');});target.addEventListener('dragleave',()=>target.classList.remove('drag'));
  target.addEventListener('drop',async e=>{
    e.preventDefault();target.classList.remove('drag');const items=Array.from(e.dataTransfer.items||[]),entries=items.map(i=>i.webkitGetAsEntry?.()).filter(Boolean);
    if(entries.some(e=>e.isDirectory)){
      const files=[];async function walk(entry){if(entry.isFile){files.push(await new Promise((resolve,reject)=>entry.file(resolve,reject)));}else if(entry.isDirectory){const reader=entry.createReader();while(true){const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;for(const child of batch)await walk(child);}}}
      try{for(const entry of entries)await walk(entry);loadFiles(slot,files);}catch(err){toast('Не удалось прочитать папку: '+err.message,true);}
    }else loadFiles(slot,e.dataTransfer.files);
  });
  target.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===target){e.preventDefault();pickSlot=slot;$('fileInput').value='';$('fileInput').click();}});
  for(const kind of ['wl','ww'])$(kind+slot.toUpperCase()).addEventListener('input',e=>{const v=Number(e.target.value);if(!Number.isFinite(v)||(kind==='ww'&&v<1))return;state.windows[slot][kind==='wl'?'level':'width']=v;requestRender();});
}
document.querySelectorAll('[data-auto]').forEach(btn=>btn.addEventListener('click',()=>{const slot=btn.dataset.auto;if(!state[slot])return;state.windows[slot]={level:state[slot].stats.level,width:state[slot].stats.width};$('wl'+slot.toUpperCase()).value=Number(state.windows[slot].level.toFixed(2));$('ww'+slot.toUpperCase()).value=Number(state.windows[slot].width.toFixed(2));requestRender();}));
$('manualMode').addEventListener('change',()=>{if($('manualMode').checked&&state.regWorker)stopRegistration(false);if($('manualMode').checked)document.querySelector('[data-display="blend"]').click();canvases.r.parentElement.classList.toggle('manual-active',$('manualMode').checked);updateButtons();});
for(const [id,degrees] of [['rotateLeft',-1],['rotateRight',1]])$(id).addEventListener('click',()=>{if(!$('manualMode').checked||!(state.a&&state.b))return;state.params=rotateInPlane(state.params,planeInfo(state.a),degrees);invalidateRegistration();scheduleResampling();requestRender();});
$('metric').addEventListener('change',()=>{setRegistrationStage('metric');$('registrationReport').hidden=true;});
$('antiAlias').addEventListener('change',()=>scheduleResampling());
document.querySelectorAll('[data-plane]').forEach(btn=>btn.addEventListener('click',()=>{state.plane=btn.dataset.plane;document.querySelectorAll('[data-plane]').forEach(b=>b.classList.toggle('active',b===btn));resetView();}));
function updateGain(){const blend=state.display==='blend';$('gainValue').textContent=blend?Math.round(Number($('resultGain').value)/4*100)+'%':format(Number($('resultGain').value),1)+'×';}
document.querySelectorAll('[data-display]').forEach(btn=>btn.addEventListener('click',()=>{state.display=btn.dataset.display;if(state.display!=='blend'&&$('manualMode').checked)cancelManualMode();document.querySelectorAll('[data-display]').forEach(b=>b.classList.toggle('active',b===btn));const blend=state.display==='blend';$('gainLabel').textContent=blend?'Доля B в наложении':'Усиление разницы';$('resultGain').min=blend?'0':'.25';$('resultGain').max=blend?'4':'8';$('resultGain').value=clamp(Number($('resultGain').value),blend?0:.25,blend?4:8);$('resultGain').disabled=state.display==='window';$('revealControls').hidden=state.display!=='window';canvases.r.parentElement.classList.toggle('reveal-active',state.display==='window');updateGain();requestRender();}));
$('windowSize').addEventListener('input',e=>{$('windowSizeValue').textContent=e.target.value+'%';requestRender();});
for(const id of ['sign','weight','palette','rawScale','resultGain','subtractionMode'])$(id).addEventListener('input',()=>{$('rawScale').disabled=$('subtractionMode').value!=='raw';updateGain();requestRender();});
$('sliceSlider').addEventListener('input',e=>{state.slice=Number(e.target.value);configureSlice();requestRender();});$('prevSlice').addEventListener('click',()=>stepSlice(-1));$('nextSlice').addEventListener('click',()=>stepSlice(1));
$('fitBtn').addEventListener('click',()=>{state.zoom=1;requestRender();});$('registerBtn').addEventListener('click',startRegistration);$('resetTransform').addEventListener('click',()=>{resetRegistration();requestRender();});$('demoBtn').addEventListener('click',demo);$('clearBtn').addEventListener('click',()=>clearAll());
$('exportTransform').addEventListener('click',exportTransform);$('exportNifti').addEventListener('click',exportNifti);$('exportPng').addEventListener('click',()=>{render();canvases.r.toBlob(blob=>{if(blob)saveBlob(blob,'subtract-'+state.plane+'-'+(state.slice+1)+'.png');});});
$('helpBtn').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());$('closeSeries').addEventListener('click',cancelScan);$('seriesDialog').addEventListener('cancel',cancelScan);
$('closeDownload').addEventListener('click',()=>$('downloadDialog').close());
for(const key of ['a','b','r']){
  const wrap=canvases[key].parentElement;wrap.addEventListener('wheel',e=>{e.preventDefault();stepSlice(e.deltaY>0?1:-1);},{passive:false});let drag=null;
  const moveWindow=e=>{if(key!=='r'||state.display!=='window'||!(state.a&&state.b))return;const canvas=canvases.r,rect=canvas.getBoundingClientRect();state.reveal=pointerToImage((e.clientX-rect.left)*canvas.width/rect.width,(e.clientY-rect.top)*canvas.height/rect.height,canvas,planeInfo(state.a),state.zoom);requestRender();};
  wrap.addEventListener('pointerdown',e=>{if(!(state.a||state.b))return;if(key==='r'&&$('manualMode').checked&&state.a&&state.b&&!e.shiftKey){
    const canvas=canvases.r,rect=canvas.getBoundingClientRect(),start={x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};
    drag={manual:true,start,params:[...state.params],canvasSize:{width:canvas.width,height:canvas.height},plane:planeInfo(state.a),zoom:state.zoom,pointerId:e.pointerId,changed:false};
    stopResampling();state.manualDragging=true;updateButtons();wrap.setPointerCapture(e.pointerId);return;
  }drag={x:e.clientX,y:e.clientY,wl:state.windows[key]?.level,ww:state.windows[key]?.width,zoom:state.zoom,shift:e.shiftKey,pointerId:e.pointerId};wrap.setPointerCapture(e.pointerId);if(!e.shiftKey)moveWindow(e);});
  wrap.addEventListener('pointermove',e=>{if(drag?.manual){if(drag.pointerId!==e.pointerId||!state.manualDragging)return;const canvas=canvases.r,rect=canvas.getBoundingClientRect(),end={x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};state.params=dragTranslation(drag.params,drag.start,end,drag.canvasSize,drag.plane,drag.zoom);previewShift={x:end.x-drag.start.x,y:end.y-drag.start.y};drag.changed=drag.changed||Math.hypot(previewShift.x,previewShift.y)>0;if(!manualFrame)manualFrame=requestAnimationFrame(renderManualPreview);return;}if(key==='r'&&state.display==='window'&&!$('manualMode').checked&&!e.shiftKey&&(e.pointerType==='mouse'||drag))moveWindow(e);if(!drag||drag.pointerId!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(drag.shift){state.zoom=clamp(drag.zoom*Math.exp(-dy*.008),.2,6);}else if(key!=='r'&&state[key]){const step=Math.max(1,state[key].stats.width)/250;state.windows[key]={level:drag.wl+dy*step,width:Math.max(1,drag.ww+dx*step)};$('wl'+key.toUpperCase()).value=Math.round(state.windows[key].level);$('ww'+key.toUpperCase()).value=Math.round(state.windows[key].width);}requestRender();});
  wrap.addEventListener('pointerup',e=>{if(!drag||drag.pointerId!==e.pointerId)return;if(drag.manual&&state.manualDragging){state.manualDragging=false;if(drag.changed)invalidateRegistration();scheduleResampling();updateButtons();}drag=null;});
  wrap.addEventListener('pointercancel',e=>{if(!drag||drag.pointerId!==e.pointerId)return;if(drag.manual&&state.manualDragging){state.params=drag.params;state.manualDragging=false;scheduleResampling();updateButtons();}drag=null;});
}
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||document.querySelector('dialog[open]'))return;if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();stepSlice(e.key==='ArrowUp'?-1:1);}});
new ResizeObserver(requestRender).observe(document.querySelector('.viewers'));
// A labelled synthetic pair makes all controls testable before importing real data.
demo();
