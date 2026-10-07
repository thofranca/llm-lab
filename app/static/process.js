'use strict';
let processReplay=null,processReplayEnd=0,visualStep=null,pulseStarted=-Infinity;
const reducedProcessMotion=matchMedia('(prefers-reduced-motion: reduce)');

Scene.prototype.drawStructure=function(){
 const c=this.ctx,ids=capture.meta?.layers_captured??[0,1,2,3,4,5];
 const bins=capture.meta?.bins??16;this.nodes=[];
 for(let l=0;l<ids.length;l++){
  const x=ids.length===1?0:(l/(ids.length-1)-.5)*560;
  c.strokeStyle='#314052';c.lineWidth=1;c.setLineDash([3,5]);c.beginPath();
  for(let j=0;j<=48;j++){const a=j/48*Math.PI*2,p=this.project(x,Math.sin(a)*87,Math.cos(a)*87);if(j)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)}c.stroke();c.setLineDash([]);
  for(let j=0;j<bins;j++){const a=j/bins*Math.PI*2,p=this.project(x,Math.sin(a)*72,Math.cos(a)*72);c.beginPath();c.fillStyle='#526172';c.arc(p.x,p.y,Math.max(1.5,2.6*p.s),0,Math.PI*2);c.fill()}
  const p=this.project(x,112,0);c.fillStyle='#8391a2';c.font='10px system-ui';c.textAlign='center';c.fillText(capture.meta?'L'+ids[l]:'Bloco',p.x,p.y);
 }
};
Scene.prototype.drawProcessPulse=function(){
 if(this.mode==='tokens'||reducedProcessMotion.matches)return;
 const elapsed=performance.now()-pulseStarted;
 const waiting=Boolean(controller)&&Boolean(capture.meta)&&!capture.steps.length;
 if(!waiting&&(elapsed<0||elapsed>1200))return;
 const progress=waiting?(performance.now()%1200)/1200:elapsed/1200;
 const c=this.ctx,x=(progress-.5)*560;c.save();c.strokeStyle='#e4bc77';c.lineWidth=1.5;c.setLineDash([4,6]);c.beginPath();
 for(let j=0;j<=48;j++){const a=j/48*Math.PI*2,p=this.project(x,Math.sin(a)*96,Math.cos(a)*96);if(j)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)}c.stroke();c.restore();
};
function renderPromptTokens(){
 $('promptTokens').replaceChildren();$('processFlow').firstElementChild.textContent=`Entrada: ${capture.meta?.prompt_tokens??0} tokens`;
 for(const token of capture.meta?.prompt??[]){const el=document.createElement('span');el.textContent=`${token.position}: ${readableToken(token.token)}`;el.title=`ID ${token.id} · token bruto: ${token.token}`;$('promptTokens').append(el)}
 $('promptDescription').textContent=`${capture.meta.prompt_tokens} tokens de entrada, incluindo instruções de sistema e marcadores. A primeira passagem processa todos; as seguintes reutilizam o cache KV.`;
 refreshTokenScene?.();if(!capture.steps.length)$('sceneStatus').textContent=scene.mode==='tokens'?'Entrada tokenizada · aguardando a primeira escolha':'Entrada tokenizada · estrutura das camadas capturadas · aguardando ativações';
}
function updateProcessVisual(){
 const step=capture.steps[selected];
 $('playProcess').disabled=Boolean(controller)||capture.steps.length<2;
 if(step&&step!==visualStep){
  visualStep=step;pulseStarted=performance.now();
  const flow=$('processFlow');flow.classList.remove('illustrating');void flow.offsetWidth;flow.classList.add('illustrating');
  flow.lastElementChild.textContent=`Token: ${readableToken(step.chosen.token)}`;
 }
 if(!step){$('processFlow').classList.remove('illustrating');$('processFlow').lastElementChild.textContent='Token'}
 $('processFlow').title='Animação didática da ordem do cálculo; não representa o tempo real de processamento.';
 renderAttentionLinks();refreshTokenScene?.();
}
function resetProcessVisual(){
 visualStep=null;pulseStarted=-Infinity;$('processFlow').firstElementChild.textContent='Entrada';$('playProcess').disabled=true;
 $('attentionLinks').replaceChildren();$('promptTokens').replaceChildren();
 $('promptDescription').textContent='Aguardando tokenização da nova entrada.';
 $('processFlow').classList.remove('illustrating');$('processFlow').lastElementChild.textContent='Token';
 refreshTokenScene?.();
}
function stopProcessReplay(){
 if(processReplay!==null)clearInterval(processReplay);processReplay=null;
 $('playProcess').textContent='▶ Reproduzir';$('playProcess').setAttribute('aria-pressed','false');
}
$('playProcess').onclick=()=>{
 if(processReplay!==null){stopProcessReplay();return}
 if(controller||capture.steps.length<2)return;
 $('follow').checked=false;processReplayEnd=capture.steps.length-1;
 show(selected>=processReplayEnd?0:selected);
 $('playProcess').textContent='Ⅱ Pausar';$('playProcess').setAttribute('aria-pressed','true');
 processReplay=setInterval(()=>{if(document.hidden)return;if(selected>=processReplayEnd){stopProcessReplay();return}show(selected+1)},1400);
};

