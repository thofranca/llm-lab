'use strict';

scene.mode='tokens';scene.yaw=-.08;scene.pitch=.06;
scene.tokenCards=[];scene.tokenEdges=[];scene.tokenTarget=null;
let sceneStep=null;
const tokenPageSize=()=>$('network').parentElement.getBoundingClientRect().width<500?6:12;
const tokenColors={prompt:'#8fb9df',generated:'#7ad5b7',query:'#efc680',chosen:'#7ad5b7',marker:'#b8a8d8'};

function contextTokens(){
 const step=capture.steps[selected];if(!capture.meta)return [];
 const all=[...capture.meta.prompt,...capture.steps.slice(0,selected).map(s=>s.chosen)];
 return step?all.filter(t=>t.position<=step.input_position):capture.meta.prompt;
}
function tokenRole(token){
 if(token.position>=capture.meta.prompt_tokens)return 'generated';
 return /^<\|.*\|>$/.test(token.token)?'marker':'prompt';
}
function refreshTokenScene(){
 const step=capture.steps[selected],tokens=contextTokens();
 const page=$('contextView').value||'top';
 $('contextView').replaceChildren(option('top',step?.attention?`${tokenPageSize()} maiores pesos`:`Últimas ${tokenPageSize()} posições`));
 for(let start=0;start<tokens.length;start+=tokenPageSize())$('contextView').append(option(String(start),`Posições ${start}–${Math.min(start+tokenPageSize()-1,tokens.length-1)}`));
 if([...$('contextView').options].some(o=>o.value===page))$('contextView').value=page;
 if(step!==sceneStep){sceneStep=step;scene.tokenTarget=step?.attention?.top[0]?.position??null;}
 $('inspectToken').replaceChildren();$('inspectToken').disabled=!step?.attention;
 if(step?.attention){
  for(const token of tokens)$('inspectToken').append(option(token.position,`[${token.position}] ${readableToken(token.token)} · ${fmt(step.attention.weights[token.position]*100)}%`));
  $('inspectToken').value=String(scene.tokenTarget??step.input_position);
 }
 updateTokenMeasure();updateSceneLabels();
}
function updateTokenMeasure(){
 const step=capture.steps[selected],tokens=contextTokens(),target=tokens.find(t=>t.position===scene.tokenTarget);
 if(!step){$('tokenMeasure').textContent='Sem medições ainda. Entrada → processamento do modelo → próximo token. O esquema não representa neurônios individuais.';return}
 if(!step.attention){$('tokenMeasure').textContent=`Posição ${step.input_position} processada → token escolhido na posição ${step.chosen.position}. Atenção não capturada: nenhuma ligação de atenção é desenhada.`;return}
 if(!target)return;
 const weight=step.attention.weights[target.position];
 $('tokenMeasure').textContent=`L${step.attention.layer} · cabeça ${step.attention.head} · consulta [${step.input_position}] ${readableToken(step.input_token.token)} → [${target.position}] ${readableToken(target.token)} · peso medido ${fmt(weight*100,6)}% (${weight}) · espessura ${fmt(1+8*weight,3)} px. Não mede importância causal.`;
}
function updateSceneLabels(){
 const mode=scene.mode,step=capture.steps[selected];document.querySelector('#sceneBox h1').textContent=mode==='tokens'?'Tokens e atenção':'Ativações por camada';
 $('sceneBox').classList.toggle('tokenMode',mode==='tokens');
 $('viewTokens').setAttribute('aria-pressed',String(mode==='tokens'));
 $('viewLayers').setAttribute('aria-pressed',String(mode==='layers'));
 $('network').setAttribute('aria-label',mode==='tokens'?'Tokens no contexto, consulta processada e próximo token. Arraste para girar. Clique em um token ou ligação para inspecionar a atenção. Os seletores abaixo oferecem os mesmos valores por teclado.':'Ativações por camada: pontos representam grupos de canais. Clique para inspecionar RMS; arraste para girar.');
 $('contextViewLabel').hidden=mode!=='tokens';$('tokenInspector').hidden=mode!=='tokens';
 document.querySelector('.inspector').hidden=mode==='tokens';
 if(mode==='tokens'){
  $('sceneLegend').textContent='Roxo: atenção (1 + 8 × peso px) · dourado: posição processada · verde: gerado · profundidade ilustrativa';
  $('scale').textContent='Arraste para girar · clique em token ou ligação · contexto completo por páginas';
  $('sceneStatus').textContent=step?(step.attention?`Passo ${step.step+1} · L${step.attention.layer}, cabeça ${step.attention.head} · ligações da consulta para o contexto`:`Passo ${step.step+1} · atenção não capturada`):'Esquema do processo · sem ativações ou atenção inventadas';
 }else{
  $('sceneLegend').textContent='3D ilustrativo · cor/tamanho = RMS · pulso dourado = animação';
  $('scale').textContent=step?`Escala RMS da captura: 0 → ${fmt(scene.maximum,4)}`:'Aguardando dados';
  $('sceneStatus').textContent=step?`Passo ${step.step+1} · saída de ${step.layers.length} camadas medidas`:'Estrutura esquemática · sem ativações capturadas';
 }
}
for(const [id,mode]of [['viewTokens','tokens'],['viewLayers','layers']])$(id).onclick=()=>{
 scene.mode=mode;scene.auto=false;rotationButton();scene.yaw=mode==='tokens'?-.08:-.25;scene.pitch=mode==='tokens'?.06:.15;scene.zoom=1;updateSceneLabels();
};
$('contextView').onchange=()=>{scene.tokenCards=[];scene.tokenEdges=[];updateSceneLabels()};
$('inspectToken').onchange=()=>{
 scene.tokenTarget=Number($('inspectToken').value);
 const visible=visibleContext();
 if(!visible.some(t=>t.position===scene.tokenTarget)&&scene.tokenTarget!==capture.steps[selected]?.input_position)$('contextView').value=String(Math.floor(scene.tokenTarget/tokenPageSize())*tokenPageSize());
 updateTokenMeasure();
};
function visibleContext(){
 const tokens=contextTokens(),step=capture.steps[selected];
 if($('contextView').value==='top'){
  if(step?.attention){const positions=new Set(step.attention.top.slice(0,tokenPageSize()).map(t=>t.position));return tokens.filter(t=>positions.has(t.position));}
  return tokens.slice(-tokenPageSize());
 }
 const start=Number($('contextView').value);return tokens.slice(start,start+tokenPageSize());
}

