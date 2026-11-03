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
async function choose(page, name, value) {
  const menu = page.getByRole('button', { name, exact: true });
  if (name === '当前分离结果' && (await menu.count())) {
    await menu.click();
    await page.locator(`[data-result-id=${JSON.stringify(String(value || ''))}]`).click();
    return;
  }
  const control = page.getByRole('combobox', { name, exact: true });
  if (await control.evaluate((el) => el.tagName === 'SELECT')) return control.selectOption(value);
  const label = await page.locator('select').evaluateAll(
    (nodes, { name, value }) => {
      const select = nodes.find((el) => el.getAttribute('aria-label') === name);
      return [...(select?.options || [])]
        .find((option) => option.value === String(value))
        ?.textContent?.trim()
        .replace(/\s+/g, ' ');
    },
    { name, value },
  );
  if (!label) throw new Error('Missing option for ' + name + ': ' + value);
  await control.click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
module.exports = { range, saved, choose };
