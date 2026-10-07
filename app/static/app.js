'use strict';
const $=id=>document.getElementById(id);
const fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
let capture={meta:null,steps:[],done:null},controller=null,selected=0;
class Scene{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.yaw=-.25;this.pitch=.15;this.zoom=1;this.auto=false;this.layers=[];this.maximum=1;this.drag=null;this.last=0;this.nodes=[];this.picked=null;new ResizeObserver(()=>this.resize()).observe(canvas.parentElement);
 canvas.addEventListener('pointerdown',e=>{this.down=[e.clientX,e.clientY];this.drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.yaw+=(e.clientX-this.drag[0])*.005;this.pitch=Math.max(-.65,Math.min(.65,this.pitch+(e.clientY-this.drag[1])*.005));this.drag=[e.clientX,e.clientY]});canvas.addEventListener('pointerup',e=>{if(this.down&&Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])<6){const r=canvas.getBoundingClientRect();if(this.mode==='tokens'){this.pickToken?.(e.clientX-r.left,e.clientY-r.top);return}const p=[...this.nodes].reverse().find(p=>Math.hypot(p.x-(e.clientX-r.left),p.y-(e.clientY-r.top))<Math.max(10,p.radius));if(p&&this.layers.length){this.auto=false;rotationButton();$('pointLayer').value=p.layer;fillGroups(p.group);inspectPoint()}}});for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>this.drag=null);
 canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.6,Math.min(1.8,this.zoom-e.deltaY*.001))},{passive:false});canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')this.yaw-=.1;if(e.key==='ArrowRight')this.yaw+=.1;if(e.key==='ArrowUp')this.pitch=Math.max(-.65,this.pitch-.1);if(e.key==='ArrowDown')this.pitch=Math.min(.65,this.pitch+.1);if(e.key==='+'||e.key==='=')this.zoom=Math.min(1.8,this.zoom+.1);if(e.key==='-')this.zoom=Math.max(.6,this.zoom-.1)}});requestAnimationFrame(t=>this.frame(t));}
 resize(){const r=this.canvas.parentElement.getBoundingClientRect();this.w=r.width;this.h=r.height;const d=Math.min(devicePixelRatio||1,2);this.canvas.width=r.width*d;this.canvas.height=r.height*d;this.ctx.setTransform(d,0,0,d,0,0)}
 project(x,y,z){let xx=x*Math.cos(this.yaw)+z*Math.sin(this.yaw),zz=-x*Math.sin(this.yaw)+z*Math.cos(this.yaw);let yy=y*Math.cos(this.pitch)-zz*Math.sin(this.pitch),depth=y*Math.sin(this.pitch)+zz*Math.cos(this.pitch);const s=Math.min(this.w/780,this.h/320)*this.zoom*1000/(1000+depth);return{x:this.w/2+xx*s,y:this.h*.5+yy*s,depth,s}}
 frame(t){const dt=this.last?Math.min(50,t-this.last):0;this.last=t;if(!document.hidden){if(this.auto&&!this.drag)this.yaw+=dt*.000065;this.draw();this.drawProcessPulse?.()}requestAnimationFrame(v=>this.frame(v))}
 draw(){const c=this.ctx;c.clearRect(0,0,this.w,this.h);if(this.mode==='tokens'){this.drawTokens?.();return}if(!this.layers.length){this.drawStructure?.();return}const nodes=[];const count=this.layers.length;const span=560;for(let l=0;l<count;l++){const x=count===1?0:(l/(count-1)-.5)*span;const layer=this.layers[l];c.strokeStyle='rgba(106,163,180,.18)';c.beginPath();for(let j=0;j<=50;j++){const a=j/50*Math.PI*2,p=this.project(x,Math.sin(a)*87,Math.cos(a)*87);if(j===0)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y)}c.stroke();layer.bins.forEach((value,j)=>{const a=j/layer.bins.length*Math.PI*2;nodes.push({...this.project(x,Math.sin(a)*72,Math.cos(a)*72),value,layer:layer.layer,group:j})});const p=this.project(x,112,0);c.fillStyle='#a9bdcf';c.font='11px system-ui';c.textAlign='center';if(p.y<this.h-12&&p.x>35&&p.x<this.w-35)c.fillText('L'+layer.layer,p.x,p.y)}nodes.sort((a,b)=>b.depth-a.depth);this.nodes=nodes;for(const p of nodes){const ratio=Math.min(1,p.value/this.maximum);const rgb=[Math.round(35+ratio*83),Math.round(74+ratio*158),Math.round(112+ratio*85)];c.fillStyle=`rgb(${rgb})`;c.shadowColor=c.fillStyle;c.shadowBlur=ratio*13;c.beginPath();p.radius=(2.5+ratio*5)*Math.max(.65,p.s);c.arc(p.x,p.y,p.radius,0,Math.PI*2);c.fill();c.shadowBlur=0;if(this.picked&&p.layer===this.picked.layer&&p.group===this.picked.group){c.strokeStyle='#fff';c.lineWidth=2;c.stroke()}}}
}
const scene=new Scene($('network'));function rotationButton(){$('rotate').textContent=scene.auto?'Rotação ligada':'Rotação desligada';$('rotate').setAttribute('aria-pressed',String(scene.auto))}rotationButton();$('rotate').onclick=()=>{scene.auto=!scene.auto;rotationButton()};$('center').onclick=()=>{scene.yaw=scene.mode==='tokens'?0:-.25;scene.pitch=scene.mode==='tokens'?0:.15;scene.zoom=1};$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('lab').requestFullscreen()}catch{$('status').textContent='Tela cheia indisponível neste navegador.'}};
function bars(id,rows,valueKey){$(id).replaceChildren();for(const row of rows){const div=document.createElement('div');div.className='bar';const name=document.createElement('span');name.className='name';name.textContent=row.label??readableToken(row.token);name.title=row.token??row.label;const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.className='fill';fill.style.width=(Math.min(1,row[valueKey])*100)+'%';track.append(fill);const value=document.createElement('span');value.textContent=fmt(row[valueKey]*100)+'%';div.append(name,track,value);$(id).append(div)}}
function show(index){const step=capture.steps[index];if(!step)return;selected=index;$('timeline').value=index;$('stepLabel').textContent=`Passo ${index+1} de ${capture.steps.length} · ${step.phase==='thinking'?'raciocínio':'resposta'}`;$('context').textContent=`Posição processada ${step.input_position}: ${readableToken(step.input_token.token)} → escolheu posição ${step.chosen.position}: ${readableToken(step.chosen.token)}`;scene.layers=step.layers;$('sceneStatus').textContent=`Passo ${index+1} · saída de ${step.layers.length} camadas medidas · última posição processada`;$('chosen').textContent=`Escolhido: ${readableToken(step.chosen.token)} · probabilidade bruta ${fmt(step.chosen_probability*100)}%`;bars('probs',step.top,'probability');updateAnswer();$('previous').disabled=index===0;$('next').disabled=index===capture.steps.length-1;$('pinReference').disabled=false;
 $('layers').replaceChildren();for(const layer of step.layers){const div=document.createElement('div');div.className='metric';const name=document.createElement('span');name.textContent='Camada '+layer.layer;const val=document.createElement('span');val.textContent='RMS '+fmt(layer.rms,4);div.append(name,val);$('layers').append(div)}
 if(step.attention){const a=step.attention;$('attentionTitle').textContent=`Camada ${a.layer}, cabeça ${a.head} · consulta na posição ${a.query_position} (${a.query_token.token})`;bars('attn',a.top.map(x=>({...x,label:`[${x.position}] ${x.token}`})),'weight');$('remaining').textContent=`Outras posições: ${fmt(a.remaining_mass*100)}% · ${a.keys_total} posições no contexto.`}else{$('attn').replaceChildren();$('attentionTitle').textContent='Atenção não capturada nesta execução.';$('remaining').textContent=''}
 updateProcessVisual();updateInspector();renderComparison();for(const b of $('steps').children)b.setAttribute('aria-pressed',String(Number(b.dataset.index)===index));revealSelectedToken();
}
function processEvent(e){if(e.type==='status')$('status').textContent=e.message;if(e.type==='error')throw new Error(e.message);if(e.type==='meta'){capture.meta=e;renderPromptTokens();$('model').textContent=`${e.model} · ${e.device} · ${e.dtype} · ${e.layers_total} camadas · ${e.prompt_tokens} tokens de entrada`;$('layer').max=e.layers_total-1;$('head').max=e.heads-1;$('status').textContent='Capturando ativações e gerando…'}if(e.type==='step'){if(!capture.steps.length)$('steps').replaceChildren();capture.steps.push(e);const option=document.createElement('option');option.value=capture.steps.length-1;option.textContent=`Passo ${capture.steps.length} · posição ${e.input_position}`;$('compareStep').append(option);$('compareStep').disabled=false;scene.maximum=Math.max(scene.maximum,...e.layers.flatMap(x=>x.bins));$('scale').textContent=`Escala RMS da captura: 0 → ${fmt(scene.maximum,4)}`;$('timeline').disabled=false;$('timeline').max=capture.steps.length-1;$('export').disabled=false;const b=document.createElement('button');b.type='button';b.dataset.index=capture.steps.length-1;const number=document.createElement('small');number.textContent=capture.steps.length;const token=document.createElement('span');token.textContent=readableToken(e.chosen.token);b.append(number,token);b.title=`Passo ${capture.steps.length} · token bruto: ${e.chosen.token} · posição ${e.chosen.position}`;b.setAttribute('aria-label',`Passo ${capture.steps.length}: ${readableToken(e.chosen.token)}`);b.onclick=()=>{stopProcessReplay();$('follow').checked=false;show(Number(b.dataset.index))};$('steps').append(b);if($('follow').checked)show(capture.steps.length-1);else show(selected)}if(e.type==='done'){capture.done=e;updateAnswer();updateProcessVisual();$('status').textContent=e.reason==='length'?'Captura concluída no limite de tokens.':'Captura concluída.';$('stats').textContent=`${e.generated_tokens} tokens · ${fmt(e.generation_ms/1000)} s nos passos instrumentados (sem carga/streaming) · pico de tensores CUDA: ${e.peak_vram_mib==null?'CPU':fmt(e.peak_vram_mib)+' MiB'}`;return true}return false}
$('timeline').oninput=()=>{stopProcessReplay();$('follow').checked=false;show(Number($('timeline').value))};$('follow').onchange=()=>{stopProcessReplay();if($('follow').checked)show(capture.steps.length-1)};
$('export').onclick=()=>{const data={format:'llm-lab-v2',...capture};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='captura-llm.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('think').onchange=()=>{if($('think').checked&&Number($('count').value)<64)$('count').value=64};$('stop').onclick=()=>controller?.abort();
$('form').onsubmit=async ev=>{ev.preventDefault();if(controller)return;const message=$('question').value.trim();if(!message)return;stopProcessReplay();capture={meta:null,steps:[],done:null};resetProcessVisual();$('settings').open=false;for(const id of ['previous','next','pinReference'])$(id).disabled=true;$('answerState').textContent='Gerando…';selected=0;scene.layers=[];scene.nodes=[];scene.picked=null;for(const id of ['pointLayer','pointGroup','pointValue','compareStep','comparison','comparisonContext','comparisonExtras'])$(id).replaceChildren();$('compareStep').disabled=true;scene.maximum=0.000001;$('timeline').disabled=true;$('timeline').max=0;$('timeline').value=0;$('follow').checked=true;$('export').disabled=true;for(const id of ['answer','probs','layers','attn','steps','remaining','chosen'])$(id).replaceChildren();$('stats').textContent='Tempos incluem o custo da instrumentação.';$('context').textContent='Aguardando primeiro passo.';$('stepLabel').textContent='Passos da geração';$('scale').textContent='Escala: aguardando dados';$('sceneStatus').textContent='Aguardando medições…';controller=new AbortController();const payload={message,max_tokens:Number($('count').value),temperature:Number($('temperature').value),think:$('think').checked,attention:$('attention').checked,attention_layer:Number($('layer').value),attention_head:Number($('head').value)};const controls=['send','count','temperature','think','attention','layer','head'];controls.forEach(id=>$(id).disabled=true);$('stop').disabled=false;let done=false;
 try{const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});if(!r.ok){const error=await r.json();throw new Error(typeof error.detail==='string'?error.detail:JSON.stringify(error.detail))}const reader=r.body.getReader(),decoder=new TextDecoder();let buf='';while(true){const {value,done:ended}=await reader.read();buf+=decoder.decode(value,{stream:!ended});let n;while((n=buf.indexOf('\n'))>=0){const line=buf.slice(0,n);buf=buf.slice(n+1);if(line.trim())done=processEvent(JSON.parse(line))||done}if(ended){if(buf.trim())done=processEvent(JSON.parse(buf))||done;break}}if(!done)throw new Error('A transmissão terminou antes da conclusão.')}
 catch(e){controller.abort();$('status').textContent=e.name==='AbortError'?'Interrupção solicitada. A operação em curso termina antes de liberar o modelo.':e.message}
 finally{controller=null;updateAnswer();updateProcessVisual();controls.forEach(id=>$(id).disabled=false);$('stop').disabled=true}
};
fetch('/api/info').then(r=>r.json()).then(info=>{$('model').textContent=info.model+' · backend PyTorch / Transformers · captura real'}).catch(()=>{$('model').textContent='Não foi possível consultar o servidor.'});

