// Small presentation primitives shared by the operational settings. They keep
// native form controls, labels and server-owned values; no API calls here.
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function action(text, primary = false) {
  const button = element('button', text, 'button ' + (primary ? 'button--primary' : 'button--ghost-dark'));
  button.type = 'button';
  return button;
}
export function field(text, control) {
  const label = element('label', null, 'field');
  label.append(element('span', text), control);
  return label;
}
export function toggle(text, description, control) {
  const label = element('label', null, 'admin-policy-toggle');
  const copy = element('span');
  copy.append(element('strong', text), element('small', description));
  label.append(copy, control);
  return label;
}
export function header(kicker, title, description) {
  const head = element('div', null, 'panel-card__header');
  const copy = element('div');
  copy.append(element('span', kicker, 'eyebrow eyebrow--dark'), element('h2', title));
  if (description) copy.append(element('p', description, 'muted-copy'));
  head.append(copy);
  return head;
}
export function feedback(text = '') {
  const message = element('p', text, 'admin-feedback');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.setAttribute('aria-atomic', 'true');
  return message;
}
export function setFeedback(message, text, state = '') {
  message.textContent = text;
  message.dataset.state = state;
}
