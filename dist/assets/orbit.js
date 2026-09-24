(() => {
    const root=document.getElementById('orbit-learning-lab');
    const $=id=>root.querySelector('#ol-'+id);
    const TAU=2*Math.PI, RAD=Math.PI/180, MU=6.678e-11*5.972e24, R=6371000;
    const OE=TAU/86164.0905, OS=TAU/(365*86400), LAT=33.7490*RAD, LON=-84.3880*RAD;
    const GEO=Math.cbrt(MU/(OE*OE)), END=48*3600;
    const c={fg:'var(--foreground)',mut:'var(--muted-foreground)',grid:'color-mix(in srgb, var(--foreground) 25%, transparent)',orbit:'var(--viz-series-1)',solar:'var(--viz-series-2)',velocity:'var(--viz-series-3)',station:'var(--viz-series-4)',gravity:'var(--viz-series-5)'};
    let cfg={orbit:'ellipse',frame:'inertial',density:2,step:60,solar:true,phase:40,hours:6,stage:0,lens:''};
    let history=[],running=false,lastFrame=0,animation=0;
    const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), wrap=x=>((x%TAU)+TAU)%TAU;
    const signed=x=>wrap(x+Math.PI)-Math.PI, deg=x=>x/RAD;
    const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0), add=(a,b,k=1)=>a.map((x,i)=>x+k*b[i]);
    const mag=a=>Math.hypot(...a), mul=(a,k)=>a.map(x=>x*k), unit=a=>mul(a,1/mag(a));
    const fmt=(v,n=2)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n});
    const expo=x=>x.toExponential(3);
    const acceleration=()=>cfg.solar?9.08e-6*.5/cfg.density:0;
    function initial(){const e=cfg.orbit==='ellipse'?.06:0,r0=GEO*(1-e),v=Math.sqrt(MU*(2/r0-1/GEO));return [r0,0,0,v/r0];}
    function derivatives(s,t){const [r,theta,vr,om]=s,a=acceleration(),rel=cfg.phase*RAD+OS*t-theta;return [vr,om,r*om*om-MU/(r*r)+a*Math.cos(rel),-2*vr*om/r+a*Math.sin(rel)/r];}
    function rk(s,t,h,details=false){
      const k1=derivatives(s,t),s2=add(s,k1,h/2),k2=derivatives(s2,t+h/2),s3=add(s,k2,h/2),k3=derivatives(s3,t+h/2),s4=add(s,k3,h),k4=derivatives(s4,t+h);
      const next=s.map((x,i)=>x+h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
      if(next[0]<=R||!next.every(Number.isFinite))throw Error('Invalid teaching orbit. Choose another setting.');
      return details?{states:[s,s2,s3,s4],rates:[k1,k2,k3,k4],times:[t,t+h/2,t+h/2,t+h],next}:next;
    }
    function geometry(s,t){
      const [r,theta]=s,q=OE*t,delta=theta-q,P=[R*Math.cos(LAT)*Math.cos(q),R*Math.cos(LAT)*Math.sin(q),R*Math.sin(LAT)],S=[r*Math.cos(theta),r*Math.sin(theta),0];
      const east=r*Math.sin(delta),north=-r*Math.sin(LAT)*Math.cos(delta),up=r*Math.cos(LAT)*Math.cos(delta)-R;
      const gamma=Math.acos(clamp(Math.cos(LAT)*Math.cos(delta),-1,1)),ratio=R/r;
      const acosEl=Math.acos(clamp(Math.sin(gamma)/Math.sqrt(1+ratio*ratio-2*ratio*Math.cos(gamma)),-1,1));
      const visible=gamma<=Math.acos(ratio),el=visible?acosEl:-acosEl;
      const alpha=Math.asin(clamp(Math.abs(Math.sin(delta))/Math.sin(gamma),-1,1));
      let az;if(Math.abs(east/r)<1e-12)az=north>0?0:Math.PI;else if(Math.abs(north/r)<1e-12)az=east>0?Math.PI/2:3*Math.PI/2;else az=north>0?(east>0?alpha:TAU-alpha):(east>0?Math.PI-alpha:Math.PI+alpha);
      return {P,S,east,north,up,q,delta,az,el,acosEl,visible,gamma,range:Math.hypot(east,north,up),ssp:LON+delta};
    }
    function simulate(){
      history=[];let s=initial(),t=0,prev=null,uw=0,a0=0,max=0,min=Math.PI/2;
      while(true){const g=geometry(s,t);if(prev===null){uw=g.az;a0=g.az;}else uw+=signed(g.az-prev);prev=g.az;max=Math.max(max,Math.abs(uw-a0));min=Math.min(min,g.el);history.push({s:[...s],t,g,uw,max,min});if(t>=END)break;const h=Math.min(cfg.step,END-t);s=rk(s,t,h);t+=h;}
    }
    function current(){const t=clamp(cfg.hours*3600,0,END),i=Math.min(history.length-1,Math.floor(t/cfg.step)),row=history[i];if(Math.abs(t-row.t)<1e-7)return row;const s=rk(row.s,row.t,t-row.t),g=geometry(s,t),uw=row.uw+signed(g.az-row.g.az);return {s,t,g,uw,max:Math.max(row.max,Math.abs(uw-history[0].uw)),min:Math.min(row.min,g.el)};}
    const ns='http://www.w3.org/2000/svg';
    function element(tag,attrs={},parent){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(parent)parent.append(e);return e;}
    function text(svg,x,y,value,anchor='start',small=false){const e=element('text',{x,y,'text-anchor':anchor,class:small?'small':''},svg);e.textContent=value;return e;}
    function line(svg,a,b,color=c.grid,width=1,dash=''){return element('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:color,'stroke-width':width,...(dash?{'stroke-dasharray':dash}:{})},svg);}
    function path(svg,pts,color=c.grid,width=1,dash=''){return element('path',{d:pts.map((p,i)=>(i?'L':'M')+p.map(x=>x.toFixed(2)).join(',')).join(' '),fill:'none',stroke:color,'stroke-width':width,...(dash?{'stroke-dasharray':dash}:{})},svg);}
    function arrow(svg,a,b,color,width=2){line(svg,a,b,color,width);const ang=Math.atan2(b[1]-a[1],b[0]-a[0]),size=7;path(svg,[[b[0]-size*Math.cos(ang-.45),b[1]-size*Math.sin(ang-.45)],b,[b[0]-size*Math.cos(ang+.45),b[1]-size*Math.sin(ang+.45)]],color,width);}
    function circle(svg,p,r,color,filled=false){return element('circle',{cx:p[0],cy:p[1],r,fill:filled?color:'none',stroke:filled?'none':color,'stroke-width':1.2},svg);}
    function setup(id,h,title){const svg=$(id),w=Math.max(260,svg.getBoundingClientRect().width);svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('height',h);const tt=element('title',{},svg);tt.textContent=title;return {svg,w,h};}
    function arc(svg,center,r,start,end,color,width=1.5){const n=Math.max(8,Math.ceil(Math.abs(end-start)*18));return path(svg,Array.from({length:n+1},(_,i)=>{const a=start+(end-start)*i/n;return [center[0]+r*Math.cos(a),center[1]+r*Math.sin(a)];}),color,width);}
    function readout(id,entries){$(id).replaceChildren(...entries.map(s=>{const e=document.createElement('span');e.textContent=s;return e;}));}
    function panelOrbit(row){
      const {svg,w,h}=setup('orbit-svg',340,'Satellite and station in '+cfg.frame+' frame');
      const spin=cfg.frame==='earth'?row.g.q:0,beta=.55,cam=-.9,eye=[Math.cos(beta)*Math.cos(cam),Math.cos(beta)*Math.sin(cam),Math.sin(beta)],right=[-Math.sin(cam),Math.cos(cam),0],up=[-Math.sin(beta)*Math.cos(cam),-Math.sin(beta)*Math.sin(cam),Math.cos(beta)];
      const center=[w/2,178],sc=Math.min((w-90)/2,127)/(GEO*1.08);
      function rot(v,q=spin){return [v[0]*Math.cos(q)+v[1]*Math.sin(q),-v[0]*Math.sin(q)+v[1]*Math.cos(q),v[2]];}
      function p(v,q=spin){v=rot(v,q);return [center[0]+sc*dot(v,right),center[1]-sc*dot(v,up)];}
      const rim=Array.from({length:145},(_,i)=>[GEO*Math.cos(i*TAU/144),GEO*Math.sin(i*TAU/144),0]);path(svg,rim.map(v=>p(v)),c.grid,1,'4 4');
      const stride=Math.max(1,Math.floor(history.length/650));path(svg,history.filter((x,i)=>i%stride===0).map(x=>p(x.g.S,cfg.frame==='earth'?x.g.q:0)),c.orbit,1.5);
      const axis=GEO*1.15;for(const [v,label]of [[[axis,0,0],cfg.frame==='earth'?'xE':'x'],[[0,axis,0],cfg.frame==='earth'?'yE':'y'],[[0,0,axis*.75],'z / spin']]){const a=p(v,0);arrow(svg,center,a,c.grid,1);text(svg,clamp(a[0],20,w-55),clamp(a[1]-6,34,310),label,'start',true);}
      const angle=cfg.frame==='earth'?signed(row.g.delta):wrap(row.s[1]),angleRadius=GEO*.37;
      path(svg,Array.from({length:65},(_,i)=>{const aa=angle*i/64;return p([angleRadius*Math.cos(aa),angleRadius*Math.sin(aa),0],0);}),c.orbit,1.5);
      const angleLabel=p([angleRadius*1.2*Math.cos(angle/2),angleRadius*1.2*Math.sin(angle/2),0],0);text(svg,angleLabel[0],angleLabel[1]-5,cfg.frame==='earth'?'Δλ':'θ','middle',true);
      circle(svg,center,R*sc,'var(--muted)',true);circle(svg,center,R*sc,c.fg);
      for(const lat of [-.65,0,.65]){const pts=Array.from({length:97},(_,i)=>{const a=i*TAU/96+row.g.q;return p([R*Math.cos(lat)*Math.cos(a),R*Math.cos(lat)*Math.sin(a),R*Math.sin(lat)]);});path(svg,pts,c.grid,.8);}
      const sat=p(row.g.S),station=p(row.g.P),ssp=p(mul(unit(row.g.S),R));
      line(svg,center,sat,c.orbit,1.8);line(svg,station,sat,c.station,1.5,'4 3');circle(svg,ssp,3,c.orbit,true);circle(svg,station,4,c.station,true);
      const hidden=dot(rot(row.g.P),eye)<0;if(hidden)circle(svg,station,6,c.station);
      const [r,theta,vr,om]=row.s,viewOmega=om-(cfg.frame==='earth'?OE:0),vel=[vr*Math.cos(theta)-r*viewOmega*Math.sin(theta),vr*Math.sin(theta)+r*viewOmega*Math.cos(theta),0];
      if(mag(vel)>1e-4)arrow(svg,sat,p(add(row.g.S,unit(vel),GEO*.22)),c.velocity,2);
      const relforce=[Math.cos(cfg.phase*RAD+OS*row.t),Math.sin(cfg.phase*RAD+OS*row.t),0];
      if(cfg.solar)arrow(svg,sat,p(add(row.g.S,relforce,GEO*.19)),c.solar,2);
      circle(svg,sat,5,c.orbit,true);
      const sx=clamp(sat[0]+10,25,w-105),sy=clamp(sat[1]-12,42,280);text(svg,sx,sy,'Satellite S');
      const labelY=286;line(svg,station,[25,labelY-12],c.station,.9);text(svg,18,labelY,'Atlanta P'+(hidden?' · far side':''),'start',true);
      text(svg,w-14,308,'SSP on equator','end',true);line(svg,ssp,[w-120,298],c.orbit,.9);
      text(svg,14,18,cfg.frame==='inertial'?'Space-fixed axes':'Earth-fixed camera');
      text(svg,14,38,'Full 48 h trail · distances to scale','start',true);text(svg,14,330,'v / SRP arrows: directions only','start',true);
      readout('state-values',[`r ${fmt(r/1000,1)} km`,`altitude ${fmt((r-R)/1000,1)} km`,`θ ${fmt(deg(wrap(theta)),1)}°`,`Vr ${fmt(vr,2)} m/s`,`Vθ ${fmt(r*om,2)} m/s`,`ω ${expo(om)} rad/s`,`λSSP ${fmt(deg(signed(row.g.ssp)),2)}°`,cfg.frame==='earth'?`v relative to Earth ${fmt(mag(vel),3)} m/s`:'v arrow: space-fixed velocity']);
    }
    function panelForce(row){
      const {svg,w}=setup('force-svg',382,'Solar acceleration in a radial-tangential coordinate frame, with gravity shown separately below');
      const center=[w/2,167],len=Math.min(105,(w-100)/2),psi=cfg.phase*RAD+OS*row.t,rel=signed(psi-row.s[1]),a=acceleration(),px=len*Math.cos(rel),py=-len*Math.sin(rel);
      arrow(svg,[center[0]-len-12,center[1]],[center[0]+len+15,center[1]],c.grid,1);
      arrow(svg,[center[0],center[1]+len+12],[center[0],center[1]-len-15],c.grid,1);
      text(svg,w-10,center[1]-12,'+êr','end');text(svg,center[0]+10,center[1]-len-13,'+êθ');
      circle(svg,center,5,c.orbit,true);
      if(cfg.solar){
        const end=[center[0]+px,center[1]+py];
        line(svg,[end[0],center[1]],end,c.solar,1,'3 3');line(svg,[center[0],end[1]],end,c.solar,1,'3 3');
        arrow(svg,center,[end[0],center[1]],c.solar,3);arrow(svg,center,[center[0],end[1]],c.solar,3);arrow(svg,center,end,c.solar,2);
        arc(svg,center,35,0,-rel,c.solar);text(svg,clamp(end[0]+(px>=0?9:-9),20,w-20),end[1]-10,'aSRP',px>=0?'start':'end',true);
        text(svg,center[0]+px/2,center[1]+20,'a_r','middle',true);text(svg,center[0]-10,center[1]+py/2,'a_θ','end',true);
        const sun=[center[0]-px*.8,center[1]-py*.8];circle(svg,sun,10,c.solar);text(svg,clamp(sun[0],45,w-45),sun[1]+25,'toward Sun','middle',true);
      }
      arrow(svg,[center[0]+len*.4,300],[center[0]-len*.4,300],c.gravity,2);text(svg,center[0],323,'gravity (separate): −μ/r²','middle',true);
      text(svg,12,18,`relative ${fmt(deg(rel),1)}°`);text(svg,12,39,`push phase now ${fmt(deg(wrap(psi)),1)}°`,'start',true);
      text(svg,12,350,'Directions + SRP component ratios','start',true);text(svg,12,370,'rω²: coordinate term, not a force','start',true);
      readout('force-values',[`aSRP ${expo(a)} m/s²`,`a_r ${expo(a*Math.cos(rel))} m/s²`,`a_θ ${expo(a*Math.sin(rel))} m/s²`,`gravity ${expo(MU/(row.s[0]**2))} m/s²`]);
    }
    function panelElevation(row){
      const {svg,w,h}=setup('elevation-svg',330,'Station-satellite plane showing gamma and signed elevation');
      const {gamma,el,range}=row.g,r=row.s[0],rawS=[r*Math.sin(gamma),r*Math.cos(gamma)];
      const minx=-R,maxx=Math.max(R,rawS[0]),miny=Math.min(-R,rawS[1]),maxy=Math.max(R,rawS[1]);
      const sc=Math.min((w-85)/(maxx-minx),(h-110)/(maxy-miny)),ox=40-minx*sc,oy=65+maxy*sc;
      const p=v=>[ox+v[0]*sc,oy-v[1]*sc],O=p([0,0]),P=p([0,R]),S=p(rawS);
      circle(svg,O,R*sc,'var(--muted)',true);circle(svg,O,R*sc,c.fg);
      line(svg,O,P,c.fg,1.4);line(svg,O,S,c.orbit,1.5);line(svg,P,S,c.station,2);
      arrow(svg,[Math.max(10,P[0]-35),P[1]],[Math.min(w-12,P[0]+120),P[1]],c.grid,1);
      arrow(svg,P,[P[0],P[1]-45],c.grid,1);text(svg,P[0]-8,P[1]-35,'up','end',true);
      const arcR=Math.min(34,R*sc*.75);arc(svg,O,arcR,-Math.PI/2,-Math.PI/2+gamma,c.orbit);text(svg,O[0]+arcR+7,O[1]-arcR,'γ','start');
      arc(svg,P,39,0,-el,c.station);text(svg,P[0]+47,P[1]-9,'E','start');
      circle(svg,P,4,c.station,true);circle(svg,S,5,c.orbit,true);
      text(svg,clamp(S[0]+8,20,w-85),S[1]-10,'Satellite','start',true);text(svg,O[0]-10,O[1]+17,'O','end',true);
      text(svg,P[0]-10,P[1]-10,'P','end',true);text(svg,P[0]-8,(P[1]+O[1])/2+4,'R','end',true);
      text(svg,(O[0]+S[0])/2-13,(O[1]+S[1])/2+13,'r','end',true);
      text(svg,(P[0]+S[0])/2+5,(P[1]+S[1])/2-9,'line of sight','start',true);
      text(svg,12,18,`γ ${fmt(deg(gamma),2)}° · elevation E ${fmt(deg(el),2)}°`);
      text(svg,12,309,w<400?'Horizon at P · distances to scale':'Horizon tangent at P · distances to scale','start',true);
      readout('elevation-values',[`acos magnitude ${fmt(deg(row.g.acosEl),2)}°`,`isVisible ${row.g.visible?'True':'False'}`,`signed E ${fmt(deg(el),2)}°`,`slant range ${fmt(range/1000,1)} km`,`Earth R ${fmt(R/1000,0)} km`,`horizon limit γ ${fmt(deg(Math.acos(R/r)),2)}°`]);
    }
    function panelAzimuth(row){
      const {svg,w}=setup('azimuth-svg',350,'Compass projection of the station-to-satellite line of sight');
      const center=[w/2,177],rad=Math.min(90,(w-96)/2),A=row.g.az,end=[center[0]+rad*Math.sin(A),center[1]-rad*Math.cos(A)];
      circle(svg,center,rad,c.grid);line(svg,[center[0]-rad-15,center[1]],[center[0]+rad+15,center[1]],c.grid);line(svg,[center[0],center[1]-rad-15],[center[0],center[1]+rad+15],c.grid);
      text(svg,center[0],center[1]-rad-20,'North · 0°','middle',true);text(svg,w-10,center[1]-10,'East','end',true);text(svg,10,center[1]-10,'West','start',true);text(svg,center[0],center[1]+rad+32,'South · 180°','middle',true);
      line(svg,[end[0],center[1]],end,c.station,1,'3 3');line(svg,[center[0],end[1]],end,c.station,1,'3 3');arrow(svg,center,end,c.station,2.5);circle(svg,center,4,c.station,true);
      path(svg,Array.from({length:61},(_,i)=>{const a=A*i/60;return [center[0]+rad*.42*Math.sin(a),center[1]-rad*.42*Math.cos(a)];}),c.station,2);
      text(svg,12,18,`Azimuth A ${fmt(deg(A),2)}°`);text(svg,12,39,'Clockwise from north · horizontal LOS','start',true);
      text(svg,12,334,`east/r ${fmt(row.g.east/row.s[0],4)} · north/r ${fmt(row.g.north/row.s[0],4)}`,'start',true);
      readout('azimuth-values',[`unwrapped A ${fmt(deg(row.uw),2)}°`,`demo max |ΔA| ${fmt(deg(row.max),3)}°`,`sampled min E ${fmt(deg(row.min),2)}°`,`Δlongitude ${fmt(deg(signed(row.g.delta)),2)}°`]);
    }
    function panelRK(row){
      if (!$('rk-svg')) return;
      const {svg,w}=setup('rk-svg',wForRK()<560?238:158,'Four trial evaluations followed by one commit');
      root.querySelectorAll('[data-stage]').forEach(b=>b.disabled=row.t>=END);
      if(row.t>=END){text(svg,12,40,'Run complete: final sample recorded.');text(svg,12,65,'No update after the endpoint.','start',true);$('derivative-values').replaceChildren();$('storage-values').replaceChildren();return;}
      const h=Math.min(cfg.step,END-row.t),st=rk(row.s,row.t,h,true),narrow=w<560;
      const stages=narrow?[[35,35],[w*.52,75],[w*.52,128],[w-35,175]]:[[42,65],[w*.5,38],[w*.5,91],[w-45,65]];
      for(let i=0;i<3;i++)arrow(svg,stages[i],stages[i+1],c.grid,1);
      stages.forEach((p,i)=>{circle(svg,p,i===cfg.stage?9:6,i===cfg.stage?c.orbit:c.grid,true);text(svg,p[0]+(i===3?-12:12),p[1]-12,'k'+(i+1),i===3?'end':'start');text(svg,p[0]+(i===3?-12:12),p[1]+20,i===0?'t':i===3?'t + dt':'t + dt/2',i===3?'end':'start',true);});
      if(narrow){text(svg,12,215,'Weights 1 : 2 : 2 : 1 → candidate','start',true);text(svg,12,234,'Endpoint guard → one commit','start',true);}else text(svg,12,145,'Weights 1 : 2 : 2 : 1 → candidate → endpoint guard → one commit','start',true);
      const rate=st.rates[cfg.stage],trial=st.states[cfg.stage];
      readout('derivative-values',[`k${cfg.stage+1}: trial t ${fmt(st.times[cfg.stage]/3600,4)} h`,`this dt ${fmt(h,1)} s`,`dr/dt ${fmt(rate[0],3)} m/s`,`dθ/dt ${expo(rate[1])} rad/s`,`dVr/dt ${expo(rate[2])} m/s²`,`dω/dt ${expo(rate[3])} rad/s²`]);
      readout('storage-values',[`trial r ${fmt(trial[0]/1000,3)} km`,`stored dr (Vr·dt) ${fmt(row.s[2]*h,1)} m`,`stored dtheta (ω·dt) ${fmt(row.s[3]*h,6)} rad`,`RK4 next Δr ${fmt(st.next[0]-row.s[0],1)} m`]);
    }
    function wForRK(){return $('rk-svg').getBoundingClientRect().width;}
    const lensText={baseline:'Baseline: solar pressure off; circular GEO; numerical drift check only.',density:'Density search: change ρA between complete runs; brentq locates a drift-target crossing.',design:'Design search: change initial r, Vr and semimajor axis between complete runs; no steering during flight.',simulate:'simulate(): advance the same OrbitSim; measure before each step, including the first and final samples.',geometry:'Your main file: calcLookAngle2D gives acos magnitude; isVisible supplies the sign in simulate. calcAz → adjAz supplies the azimuth quadrant.',metrics:'Metrics: unwrap compass jumps; keep the largest departure from initial azimuth and lowest sampled elevation.',rk4:'update(): four derivatives evaluations at trial states; midpoint k2 and k3 use different trial states.',commit:'The fifth derivatives call only validates the endpoint; dr and dtheta store velocity × dt, not displacement.'};
    function highlight(){if (!$('code-detail')) return;root.querySelectorAll('[data-lens]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lens===cfg.lens)));$('code-detail').textContent=lensText[cfg.lens]||'Select a code stage to highlight its physical quantities.';const active=cfg.lens;['orbit-svg','force-svg','elevation-svg','azimuth-svg','rk-svg'].forEach(id=>{const on=!active||active==='simulate'||active==='design'||active==='baseline'||(active==='density'&&id==='force-svg')||(active==='geometry'&&['orbit-svg','elevation-svg','azimuth-svg'].includes(id))||(active==='metrics'&&id==='azimuth-svg')||(['rk4','commit'].includes(active)&&['force-svg','rk-svg'].includes(id));$(id).style.opacity=on?'1':'.8';});}
    function draw(){try{const row=current();$('time-value').textContent=fmt(cfg.hours,2)+' h';$('time').value=cfg.hours;$('phase-value').textContent=cfg.phase+'°';panelOrbit(row);panelForce(row);panelElevation(row);panelAzimuth(row);panelRK(row);highlight();$('error').hidden=true;root.dispatchEvent(new Event('orbitalhw:state', {bubbles:true}));}catch(e){$('error').hidden=false;$('error').textContent=e.message;}}
    function save(){if(window.orbitalState?.setWidgetState)window.orbitalState.setWidgetState({modelContent:{view:'Orbital physics and code',orbit:cfg.orbit,timeHours:cfg.hours,solarPressure:cfg.solar,densityKgPerM2:cfg.density,forcePhaseDegrees:cfg.phase,selectedCode:cfg.lens,rkStage:cfg.stage+1},privateContent:{...cfg}}).catch(()=>{});}
    function sync(){for(const key of ['orbit','frame','density','step'])$(key).value=cfg[key];$('solar').checked=cfg.solar;$('phase').value=cfg.phase;$('time').value=cfg.hours;root.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.stage===cfg.stage)));}
    function applyState(state){const saved=state?.privateContent;if(!saved)return;cfg={...cfg,...saved};cfg.hours=clamp(+cfg.hours||0,0,48);cfg.phase=clamp(+cfg.phase||0,0,360);cfg.stage=clamp(+cfg.stage||0,0,3);if(!['ellipse','circular'].includes(cfg.orbit))cfg.orbit='ellipse';if(!['inertial','earth'].includes(cfg.frame))cfg.frame='inertial';if(![1,2,5,10].includes(+cfg.density))cfg.density=2;if(![60,300,900].includes(+cfg.step))cfg.step=60;cfg.step=+cfg.step;cfg.density=+cfg.density;cfg.solar=!!cfg.solar;}
    function stop(){running=false;cancelAnimationFrame(animation);$('play').textContent=matchMedia('(prefers-reduced-motion: reduce)').matches?'Advance 1 hour':'Play 48 hours';}
    function animate(now){if(!running)return;if(lastFrame){cfg.hours=Math.min(48,cfg.hours+(now-lastFrame)*.00075);draw();}lastFrame=now;if(cfg.hours>=48){stop();save();return;}animation=requestAnimationFrame(animate);}
    $('play').addEventListener('click',()=>{if(running){stop();save();return;}if(cfg.hours>=48)cfg.hours=0;if(matchMedia('(prefers-reduced-motion: reduce)').matches){cfg.hours=Math.min(48,cfg.hours+1);draw();save();return;}running=true;lastFrame=0;$('play').textContent='Pause';animation=requestAnimationFrame(animate);});
    $('time').addEventListener('input',e=>{stop();cfg.hours=+e.target.value;draw();});$('time').addEventListener('change',save);
    for(const key of ['orbit','density','step','phase','solar'])$(key).addEventListener(key==='phase'?'input':'change',e=>{stop();cfg[key]=key==='solar'?e.target.checked:key==='orbit'?e.target.value:+e.target.value;simulate();draw();if(key!=='phase')save();});$('phase').addEventListener('change',save);
    $('frame').addEventListener('change',e=>{cfg.frame=e.target.value;draw();save();});
    root.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>{cfg.stage=+b.dataset.stage;sync();draw();save();}));root.querySelectorAll('[data-lens]').forEach(b=>b.addEventListener('click',()=>{cfg.lens=cfg.lens===b.dataset.lens?'':b.dataset.lens;highlight();save();}));
    window.addEventListener('orbitalhw:restore',e=>{if(e.detail?.globals?.widgetState){stop();applyState(e.detail.globals.widgetState);sync();simulate();draw();}});
    let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,80);}).observe(root);
    applyState(window.orbitalState?.widgetState);sync();simulate();draw();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)$('play').textContent='Advance 1 hour';
    root.orbitDebug={get config(){return {...cfg};},get history(){return history;},get current(){return current();},derivatives,rk,geometry,initial,constants:{MU,R,OE,OS,GEO,LAT,LON},get state(){return cfg;}};
  })();

document.dispatchEvent(new Event('orbitalhw:state'));
