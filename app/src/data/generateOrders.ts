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

// Seeded so the "random" dataset is identical across reloads — a recorder
// that replays against a virtualized list needs the same rows in the same
// order every time to prove anything, and a fixed fixture makes the
// eventual v1-vs-v2 healing demo reproducible instead of a coin flip.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260814;
const FIXTURE_NOW = Date.UTC(2026, 7, 14);

function pick<T>(arr: T[], random: () => number): T {
  return arr[Math.floor(random() * arr.length)];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function generateOrders(count = 600): Order[] {
  const random = mulberry32(SEED);
  const orders: Order[] = [];
  for (let i = 0; i < count; i++) {
    const first = pick(FIRST_NAMES, random);
    const last = pick(LAST_NAMES, random);
    const company = pick(COMPANIES, random);
    const daysAgo = Math.floor(random() * 90);
    orders.push({
      id: `ORD-${1000 + i}`,
      company,
      customer: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${slugify(company)}.com`,
      status: pick(ORDER_STATUSES, random),
      total: Math.round((20 + random() * 980) * 100) / 100,
      rating: Math.floor(random() * 6),
      placedAt: new Date(FIXTURE_NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      notes: '',
    });
  }
  return orders;
}
