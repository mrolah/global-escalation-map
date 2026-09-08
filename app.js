const map=L.map('map',{
  worldCopyJump:true,
  preferCanvas:false,
  zoomControl:true,
  scrollWheelZoom:false,
  zoomSnap:1,
  zoomDelta:1,
  minZoom:2,
  maxZoom:7
}).setView([28,10],2.25);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:7,
  attribution:'© OpenStreetMap'
}).addTo(map);

// Reliable one-level mouse/trackpad zoom.
const mapContainer=map.getContainer();
let wheelAccumulator=0;
let wheelDirection=0;
let lastZoomAt=-Infinity;
let wheelResetTimer=null;
const WHEEL_THRESHOLD_PX=48;
const MIN_ZOOM_INTERVAL_MS=68;
const WHEEL_RESET_AFTER_MS=145;

function normalizedWheelPixels(e){
  if(e.deltaMode===1) return e.deltaY*18;
  if(e.deltaMode===2) return e.deltaY*window.innerHeight;
  return e.deltaY;
}
function zoomOneLevelAtPointer(e,direction){
  const currentZoom=Math.round(map.getZoom());
  const targetZoom=Math.max(map.getMinZoom(),Math.min(map.getMaxZoom(),currentZoom+direction));
  if(targetZoom===currentZoom) return;
  const rect=mapContainer.getBoundingClientRect();
  const point=L.point(e.clientX-rect.left,e.clientY-rect.top);
  const latlng=map.containerPointToLatLng(point);
  map.setZoomAround(latlng,targetZoom);
}
mapContainer.addEventListener('wheel',e=>{
  e.preventDefault();
  const raw=normalizedWheelPixels(e);
  if(!raw) return;
  const now=performance.now();
  const direction=raw<0?1:-1;
  if(wheelDirection!==0 && direction!==wheelDirection) wheelAccumulator=0;
  wheelDirection=direction;
  clearTimeout(wheelResetTimer);
  wheelResetTimer=setTimeout(()=>{wheelAccumulator=0;wheelDirection=0},WHEEL_RESET_AFTER_MS);
  if(now-lastZoomAt<MIN_ZOOM_INTERVAL_MS) return;
  wheelAccumulator+=raw;
  if(Math.abs(wheelAccumulator)>=WHEEL_THRESHOLD_PX){
    zoomOneLevelAtPointer(e,wheelAccumulator<0?1:-1);
    wheelAccumulator=0;
    lastZoomAt=now;
  }
},{passive:false});

const C={red:'#ff3b30',orange:'#ff9f0a',blue:'#64d2ff'};

// Panes
map.createPane('heatPane');      map.getPane('heatPane').style.zIndex=200;
map.createPane('routeGlowPane'); map.getPane('routeGlowPane').style.zIndex=320;
map.createPane('routePane');     map.getPane('routePane').style.zIndex=340;
map.createPane('zonePane');      map.getPane('zonePane').style.zIndex=360;
map.createPane('assetPane');     map.getPane('assetPane').style.zIndex=420;
map.createPane('labelPane');     map.getPane('labelPane').style.zIndex=500;
map.getPane('labelPane').style.pointerEvents='none';

function getMode(){
  const z=map.getZoom();
  if(z<=3) return 'overview';
  if(z<=4) return 'mid';
  return 'detail';
}

const labelGroup=L.layerGroup().addTo(map);
const heatGroup=L.layerGroup().addTo(map);
const zoneGroup=L.layerGroup().addTo(map);
const routeGroup=L.layerGroup().addTo(map);
const assetGroup=L.layerGroup().addTo(map);

function labelIcon(text){
  return L.divIcon({
    className:'',
    html:'<div class="lab">'+text+'</div>',
    iconSize:[90,22],
    iconAnchor:[0,0]
  });
}
function microLabel(text){
  return L.divIcon({
    className:'',
    html:'<div class="micro-label">'+text+'</div>',
    iconSize:[90,18],
    iconAnchor:[0,0]
  });
}
function pulseIcon(size=18){
  return L.divIcon({
    className:'',
    html:'<div class="pulse" style="width:'+size+'px;height:'+size+'px"></div>',
    iconSize:[size,size],iconAnchor:[size/2,size/2]
  });
}
function spreadIcon(size=22){
  return L.divIcon({
    className:'',
    html:'<div class="spread" style="width:'+size+'px;height:'+size+'px"></div>',
    iconSize:[size,size],iconAnchor:[size/2,size/2]
  });
}
function flowIcon(size=8){
  return L.divIcon({
    className:'',
    html:'<div class="flow" style="width:'+size+'px;height:'+size+'px"></div>',
    iconSize:[size,size],iconAnchor:[size/2,size/2]
  });
}
function assetIcon(sym,size=24){
  return L.divIcon({
    className:'',
    html:'<div class="asset" style="width:'+size+'px;height:'+size+'px;font-size:'+(size*.58)+'px">'+sym+'</div>',
    iconSize:[size,size],iconAnchor:[size/2,size/2]
  });
}

