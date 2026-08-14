import { ORDER_STATUSES, type Order } from '../types/order';

const COMPANIES = [
  'Acme Corp',
  'Globex',
  'Initech',
  'Umbrella LLC',
  'Soylent Co',
  'Hooli',
  'Vandelay Industries',
  'Stark Industries',
  'Wayne Enterprises',
  'Wonka Ltd',
  'Pied Piper',
  'Aperture Science',
];

const FIRST_NAMES = [
  'Alex',
  'Jordan',
  'Taylor',
  'Morgan',
  'Casey',
  'Riley',
  'Priya',
  'Wei',
  'Sofia',
  'Noah',
  'Amara',
  'Leo',
];

const LAST_NAMES = [
  'Chen',
  'Patel',
  'Garcia',
  'Kim',
  'Nguyen',
  'Smith',
  'Okafor',
  'Rossi',
  'Muller',
  'Novak',
  'Silva',
  'Ivanov',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function generateOrders(count = 600): Order[] {
  const orders: Order[] = [];
  for (let i = 0; i < count; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const company = pick(COMPANIES);
    const daysAgo = Math.floor(Math.random() * 90);
    orders.push({
      id: `ORD-${1000 + i}`,
      company,
      customer: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${slugify(company)}.com`,
      status: pick(ORDER_STATUSES),
      total: Math.round((20 + Math.random() * 980) * 100) / 100,
      rating: Math.floor(Math.random() * 6),
      placedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      notes: '',
    });
  }
  return orders;
}
