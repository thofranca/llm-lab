'use strict';

// Splits keep neighboring panels inside the workspace; only ratios are saved.
(() => {
 const workspace=document.querySelector('.workspace');
 const side=document.querySelector('.side');
 const scene=document.getElementById('sceneBox');
 const answer=document.querySelector('.answerCard');
 const storageKey='llm-lab-layout-v1';
 let preferences={},drag=null;
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
  for(const key of ['columns','tokens','answer','mobileScene','mobileTokens'])
   if(Number.isFinite(saved?.[key])&&saved[key]>0&&saved[key]<1)preferences[key]=saved[key];
 }catch{/* Storage may be unavailable; resizing still works for this session. */}
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const mobile=()=>matchMedia('(max-width:760px)').matches;
 const gap=element=>parseFloat(getComputedStyle(element).gap)||0;
 const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(preferences))}catch{}};
 function separator(id,label,parent){
  const element=document.createElement('div');element.id=id;element.className='splitter';element.tabIndex=0;
  element.setAttribute('role','separator');element.setAttribute('aria-label',label);
  element.title=label+' · arraste ou use as setas · duplo clique restaura';
  parent.append(element);return element;
 }
 const columns=separator('split-columns','Ajustar gráfico e painel de resposta',workspace);
 const tokens=separator('split-tokens','Ajustar altura da faixa de tokens',workspace);
 const answerSplit=separator('split-answer','Ajustar resposta e detalhes',side);
 columns.setAttribute('aria-controls','sceneBox answerPanel');
 tokens.setAttribute('aria-controls','tokensPanel');
 answerSplit.setAttribute('aria-controls','answerPanel detailsPanel');
 function limits(element){
  const m=mobile(),w=workspace.clientWidth,h=workspace.clientHeight,g=gap(workspace);
  if(element===columns){
   if(m){const available=h-parseFloat(workspace.style.getPropertyValue('--tokens-height'))-2*g;
    return {key:'mobileScene',axis:'y',total:available,min:200,max:Math.max(200,available-145),current:scene.clientHeight};}
   return {key:'columns',axis:'x',total:w-g,min:Math.min(320,(w-g)*.48),max:w-g-280,current:scene.getBoundingClientRect().width};
  }
  if(element===tokens)return {key:m?'mobileTokens':'tokens',axis:'y',total:h,min:100,max:Math.max(100,h-(m?345+2*g:330+g)),current:document.querySelector('.replay').getBoundingClientRect().height,reverse:true};
  const available=side.clientHeight-gap(side);
  return {key:'answer',axis:'y',total:available,min:100,max:Math.max(100,available-130),current:answer.getBoundingClientRect().height};
 }
 function positionHandles(){
  const m=mobile(),wr=workspace.getBoundingClientRect(),sr=scene.getBoundingClientRect(),ar=answer.getBoundingClientRect(),br=side.getBoundingClientRect();
  columns.classList.toggle('vertical',!m);columns.classList.toggle('horizontal',m);
  columns.style.cssText=m?`left:0;top:${sr.bottom-wr.top+gap(workspace)/2}px;width:100%`:`left:${sr.right-wr.left+gap(workspace)/2}px;top:0;height:${sr.height}px`;
  tokens.classList.add('horizontal');
  const tr=document.querySelector('.replay').getBoundingClientRect();
  tokens.style.cssText=`left:0;top:${tr.top-wr.top-gap(workspace)/2}px;width:100%`;
  answerSplit.classList.add('horizontal');answerSplit.hidden=m;
  answerSplit.style.cssText=`left:0;top:${ar.bottom-br.top+gap(side)/2}px;width:100%`;
  for(const element of [columns,tokens,answerSplit]){
   if(element.hidden)continue;const l=limits(element);
   element.setAttribute('aria-orientation',l.axis==='x'?'vertical':'horizontal');
   element.setAttribute('aria-valuemin',Math.round(l.min));element.setAttribute('aria-valuemax',Math.round(l.max));
   element.setAttribute('aria-valuenow',Math.round(l.current));element.setAttribute('aria-valuetext',`${Math.round(l.current)} pixels`);
  }
 }
 function apply(){
  const m=mobile(),h=workspace.clientHeight,g=gap(workspace);
  const key=m?'mobileTokens':'tokens';
  const tokenHeight=clamp(preferences[key]*h||(m?126:innerHeight<=780?140:154),100,Math.max(100,h-(m?345+2*g:330+g)));
  workspace.style.setProperty('--tokens-height',`${tokenHeight}px`);
  if(m){
   const available=h-tokenHeight-2*g;
   const sceneHeight=clamp((preferences.mobileScene??.625)*available,200,Math.max(200,available-145));
   workspace.style.gridTemplateColumns='minmax(0,1fr)';
   workspace.style.gridTemplateRows=`${sceneHeight}px minmax(0,1fr) ${tokenHeight}px`;
   side.style.removeProperty('grid-template-rows');
  }else{
   const available=workspace.clientWidth-g;
   const left=clamp(preferences.columns*available||(innerWidth<=1000?available-340:available*.62),Math.min(320,available*.48),available-280);
   workspace.style.gridTemplateColumns=`${left}px minmax(0,1fr)`;
   workspace.style.gridTemplateRows=`minmax(0,1fr) ${tokenHeight}px`;
   const sideAvailable=h-tokenHeight-g-gap(side);
   const top=clamp((preferences.answer??.425)*sideAvailable,100,Math.max(100,sideAvailable-130));
   side.style.gridTemplateRows=`${top}px minmax(0,1fr)`;
  }
  positionHandles();
 }
 function finish(cancel=false){
  if(!drag)return;
  const active=drag;drag=null;
  if(cancel)preferences=active.before;else save();
  if(active.element.hasPointerCapture(active.pointerId))active.element.releasePointerCapture(active.pointerId);
  document.body.classList.remove('resizing-x','resizing-y');active.element.classList.remove('dragging');apply();
 }
 for(const element of [columns,tokens,answerSplit]){
  element.addEventListener('pointerdown',event=>{
   if(event.button!==0||drag)return;event.preventDefault();
   const l=limits(element);drag={element,pointerId:event.pointerId,limits:l,start:l.axis==='x'?event.clientX:event.clientY,before:{...preferences}};
   element.focus();element.setPointerCapture(event.pointerId);element.classList.add('dragging');
   document.body.classList.add(`resizing-${l.axis}`);
  });
  element.addEventListener('pointermove',event=>{
   if(!drag||drag.element!==element||drag.pointerId!==event.pointerId)return;
   const l=drag.limits,delta=((l.axis==='x'?event.clientX:event.clientY)-drag.start)*(l.reverse?-1:1);
   preferences[l.key]=clamp(l.current+delta,l.min,l.max)/l.total;apply();
  });
  element.addEventListener('pointerup',()=>finish());
  element.addEventListener('pointercancel',()=>finish(true));
  element.addEventListener('lostpointercapture',()=>finish(true));
  element.addEventListener('dblclick',()=>{delete preferences[limits(element).key];save();apply()});
  element.addEventListener('keydown',event=>{
   const l=limits(element),keys=l.axis==='x'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];
   if(![...keys,'Home','End'].includes(event.key))return;event.preventDefault();
   let value=event.key==='Home'?l.min:event.key==='End'?l.max:l.current+(event.key===keys[0]?-1:1)*(l.reverse?-1:1)*(event.shiftKey?50:20);
   preferences[l.key]=clamp(value,l.min,l.max)/l.total;save();apply();
  });
 }
 document.addEventListener('keydown',event=>{if(event.key==='Escape')finish(true)});
 window.addEventListener('blur',()=>finish(true));
 document.getElementById('resetLayout').onclick=()=>{finish(true);preferences={};save();apply()};
 new ResizeObserver(()=>{if(drag)finish(true);apply()}).observe(workspace);
 apply();
})();