const STATIC_LABELS=[
 ['Russia',[58,55]],['China',[35,96]],['Iran',[31,49]],['North Korea',[40.5,126]],
 ['USA',[39,-101]],['NATO',[55,13]],['India',[22,78]],['Turkey',[39,35]],
 ['Egypt',[27,30]],['Saudi Arabia',[24,45]],['Japan',[37,138]],['Australia',[-25,134]]
];

const HEAT_FIELDS=[
 [[58,65],2600000,'#c9362b'],
 [[35,103],2200000,'#d4a10b'],
 [[32,53],900000,'#168652'],
 [[40,127],450000,'#7f3ca6'],
 [[39,-98],2800000,'#1f5aa6']
];

/* Scenario data is defined in scenario-data.js */

// ---- Route geometry preparation ----
// Make every route continuous across the ±180° date line.
// Raw Leaflet geometry such as -158 -> +170 otherwise draws across almost the entire world.
function unwrapPoints(points){
  if(!points.length) return [];
  const out=[[points[0][0],points[0][1]]];
  let prevLon=points[0][1];
  for(let i=1;i<points.length;i++){
    let lon=points[i][1];
    while(lon-prevLon>180) lon-=360;
    while(lon-prevLon<-180) lon+=360;
    out.push([points[i][0],lon]);
    prevLon=lon;
  }
  return out;
}

function prepareRoute(route){
  if(route._prepared) return;
  route._base=unwrapPoints(route.p);
  route._lens=[];
  route._total=0;
  for(let i=0;i<route._base.length-1;i++){
    const a=L.latLng(route._base[i][0],route._base[i][1]);
    const b=L.latLng(route._base[i+1][0],route._base[i+1][1]);
    const d=a.distanceTo(b);
    route._lens.push(d);
    route._total+=d;
  }
  route._meanLon=route._base.reduce((s,p)=>s+p[1],0)/route._base.length;
  route._prepared=true;
}
steps.forEach(s=>(s.routes||[]).forEach(prepareRoute));

function routeShiftForMap(route){
  const centerLon=map.getCenter().lng;
  return Math.round((centerLon-route._meanLon)/360)*360;
}
function shiftedRoutePoints(route,shift){
  return route._base.map(p=>[p[0],p[1]+shift]);
}
function routePointAt(route,f,shift){
  let target=(f%1)*route._total;
  for(let i=0;i<route._lens.length;i++){
    const d=route._lens[i];
    if(target<=d){
      const q=d===0?0:target/d;
      const a=route._base[i],b=route._base[i+1];
      return [
        a[0]+(b[0]-a[0])*q,
        a[1]+(b[1]-a[1])*q+shift
      ];
    }
    target-=d;
  }
  const p=route._base[route._base.length-1];
  return [p[0],p[1]+shift];
}

function arrowHead(route,displayPoints,mode,opacity){
  const end=displayPoints[displayPoints.length-1];
  const prev=displayPoints[displayPoints.length-2];
  const dy=end[0]-prev[0],dx=end[1]-prev[1];
  const rot=Math.atan2(dy,dx)*180/Math.PI*-1;
  const size=mode==='overview'?12:mode==='mid'?17:22;
  const icon=L.divIcon({
    className:'',
    html:'<div style="opacity:'+opacity+';width:0;height:0;border-top:'+(size*.45)+'px solid transparent;border-bottom:'+(size*.45)+'px solid transparent;border-left:'+size+'px solid '+C[route.c]+';filter:drop-shadow(0 0 4px '+C[route.c]+');transform:rotate('+rot+'deg)"></div>',
    iconSize:[size,size],iconAnchor:[size/2,size/2]
  });
  return L.marker(end,{icon,interactive:false,pane:'routePane'});
}

let movers=[];
let currentStep=0;
let mapIsMoving=false;
let lastAnimFrame=0;
let redrawScheduled=false;

function currentRenderRegion(){
  const lng=L.Util.wrapNum(map.getCenter().lng,[-180,180],true);
  if(lng<-30) return 'americas';
  if(lng>90) return 'asia-pacific';
  return 'eurafrica';
}
let lastRenderRegion=currentRenderRegion();

function scheduleRedraw(){
  if(redrawScheduled) return;
  redrawScheduled=true;
  requestAnimationFrame(()=>{
    redrawScheduled=false;
    redraw();
  });
}

