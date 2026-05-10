export type ItemType = 'PLACE' | 'RECIPE' | 'GEAR';
export type ItemStatus = 'SAVED' | 'EXPERIENCED';

export interface Location {
  address: string;
  lat: number;
  lng: number;
}

export interface PlaceData {
  location: { address: string; lat: number; lng: number };
  cuisine?: string;
  price_range?: string;
  vibe?: string;
  signature_dishes?: string[];
  dietary_tags?: string[];
  best_for?: string[];
  phone?: string;
  hours_summary?: string;
  rating?: number;
  ratings_count?: number;
  google_maps_url?: string;
  website?: string;
  wolt_url?: string;
  instagram_url?: string;
  description?: string;
  photos?: string[];
}

export interface RecipeData {
  prep_time_minutes: number;
  cook_time_minutes: number;
  total_time_minutes?: number;
  serving_size: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  ingredients: string[];
  cuisine?: string;
  course?: string;
  dietary_tags?: string[];
  key_techniques?: string[];
  tips?: string[];
  description?: string;
  photos?: string[];
}

export interface GearData {
  brand: string;
  price: string;
  purchase_link: string;
  category?: string;
  use_case?: string;
  pros?: string[];
  cons?: string[];
  description?: string;
  photos?: string[];
}

export interface CulinaryItem {
  id: string;
  type: ItemType;
  title: string;
  thumbnail_url: string;
  context_tags: string[];
  status: ItemStatus;
  rating?: number;
  personal_review?: string;
  original_url?: string;
  specific_data: PlaceData | RecipeData | GearData | any;
}

export const mockItems: CulinaryItem[] = [
  {
    id: '1',
    type: 'PLACE',
    title: 'Port Said',
    thumbnail_url: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1974&auto=format&fit=crop',
    context_tags: ['Date Night', 'Atmosphere', 'Middle Eastern'],
    status: 'EXPERIENCED',
    rating: 5,
    personal_review: 'Unbelievable energy. The roasted sweet potato is a must.',
    specific_data: {
      location: { address: 'Har Sinai St 5, Tel Aviv', lat: 32.0645, lng: 34.7732 },
      google_maps_url: 'https://maps.google.com/?q=Port+Said+Tel+Aviv'
    }
  },
  {
    id: '2',
    type: 'RECIPE',
    title: 'Reverse Sear Ribeye',
    thumbnail_url: 'https://images.unsplash.com/photo-1600891963951-460d3d57d76f?q=80&w=2070&auto=format&fit=crop',
    context_tags: ['Meat', 'Keto', 'Weekend Project'],
    status: 'SAVED',
    specific_data: {
      prep_time_minutes: 60,
      difficulty: 'Medium',
      ingredients: ['Ribeye Steak', 'Kosher Salt', 'Black Pepper', 'Butter', 'Garlic', 'Thyme']
    }
  },
  {
    id: '3',
    type: 'PLACE',
    title: 'Hudson Brasserie',
    thumbnail_url: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?q=80&w=2070&auto=format&fit=crop',
    context_tags: ['Meat', 'High End', 'Date Night'],
    status: 'EXPERIENCED',
    rating: 5,
    personal_review: 'The best steakhouse in the city. Incredible aging program.',
    specific_data: {
      location: { address: 'HaBarzel St 27, Tel Aviv', lat: 32.1121, lng: 34.8407 }
    }
  },
  {
    id: '4',
    type: 'GEAR',
    title: 'Lodge Cast Iron Skillet',
    thumbnail_url: 'https://images.unsplash.com/photo-1584803735147-19612c75a40a?q=80&w=2102&auto=format&fit=crop',
    context_tags: ['Essentials', 'Durable'],
    status: 'EXPERIENCED',
    rating: 5,
    personal_review: 'A workhorse. Essential for getting a great crust on steaks.',
    specific_data: {
      brand: 'Lodge',
      price: '$40',
      purchase_link: 'https://amazon.com/...'
    }
  },
  {
    id: '5',
    type: 'PLACE',
    title: 'George & John',
    thumbnail_url: 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?q=80&w=2070&auto=format&fit=crop',
    context_tags: ['Fine Dining', 'Date Night', 'Wine'],
    status: 'SAVED',
    specific_data: {
      location: { address: 'Auerbach St 6, Tel Aviv', lat: 32.0573, lng: 34.7644 }
    }
  },
  {
    id: '6',
    type: 'RECIPE',
    title: 'Bone Marrow & Chimichurri',
    thumbnail_url: 'https://images.unsplash.com/photo-1628169125139-4bb42fcadfc3?q=80&w=2071&auto=format&fit=crop',
    context_tags: ['Appetizer', 'Meat', 'Keto'],
    status: 'EXPERIENCED',
    rating: 4,
    personal_review: 'Decadent and rich. Needs plenty of crusty bread or serves as a great steak topper.',
    specific_data: {
      prep_time_minutes: 25,
      difficulty: 'Easy'
    }
  },
  {
    id: '7',
    type: 'PLACE',
    title: 'M25',
    thumbnail_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=1974&auto=format&fit=crop',
    context_tags: ['Meat', 'Casual', 'Lunch'],
    status: 'EXPERIENCED',
    rating: 5,
    personal_review: 'Incredible meat quality in Carmel Market. The Arayes are mandatory.',
    specific_data: {
      location: { address: 'Simtat HaCarmel 30, Tel Aviv-Yafo', lat: 32.0682, lng: 34.7684 }
    }
  },
  {
    id: '8',
    type: 'GEAR',
    title: 'Meater Plus',
    thumbnail_url: 'https://images.unsplash.com/photo-1579888944594-39c28892d5c3?q=80&w=2070&auto=format&fit=crop',
    context_tags: ['Tech', 'Meat'],
    status: 'SAVED',
    specific_data: {
      brand: 'Meater',
      price: '$99'
    }
  }
];
