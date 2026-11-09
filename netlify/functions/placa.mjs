// Consulta de placa para o formulário de cotação da Tás Seguro.
// Recebe a placa, consulta a API do Consulta de Placa (consultadeplaca.net) e devolve
// só os dados do veículo (sem dados do proprietário).
// Variável de ambiente necessária (Netlify > Configuração do projeto > Variáveis ambientais):
//   CDP_API_KEY   chave da API do consultadeplaca.net (começa com cdp_live_ ou cdp_test_)
// Para economizar, cada placa consultada fica guardada por 30 dias e não é cobrada de novo.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const API = "https://consultadeplaca.net/api/v1/lookups";
const DIAS_CACHE = 30;
const LIMITE_POR_MINUTO = 8; // por visitante (IP)

const resposta = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const origemOk = (req) => {
  const o = req.headers.get("origin") || req.headers.get("referer") || "";
  if (!o) return true; // alguns navegadores não mandam; o limite por IP segura
  try {
    const h = new URL(o).hostname;
    return h === "tasseguro.com.br" || h === "www.tasseguro.com.br" || h.endsWith("--capable-salamander-93e5e1.netlify.app") ||
      h === "capable-salamander-93e5e1.netlify.app" || h === "localhost" || h === "127.0.0.1";
  } catch {
    return false;
  }
};

const visitas = new Map(); // limite simples por IP (por instância da função)
const passouLimite = (ip) => {
  const agora = Date.now();
  const lista = (visitas.get(ip) || []).filter((t) => agora - t < 60000);
  lista.push(agora);
  visitas.set(ip, lista);
  if (visitas.size > 5000) visitas.clear();
  return lista.length > LIMITE_POR_MINUTO;
};

const resumo = (v) => {
  if (!v) return null;
  const valor = v.fipe && v.fipe.amount ? Math.round(Number(v.fipe.amount)) : null;
  const tipo = String(v.type || "").toLowerCase();
  return {
    marca: v.brand || "",
    modelo: v.model || "",
    versao: v.version || "",
    ano_fabricacao: v.manufacture_year || null,
    ano_modelo: v.model_year || null,
    cor: v.color || "",
    combustivel: v.fuel || "",
    tipo: /moto|ciclomotor|motoneta|triciclo|quadriciclo/.test(tipo) ? "moto" : tipo ? "carro" : "",
    tipo_original: v.type || "",
    fipe_codigo: (v.fipe && v.fipe.code) || "",
    fipe_valor: Number.isFinite(valor) ? valor : null,
  };
};

export default async (req, context) => {
  if (req.method !== "POST") return resposta({ erro: "metodo" }, 405);
  if (!origemOk(req)) return resposta({ erro: "origem" }, 403);

  let placa = "";
  try {
    placa = String((await req.json()).placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  } catch {}
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return resposta({ erro: "placa-invalida" }, 422);

  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "anon";
  if (passouLimite(ip)) return resposta({ erro: "muitas-consultas" }, 429);

  // já consultada nos últimos 30 dias? devolve sem cobrar de novo
  let store = null;
  try {
    store = getStore("placas");
    const guardada = await store.get(placa, { type: "json" });
    if (guardada && Date.now() - guardada.em < DIAS_CACHE * 864e5) return resposta({ ...guardada.dados, cache: true });
  } catch {}

  const chave = process.env.CDP_API_KEY;
  if (!chave) return resposta({ erro: "sem-chave" }, 503);

  let r;
  try {
    r = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ plate: placa }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return resposta({ erro: "indisponivel" }, 503);
  }

  let corpo = null;
  try { corpo = await r.json(); } catch {}
  if (r.status !== 201 || !corpo) {
    const codigo = (corpo && corpo.code) || `http-${r.status}`;
    console.log("consulta de placa falhou:", codigo); // aparece nos logs da função no Netlify
    return resposta({ erro: codigo }, r.status === 429 ? 429 : 503);
  }

  const dados = corpo.result === "found" ? { encontrado: true, placa, ...resumo(corpo.vehicle) } : { encontrado: false, placa };
  try { if (store) await store.setJSON(placa, { em: Date.now(), dados }); } catch {}
  return resposta(dados);
};

export const config = { path: "/api/placa" };
