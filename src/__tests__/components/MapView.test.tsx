import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CulinaryItem } from '../../data/mockData';

// Mock @vis.gl/react-google-maps to avoid real map rendering
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  Map: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'google-map' }, children),
  AdvancedMarker: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'map-marker' }, children),
  InfoWindow: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'info-window' }, children),
  Pin: () => React.createElement('div', { 'data-testid': 'pin' }),
  useAdvancedMarkerRef: () => [vi.fn(), null],
  useApiIsLoaded: () => true,
  useMap: () => null,
}));

// Mock ItemCard to avoid deep rendering
vi.mock('../../components/ItemCard', () => ({
  default: () => null,
}));

// Import after mocks are set up
import MapView from '../../components/MapView';

// In vitest.config.ts, process.env.GOOGLE_MAPS_PLATFORM_KEY is set to ''
// So hasValidKey will be false → MapView renders EmptyState for all tests

const placeItem: CulinaryItem = {
  id: 'place-1',
  type: 'PLACE',
  title: 'Test Restaurant',
  thumbnail_url: 'https://example.com/thumb.jpg',
  context_tags: ['Italian', 'Pizza'],
  status: 'SAVED',
  specific_data: {
    location: { address: '123 Main St, Paris', lat: 48.8566, lng: 2.3522 },
    cuisine: 'Italian',
  },
};

const emptyItems: CulinaryItem[] = [];
const itemsWithPlace: CulinaryItem[] = [placeItem];

describe('MapView', () => {
  it('renders "Map Configuration Required" when API key is not set', () => {
    render(
      <MapView
        items={emptyItems}
        onToggleStatus={vi.fn()}
      />
    );
    expect(screen.getByText('Map Configuration Required')).toBeInTheDocument();
  });

  it('renders setup instructions when API key is not set', () => {
    render(
      <MapView
        items={emptyItems}
        onToggleStatus={vi.fn()}
      />
    );
    expect(screen.getByText(/Get your API Key from Google Cloud/i)).toBeInTheDocument();
  });

  it('renders configuration instructions with secrets step', () => {
    render(
      <MapView
        items={emptyItems}
        onToggleStatus={vi.fn()}
      />
    );
    expect(screen.getByText(/Add to Secrets/i)).toBeInTheDocument();
  });

  it('renders GOOGLE_MAPS_PLATFORM_KEY code reference in instructions', () => {
    render(
      <MapView
        items={emptyItems}
        onToggleStatus={vi.fn()}
      />
    );
    expect(screen.getByText('GOOGLE_MAPS_PLATFORM_KEY')).toBeInTheDocument();
  });

  it('still shows EmptyState when items with valid lat/lng are provided (no API key)', () => {
    render(
      <MapView
        items={itemsWithPlace}
        onToggleStatus={vi.fn()}
      />
    );
    // Without a valid API key, the EmptyState is always rendered
    expect(screen.getByText('Map Configuration Required')).toBeInTheDocument();
    // The actual map should NOT be rendered
    expect(screen.queryByTestId('google-map')).not.toBeInTheDocument();
  });

  it('does not render the map container when hasValidKey is false', () => {
    render(
      <MapView
        items={itemsWithPlace}
        onToggleStatus={vi.fn()}
      />
    );
    expect(screen.queryByTestId('google-map')).not.toBeInTheDocument();
  });

  it('renders a link to Google Cloud console in instructions', () => {
    render(
      <MapView
        items={emptyItems}
        onToggleStatus={vi.fn()}
      />
    );
    const link = screen.getByRole('link', { name: /Get your API Key from Google Cloud/i });
    expect(link).toHaveAttribute('href', 'https://console.cloud.google.com/google/maps-apis/start');
  });

  it('passes onToggleStatus without crashing when items list is empty', () => {
    const onToggleStatus = vi.fn();
    expect(() =>
      render(<MapView items={emptyItems} onToggleStatus={onToggleStatus} />)
    ).not.toThrow();
  });
});
