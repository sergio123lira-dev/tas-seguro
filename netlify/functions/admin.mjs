// Área do corretor da Tás Seguro: login, lista de cotações e CRM.
// Variáveis de ambiente necessárias (Netlify > Configuração do projeto > Variáveis ambientais):
//   ADMIN_EMAIL    e-mails que entram no painel, separados por vírgula
//   ADMIN_SENHA_1  senha do 1º e-mail, ADMIN_SENHA_2 senha do 2º, e assim por diante
//                  (ou ADMIN_SENHA: uma senha só para todos)
//   NETLIFY_TOKEN  token de acesso pessoal do Netlify (User settings > Applications)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const resposta = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const usuarios = () =>
  String(process.env.ADMIN_EMAIL || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    .map((email, i) => ({ email, senha: process.env[`ADMIN_SENHA_${i + 1}`] || process.env.ADMIN_SENHA || "" }));

const segredo = () =>
  crypto.createHash("sha256").update(`${usuarios().map((u) => u.email + ":" + u.senha).join("|")}|${process.env.NETLIFY_TOKEN}|tas-admin`).digest();

const assinar = (dados) => {
  const b = Buffer.from(JSON.stringify(dados)).toString("base64url");
  const s = crypto.createHmac("sha256", segredo()).update(b).digest("base64url");
  return `${b}.${s}`;
};

const conferir = (token) => {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [b, s] = token.split(".");
  const esperado = crypto.createHmac("sha256", segredo()).update(b).digest("base64url");
  if (s.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(esperado))) return null;
  try {
    const d = JSON.parse(Buffer.from(b, "base64url").toString());
    return d.exp > Date.now() ? d : null;
  } catch {
    return null;
  }
};

const igual = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

async function api(caminho, opcoes = {}) {
  const r = await fetch(`https://api.netlify.com/api/v1${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${process.env.NETLIFY_TOKEN}`, ...(opcoes.headers || {}) },
  });
  if (!r.ok) throw new Error(`netlify_${r.status}`);
  return r.status === 204 ? null : r.json();
}

export default async (req, context) => {
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);
  const lista = usuarios();
  if (!lista.length || lista.some((u) => !u.senha) || !process.env.NETLIFY_TOKEN) return resposta({ erro: "config" }, 500);

  let corpo = {};
  try { corpo = await req.json(); } catch {}
  const acao = corpo.acao;

  if (acao === "login") {
    await new Promise((r) => setTimeout(r, 700)); // freia tentativas repetidas
    const email = String(corpo.email || "").trim().toLowerCase(), senha = String(corpo.senha || "");
    let achou = null;
    for (const u of lista) { const ok = igual(email, u.email) & igual(senha, u.senha); if (ok) achou = u; }
    if (achou) return resposta({ token: assinar({ u: achou.email, exp: Date.now() + 12 * 3600 * 1000 }) });
    return resposta({ erro: "login" }, 401);
  }

  if (!conferir(corpo.token)) return resposta({ erro: "sessao" }, 401);

  const siteId = context?.site?.id || process.env.SITE_ID;
  const store = getStore({ name: "crm", consistency: "strong" });
  const lerMeta = async () => (await store.get("meta", { type: "json" })) || {};

  try {
    if (acao === "listar") {
      const subs = [];
      for (let p = 1; p <= 30; p++) {
        const lote = await api(`/sites/${siteId}/submissions?per_page=100&page=${p}`);
        subs.push(...lote);
        if (lote.length < 100) break;
      }
      const meta = await lerMeta();
      const itens = subs
        .filter((s) => !s.form_name || s.form_name === "cotacao")
        .map((s) => ({ id: s.id, numero: s.number, criado: s.created_at, dados: s.data || {}, ...(meta[s.id] || {}) }));
      return resposta({ itens });
    }

    if (acao === "salvar") {
      const meta = await lerMeta();
      const id = String(corpo.id || "");
      if (!id) return resposta({ erro: "id" }, 400);
      meta[id] = {
        status: String(corpo.status || "novo").slice(0, 20),
        nota: String(corpo.nota || "").slice(0, 4000),
        valor: String(corpo.valor || "").slice(0, 40),
        arquivado: !!corpo.arquivado,
        atualizado: new Date().toISOString(),
      };
      await store.setJSON("meta", meta);
      return resposta({ ok: true });
    }

    if (acao === "excluir") {
      const ids = [].concat(corpo.ids || corpo.id || []).map(String).filter(Boolean);
      const meta = await lerMeta();
      for (const id of ids) {
        await api(`/submissions/${encodeURIComponent(id)}`, { method: "DELETE" });
        delete meta[id];
      }
      await store.setJSON("meta", meta);
      return resposta({ ok: true, excluidos: ids.length });
    }
  } catch (e) {
    return resposta({ erro: "netlify", detalhe: String(e.message || e) }, 502);
  }

  return resposta({ erro: "acao" }, 400);
};

export const config = { path: "/api/admin" };
