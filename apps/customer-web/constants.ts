import { Event, Ticket, TicketTier, TicketStatus, UserRole, User, Region } from './types';

// TODO: Replace with Supabase API calls
export const MOCK_USER: User = {
  id: 'u_123',
  name: 'Jonathan Sterling',
  email: 'jonathan.sterling@luxnight.com',
  role: UserRole.CUSTOMER, // Change this to test staff features
  avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBXzJVD41qxM39-XRf7NKgwX_4Z1Wo3jxVqsr489pxMidZtnbs_IM8Ei3etdZosJlm5FKq1ibIQl8g38lHnGiF52kTZunz-s3IQ4SxtwnZEOd5qAOzd0dthYJ-d5aYlQwipBYYyxZccps85eTeXNReTdAvU0JzCVqPMChnV6Tx3ffIomeOltsJlF4SjEfqLgtc6adpr7EzX_MRC11mqU19rWNcHhv4zJ-cngFSfom_7C3KTjbMVDmkUU5EAT9n2NF8dx-1E_L8tcEJL'
};

export const MOCK_EVENTS: Event[] = [
  {
    id: 'e_1',
    title: 'Midnight Gold Gala',
    date: 'Fri, Oct 24',
    time: '10:00 PM',
    location: 'The Bund',
    venue: 'The Obsidian Lounge',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDbRpJYMs57YydZlP3NjZyQ_n2SldjdbfzTirL6FPZLE_-uhtAmfSdO6AAbEAr_-jzYN9_6QcSp-xZ9ZLjoKQe8MQnlcimzJ5NeF-Gp7Qq4Is7A7Dl_E-gEibDOMaAa_H_pjrNMW9ElihkYuLbzwm-u_uQuoBYo4dbBRwXNRy18pMrkfk83yN92IgcUwPyCqxjPEMCFlsuzGh4JsT5RJeTGHkxkgMNg__Fu_RbtB_KVd0wtyADhPZoM38QoPbXSr_tABmQAz22E5SQw',
    priceStart: 50,
    tags: ['TONIGHT', '21+'],
    isSellingFast: true
  },
  {
    id: 'e_2',
    title: 'Neon Nights: Deep House',
    date: 'Sat, Oct 25',
    time: '11:00 PM',
    location: 'Downtown Sector 4',
    venue: 'The Void Club',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDtzwPTFmG482WX9iO9Hbtf82KC7kOLZGkHS1y8uUnB3cCRj-ieYtLQ713KnDUUA8GiI7FYwYGhZlhIG_YlGaqQrIIPN2MuMpfEaJ5k-ucLgRjUAMLD-sEC7MBBZcLSSDaoi1qFDKpir9jRs6OAVIIBnFMUTSfKN7hq5PRsF0zMZHOWiK1wLFrY8QqGvrowsbyuszFzOSaxyjpgStKAzpFnRVerT0t1pVnhX_QCvDggIqdia6mTRaUKS84WBbR8sIye_XYqiAzEoC-n',
    priceStart: 35,
    tags: ['OPEN LATE'],
    isSellingFast: false
  }
];

export const MOCK_TIERS: TicketTier[] = [
  {
    id: 't_gen',
    name: 'General Admission',
    description: 'Entry to the main floor, live DJ set access, and open bar until midnight.',
    price: 40,
    available: 100,
    maxPerOrder: 4,
    type: 'general'
  },
  {
    id: 't_vip',
    name: 'VIP Table',
    description: 'Private booth for 4, 2 premium bottles, personal server, and skip-the-line.',
    price: 500,
    available: 2, // Low stock test
    maxPerOrder: 1,
    type: 'table'
  }
];

export const MOCK_REGIONS: Region[] = [
  { id: 'sh', name: 'Shanghai', isActive: true },
  { id: 'tk', name: 'Tokyo', isActive: false },
  { id: 'ny', name: 'New York', isActive: false },
  { id: 'ln', name: 'London', isActive: false },
];

export const MOCK_TICKETS: Ticket[] = [
  {
    id: '8493-2910',
    eventId: 'e_2',
    eventName: 'Neon Nights',
    venue: 'The Void Club',
    date: 'Oct 24',
    time: '10:00 PM',
    status: TicketStatus.ACTIVE,
    tierName: 'VIP Entry',
    qrCodeUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBcMD3F5ABjIDBQ92LIp6cxhBXuWQ9uz8ZLHtRkFgUoKREGhNTUkf_WfFRpZh7ExGV9I1CWOdcPrWfsGrjIcSm9W18vEUTZajv6gwRQeA4j_0tDBqOfx9GQwmuX1wxld_3Y5vZmbEQcbV_fNa2p-V3hL_OHIeTyNex_20Vp6YbQxFj8j4zaBpCog86bsrkUYAarD7XFaOe0sxgbpq-sykMdlNve7N0wygPcIitA3DyIDFiiU5smD2eqdbjxlTVwRU8v4fpB8bRCQRgu',
    purchaseDate: '2023-10-20'
  }
];
