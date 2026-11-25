import { z } from 'zod';

// Never embed submitted HTML or arbitrary hosts. Only a validated video ID is used.
export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be' && /^\/[^/]+\/?$/.test(url.pathname)) id = url.pathname.split('/')[1];
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = /^\/(?:embed|shorts|live)\/([\w-]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
export const trainingSchema = z.object({
  title: text(90), description: text(250),
  noticeTitle: z.string().trim().max(100), notice: z.string().trim().max(3000),
  modules: z.array(z.object({ id: key, title: text(60) }).strict()).max(20),
  lessons: z.array(z.object({
    id: key, moduleId: key, title: text(100), description: z.string().trim().max(3000),
    youtubeUrl: z.string().trim().max(2048).refine(v => youtubeId(v) !== null, 'Cole um link HTTPS válido de vídeo do YouTube.'),
    duration: z.string().trim().max(24),
    cover: z.string().refine(v => v === '' || /^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(v), 'Envie a capa pelo painel.'),
    visible: z.boolean(),
  }).strict()).max(100),
}).strict().superRefine((v, ctx) => {
  for (const items of [v.modules, v.lessons]) if (new Set(items.map(i => i.id)).size !== items.length) ctx.addIssue({ code: 'custom', message: 'Há identificadores repetidos.' });
  for (const lesson of v.lessons) if (!v.modules.some(m => m.id === lesson.moduleId)) ctx.addIssue({ code: 'custom', message: 'Escolha um módulo existente para cada aula.' });
});
export type DriverTraining = z.infer<typeof trainingSchema>;
export const defaultTraining: DriverTraining = {
  title: 'Aprenda. Pratique. Ramo nessa.', description: 'Tudo o que você precisa para começar e fazer boas corridas.',
  noticeTitle: '', notice: '',
  modules: [{ id: 'primeiros-passos', title: 'Primeiros passos' }, { id: 'corridas', title: 'Corridas' }, { id: 'pagamentos', title: 'Pagamentos' }, { id: 'cuidados', title: 'Cuidados e atendimento' }],
  lessons: [],
};
export function visibleTraining(content: DriverTraining): DriverTraining {
  return { ...content, lessons: content.lessons.filter(lesson => lesson.visible) };
}