function svgElement(name,attributes={},text){
 const element=document.createElementNS('http://www.w3.org/2000/svg',name);
 for(const [key,value]of Object.entries(attributes))element.setAttribute(key,value);
 if(text!==undefined)element.textContent=text;return element;
}
function renderAttentionLinks(){
 const host=$('attentionLinks');host.replaceChildren();if(!$('showAttentionLinks').checked)return;
 const step=capture.steps[selected],attention=step?.attention;
 if(!attention){const p=document.createElement('p');p.className='small';p.textContent=step?'Atenção não capturada nesta execução. Ative a captura antes de gerar novamente.':'Gere uma resposta para consultar ligações medidas.';host.append(p);return}
 const caption=document.createElement('p');caption.className='small';caption.textContent=`Passo ${step.step+1} · L${attention.layer}, cabeça ${attention.head}. Consulta na posição ${attention.query_position}; o token escolhido na posição ${step.chosen.position} ainda não faz parte desse contexto.`;host.append(caption);
 const rows=attention.top,svg=svgElement('svg',{viewBox:`0 0 400 ${65+rows.length*28}`,role:'img','aria-label':`Pesos de atenção da posição ${attention.query_position} para as ${rows.length} posições com maior peso`});
 svg.append(svgElement('title',{},'Ligações medidas: consulta → posições do contexto. Não são conexões entre neurônios.'));
 const defs=svgElement('defs'),marker=svgElement('marker',{id:'attentionArrow',viewBox:'0 0 6 6',refX:6,refY:3,markerWidth:5,markerHeight:5,orient:'auto',markerUnits:'userSpaceOnUse'});
 marker.append(svgElement('path',{d:'M0 0 L6 3 L0 6',fill:'#bfacf3'}));defs.append(marker);svg.append(defs);
 svg.append(svgElement('circle',{cx:24,cy:23,r:6,fill:'#bfacf3'}));
 svg.append(svgElement('text',{x:40,y:27,fill:'#ddd2ff','font-size':12},`Consulta [${attention.query_position}]: ${readableToken(attention.query_token.token).slice(0,34)}`));
 for(let i=0;i<rows.length;i++){
  const row=rows[i],y=65+i*28;
  const link=svgElement('path',{d:`M24 31 Q24 ${y} 133 ${y}`,fill:'none',stroke:'#bfacf3','stroke-width':1+8*row.weight,'stroke-dasharray':'4 4','marker-end':'url(#attentionArrow)','data-position':row.position,'data-weight':row.weight});
  link.append(svgElement('title',{},`Posição ${row.position}: ${row.token} · peso ${row.weight}`));svg.append(link);
  svg.append(svgElement('rect',{x:141,y:y-11,width:250,height:23,rx:5,fill:'#1e213b'}));
  const label=svgElement('text',{x:150,y:y+4,fill:'#dce3f2','font-size':11},`[${row.position}] ${readableToken(row.token).slice(0,22)}`);label.append(svgElement('title',{},row.token));svg.append(label);
  svg.append(svgElement('text',{x:382,y:y+4,fill:'#cfbaff','font-size':11,'text-anchor':'end'},fmt(row.weight*100)+'%'));
 }
 host.append(svg);const note=document.createElement('p');note.className='small';note.textContent=`Roxo tracejado = atenção medida (12 maiores, ou todas se houver menos). Espessura = 1 + 8 × peso. Outras posições: ${fmt(attention.remaining_mass*100)}%. Não mede importância causal.`;host.append(note);
}
$('showAttentionLinks').onchange=renderAttentionLinks;