function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o}
function fillGroups(preferred=Number($('pointGroup').value)){
 const layer=capture.steps[selected]?.layers.find(x=>x.layer===Number($('pointLayer').value));
 $('pointGroup').replaceChildren();if(!layer)return;
 for(const g of layer.groups)$('pointGroup').append(option(g.group,`${g.group} · canais ${g.channel_start}–${g.channel_end_exclusive-1}`));
 $('pointGroup').value=String(Math.min(preferred,layer.groups.length-1));
}
function updateInspector(){
 const step=capture.steps[selected];const old=$('pointLayer').value;
 $('pointLayer').replaceChildren(...step.layers.map(x=>option(x.layer,`Camada ${x.layer}`)));
 if(step.layers.some(x=>String(x.layer)===old))$('pointLayer').value=old;
 fillGroups();inspectPoint();
}
function inspectPoint(){
 const step=capture.steps[selected];if(!step)return;
 const layer=step.layers.find(x=>x.layer===Number($('pointLayer').value));
 const group=Number($('pointGroup').value),g=layer.groups[group];
 scene.picked={layer:layer.layer,group};
 const pointDescription=`Passo ${selected+1} · posição ${step.input_position} → ${step.chosen.position} · camada ${layer.layer} · grupo ${group} · canais ${g.channel_start}–${g.channel_end_exclusive-1} · RMS medido ${layer.bins[group]} · RMS da camada ${layer.rms}`;
 $('pointValue').replaceChildren(...pointDescription.split(' · ').map(text=>{const span=document.createElement('span');span.className='pointFragment';span.textContent=text+' ';return span}));
}
$('pointLayer').onchange=()=>{fillGroups();inspectPoint()};$('pointGroup').onchange=inspectPoint;
$('compareStep').onchange=renderComparison;
function cells(row,values){for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td)}return row}
function extraTable(title,headers,rows){
 const section=document.createElement('details'),summary=document.createElement('summary');summary.textContent=title;section.append(summary);
 const wrap=document.createElement('div');wrap.className='tableScroll';const table=document.createElement('table');const head=document.createElement('thead'),tr=document.createElement('tr');
 for(const h of headers){const th=document.createElement('th');th.textContent=h;tr.append(th)}head.append(tr);table.append(head);
 const body=document.createElement('tbody');for(const row of rows)body.append(cells(document.createElement('tr'),row));table.append(body);wrap.append(table);section.append(wrap);$('comparisonExtras').append(section);
}
function renderComparison(){
 const a=capture.steps[Number($('compareStep').value)],b=capture.steps[selected];if(!a||!b)return;
 $('comparisonContext').textContent=`A: passo ${a.step+1}, posição ${a.input_position} (${a.input_token.token}) → ${a.chosen.position} (${a.chosen.token}). B: passo ${b.step+1}, posição ${b.input_position} (${b.input_token.token}) → ${b.chosen.position} (${b.chosen.token}).`;
 $('comparison').replaceChildren();
 for(const layer of b.layers){const before=a.layers.find(x=>x.layer===layer.layer);for(const g of layer.groups){const av=before.bins[g.group],bv=layer.bins[g.group];const row=cells(document.createElement('tr'),[`L${layer.layer} / G${g.group}`,`${g.channel_start}–${g.channel_end_exclusive-1}`,fmt(av,6),fmt(bv,6),fmt(bv-av,6)]);$('comparison').append(row)}}
 $('comparisonExtras').replaceChildren();
 if(a.attention&&b.attention){
  const tokens=[...capture.meta.prompt,...capture.steps.map(s=>s.chosen)];const aw=a.attention.weights,bw=b.attention.weights;
  extraTable(`Atenção medida · camada ${a.attention.layer}, cabeça ${a.attention.head} · todas as posições`,['Posição / token','A (%)','B (%)','Δ (p.p.)'],Array.from({length:Math.max(aw.length,bw.length)},(_,i)=>[`${i} / ${tokens[i]?.token??''}`,i<aw.length?fmt(aw[i]*100,6):'Fora do contexto',i<bw.length?fmt(bw[i]*100,6):'Fora do contexto',i<aw.length&&i<bw.length?fmt((bw[i]-aw[i])*100,6):'—']));
 }else{const p=document.createElement('p');p.className='small';p.textContent='Atenção não capturada; comparação indisponível.';$('comparisonExtras').append(p)}
 const probabilities=s=>new Map([...s.top.map(t=>[t.id,{token:t.token,p:t.probability}]),[s.chosen.id,{token:s.chosen.token,p:s.chosen_probability}]]);
 const ap=probabilities(a),bp=probabilities(b);
 extraTable('Probabilidades brutas · top 5 + token escolhido de cada passo',['Token (ID)','A (%)','B (%)','Δ (p.p.)'],[...new Set([...ap.keys(),...bp.keys()])].map(id=>{const av=ap.get(id),bv=bp.get(id);return[`${(av??bv).token} (${id})`,av?fmt(av.p*100,6):'Não armazenada',bv?fmt(bv.p*100,6):'Não armazenada',av&&bv?fmt((bv.p-av.p)*100,6):'—']}));
}