function buildStepbar(){
  const el=document.getElementById('stepbar');
  el.innerHTML='';
  for(let i=0;i<steps.length;i++){
    const d=document.createElement('div');
    d.className='stepdot'+(i===currentStep?' active':'');
    d.textContent=i+1;
    d.title='Go to step '+(i+1);
    d.onclick=()=>setStep(i);
    el.appendChild(d);
  }
}

function renderStaticContext(mode){
  labelGroup.clearLayers();
  heatGroup.clearLayers();

  // Strict overview: no country labels and no large heat overlays.
  if(mode==='overview') return;

  STATIC_LABELS.forEach(([name,pos])=>{
    labelGroup.addLayer(L.marker(pos,{
      pane:'labelPane',interactive:false,icon:labelIcon(name)
    }));
  });

  HEAT_FIELDS.forEach(([pos,radius,color])=>{
    heatGroup.addLayer(L.circle(pos,{
      pane:'heatPane',radius,color,weight:1,
      fillColor:color,fillOpacity:.10,opacity:.30,interactive:false
    }));
  });
}

function routePopup(r, suffix=''){
  return '<div style="min-width:220px;max-width:330px">'+
    '<b style="font-size:13px">'+r.n+'</b>'+
    (suffix?'<div style="margin-top:2px;color:#9fc8e6;font-size:11px">'+suffix+'</div>':'')+
    '<div style="margin-top:8px"><b>Role:</b> '+(r.role||'Strategic movement')+'</div>'+
    '<div style="margin-top:6px">'+(r.desc||'Hypothetical strategic movement.')+'</div>'+
    '<div style="margin-top:8px"><b>Plausibility:</b> '+(r.plausibility||'Scenario-dependent')+'</div>'+
    '<div style="margin-top:4px;color:#b7c8d4;font-size:11px"><b>Analytic basis:</b> '+(r.basis||'Public posture and capability assessments')+'</div>'+
    '</div>';
}
function zonePopup(z){
  return '<div style="min-width:220px;max-width:330px">'+
    '<b style="font-size:13px">'+z.n+'</b>'+
    '<div style="margin-top:6px">'+(z.desc||z.txt||'Hypothetical theater condition.')+'</div>'+
    '<div style="margin-top:8px"><b>Plausibility:</b> '+(z.plausibility||'Scenario-dependent')+'</div>'+
    '<div style="margin-top:4px;color:#b7c8d4;font-size:11px"><b>Analytic basis:</b> '+(z.basis||'Public posture and capability assessments')+'</div>'+
    '</div>';
}

