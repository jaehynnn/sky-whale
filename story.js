'use strict';
(() => {
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 const clamp=x=>Math.max(0,Math.min(1,x)), smooth=x=>{x=clamp(x);return x*x*(3-2*x)}, seg=(s,a,b)=>smooth((s-a)/(b-a));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const stage=$('#stage'),story=$('#story'),choices=$('#choices'),refuse=$('#refuse'),accept=$('#accept');
 let accepted=false,missionsOpen=false,lastTime=performance.now(),introStart=performance.now(),s=0,currentChapter=-1,lastDodge=0,dodgeCount=0,resizeTimer;
 let vh=stage.clientHeight,storyLength=9.6,renderQueued=false,activeDialogue=null,dialogueStart=0;
 const dialogues=$$('.dialogue');
 dialogues.forEach(el=>{const text=el.dataset.text.replaceAll('\\n','\n');el.setAttribute('aria-label',text);const visual=document.createElement('span');visual.setAttribute('aria-hidden','true');text.split('\n').forEach(line=>{const row=document.createElement('span');row.className='line';line.split(/(\s+)/).forEach(word=>{const group=document.createElement('span');group.className='word';[...word].forEach(c=>{const ch=document.createElement('span');ch.className='char';ch.textContent=c;group.append(ch)});row.append(group)});visual.append(row)});el.append(visual);el._chars=[...el.querySelectorAll('.char')];});
 for(let i=0;i<100;i++){const star=document.createElement('i');star.style.cssText=`left:${(i*61.71)%100}%;top:${(i*37.39)%100}%;width:${i%9===0?2:1}px;height:${i%9===0?2:1}px;--twinkle:${3+i%6}s;animation-delay:-${i%7}s`;$('#stars').append(star)}
 function reveal(el,p){el._chars.forEach((c,i)=>{const a=reduced?1:smooth((p-i/Math.max(1,el._chars.length-1)*.8)/.2);c.style.opacity=a;c.style.transform=`translateY(${(1-a)*8}px)`})}
 function visibility(el,v,interactive=false){v=clamp(v);el.style.opacity=v;el.classList.toggle('is-active',v>.001);el.inert=v<=.001;el.setAttribute('aria-hidden',String(v<=.001));}
 function type(el,p){if(activeDialogue!==el){activeDialogue=el;dialogueStart=performance.now()}const auto=(performance.now()-dialogueStart)/(el._chars.length*34+350);reveal(el,Math.max(p,auto));}
 function setChapter(index){if(currentChapter===index)return;currentChapter=index;const labels=['낯선 여행자의 목소리','별빛이 가리키는 곳','하늘고래의 선착장','당신을 위한 초대','함께 떠날 준비'];$('#chapter-number').textContent=String(index+1).padStart(2,'0');$('#chapter-name').textContent=labels[index];$$('[data-jump]').forEach((b,i)=>{if(i===Math.min(3,index))b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')})}
 function render(now){
  s=Math.min(storyLength,Math.max(0,scrollY/vh));
  const introFade=1-seg(s,.85,1.25),mapFade=seg(s,.95,1.45)*(1-seg(s,3.05,3.8)),harborFade=seg(s,3.2,4)*(1-seg(s,6.65,7.35)),inviteFade=seg(s,6.9,7.65)*(accepted?1-seg(s,9.15,9.75):1),acceptedFade=accepted?seg(s,9.15,9.85):0;
  visibility($('#intro'),introFade);$('#intro-art').style.opacity=introFade*.75;
  reveal(dialogues[0],(now-introStart)/(dialogues[0]._chars.length*36+500));
  visibility($('#map-scene'),mapFade);
  const z=seg(s,2.05,3.55),mw=$('#map-world'),w=mw.clientWidth,h=mw.clientHeight;
  // Anchor is the western coast: rotation and translation follow the same destination.
  mw.style.transform=reduced?'none':`translate(${w*.115*z}px,${h*.243*z}px) rotate(${-23*z}deg) scale(${1+4.5*z*z})`;
  $('.map-heading').style.opacity=1-seg(s,2.1,2.65);$('.compass').style.opacity=1-seg(s,2.7,3.2);$('.marker-label').style.opacity=1-seg(s,2.2,2.6);
  visibility($('#harbor'),harborFade);
  $('#harbor-image').style.transform=reduced?'none':`scale(${1.06-.06*seg(s,3.2,6.6)}) translateY(${-1.5*seg(s,4,6.6)}%)`;
  const arrival=seg(s,3.65,4.1)*(1-seg(s,4.45,4.8)),night=seg(s,5.0,5.2)*(1-seg(s,6.4,6.8));
  $('#arrival-caption').style.opacity=arrival;$('#arrival-caption').setAttribute('aria-hidden',String(arrival<.01));
  $('#night-caption').style.opacity=night;$('#night-caption').setAttribute('aria-hidden',String(night<.01));
  if(arrival>.01)type(dialogues[1],seg(s,3.8,4.35));
  if(night>.01)type(dialogues[2],seg(s,5.05,6.1));
  // A full image-only pause (4.8–5.0) separates the arrival from the next narration.
  const fly=seg(s,5.7,6.9);$('#whale-flight').style.left=`${-85+145*fly}%`;$('#whale-flight').style.opacity=reduced?0:seg(s,5.7,5.95)*(1-seg(s,6.65,6.95));$('#whale-flight').style.transform=`scale(${.45+1.25*fly}) rotate(${-12+15*fly}deg)`;
  visibility($('#invitation'),inviteFade,inviteFade>.95 && !accepted);
  if(inviteFade>.01)type(dialogues[3],seg(s,7.3,8.15));
  const choiceReady=s>=8.15 && !accepted;choices.style.opacity=seg(s,8.05,8.45);choices.inert=!choiceReady;choices.setAttribute('aria-hidden',String(!choiceReady));$('.invitation-question').style.opacity=seg(s,7.95,8.25);
  visibility($('#accepted'),acceptedFade,acceptedFade>.1);
  if(acceptedFade>.01)type(dialogues[4],seg(s,9.55,10.15));
  $('#progress-bar').style.width=clamp(s/(accepted?10.6:9.6))*100+'%';
  setChapter(accepted&&s>9.35?4:s<1.25?0:s<3.5?1:s<7?2:3);
  $('#continue').style.opacity=s>8.4&&!accepted?0:1;$('#continue').disabled=s>8.4&&!accepted;$('#continue').textContent=s>9.4&&accepted?'추억을 모으러 가볼까요 ↓':s<1?'천천히 스크롤해 이야기를 따라오세요 ↓':'다음 이야기로 ↓';
  lastTime=now;requestAnimationFrame(render);
 }
 function jump(to,behavior=reduced?'auto':'smooth'){window.scrollTo({top:to*vh,behavior})}
 const stops=[1.6,2.7,4.15,4.9,5.65,6.25,7.75,8.6,10.1];
 $('#continue').addEventListener('click',()=>{if(accepted&&s>9.4){openMissions();return}const next=stops.find(x=>x>s+.22);if(next!==undefined)jump(next)});
 $$('[data-jump]').forEach(b=>b.addEventListener('click',()=>jump(Number(b.dataset.jump))));
 function reset(){accepted=false;missionsOpen=false;$('#missions').hidden=true;storyLength=9.6;story.style.height='1060svh';refuse.hidden=false;choices.insertBefore(refuse,$('#dodge-note'));refuse.classList.remove('has-moved');refuse.style.left='';refuse.style.top='';$('#dodge-message').textContent='';introStart=performance.now();activeDialogue=null;dodgeCount=0;window.scrollTo({top:0,behavior:'instant'});$('#brand').focus({preventScroll:true})}
 $('#restart').addEventListener('click',reset);$('#brand').addEventListener('click',e=>{e.preventDefault();reset()});$('#replay').addEventListener('click',reset);
 $('.skip-link').addEventListener('click',e=>{e.preventDefault();jump(8.6,'auto');requestAnimationFrame(()=>{accept.focus({preventScroll:true})})});
 accept.addEventListener('click',()=>{if(accepted)return;accepted=true;storyLength=10.6;story.style.height='1160svh';refuse.hidden=true;activeDialogue=null;jump(10.1);setTimeout(()=>$('#open-missions').focus({preventScroll:true}),reduced?0:650)});
 function openMissions(){if(!accepted)return;missionsOpen=true;$('#missions').hidden=false;$('#missions').scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});setTimeout(()=>$('#mission-title').focus({preventScroll:true}),reduced?0:650)}
 $('#open-missions').addEventListener('click',openMissions);
 function dodge(e){
  if(accepted||s<8.1||s>9.2||performance.now()-lastDodge<380)return;
  if(e&&e.type==='pointerdown'&&e.pointerType==='touch')e.preventDefault();
  lastDodge=performance.now();dodgeCount++;
  const W=stage.clientWidth,H=stage.clientHeight,bw=refuse.offsetWidth,bh=refuse.offsetHeight,ar=accept.getBoundingClientRect(),cr=$('.invitation-copy').getBoundingClientRect(),hr=$('.masthead').getBoundingClientRect();
  const px=e&&Number.isFinite(e.clientX)?e.clientX:W/2,py=e&&Number.isFinite(e.clientY)?e.clientY:H*.75;
  const candidates=[[.1,.2],[.66,.21],[.06,.63],[.65,.63],[.08,.82],[.66,.83],[.1,.12],[.64,.12]];
  let best=null,score=-Infinity;
  candidates.forEach(([x,y])=>{x=Math.max(16,Math.min(W-bw-16,x*W));y=Math.max(hr.bottom+8,Math.min(H-bh-86,y*H));const r={left:x,right:x+bw,top:y,bottom:y+bh};const overlaps=a=>r.left<a.right+14&&r.right>a.left-14&&r.top<a.bottom+14&&r.bottom>a.top-14;if(overlaps(ar)||overlaps(cr))return;const value=Math.hypot(x+bw/2-px,y+bh/2-py);if(value>score){score=value;best={x,y}}});
  if(best){$('#invitation').append(refuse);refuse.classList.add('has-moved');refuse.style.left=best.x+'px';refuse.style.top=best.y+'px'}
  $('#dodge-message').textContent=dodgeCount>2?'허허, 이번 여행이 꽤 궁금한 모양이군.':'아직 작별 인사를 하고 싶지 않은 모양이야.';
 }
 stage.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||accepted||s<8.15)return;const r=refuse.getBoundingClientRect();if(e.clientX>r.left-48&&e.clientX<r.right+48&&e.clientY>r.top-35&&e.clientY<r.bottom+35)dodge(e)},{passive:true});
 refuse.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')dodge(e)});refuse.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')dodge(e)});refuse.addEventListener('click',e=>{e.preventDefault();dodge(e)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.activeElement===refuse)accept.focus()});
 let oldWidth=innerWidth;
 window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const previous=vh;vh=stage.clientHeight;if(Math.abs(oldWidth-innerWidth)>40){window.scrollTo({top:s*vh,behavior:'instant'});choices.insertBefore(refuse,$('#dodge-note'));refuse.classList.remove('has-moved');oldWidth=innerWidth}},120)});
 if('scrollRestoration' in history)history.scrollRestoration='manual';
 window.scrollTo(0,0);requestAnimationFrame(render);
})();
