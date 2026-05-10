import React, { useState } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef, useApiIsLoaded, useMap } from '@vis.gl/react-google-maps';
import { CulinaryItem } from '../data/mockData';
import ItemCard from './ItemCard';
import { KeyRound, Loader2 } from 'lucide-react';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface MapViewProps {
  items: CulinaryItem[];
  onToggleStatus: (id: string) => void;
  onDelete?: (id: string) => void;
}

const MarkerWithInfoWindow: React.FC<{ place: CulinaryItem; onToggleStatus: (id: string) => void; onDelete?: (id: string) => void; keyProp?: string }> = ({ place, onToggleStatus, onDelete, keyProp }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);
  const map = useMap();

  const handleMarkerClick = () => {
    setOpen(true);
    if (map) {
      const position = {lat: place.specific_data.location.lat, lng: place.specific_data.location.lng};
      map.panTo(position);
      map.setZoom(15);
    }
  };

  return (
    <>
      <AdvancedMarker 
        ref={markerRef} 
        position={{lat: place.specific_data.location.lat, lng: place.specific_data.location.lng}} 
        onClick={handleMarkerClick}
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
                  onDelete={onDelete}
                  isMinimal={true}
              />
            </div>
        </InfoWindow>
      )}
    </>
  );
}

const EmptyState = () => (
  <div className="bg-[#fcfaf8] rounded-2xl overflow-hidden border border-stone-200 h-[600px] w-full flex flex-col items-center justify-center p-8 text-center text-slate-700">
    <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6 shadow-sm border border-amber-100">
      <KeyRound className="w-8 h-8 text-amber-600" />
    </div>
    <h2 className="text-2xl font-serif text-slate-900 mb-3 tracking-tight">Map Configuration Required</h2>
    <p className="text-slate-500 mb-8 max-w-sm leading-relaxed text-sm">
      To explore your culinary map, you need to provide a Google Maps API Key to enable geographical features.
    </p>
    
    <div className="bg-white p-6 rounded-xl border border-stone-100 shadow-sm text-left w-full max-w-md space-y-4">
      <p className="text-sm">
         <span className="font-semibold text-slate-800">1. Generate Key</span><br/>
         <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:text-amber-700 hover:underline font-medium mt-1 inline-block">Get your API Key from Google Cloud &rarr;</a>
      </p>
      <div className="h-px bg-stone-100 w-full" />
      <div className="text-sm text-slate-600 space-y-2">
         <p className="font-semibold text-slate-800">2. Add to Secrets</p>
         <ul className="list-disc pl-5 space-y-1.5 marker:text-amber-400">
           <li>Open <strong>Settings</strong> (⚙️ top-right)</li>
           <li>Select <strong>Secrets</strong></li>
           <li>Name: <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">GOOGLE_MAPS_PLATFORM_KEY</code></li>
           <li>Value: <span className="opacity-75">Your acquired key</span></li>
         </ul>
      </div>
    </div>
  </div>
);

const MapInner = ({ places, onToggleStatus, onDelete }: { places: CulinaryItem[], onToggleStatus: (id: string) => void, onDelete?: (id: string) => void }) => {
  const isLoaded = useApiIsLoaded();
  
  const defaultCenter = places.length > 0 
    ? {lat: places[0].specific_data.location.lat, lng: places[0].specific_data.location.lng}
    : {lat: 48.8566, lng: 2.3522};

  return (
    <>
      {!isLoaded && (
        <div className="absolute inset-0 z-10 bg-[#fcfaf8] flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-4" />
          <p className="text-slate-500 font-medium font-serif tracking-wide">Loading Atlas...</p>
        </div>
      )}
      <Map
        defaultCenter={defaultCenter}
        defaultZoom={11}
        mapId="CULINARY_MAP_ID"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
      >
        {places.map((place) => (
          <MarkerWithInfoWindow 
            key={place.id} 
            keyProp={place.id}
            place={place} 
            onToggleStatus={onToggleStatus} 
            onDelete={onDelete}
          />
        ))}
      </Map>
    </>
  );
};

export default function MapView({ items, onToggleStatus, onDelete }: MapViewProps) {
  if (!hasValidKey) {
    return <EmptyState />;
  }

  const places = items.filter(
    (item) => item.specific_data?.location && item.specific_data.location.lat !== 0 && item.specific_data.location.lng !== 0
  );

  return (
    <div className="bg-[#fcfaf8] rounded-2xl overflow-hidden border border-stone-200 shadow-sm h-[600px] w-full relative">
      <APIProvider apiKey={API_KEY} version="weekly">
        <MapInner places={places} onToggleStatus={onToggleStatus} onDelete={onDelete} />
      </APIProvider>
    </div>
  );
}
