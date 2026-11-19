const REQUIREMENTS_URL = 'https://github.com/NialtoServices/astro-reviews#widget-requirements'

/**
 * The widget's markup lacks something the sync cannot do without, almost always because the widget
 * is set up in Trustindex with a layout or setting the package does not support. The fix is in
 * Trustindex, not the site, so the message names what is missing and points at the setup steps.
 */
export class WidgetRequirementError extends Error {
  constructor(missing) {
    super(`The Trustindex widget has ${missing}. See ${REQUIREMENTS_URL}`)
    this.name = 'WidgetRequirementError'
    this.missing = missing
  }
}
