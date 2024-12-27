export function arrPolyfill() {
  if (!Array.prototype.at) {
    return
  }

  Object.defineProperty(Array.prototype, 'at', {
    value: function (index: number) {
      if (index < 0) {
        index += this.length
      }
      return this[index]
    },
    configurable: false,
    writable: false
  })
}
