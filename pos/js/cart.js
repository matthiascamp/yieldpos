export class Cart {
  constructor() {
    this.items = []
    this.onChange = null
  }

  addProduct(product, qty = 1, silent = false) {
    const price = product.active_price ?? product.price
    const taxRate = product.tax_rate ?? 0.10
    const isReturnLine = qty < 0
    const existing = this.items.find(i =>
      i.product_id === product.id &&
      product.unit === 'each' &&
      i.unit_price === price &&
      (i.qty < 0) === isReturnLine
    )
    if (existing) {
      existing.qty += qty
      this._recalcItem(existing)
    } else {
      const item = {
        product_id: product.id,
        name: product.name,
        qty,
        unit: product.unit || 'each',
        unit_price: price,
        tax_rate: taxRate,
        discount: 0,
        line_total: 0,
        tax: 0,
        is_special: product.is_special || false,
        deal_id: null,
        deal_name: null,
        category_id: product.category_id || null,
        image_url: product.image_url || null,
        category_color: product.category_color || null,
      }
      this._recalcItem(item)
      this.items.push(item)
    }
    if (!silent) this._notify()
  }

  updateQty(index, qty) {
    if (qty === 0) { this.removeItem(index); return }
    const item = this.items[index]
    if (!item) return
    item.qty = qty
    this._recalcItem(item)
    this._notify()
  }

  removeItem(index) {
    this.items.splice(index, 1)
    this._notify()
  }

  updatePrice(index, newPrice) {
    const item = this.items[index]
    if (!item) return
    item.unit_price = newPrice
    this._recalcItem(item)
    this._notify()
  }

  setItemDiscount(index, amount) {
    const item = this.items[index]
    if (!item) return
    item.discount = +amount
    this._recalcItem(item)
    this._notify()
  }

  clear() {
    this.items = []
    this._notify()
  }

  loadItems(items) {
    this.items = items.map(i => ({ ...i }))
    this._notify()
  }

  _recalcItem(item) {
    const rate = item.tax_rate ?? 0.10
    const gross = item.qty * item.unit_price
    // For returns (negative qty), discount reduces the absolute amount (moves toward zero)
    item.line_total = +(gross >= 0 ? Math.max(0, gross - item.discount) : Math.min(0, gross + item.discount)).toFixed(2)
    item.tax = +(item.line_total * rate / (1 + rate)).toFixed(2)
  }

  get subtotal() { return +this.items.reduce((s, i) => s + i.line_total, 0).toFixed(2) }
  get tax() { return +this.items.reduce((s, i) => s + i.tax, 0).toFixed(2) }
  get discount() { return +this.items.reduce((s, i) => s + i.discount, 0).toFixed(2) }
  get total() { return this.subtotal }
  get count() { return this.items.reduce((s, i) => s + i.qty, 0) }
  get isEmpty() { return this.items.length === 0 }

  toTransaction(staffId, payments) {
    return {
      staff_id: staffId,
      subtotal: this.subtotal,
      tax: this.tax,
      discount: this.discount,
      total: this.total,
      status: 'completed',
      items: this.items.map(i => ({ ...i })),
      payments,
    }
  }

  _notify() { if (this.onChange) this.onChange(this) }
}
