import { z } from 'zod';
const text = (max: number) => z.string().trim().min(1).max(max);
const link = z.string().max(2048).refine(value => {
  if (value === '') return true;
  if (/^\/media\/[a-f0-9]{64}\.(apk|png|jpg|webp)$/.test(value)) return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}, 'Use um endereço HTTPS completo.');
const image = z.string().refine(value => /^\/(app-icon|driver-icon|jericoacoara)\.webp$/.test(value) || /^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(value), 'Envie uma imagem pelo painel.');
export const contentSchema = z.object({
  heroTitle: text(70), heroAccent: text(40), heroDescription: text(220),
  driverTitle: text(70), driverAccent: text(40), driverDescription: text(250),
  downloadTitle: text(80), downloadAccent: text(50),
  heroImage: image, heroImageAlt: text(180), appIcon: image, driverIcon: image,
  photoCredit: z.string().trim().max(180), photoCreditUrl: link,
  apps: z.array(z.object({ id: z.enum(['passageiro','motorista']), label: text(30), version: z.string().trim().max(40), apkHref: link, webHref: link, playStoreHref: link, appStoreHref: link }).strict()).length(2).refine(a => new Set(a.map(x => x.id)).size === 2),
}).strict();
export type SiteContent = z.infer<typeof contentSchema>;
export const defaultContent: SiteContent = {
  heroTitle: 'O próximo destino', heroAccent: 'é seu.', heroDescription: 'Corridas e entregas em um app.\nNosso começo: Jericoacoara, Jijoca e Preá.',
  driverTitle: 'Você dirige?', driverAccent: 'Ramo nessa.', driverDescription: 'Motorista, mototaxista ou entregador: vem fazer parte do Ramo Nessa na sua região.',
  downloadTitle: 'Seu próximo destino', downloadAccent: 'começa aqui.',
  heroImage: '/jericoacoara.webp', heroImageAlt: 'Pôr do sol sobre o mar visto da Duna do Pôr do Sol em Jericoacoara', appIcon: '/app-icon.webp', driverIcon: '/driver-icon.webp',
  photoCredit: 'Wanessa Gabrielle / Wikimedia Commons · CC BY-SA 4.0 · Imagem redimensionada e recortada.',
  photoCreditUrl: 'https://commons.wikimedia.org/wiki/File:Imensid%C3%A3o_do_mar_vista_da_Duna_do_P%C3%B4r_do_Sol_-_Praia_de_Jericoacoara.jpg',
  apps: [{ id: 'passageiro', label: 'Passageiro', version: '', apkHref: '', webHref: '', playStoreHref: '', appStoreHref: '' },{ id: 'motorista', label: 'Motorista', version: '', apkHref: '', webHref: '', playStoreHref: '', appStoreHref: '' }],
};
export const leadSchema = z.object({ status: z.enum(['new','contacted','approved','closed']), notes: z.string().trim().max(2000), expectedRevision: z.number().int().nonnegative() }).strict();
export class SiteError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
