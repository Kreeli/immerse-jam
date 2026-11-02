// Give range edits the same completion boundary as keyboard interaction. A
// bare input/change leaves Transport's preview active until blur/key-up.
async function range(page, name, value) {
  const slider = page.getByRole('slider', { name, exact: true });
  await slider.focus();
  await slider.evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      element,
      String(value),
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await slider.press('Tab');
}
async function saved(predicate) {
  const end = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Timed out waiting for the saved project');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
module.exports = { range, saved };
