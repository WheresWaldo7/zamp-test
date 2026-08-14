export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

export interface Order {
  id: string;
  company: string;
  customer: string;
  email: string;
  status: OrderStatus;
  total: number;
  rating: number;
  placedAt: string;
  notes: string;
}
