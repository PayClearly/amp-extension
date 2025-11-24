import type { PortalTemplate, FieldMapping } from './types';
import { config } from './config';

export function generateSelector(element: HTMLElement): string {
  // Prefer ID
  if (element.id) {
    return `#${element.id}`;
  }

  // Prefer name attribute
  if ((element as HTMLInputElement).name) {
    return `[name="${(element as HTMLInputElement).name}"]`;
  }

  // Use class if unique
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.split(' ').filter(Boolean);
    if (classes.length > 0) {
      return `.${classes[0]}`;
    }
  }

  // Fallback to tag + nth-child
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(element);
    return `${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
  }

  return element.tagName.toLowerCase();
}

export function findLabel(element: HTMLElement): HTMLLabelElement | null {
  // Check for/for relationship
  const id = element.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`) as HTMLLabelElement;
    if (label) return label;
  }

  // Check parent label
  let parent = element.parentElement;
  while (parent && parent.tagName !== 'BODY') {
    if (parent.tagName === 'LABEL') {
      return parent as HTMLLabelElement;
    }
    parent = parent.parentElement;
  }

  return null;
}

export function findNearbyLabel(element: HTMLElement): HTMLLabelElement | null {
  // Check previous sibling
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === 'LABEL') {
      return sibling as HTMLLabelElement;
    }
    sibling = sibling.previousElementSibling;
  }

  // Check parent's previous sibling
  const parent = element.parentElement;
  if (parent) {
    sibling = parent.previousElementSibling;
    if (sibling && sibling.tagName === 'LABEL') {
      return sibling as HTMLLabelElement;
    }
  }

  return null;
}

export function verifyTemplateSignature(
  template: PortalTemplate,
  publicKey: string
): boolean {
  // TODO: Implement RSA signature verification
  // For now, return true if signature exists
  return template.signature.length > 0;
}

export async function getCachedTemplate(
  portalId: string,
  pageKey: string
): Promise<PortalTemplate | null> {
  const result = await chrome.storage.local.get(`template_${portalId}_${pageKey}`);
  const template = result[`template_${portalId}_${pageKey}`] as PortalTemplate | undefined;
  if (template) {
    // Verify signature
    if (
      config.templateSigningPublicKey &&
      !verifyTemplateSignature(template, config.templateSigningPublicKey)
    ) {
      console.warn('Template signature verification failed');
      return null;
    }
    return template;
  }
  return null;
}

export async function cacheTemplate(template: PortalTemplate): Promise<void> {
  const key = `template_${template.portalId}_${template.pageKey}`;
  await chrome.storage.local.set({ [key]: template });
}