// The answer stays complete while the selected step drives only the measurements.
function readableToken(token){return token.replaceAll('Ġ',' ').replaceAll('Ċ','↵').replaceAll('ĉ','⇥')||'∅'}
function updateAnswer(){
 const answer=$('answer'),nearEnd=answer.scrollHeight-answer.scrollTop-answer.clientHeight<30;
 const latest=capture.steps.at(-1);const text=latest?.text??'';
 if(answer.textContent!==text){answer.textContent=text;if(nearEnd)answer.scrollTop=answer.scrollHeight;}
 $('answerState').textContent=capture.done?(capture.done.reason==='length'?'Limite de tokens':'Concluída'):(controller?'Gerando…':latest?'Parcial':'Aguardando');
}
function moveStep(delta){stopProcessReplay();$('follow').checked=false;show(Math.max(0,Math.min(capture.steps.length-1,selected+delta)))}
$('previous').onclick=()=>moveStep(-1);$('next').onclick=()=>moveStep(1);
$('pinReference').onclick=()=>{$('compareStep').value=selected;renderComparison()};
const tabs=[...document.querySelectorAll('[role=tab]')];
function activateTab(tab){
 for(const item of tabs){const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;$(item.getAttribute('aria-controls')).hidden=!active;}
}
for(const tab of tabs){
 tab.onclick=()=>{const card=document.querySelector('.detailsCard');const same=tab.getAttribute('aria-selected')==='true';if(matchMedia('(max-width:760px)').matches)card.classList.toggle('mobileOpen',!same||!card.classList.contains('mobileOpen'));activateTab(tab)};
 tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key))return;e.preventDefault();if(e.key==='Escape'){document.querySelector('.detailsCard').classList.remove('mobileOpen');return}const i=tabs.indexOf(tab),next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];activateTab(next);next.focus()};
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('settings').open=false;document.querySelector('.detailsCard').classList.remove('mobileOpen')}});

function revealSelectedToken(){
 const strip=$('steps'),active=strip.children[selected];if(!active)return;
 const ar=active.getBoundingClientRect(),sr=strip.getBoundingClientRect();
 if(ar.left<sr.left||ar.right>sr.right)strip.scrollLeft+=ar.left-sr.left-strip.clientWidth/2+ar.width/2;
}
new ResizeObserver(revealSelectedToken).observe($('steps'));
$('closeDetails').onclick=()=>{document.querySelector('.detailsCard').classList.remove('mobileOpen');document.querySelector('[role=tab][aria-selected=true]').focus()};
