"use client";
import { useEffect, useRef, useState, type PointerEvent, type FormEvent } from "react";
import { CarFront, Motorbike, Package, Truck, MapPin, Smartphone, Check, Menu, X, Navigation, Users, Download, Globe, Waves, ChevronDown, CircleCheck, LoaderCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { defaultContent, type SiteContent } from "@/lib/site-content";

const categories = [
  { id: "moto", name: "Mototáxi", short: "Do seu jeito. No seu ritmo.", icon: Motorbike, title: "Praticidade no dia a dia.", text: "Para ir ao trabalho, resolver o corre ou chegar ao próximo compromisso.", number: "01" },
  { id: "carro", name: "Carro", short: "A rotina vai junto.", icon: CarFront, title: "Seus planos vão junto.", text: "Uma opção para viajar sozinho, com amigos ou com a família.", number: "02" },
  { id: "4x4", name: "Comfort 4x4", short: "O caminho faz parte.", icon: Truck, title: "Conforto para ir além.", text: "Mais conforto para seus deslocamentos pela região.", number: "03" },
  { id: "buggy", name: "Táxi Buggy", short: "Tem a cara de Jeri.", icon: CarFront, title: "O ritmo da Vila.", text: "Uma opção com a cara de Jericoacoara para seus trajetos na Vila.", number: "04" },
  { id: "entrega", name: "Entregas", short: "Você manda. A gente leva.", icon: Package, title: "Seu próximo envio.", text: "Peça uma entrega pelo app e siga com o seu dia.", number: "05" },
];
function Brand({ footer = false, icon = "/app-icon.webp" }: { footer?: boolean; icon?: string }) {
  return <a className={`brand ${footer ? "footer-brand" : ""}`} href="#inicio" aria-label="Ramo Nessa, início"><img src={icon} alt="" width="44" height="44" /><span>RAMO<span>NESSA</span></span></a>;
}
function Choice({ label, value, onChange, options, id }: { label: string; value: string; onChange: (v: string) => void; options: string[]; id: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label><Select value={value} onValueChange={onChange}><SelectTrigger id={id} className="form-select" aria-label={label}><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>;
}
function createRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export default function Home({initialContent=defaultContent}: {initialContent?: SiteContent}) {
  const [content, setContent] = useState<SiteContent>(initialContent);
  const appAccess = content.apps;
  useEffect(() => { const controller = new AbortController(); fetch("/api/site-content", {cache:"no-store",signal:controller.signal}).then(r => {if(!r.ok)throw new Error(); return r.json();}).then(setContent).catch(()=>{}); return ()=>controller.abort(); }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [demoCategory, setDemoCategory] = useState("Mototáxi");
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [formRegion, setFormRegion] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [consent, setConsent] = useState(false);
  const [formState, setFormState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const progressRef = useRef<HTMLDivElement>(null);
  const registrationKey = useRef<string | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("revealed"); observer.unobserve(entry.target); }
    }), { threshold: .1 });
    document.querySelectorAll("[data-reveal]").forEach(el => observer.observe(el));
    let frame = 0;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? window.scrollY / max : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress})`;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.documentElement.style.setProperty("--ribbon-x", `${-progress * 320}px`);
      frame = 0;
    };
    const scroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    update(); window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("keydown", escape);
    return () => { observer.disconnect(); window.removeEventListener("scroll", scroll); window.removeEventListener("keydown", escape); window.cancelAnimationFrame(frame); document.documentElement.style.removeProperty("--ribbon-x"); };
  }, []);
  function movePreview(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--phone-x", `${((event.clientX - bounds.left) / bounds.width - .5) * 10}px`);
    event.currentTarget.style.setProperty("--phone-y", `${((event.clientY - bounds.top) / bounds.height - .5) * 8}px`);
  }
  function resetPreview(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.setProperty("--phone-x", "0px"); event.currentTarget.style.setProperty("--phone-y", "0px");
  }
  useEffect(() => {
    type ToolContext = { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ToolContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try { Promise.resolve(context.registerTool({ name: "start_driver_preregistration", title: "Abrir pré-cadastro de motorista", description: "Navega ao formulário de interesse para motoristas. Não envia dados nem efetua o cadastro.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input: unknown) => { if (!input || typeof input !== "object" || Object.keys(input).length) throw new Error("Nenhum parâmetro é esperado."); document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth" }); document.getElementById("name")?.focus({ preventScroll: true }); return { state: "form_open", submitted: false }; } }, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    return () => lifecycle.abort();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (formState === "saving") return;
    if (!formRegion || !vehicle || !consent) { setError("Escolha sua região e categoria e autorize o contato para continuar."); setFormState("error"); document.getElementById(!formRegion ? "form-region" : !vehicle ? "form-vehicle" : "consent")?.focus(); return; }
    const data = new FormData(event.currentTarget);
    setFormState("saving"); setError("");
    try {
      registrationKey.current ??= createRequestId();
      const res = await fetch("/api/interesse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), phone: data.get("phone"), region: formRegion, vehicle, consent, website: data.get("website"), requestId: registrationKey.current }) });
      const result = await res.json() as { error?: string; status?: string };
      if (!res.ok) throw new Error(result.error || "Não foi possível enviar agora. Tente novamente.");
      setFormState("success");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar agora. Tente novamente."); setFormState("error"); }
  }
  return <>
    <div className="scroll-progress" ref={progressRef} aria-hidden="true" />
    <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
    <header className="site-header"><div className="header-inner"><Brand icon={content.appIcon}/><nav id="main-nav" className={mobileOpen ? "nav open" : "nav"} aria-label="Principal">
      {[["#inicio", "O app"], ["#como-funciona", "Como funciona"], ["#baixar", "Acesse o app"]].map(([href, name]) => <a key={href} href={href} onClick={() => setMobileOpen(false)}>{name}</a>)}
      <a href="#motoristas" className="nav-driver" onClick={() => setMobileOpen(false)}>Quero ser motorista</a>
    </nav><button className="menu-button" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={mobileOpen} aria-controls="main-nav">{mobileOpen ? <X  aria-hidden="true" /> : <Menu  aria-hidden="true" />}</button></div></header>
    <main id="conteudo">
      <section className="hero" id="inicio">
        <div className="hero-left"><div className="eyebrow hero-label"><span className="mini-line" /> SEU NOVO JEITO DE IR</div>
          <h1>{content.heroTitle}<br /><span>{content.heroAccent}</span></h1>
          <p className="site-editable-lines">{content.heroDescription}</p>
          <div className="hero-actions"><a href="#baixar" className="button button-yellow"><Smartphone size={17} aria-hidden="true" /> Acesse o app</a><a href="#motoristas" className="text-link">Vem dirigir com a gente</a></div>
          <a className="launch-line" href="#baixar"><Globe size={17} aria-hidden="true" /><span>Android via APK · iPhone e Android via navegador</span></a>
        </div>
        <div className="hero-visual" onPointerMove={movePreview} onPointerLeave={resetPreview}><img className="hero-photo" src={content.heroImage} alt={content.heroImageAlt} width="1800" height="1200" fetchPriority="high" />
          <div className="photo-label"><MapPin size={15} aria-hidden="true" /> Jericoacoara, Ceará <span>É daqui que a gente começa.</span></div>
          <div className="phone-float"><div className="phone-preview" data-ui="true"><div className="phone-top"><span>9:41</span><span className="phone-island" /><span>•••</span></div><div className="phone-brand"><img src={content.appIcon} alt="Ramo Nessa" width="36" height="36" /><span>Ramo Nessa</span><span className="phone-avatar"><Users size={16} aria-hidden="true" /></span></div>
            <div className="phone-body" key={demoStep} aria-live="polite">
              <div className="phone-step">{String(demoStep + 1).padStart(2, "0")} / 03</div>
              <h2>{["Bora pra onde?", "Qual é o seu jeito?", "Ramo nessa."][demoStep]}</h2>
              {demoStep === 0 && <><div className="route-preview"><div><span className="route-dot" /><p><small>Seu ponto de partida</small>Preá</p></div><div><MapPin size={18} aria-hidden="true" /><p><small>Próximo destino</small>Jijoca</p></div></div><div className="phone-info"><Navigation size={21} aria-hidden="true" /><span>Você escolhe a origem e o destino.</span></div></>}
              {demoStep === 1 && <div className="demo-choices">{["Mototáxi", "Carro", "Comfort 4x4"].map((c,i) => { const Icon = [Motorbike, CarFront, Truck][i]; return <button key={c} onClick={() => setDemoCategory(c)} className={demoCategory === c ? "selected" : ""} aria-pressed={demoCategory === c}><Icon size={24} aria-hidden="true" /><span>{c}</span>{demoCategory === c && <Check size={17} aria-hidden="true" />}</button>; })}</div>}
              {demoStep === 2 && <div className="demo-payment"><div className="payment-route"><MapPin size={19} aria-hidden="true" /><span>Preá · Jijoca<br /><strong>{demoCategory}</strong></span></div><div><CircleCheck size={22} aria-hidden="true" /><span>Pronto para seguir</span></div><p>Confira e confirme sua corrida pelo app.</p></div>}
              <button className="phone-button" onClick={() => setDemoStep((demoStep + 1) % 3)}>{["Escolher categoria", "Continuar", "Ver de novo"][demoStep]}</button>
            </div><div className="phone-bottom"><span /></div></div><div className="demo-caption">Explore a experiência · demonstração</div></div>
          <div className="hero-roundel" aria-hidden="true"><Waves size={26} aria-hidden="true" /><span>DAQUI.<br />PRA VOCÊ.</span></div>
        </div>
        <a className="hero-scroll" href="#como-funciona"><span>Veja como funciona</span><ChevronDown size={19} aria-hidden="true" /></a>
      </section>
      <div className="ticker" aria-hidden="true"><div className="ticker-track">{Array.from({length:4}, (_, i) => <span key={i}>SE TEM CAMINHO, <strong>RAMO NESSA.</strong><span className="ticker-star">✳</span> JERI · PREÁ · JIJOCA <span className="ticker-star">✳</span></span>)}</div></div>
      <section className="how-section section" id="como-funciona">
        <div className="section-index" data-reveal><span>01 / COMO FUNCIONA</span><span>SIMPLES, DO COMEÇO AO DESTINO</span></div>
        <div className="section-heading"><h2 data-reveal>Sua viagem.<br /><span>Em três passos.</span></h2></div>
        <div className="steps-grid">{[
          {n:"01",icon:MapPin,title:"Diga pra onde vai.",text:"Informe sua origem e seu destino."},
          {n:"02",icon:CarFront,title:"Escolha como vai.",text:"Escolha a categoria para o seu trajeto."},
          {n:"03",icon:Smartphone,title:"Confirme. Ramo nessa.",text:"Confira e confirme sua corrida pelo app."},
        ].map(s => <article className="step" data-reveal key={s.n}><div className="step-top"><span>{s.n}</span><s.icon size={32} strokeWidth={1.5} aria-hidden="true" /></div><div><h3>{s.title}</h3><p>{s.text}</p></div></article>)}</div>
      </section>
      <section className="categories-section section" id="categorias">
        <div className="section-index" data-reveal><span>02 / CATEGORIAS</span><span>UM APP. VÁRIOS CAMINHOS.</span></div>
        <div className="section-heading"><h2 data-reveal>Um jeito para<br /><span>cada destino.</span></h2></div>
        <Tabs defaultValue="moto" className="category-tabs">
          <TabsList className="category-list" aria-label="Categorias de mobilidade">{categories.map(c => <TabsTrigger className="category-tab" key={c.id} value={c.id}><c.icon size={21} aria-hidden="true"/>{c.name}</TabsTrigger>)}</TabsList>
          {categories.map(c => <TabsContent key={c.id} value={c.id} className="category-content"><div className="category-graphic"><span className="category-big-number">{c.number}</span><c.icon className="category-big-icon" strokeWidth={1.15} aria-hidden="true" /><span className="category-graphic-caption">{c.short}</span></div><div className="category-description"><span className="eyebrow">RAMO NESSA / {c.name.toUpperCase()}</span><h3>{c.title}</h3><p>{c.text}</p></div>
          </TabsContent>)}
        </Tabs>
      </section>
      <section className="signup-section section" id="motoristas">
        <div className="signup-heading" data-reveal>
          <div className="driver-badge"><img src={content.driverIcon} alt="App Ramo Nessa Motorista" width="64" height="64" /><span>RAMO NESSA<br /><strong>MOTORISTA</strong></span></div>
          <h2>{content.driverTitle}<br /><em>{content.driverAccent}</em></h2>
          <p>{content.driverDescription}</p>
          <div className="signup-small"><Navigation size={23} aria-hidden="true" /><span>Pré-cadastro aberto.</span></div>
          <a className="driver-access-link" href="#baixar">Já é motorista? Veja as opções de acesso.</a>
        </div>
        <div className="signup-card" id="cadastro" data-reveal>{formState==="success" ?
          <div className="signup-success" role="status"><CircleCheck size={52} aria-hidden="true" /><span className="eyebrow">PRIMEIRO PASSO DADO</span><h3>Ramo nessa<br />com você.</h3><p>Interesse registrado! A equipe poderá entrar em contato pelo WhatsApp informado.</p><p className="success-note">Pré-cadastro de interesse. Sua conta ainda não está ativa.</p></div> :
          <form onSubmit={submit}>
            <h3>Quero fazer parte</h3>
            <div className="field"><label htmlFor="name">Seu nome</label><Input className="form-input" id="name" name="name" placeholder="Como podemos chamar você?" autoComplete="name" minLength={3} maxLength={100} required/></div>
            <div className="field"><label htmlFor="phone">WhatsApp com DDD</label><Input className="form-input" id="phone" name="phone" type="tel" inputMode="tel" placeholder="(88) 99999-9999" autoComplete="tel" minLength={10} maxLength={20} required/></div>
            <div className="field-row"><Choice id="form-region" label="Sua região" value={formRegion} onChange={setFormRegion} options={["Jericoacoara", "Preá", "Jijoca", "Interiores de Jijoca"]}/><Choice id="form-vehicle" label="Sua categoria" value={vehicle} onChange={setVehicle} options={categories.map(c=>c.name)}/></div>
            <div className="honeypot" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off"/></div>
            <div className="consent"><Checkbox id="consent" checked={consent} onCheckedChange={v=>setConsent(v===true)}/><div><label htmlFor="consent">Autorizo contato sobre meu pré-cadastro.</label> <button type="button" onClick={()=>setPrivacyOpen(true)}>Uso dos dados.</button></div></div>
            {error&&<p className="form-error" role="alert">{error}</p>}
            <button className="button button-black submit-button" disabled={formState==="saving"}>{formState==="saving" ? <><LoaderCircle className="spin" size={18} aria-hidden="true" />Enviando…</> : "Enviar meu interesse"}</button>
          </form>}
        </div>
      </section>
      <section className="download-section section" id="baixar">
        <div className="download-heading" data-reveal><img src={content.appIcon} alt="" width="72" height="72" /><span className="eyebrow">ESCOLHA COMO ACESSAR</span></div>
        <h2 data-reveal>{content.downloadTitle}<br /><em>{content.downloadAccent}</em></h2>
        <Tabs defaultValue="passageiro" className="access-tabs" data-reveal>
          <TabsList className="access-role-list" aria-label="Qual aplicativo você quer acessar?">
            {appAccess.map(app => <TabsTrigger key={app.id} value={app.id} className="access-role-tab">{app.label}</TabsTrigger>)}
          </TabsList>
          {appAccess.map(app => <TabsContent key={app.id} value={app.id} className="access-options">
            <article className="access-card">
              <div className="access-card-top"><Smartphone size={28} aria-hidden="true" /><span>ANDROID</span></div>
              <h3>Baixe o aplicativo.</h3>
              <p>Instalação direta pelo arquivo APK.</p>
              {app.apkHref ? <a href={app.apkHref} download className="button button-yellow access-button" aria-label={`Baixar APK do app ${app.label}`}><Download size={18} aria-hidden="true" />Baixar APK</a> : <button className="button button-yellow access-button" disabled aria-describedby={`apk-status-${app.id}`}><Download size={18} aria-hidden="true" />Baixar APK</button>}
              <span className="access-status" id={`apk-status-${app.id}`}>{app.apkHref ? `Ramo Nessa · ${app.label}${app.version ? " · " + app.version : ""}` : "Download em breve"}</span>
            </article>
            <article className="access-card access-card-web">
              <div className="access-card-top"><Globe size={28} aria-hidden="true" /><span>IPHONE E ANDROID</span></div>
              <h3>Use pelo navegador.</h3>
              <p>No iPhone ou Android, sem baixar um APK.</p>
              {app.webHref ? <a href={app.webHref} target="_blank" rel="noopener noreferrer" className="button button-yellow access-button" aria-label={`Usar o app ${app.label} no navegador`}><Globe size={18} aria-hidden="true" />Usar no navegador</a> : <button className="button button-yellow access-button" disabled aria-describedby={`web-status-${app.id}`}><Globe size={18} aria-hidden="true" />Usar no navegador</button>}
              <span className="access-status" id={`web-status-${app.id}`}>{app.webHref ? `Ramo Nessa · ${app.label}` : "Versão web em breve"}</span>
            </article>
          <div className="store-links">{app.playStoreHref && <a href={app.playStoreHref} target="_blank" rel="noopener noreferrer">Google Play</a>}{app.appStoreHref && <a href={app.appStoreHref} target="_blank" rel="noopener noreferrer">App Store</a>}</div>
          </TabsContent>)}
        </Tabs>
      </section>
    </main>
    <footer className="site-footer"><div className="footer-top"><Brand footer icon={content.appIcon}/><div className="footer-links"><a href="#inicio">O app</a><a href="#motoristas">Motoristas</a><button onClick={()=>setPrivacyOpen(true)}>Uso dos dados</button></div><span className="footer-copyright">© {new Date().getFullYear()} Ramo Nessa.</span></div>{content.photoCredit && <p className="photo-credit">Foto: {content.photoCreditUrl ? <a href={content.photoCreditUrl} target="_blank" rel="noreferrer">{content.photoCredit}</a> : content.photoCredit}</p>}</footer>
    <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}><DialogContent className="privacy-dialog"><DialogTitle>Uso dos dados do pré-cadastro</DialogTitle><DialogDescription>O formulário registra seu interesse em atuar como motorista ou entregador no Ramo Nessa.</DialogDescription><p>Guardamos seu nome, WhatsApp, região e categoria de interesse para que a equipe possa conversar com você sobre o cadastro. Os dados ficam no registro de interessados deste site, sem exposição pública.</p><p>Este é um pré-cadastro de interesse. A ativação da conta acontece em uma etapa posterior.</p><p>Se quiser retirar seu interesse ou pedir a exclusão dos dados, informe a equipe quando ela entrar em contato pelo número que você cadastrou.</p></DialogContent></Dialog>
  </>;
}
