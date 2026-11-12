export const PROMOTION_TAGS = {
  special_guest: 'Convidado especial',
  influencer: 'Influenciador parceiro',
  promotional: 'Corrida promocional',
  sponsored: 'Corrida patrocinada',
  event: 'Evento parceiro',
} as const;

export interface PromotionPresentation {
  tag: keyof typeof PROMOTION_TAGS;
  partnerName?: string;
  message: string;
  animation: 'none' | 'flash' | 'confetti';
}

export const DEFAULT_PROMOTION_MESSAGE = '📸 Corrida especial com {nome}! Você foi convidado para fazer parte desta experiência.';

export function parsePromotionPresentation(value: unknown): PromotionPresentation | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw Error('Apresentação inválida.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['tag', 'partnerName', 'message', 'animation'].includes(key)) ||
      typeof data.tag !== 'string' || !Object.hasOwn(PROMOTION_TAGS, data.tag) ||
      (data.partnerName != null && typeof data.partnerName !== 'string') ||
      typeof data.message !== 'string' || !['none', 'flash', 'confetti'].includes(String(data.animation))) {
    throw Error('Tag, mensagem ou animação inválida.');
  }
  const partnerName = String(data.partnerName ?? '').trim().replace(/\s+/g, ' ');
  const message = data.message.trim();
  if (partnerName.length > 80 || message.length > 320 ||
      /[\u0000-\u0008\u000b-\u001f\u007f]/.test(partnerName + message)) {
    throw Error('Use até 80 caracteres no nome e 320 na mensagem.');
  }
  return {tag: data.tag as PromotionPresentation['tag'], ...(partnerName ? {partnerName} : {}),
    message, animation: data.animation as PromotionPresentation['animation']};
}

export function driverPromotionPresentation(presentation: PromotionPresentation | undefined, accepted: boolean) {
  if (presentation == null) return undefined;
  const identity = {tag: presentation.tag, label: PROMOTION_TAGS[presentation.tag]};
  if (!accepted) return identity;
  return {...identity, partnerName: presentation.partnerName ?? null,
    message: presentation.message.replaceAll('{nome}', presentation.partnerName || 'nosso parceiro'),
    animation: presentation.animation};
}
