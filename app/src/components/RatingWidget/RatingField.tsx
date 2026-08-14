import { useEffect, useRef } from 'react';
import './rating-widget';

interface RatingChangeEvent extends CustomEvent {
  detail: { value: number };
}

interface RatingFieldProps {
  value: number;
  max?: number;
  onChange: (value: number) => void;
}

export function RatingField({ value, max = 5, onChange }: RatingFieldProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (event: Event) => {
      onChange((event as RatingChangeEvent).detail.value);
    };
    el.addEventListener('rating-change', handler);
    return () => el.removeEventListener('rating-change', handler);
  }, [onChange]);

  return <x-rating ref={ref} value={value} max={max} />;
}