function redraw(){
  zoneGroup.clearLayers();
  routeGroup.clearLayers();
  assetGroup.clearLayers();
  movers=[];

  const mode=getMode();
  const activeStep=steps[currentStep];

  document.getElementById('detailModeBox').textContent=
    'Display mode: '+(mode==='overview'?'Overview':mode==='mid'?'Mid detail':'Full detail');

  renderStaticContext(mode);

  const cumulative=[];
  for(let si=0;si<=currentStep;si++){
    (steps[si].routes||[]).forEach(r=>cumulative.push({r,phase:si}));
  }
  const zones=[];
  for(let si=0;si<=currentStep;si++){
    (steps[si].zones||[]).forEach(z=>zones.push({z,phase:si}));
  }

  // Zones: same symbology regardless of which phase introduced them.
  zones.forEach(({z,phase})=>{
    if(mode==='overview'){
      zoneGroup.addLayer(
        L.circleMarker(z.p,{
          pane:'zonePane',
          radius:3.2,
          color:'#ffd43b',
          weight:1.2,
          fillColor:'#ffd43b',
          fillOpacity:.82,
          interactive:true
        }).bindPopup(zonePopup(z))
      );
    }else{
      const ps=mode==='mid'?15:18;
      zoneGroup.addLayer(
        L.marker(z.p,{pane:'zonePane',icon:pulseIcon(ps),interactive:true})
          .bindPopup(zonePopup(z))
      );
      zoneGroup.addLayer(L.marker(z.p,{
        pane:'zonePane',
        icon:spreadIcon(mode==='mid'?17:21),
        interactive:false
      }));
      zoneGroup.addLayer(L.marker([z.p[0]+.55,z.p[1]+.65],{
        pane:'labelPane',
        interactive:false,
        icon:microLabel(z.n)
      }));
    }
  });

  // Routes: same symbology by color/type only; no current-step restyling.
  cumulative.forEach(({r,phase},i)=>{
    prepareRoute(r);
    const shift=routeShiftForMap(r);
    const pts=shiftedRoutePoints(r,shift);

    const opacity = mode==='overview' ? .88 : .92;
    const mainWeight = mode==='overview' ? 2 : mode==='mid' ? 4 : 6;
    const glowWeight = mode==='overview' ? 5 : mode==='mid' ? 9 : 12;

    routeGroup.addLayer(L.polyline(pts,{
      pane:'routeGlowPane',
      color:C[r.c],
      weight:glowWeight,
      opacity:mode==='overview' ? .08 : .10,
      lineCap:'round',
      interactive:false
    }));

    const main=L.polyline(pts,{
      pane:'routePane',
      color:C[r.c],
      weight:mainWeight,
      opacity:opacity,
      lineCap:'round'
    }).bindPopup(routePopup(r,'Route'));
    routeGroup.addLayer(main);

    routeGroup.addLayer(
      L.polyline(pts,{
        pane:'routePane',
        weight:14,
        opacity:0.001,
        color:'#fff',
        lineCap:'round',
        className:'route-hit'
      }).bindPopup(routePopup(r,'Route'))
    );

    routeGroup.addLayer(L.polyline(pts,{
      pane:'routePane',
      color:'#fff',
      weight:mode==='overview' ? .9 : 1.3,
      opacity:mode==='overview' ? .34 : .52,
      dashArray:'2,16',
      lineCap:'round',
      className:'route-flow',
      interactive:false
    }));

    routeGroup.addLayer(arrowHead(r,pts,mode,opacity));

    if(mode==='overview'){
      const start=pts[0],end=pts[pts.length-1];
      routeGroup.addLayer(L.circleMarker(start,{
        pane:'assetPane',
        radius:2.3,
        color:'#fff',
        weight:1,
        fillColor:'#0b1520',
        fillOpacity:.95,
        interactive:true
      }).bindPopup(routePopup(r,'Origin')));
      routeGroup.addLayer(L.circleMarker(end,{
        pane:'assetPane',
        radius:2.8,
        color:'#fff',
        weight:1,
        fillColor:C[r.c],
        fillOpacity:1,
        interactive:true
      }).bindPopup(routePopup(r,'Destination')));
    }

    // Animated marker visible in all modes with consistent sizing per zoom mode.
    const moverSize=mode==='overview' ? 5 : mode==='mid' ? 7 : 9;
    const mover=L.marker(pts[0],{
      pane:'assetPane',
      icon:flowIcon(moverSize),
      interactive:true,
      keyboard:true,
      title:r.n
    }).bindPopup(routePopup(r,'Animated movement marker'));
    mover._route=r;
    mover._shift=shift;
    mover._phase=phase;
    mover._bounds=L.latLngBounds(pts);
    mover.addTo(routeGroup);
    movers.push(mover);

    // Operational emoji symbols only after overview, with consistent rules by zoom mode.
    if(mode!=='overview' && (mode==='detail' || i%2===0)){
      const p=routePointAt(r,((currentStep+1)/steps.length+i*.07)%1,shift);
      const sz=mode==='mid'?17:23;
      assetGroup.addLayer(
        L.marker(p,{
          pane:'assetPane',
          icon:assetIcon(r.asset,sz),
          interactive:true,
          keyboard:true,
          title:r.n
        }).bindPopup(routePopup(r,'Operational symbol'))
      );
    }
  });

  document.getElementById('stepLabel').textContent=activeStep.title;
  document.getElementById('eventList').innerHTML=
    activeStep.events.map(e=>'<div class="event '+e.cls+'">'+e.txt+'</div>').join('');
  buildStepbar();
}
function animate(ts){
  requestAnimationFrame(animate);

  // Pause animation while the user drags/zooms, and cap animation work at ~30 fps.
  if(mapIsMoving || ts-lastAnimFrame<32) return;
  lastAnimFrame=ts;

  const visible=map.getBounds().pad(.30);
  movers.forEach((m,i)=>{
    // Do not update routes nowhere near the current viewport.
    if(m._bounds && !visible.intersects(m._bounds)) return;
    const speed=m._phase===currentStep?4200:5600;
    const f=((ts/speed)+(i*.083))%1;
    m.setLatLng(routePointAt(m._route,f,m._shift));
  });
}

function setStep(n){
  currentStep=Math.max(0,Math.min(steps.length-1,n));
  redraw();
}

document.getElementById('prev').onclick=()=>setStep(currentStep-1);
document.getElementById('next').onclick=()=>setStep(currentStep+1);

map.on('movestart zoomstart',()=>{mapIsMoving=true});

map.on('moveend',()=>{
  mapIsMoving=false;

  // Ordinary panning inside the same world region requires no layer rebuild.
  // Re-wrap date-line routes only after crossing into a different broad region.
  const region=currentRenderRegion();
  if(region!==lastRenderRegion){
    scheduleRedraw();
  }
});

map.on('zoomend',()=>{
  mapIsMoving=false;
  // Zoom changes the Overview / Mid / Detail rendering model.
  // scheduleRedraw coalesces zoomend + moveend into a single rebuild.
  scheduleRedraw();
});

redraw();
requestAnimationFrame(animate);
