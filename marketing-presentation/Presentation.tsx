import {useEffect,useState} from 'react';
const routes=['','platform/','teknoloji/','filiz/','cozumler/','hakkimizda/','iletisim/'];
export function Presentation({base}:{base:string}){
 const [enabled,setEnabled]=useState(false),[paused,setPaused]=useState(false);
 useEffect(()=>{setEnabled(new URLSearchParams(location.search).has('sunum'))},[]);
 useEffect(()=>{
  if(!enabled||paused)return;
  let frame=0,last=0,elapsed=0,bottom=0,leaving=false,timer=0,position=scrollY;
  const tick=(now:number)=>{const dt=last?Math.min(now-last,100):0;last=now;
   if(!document.hidden&&!leaving){elapsed+=dt;if(elapsed>7000){const end=document.documentElement.scrollHeight-innerHeight;if(scrollY<end-3){position=Math.max(position,scrollY)+dt*.035;scrollTo({top:position,behavior:'instant'});bottom=0}else bottom+=dt;if(bottom>6500){leaving=true;document.documentElement.classList.add('presentation-leave');timer=window.setTimeout(()=>{try{sessionStorage.setItem('agromax-cinema-entry','1')}catch{/* Continue without storage. */}const current=location.pathname.slice(base.length).replace(/^\//,'');const index=routes.indexOf(current);location.replace(base+routes[(index+1)%routes.length]+'?sunum=1')},1500)}}}
   frame=requestAnimationFrame(tick);
  };frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);clearTimeout(timer);document.documentElement.classList.remove('presentation-leave')};
 },[enabled,paused,base]);
 if(!enabled)return <a className="presentation-start" href={base+'?sunum=1'}>Sunum ↗</a>;
 return <div className="presentation-controls" role="group" aria-label="Sunum kontrolleri"><span>AGROMAX / SUNUM</span><button type="button" onClick={()=>setPaused(p=>!p)}>{paused?'Devam et':'Duraklat'}</button><a href={base}>Çıkış ↗</a></div>;
}
