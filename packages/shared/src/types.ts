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
