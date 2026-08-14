import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'x-rating': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        value?: number;
        max?: number;
      };
    }
  }
}
