import {useEffect,useRef,useState} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type {VenueActivity} from './night-operations';

export default function VenueActivityMap({venues,selected,onSelect,city}:{venues:VenueActivity[];selected:string|null;onSelect:(id:string)=>void;city:string}) {
 const container=useRef<HTMLDivElement>(null),map=useRef<mapboxgl.Map|null>(null),select=useRef(onSelect),fitted=useRef(false);
 const [failed,setFailed]=useState(false),[ready,setReady]=useState(false);
 select.current=onSelect;
 useEffect(()=>{
  const token=import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
  if(!token||!container.current){setFailed(true);return;}
  let instance:mapboxgl.Map;
  try {
   instance=new mapboxgl.Map({container:container.current,accessToken:token,style:'mapbox://styles/mapbox/dark-v11',center:city==='la'?[-118.37,34.07]:[-73.99,40.73],zoom:11,attributionControl:true});
   map.current=instance;fitted.current=false;setFailed(false);setReady(false);
   instance.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');
   instance.on('load',()=>setReady(true));instance.on('error',()=>setFailed(true));
  }catch{setFailed(true);return;}
  return()=>{map.current=null;instance.remove();};
 },[city]);
 useEffect(()=>{
  if(!ready||!map.current)return;
  const instance=map.current,bounds=new mapboxgl.LngLatBounds();
  const markers=venues.map(v=>{
   const el=document.createElement('button');el.type='button';el.className='venue-map-pin';el.textContent=String(v.people);el.setAttribute('aria-label',`${v.name}: ${v.people} sharing`);el.setAttribute('aria-pressed',String(v.venue_id===selected));
   el.addEventListener('click',()=>select.current(v.venue_id));bounds.extend([v.lng,v.lat]);
   const marker=new mapboxgl.Marker({element:el}).setLngLat([v.lng,v.lat]).addTo(instance);
   el.setAttribute('role','button');
   return marker;
  });
  if(venues.length&&!fitted.current){instance.fitBounds(bounds,{padding:55,maxZoom:14,duration:0});fitted.current=true;}
  return()=>markers.forEach(m=>m.remove());
 },[venues,selected,ready]);
 return <div className="venue-map-wrap"><div className="venue-map" ref={container} aria-label="Map of shared public venues"/>{failed&&<div className="map-fallback" role="status">Map tiles are unavailable. Use the venue list beside the map.</div>}</div>;
}
