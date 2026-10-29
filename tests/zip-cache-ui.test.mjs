import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const app=await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8');
const loader=app.slice(app.indexOf('function loadFiles('),app.indexOf('function cancelScan('));

test('loading the same ZIP into B reuses A scan worker after A volume is built',()=>{
  const state={a:null,b:null,regWorker:null,loadWorkers:{},loading:new Set()};
  const labels={labelA:{dataset:{}},labelB:{dataset:{}}};
  const workers=[];
  class Worker{
    constructor(){this.messages=[];this.terminated=false;workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
  }
  const loadFiles=vm.runInNewContext(loader+';loadFiles',{
    state,Worker,activeScan:null,$:id=>labels[id],toast(){},updateButtons(){},
    setVolume:(slot,volume)=>{state[slot]=volume;},clearAll(){},stopRegistration(){}
  });
  const zip=new File([new Uint8Array([1,2,3])],'study.zip',{lastModified:123});
  const again=new File([new Uint8Array([1,2,3])],'study.zip',{lastModified:123});
  loadFiles('a',[zip]);
  assert.equal(workers.length,1);
  workers[0].onmessage({data:{type:'groups',groups:[{key:'series-a'}],skipped:0,cachedZip:true}});
  workers[0].onmessage({data:{type:'volume',volume:{dims:[1,1,1]}}});
  assert.equal(state.a.dims[0],1);
  assert.equal(workers[0].terminated,false);
  loadFiles('b',[again]);
  assert.equal(workers.length,1,'a second scan worker would re-inflate every ZIP header');
  assert.equal(workers[0].messages.at(-1).reuse,true);
  assert.equal(workers[0].messages.at(-1).slot,'b');
});
