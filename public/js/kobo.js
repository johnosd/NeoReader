(() => {
  const api = globalThis.kobo || globalThis.Kobo || {}
  const noop = () => {}

  api.init ??= noop
  api.initialize ??= noop
  api.paginate ??= noop
  api.updatePageStyles ??= noop
  api.updatePageMetrics ??= noop
  api.setFontSize ??= noop
  api.setReadingMode ??= noop

  globalThis.kobo = api
  globalThis.Kobo = api
})()
