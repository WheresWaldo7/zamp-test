import { useMemo, useState } from 'react';
import { generateOrders } from './data/generateOrders';
import type { Order, OrderStatus } from './types/order';
import { FilterBar } from './components/FilterBar/FilterBar';
import { OrdersTable } from './components/OrdersTable/OrdersTable';
import { OrderDetailDrawer } from './components/OrderDetailDrawer/OrderDetailDrawer';
import { HoverMenus } from './components/HoverMenus/HoverMenus';
import { SortableFilterList } from './components/SortableFilterList/SortableFilterList';
import { CookieBanner } from './components/CookieBanner/CookieBanner';
import styles from './App.module.css';

const INITIAL_ORDERS = generateOrders(600);

function App() {
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesQuery =
        q.length === 0 ||
        order.company.toLowerCase().includes(q) ||
        order.customer.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [orders, query, statusFilter]);

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? null;

  const handleSave = (id: string, changes: Partial<Order>) => {
    setOrders((current) =>
      current.map((order) => (order.id === id ? { ...order, ...changes } : order)),
    );
  };

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Order Console</h1>
      </header>

      <HoverMenus />
      <SortableFilterList />
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        resultCount={filteredOrders.length}
      />

      <div className={styles.body}>
        <div className={styles.tableColumn}>
          <OrdersTable
            orders={filteredOrders}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <OrderDetailDrawer order={selectedOrder} onSave={handleSave} />
      </div>

      <CookieBanner />
    </div>
  );
}

export default App;
