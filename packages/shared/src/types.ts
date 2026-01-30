export enum UserRole {
  CUSTOMER = 'customer',
  STAFF = 'staff',
  MERCHANT = 'merchant',
  ADMIN = 'admin'
}

export enum TicketStatus {
  ACTIVE = 'active',
  USED = 'used',
  REFUNDED = 'refunded'
}

export enum TicketType {
  ENTRY_18 = 'entry_18',
  ENTRY_21 = 'entry_21',
  DRINK_21 = 'drink_21',
  COMBO = 'combo'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  regionId?: string;
}

export interface Region {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  venue: string;
  venueId: string;
  imageUrl: string;
  priceStart: number;
  tags: string[];
  isSellingFast?: boolean;
  regionId: string;
}

export interface TicketTier {
  id: string;
  eventId: string;
  name: string;
  description: string;
  price: number;
  available: number;
  maxPerOrder: number;
  type: TicketType;
  ageRequirement: 18 | 21;
}

export interface Ticket {
  id: string;
  eventId: string;
  eventName: string;
  venue: string;
  date: string;
  time: string;
  status: TicketStatus;
  tierName: string;
  qrToken: string;
  qrCodeUrl: string;
  purchaseDate: string;
  redeemedAt?: string;
  redeemedBy?: string;
}

export interface Order {
  id: string;
  userId: string;
  stripeSessionId?: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  totalAmount: number;
  createdAt: string;
}

/** 从 Google Places Details 解析后的结构化地址，用于写入 venues / regions */
export interface PlaceDetailsResponse {
  place_id: string;
  formatted_address: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  lat: number;
  lng: number;
}

export type DropStatus = 'draft' | 'published';

export interface Drop {
  id: string;
  region_id: string;
  title: string;
  subtitle?: string | null;
  content: string;
  poster_url: string | null;
  status: DropStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  region?: Region;
}
