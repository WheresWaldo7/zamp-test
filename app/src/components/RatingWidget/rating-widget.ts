const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

class RatingWidget extends HTMLElement {
  private value = 0;
  private max = 5;

  static get observedAttributes() {
    return ['value', 'max'];
  }

  connectedCallback() {
    this.max = Number(this.getAttribute('max')) || 5;
    this.value = Number(this.getAttribute('value')) || 0;

    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { display: inline-flex; gap: 2px; }
      .star {
        font-size: 22px;
        line-height: 1;
        color: #d0d0d8;
        cursor: pointer;
        user-select: none;
      }
      .star.filled { color: #f5a623; }
    `;
    shadow.appendChild(style);
    this.renderStars();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue || !this.shadowRoot) return;
    if (name === 'value') this.value = Number(newValue) || 0;
    if (name === 'max') this.max = Number(newValue) || 5;
    this.renderStars();
  }

  private renderStars() {
    const shadow = this.shadowRoot!;
    shadow.querySelectorAll('.star').forEach((el) => el.remove());
    for (let i = 1; i <= this.max; i++) {
      const span = document.createElement('span');
      span.className = 'star' + (i <= this.value ? ' filled' : '');
      span.textContent = i <= this.value ? STAR_FILLED : STAR_EMPTY;
      span.setAttribute('data-star-index', String(i));
      span.addEventListener('click', () => this.setValue(i));
      shadow.appendChild(span);
    }
  }

  private setValue(next: number) {
    this.value = next;
    this.setAttribute('value', String(next));
    this.dispatchEvent(
      new CustomEvent('rating-change', {
        detail: { value: next },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

if (!customElements.get('x-rating')) {
  customElements.define('x-rating', RatingWidget);
}

export {};
