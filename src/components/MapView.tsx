import React, { useState } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { CulinaryItem } from '../data/mockData';
import ItemCard from './ItemCard';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface MapViewProps {
  items: CulinaryItem[];
  onToggleStatus: (id: string) => void;
}

function MarkerWithInfoWindow({ place, onToggleStatus }: { place: CulinaryItem; onToggleStatus: (id: string) => void }) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AdvancedMarker 
        ref={markerRef} 
        position={{lat: place.specific_data.location.lat, lng: place.specific_data.location.lng}} 
        onClick={() => setOpen(true)}
        title={place.title}
      >
        <Pin background="#f59e0b" glyphColor="#fff" borderColor="#b45309" />
      </AdvancedMarker>
      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)} style={{padding: 0, overflow: 'hidden', borderRadius: '1rem', width: '280px'}}>
            <div className="w-[280px]">
              <ItemCard 
                  item={place} 
                  featured={false} 
                  onToggleStatus={onToggleStatus} 
                  isMinimal={true}
              />
            </div>
        </InfoWindow>
      )}
    </>
  );
}

export default function MapView({ items, onToggleStatus }: MapViewProps) {
  if (!hasValidKey) {
    return (
      <div className="bg-white rounded-2xl overflow-hidden border border-stone-100 shadow-[var(--shadow-card)] h-[600px] w-full flex items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-serif mb-4">Google Maps API Key Required</h2>
          <p className="text-stone-500 mb-6 text-sm">To see your culinary locations on the map, you need to provide a Google Maps API Key.</p>
          <div className="text-left bg-stone-50 p-4 rounded-xl text-sm space-y-3">
             <p><strong>Step 1:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener text-blue-600 hover:underline">Get an API Key</a></p>
             <p><strong>Step 2:</strong> Add your key as a secret:</p>
             <ul className="list-disc pl-5 space-y-1 text-stone-600">
               <li>Open <strong>Settings</strong> (⚙️ gear icon, <strong>top-right corner</strong>)</li>
               <li>Select <strong>Secrets</strong></li>
               <li>Type <code>GOOGLE_MAPS_PLATFORM_KEY</code> as the secret name, press <strong>Enter</strong></li>
               <li>Paste your API key as the value, press <strong>Enter</strong></li>
             </ul>
             <p className="text-stone-500 italic mt-2 text-xs">The app rebuilds automatically after you add the secret.</p>
          </div>
        </div>
      </div>
    );
  }

  const places = items.filter(
    (item) => item.type === 'PLACE' && item.specific_data?.location && item.specific_data.location.lat !== 0 && item.specific_data.location.lng !== 0
  );

  // Default to Paris if no places, or average out the coords
  const defaultCenter = places.length > 0 
    ? {lat: places[0].specific_data.location.lat, lng: places[0].specific_data.location.lng}
    : {lat: 48.8566, lng: 2.3522};

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-stone-100 shadow-[var(--shadow-card)] h-[600px] w-full relative z-0">
      <APIProvider apiKey={API_KEY} version="weekly">
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={9}
          mapId="CULINARY_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{width: '100%', height: '100%'}}
        >
          {places.map((place) => (
            <MarkerWithInfoWindow 
              key={place.id} 
              place={place} 
              onToggleStatus={onToggleStatus} 
            />
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}
