const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

class RatingWidget extends HTMLElement {
  private currentValue = 0;
  private max = 5;

  static get observedAttributes() {
    return ['value', 'max'];
  }

  // A custom element has to accept a property as well as an attribute.
  // Frameworks choose between them on their own — React 19 assigns
  // `el.value = 4` for a non-string, which used to land straight on a class
  // field and re-render nothing, so the widget showed an empty row of stars
  // for an order rated four, then kept whatever was last clicked forever.
  get value(): number {
    return this.currentValue;
  }

  set value(next: number) {
    const parsed = Number(next) || 0;
    if (parsed === this.currentValue) return;
    this.currentValue = parsed;
    // Reflected so the DOM tells the truth about what is on screen; the
    // guard above stops the resulting attribute change from looping.
    this.setAttribute('value', String(parsed));
    if (this.shadowRoot) this.renderStars();
  }

  /**
   * A property assigned before the element upgraded sits on the instance and
   * shadows the accessor, so the setter never runs and the value is lost.
   * Deleting it and assigning it again puts it back through the accessor.
   */
  private adoptPreUpgradeValue() {
    if (!Object.prototype.hasOwnProperty.call(this, 'value')) return;
    const pending = (this as unknown as { value: number }).value;
    delete (this as unknown as { value?: number }).value;
    this.value = pending;
  }

  connectedCallback() {
    this.max = Number(this.getAttribute('max')) || 5;
    this.currentValue = Number(this.getAttribute('value')) || 0;

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
    this.adoptPreUpgradeValue();
    this.renderStars();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue || !this.shadowRoot) return;
    if (name === 'value') {
      this.value = Number(newValue) || 0;
      return;
    }
    if (name === 'max') this.max = Number(newValue) || 5;
    this.renderStars();
  }

  private renderStars() {
    const shadow = this.shadowRoot!;
    shadow.querySelectorAll('.star').forEach((el) => el.remove());
    for (let i = 1; i <= this.max; i++) {
      const span = document.createElement('span');
      span.className = 'star' + (i <= this.currentValue ? ' filled' : '');
      span.textContent = i <= this.currentValue ? STAR_FILLED : STAR_EMPTY;
      span.setAttribute('data-star-index', String(i));
      span.addEventListener('click', () => this.setValue(i));
      shadow.appendChild(span);
    }
  }

  private setValue(next: number) {
    this.value = next;
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
