// Mock types for constants (not used in production)
export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  venue: string;
  imageUrl: string;
  priceStart: number;
  tags: string[];
  isSellingFast: boolean;
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
  qrCodeUrl: string;
  purchaseDate: string;
}

export interface TicketTier {
  id: string;
  name: string;
  description: string;
  price: number;
  available: number;
  maxPerOrder: number;
  type: string;
}

export enum TicketStatus {
  ACTIVE = 'active',
  REDEEMED = 'redeemed',
  EXPIRED = 'expired',
}

export enum UserRole {
  CUSTOMER = 'customer',
  STAFF = 'staff',
  MERCHANT = 'merchant',
  ADMIN = 'admin',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
}

export interface Region {
  id: string;
  name: string;
  isActive: boolean;
}