// Shallow orthographic 3D. Stroke widths stay in screen pixels so perspective
// cannot make an equal attention weight appear stronger merely by being nearer.
Scene.prototype.tokenProject=function(x,y,z){
 const yaw=this.yaw,pitch=this.pitch;
 const xx=x*Math.cos(yaw)+z*Math.sin(yaw),zz=-x*Math.sin(yaw)+z*Math.cos(yaw);
 return {x:this.w/2+xx*this.zoom,y:this.h/2+(y*Math.cos(pitch)-zz*Math.sin(pitch))*this.zoom,depth:y*Math.sin(pitch)+zz*Math.cos(pitch)};
};
function shortenToken(token,length=13){const text=readableToken(token);return text.length>length?text.slice(0,length-1)+'…':text;}
Scene.prototype.drawTokens=function(){
 const c=this.ctx,w=this.w,h=this.h;this.nodes=[];this.tokenCards=[];this.tokenEdges=[];
 const step=capture.steps[selected],all=contextTokens();
 c.save();c.font='11px system-ui';c.textAlign='center';
 if(!step){
  const y=h*.5,labels=all.length?[`${all.length} tokens de entrada`,'Modelo: calculando…','Próximo token ainda não escolhido']:['Sua pergunta','Modelo já treinado','Próximo token'];
  for(let i=0;i<3;i++){const x=w*(i+1)/4,bw=Math.min(145,w/4-14);c.fillStyle='#172536';c.strokeStyle='#536274';c.lineWidth=1;c.setLineDash([4,4]);c.beginPath();c.roundRect(x-bw/2,y-25,bw,50,8);c.fill();c.stroke();c.setLineDash([]);c.fillStyle='#a8b7c9';c.font=`${w<450?9:11}px system-ui`;const words=labels[i].split(': ');words.forEach((text,j)=>c.fillText(text,x,y+(j-((words.length-1)/2))*14, bw-10));if(i<2){c.fillStyle='#66788d';c.fillText('→',w*(i+1.5)/4,y)}}
  c.restore();return;
 }
 const attention=step.attention,query=step.input_token;
 const visible=visibleContext().filter(t=>t.position!==query.position);
 const columns=w<500?3:6,rows=Math.max(1,Math.ceil(visible.length/columns));
 const cardWidth=Math.min(106,(w-36)/columns-8),cardHeight=32;
 const contextTop=43,contextBottom=Math.max(contextTop+36,(h*.40));
 const source=this.tokenProject(-w*.22,h*.20,-28),chosen=this.tokenProject(w*.26,h*.20,30);
 const cards=visible.map((token,i)=>{
  const x=(i%columns-(columns-1)/2)*(cardWidth+8);
  const y=contextTop+(rows===1?0:Math.floor(i/columns)*(contextBottom-contextTop)/(rows-1))-h/2;
  return {...this.tokenProject(x,y,18),token,role:tokenRole(token),width:cardWidth,height:cardHeight};
 });
 // Draw the measured edges behind token cards, from the actual query only.
 for(const card of cards){
  if(!attention)continue;
  const weight=attention.weights[card.token.position];
  const start={x:source.x,y:source.y-25},end={x:card.x,y:card.y+cardHeight/2};
  const control={x:start.x+(end.x-start.x)*.15,y:(start.y+end.y)/2};
  const active=card.token.position===this.tokenTarget;
  c.strokeStyle=active?'#e0caff':'#a88bd380';c.lineWidth=1+8*weight;c.setLineDash([]);c.beginPath();c.moveTo(start.x,start.y);c.quadraticCurveTo(control.x,control.y,end.x,end.y);c.stroke();
  arrowHead(c,end,control,active?'#e0caff':'#a88bd3');
  this.tokenEdges.push({position:card.token.position,weight,width:1+8*weight,start,control,end});
 }
 if(attention){
  const weight=attention.weights[query.position],active=this.tokenTarget===query.position;
  c.strokeStyle=active?'#e0caff':'#a88bd3';c.lineWidth=1+8*weight;c.beginPath();c.ellipse(source.x-66,source.y,18,22,0,Math.PI*.4,Math.PI*1.8);c.stroke();
  c.font='9px system-ui';c.fillStyle='#c4abeb';c.fillText('si mesmo',source.x-65,source.y+36);
 }
 const drawCard=(card)=>{
  const {x,y,width,height,role,token}=card,active=token.position===this.tokenTarget;
  c.fillStyle='#0a1422';c.strokeStyle='#3b4a60';c.lineWidth=1;c.beginPath();c.roundRect(x-width/2+4,y-height/2-4,width,height,6);c.fill();c.stroke();
  c.fillStyle=role==='query'?'#382e21':role==='chosen'?'#173c31':role==='marker'?'#28273d':'#172c3d';
  c.strokeStyle=active?'#e0caff':tokenColors[role];c.lineWidth=active?2:1;c.beginPath();c.roundRect(x-width/2,y-height/2,width,height,6);c.fill();c.stroke();
  c.fillStyle=tokenColors[role];c.font='9px system-ui';
  c.fillText(`[${token.position}] ${role==='query'?'processado':role==='chosen'?'escolhido':role==='generated'?'gerado':role==='marker'?'marcador':'entrada'}`,x,y-5,width-8);
  c.fillStyle='#e8eef8';c.font=`${w<450?10:12}px ui-monospace,monospace`;c.fillText(shortenToken(token.token,w<450?9:13),x,y+10,width-8);
  this.tokenCards.push(card);
 };
 cards.sort((a,b)=>b.depth-a.depth).forEach(drawCard);
 // Dashed gold means a conceptual processing step, never an attention weight.
 c.strokeStyle='#dbb879';c.lineWidth=1.5;c.setLineDash([5,5]);c.beginPath();c.moveTo(source.x+60,source.y);c.lineTo(chosen.x-60,chosen.y);c.stroke();c.setLineDash([]);
 arrowHead(c,{x:chosen.x-60,y:chosen.y},{x:source.x+60,y:source.y},'#dbb879');
 c.fillStyle='#d9bd8c';c.font='10px system-ui';c.fillText('modelo → escolha', (source.x+chosen.x)/2,source.y-9,Math.max(50,chosen.x-source.x-125));
 drawCard({...source,token:query,role:'query',width:112,height:42});
 drawCard({...chosen,token:step.chosen,role:'chosen',width:112,height:42});
 c.fillStyle='#9db3c7';c.font='10px system-ui';c.fillText('já pertence ao contexto',source.x,source.y+51,140);
 c.fillText('entra no próximo passo',chosen.x,chosen.y+35,150);
 c.fillStyle='#9edbc5';c.fillText(`p bruta: ${fmt(step.chosen_probability*100)}%`,chosen.x,chosen.y+49,150);
 c.restore();
};
function arrowHead(c,end,from,color){const a=Math.atan2(end.y-from.y,end.x-from.x);c.save();c.fillStyle=color;c.beginPath();c.moveTo(end.x,end.y);c.lineTo(end.x-6*Math.cos(a-.5),end.y-6*Math.sin(a-.5));c.lineTo(end.x-6*Math.cos(a+.5),end.y-6*Math.sin(a+.5));c.closePath();c.fill();c.restore()}
Scene.prototype.pickToken=function(x,y){
 const card=[...this.tokenCards].reverse().find(p=>Math.abs(p.x-x)<=p.width/2&&Math.abs(p.y-y)<=p.height/2);
 if(card?.role==='chosen'){activateTab($('tab-probability'));if(matchMedia('(max-width:760px)').matches)document.querySelector('.detailsCard').classList.add('mobileOpen');return}
 let target=card?.token.position;
 if(target===undefined){
  let distance=Infinity;
  for(const edge of this.tokenEdges){for(let i=1;i<30;i++){const t=i/30,u=1-t,px=u*u*edge.start.x+2*u*t*edge.control.x+t*t*edge.end.x,py=u*u*edge.start.y+2*u*t*edge.control.y+t*t*edge.end.y,d=Math.hypot(x-px,y-py);if(d<Math.max(7,edge.width/2+3)&&d<distance){target=edge.position;distance=d}}}
 }
 if(target!==undefined&&capture.steps[selected]?.attention){this.auto=false;rotationButton();this.tokenTarget=target;$('inspectToken').value=String(target);updateTokenMeasure()}
};
let lastTokenPageSize=tokenPageSize();
new ResizeObserver(()=>{const size=tokenPageSize();if(size!==lastTokenPageSize){lastTokenPageSize=size;$('contextView').value='top';refreshTokenScene()}}).observe($('network').parentElement);
refreshTokenScene();
