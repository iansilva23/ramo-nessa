export const guideTemplates=[
 ['tours','Lista de passeios','Fotos, roteiro, duração e reservas.','tour'],
 ['rules','Regras e orientações','Informações objetivas e fontes oficiais.','eco'],
 ['highlights','Guia com destaques','Uma experiência principal e atrações selecionadas.','explore'],
 ['events','Eventos e programação','Datas, horários, locais e contatos.','celebration'],
 ['gastronomy','Gastronomia','Restaurantes, cafés e delivery.','restaurant'],
 ['venues','Casas de show','Vida noturna, programação e contatos.','music'],
];
export const guideActionLabels={route:'Calcular rota',instagram:'Instagram',whatsapp:'WhatsApp',website:'Site',internal:'Página interna',none:'Sem ação'};
export const newGuideData=()=>({name:'',summary:'',description:'',image:'',imagePosition:50,order:0,filters:[],tags:[],featured:false,badge:'',icon:'explore',address:'',latitude:null,longitude:null,duration:'',schedule:'',date:'',cuisine:'',source:'',sourceUrl:'',updatedOn:'',priceLabel:'A partir de',priceCents:null,priceSuffix:'',highlights:[],included:[],excluded:[],actions:[]});
export const guideHasDraft=e=>e.published==null||JSON.stringify(e.draft)!==JSON.stringify(e.published);
export const guideStatus=e=>e.archived?'Arquivado':e.published?guideHasDraft(e)?'Alterações em rascunho':'Publicado':'Rascunho';
