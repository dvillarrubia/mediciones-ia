#!/usr/bin/env python3
"""
A/B de reasoning.effort  ·  NO lee ninguna key de disco: se pasa por entorno.

  OPENROUTER_API_KEY=sk-or-... AB_OUT=/tmp python3 scripts/ab-reasoning-effort.py

Coste aproximado: ~$0.45 por ejecución (24 análisis completos).
Ejecútalo DOS veces y compara las dos salidas: sin ese control no se puede
distinguir el efecto de la configuración del ruido propio de la búsqueda web.

A/B de reasoning.effort en la FASE 1, replicando el flujo real de la app:
  fase 1 -> generación con búsqueda web (el modelo y prompt de openaiService)
  fase 2 -> extracción de menciones (mismo prompt, mismo modelo barato)

Compara 'medium' (defecto actual) contra 'minimal' midiendo lo que de verdad
importa para un informe: qué marcas se detectan y cuántas fuentes hay.
"""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

S = os.environ.get("AB_OUT", os.path.dirname(os.path.abspath(__file__)))
KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
if not KEY:
    sys.exit("Falta OPENROUTER_API_KEY en el entorno. Uso:\n  OPENROUTER_API_KEY=sk-or-... python3 scripts/ab-reasoning-effort.py")
URL = "https://openrouter.ai/api/v1/chat/completions"
GEN = "openai/gpt-5-mini:online"
ANA = "openai/gpt-4o-mini"
SYS = "País: España. Fecha y hora actual: martes, 25 de agosto de 2026, 12:00."

# Casos representativos del uso real: marca objetivo + competidores por sector
CASOS = [
    ("¿Cuáles son las mejores agencias SEO en Bilbao?", "Lin3s", ["Irudigital","BSL Marketing","SEO in House"]),
    ("¿Qué agencia de marketing digital me recomiendas en el País Vasco?", "Lin3s", ["Irudigital","Somos Sinapsis"]),
    ("¿Cuáles son los mejores bancos para una hipoteca en España?", "BBVA", ["Santander","CaixaBank","ING"]),
    ("¿Qué compañía de seguros de coche es la mejor en España?", "Mapfre", ["Línea Directa","Mutua Madrileña","AXA"]),
    ("¿Cuál es la mejor compañía eléctrica en España?", "Iberdrola", ["Endesa","Naturgy","Repsol"]),
    ("¿Qué supermercado online tiene mejor servicio en España?", "Mercadona", ["Carrefour","Alcampo","Dia"]),
    ("¿Cuáles son las mejores aerolíneas para volar dentro de España?", "Iberia", ["Vueling","Air Europa","Ryanair"]),
    ("¿Qué operador de móvil tiene mejor cobertura en España?", "Movistar", ["Vodafone","Orange","Yoigo"]),
    ("¿Cuál es el mejor banco digital en España?", "Openbank", ["N26","Revolut","Imagin"]),
    ("¿Qué marca de coches eléctricos es mejor comprar en España?", "Tesla", ["BYD","Volkswagen","Renault"]),
    ("¿Cuáles son las mejores empresas de software en Bilbao?", "Lin3s", ["Ibermatica","Panda Security"]),
    ("¿Qué gestoría online recomiendas para autónomos en España?", "Declarando", ["TaxDown","Getquipu","Anfix"]),
]

def post(body, intentos=3):
    data = json.dumps(body).encode()
    req = urllib.request.Request(URL, data=data, headers={
        "Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
        "HTTP-Referer": "https://mediciones.lin3s.dev", "X-Title": "Mediciones IA"})
    for i in range(intentos):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                d = json.loads(r.read())
            if "error" in d: raise RuntimeError(d["error"])
            return d
        except Exception as e:
            if i == intentos - 1: return {"_error": str(e)}
            time.sleep(3 * (i + 1))

def fase1(pregunta, effort):
    body = {"model": GEN, "messages": [{"role":"system","content":SYS},{"role":"user","content":
            f"{pregunta}\n\nResponde de forma completa y útil (200-400 palabras), enfocándote en España."}]}
    if effort: body["reasoning"] = {"effort": effort}
    return post(body)

def fase2(respuesta, marca, competidores):
    prompt = f'''Analiza la siguiente respuesta de IA y extrae información sobre menciones de marcas.

CONTEXTO GEOGRÁFICO: en España, considerando el mercado español (España)
IDIOMA: Español

RESPUESTA A ANALIZAR:
"""
{respuesta}
"""

MARCA OBJETIVO: {marca}
COMPETIDORES CONOCIDOS: {", ".join(competidores)}

Responde SOLO con JSON válido (sin texto adicional, en Español):
{{"targetBrand": {{"name": "{marca}", "mentioned": true/false, "sentiment": "very_positive|positive|neutral|negative|very_negative", "position": número}},
 "otherBrands": [{{"name": "NombreMarca", "mentioned": true, "sentiment": "...", "position": número}}],
 "confidence": número entre 0.7 y 0.95}}

IMPORTANTE: Detecta TODAS las marcas mencionadas, incluso las que no están en la lista de competidores.'''
    return post({"model": ANA, "messages":[{"role":"user","content":prompt}], "temperature":0.1})

def limpiar_json(t):
    import re
    m = re.search(r"```json\s*([\s\S]*?)\s*```", t)
    if m: t = m.group(1)
    m = re.search(r"\{[\s\S]*\}", t)
    return json.loads(m.group(0)) if m else {}

def correr(caso, effort):
    pregunta, marca, comp = caso
    r1 = fase1(pregunta, effort)
    if "_error" in r1: return {"pregunta": pregunta, "error": r1["_error"]}
    msg = r1["choices"][0]["message"]; u1 = r1.get("usage", {})
    contenido = msg.get("content") or ""
    fuentes = [a.get("url_citation",{}).get("url") for a in (msg.get("annotations") or [])]
    fuentes = [f for f in fuentes if f]

    r2 = fase2(contenido, marca, comp)
    marcas, obj, coste2 = [], None, 0
    if "_error" not in r2:
        coste2 = r2.get("usage",{}).get("cost",0)
        try:
            j = limpiar_json(r2["choices"][0]["message"]["content"])
            obj = bool(j.get("targetBrand",{}).get("mentioned"))
            marcas = sorted({b.get("name","").strip().lower() for b in j.get("otherBrands",[]) if b.get("mentioned")})
        except Exception as e:
            marcas = [f"_parse_error:{e}"]

    det = u1.get("completion_tokens_details") or {}
    return {"pregunta": pregunta, "marca": marca, "effort": effort or "medium(defecto)",
            "coste": u1.get("cost",0) + coste2, "coste_f1": u1.get("cost",0),
            "in": u1.get("prompt_tokens",0), "out": u1.get("completion_tokens",0),
            "razonamiento": det.get("reasoning_tokens",0),
            "chars": len(contenido), "n_fuentes": len(fuentes), "fuentes": fuentes,
            "objetivo_mencionada": obj, "marcas": marcas}

tareas = [(c, e) for c in CASOS for e in (None, "minimal")]
print(f"Lanzando {len(tareas)} análisis completos (fase 1 + fase 2)...", file=sys.stderr)
with ThreadPoolExecutor(max_workers=4) as ex:
    res = list(ex.map(lambda t: correr(*t), tareas))
json.dump(res, open(f"{S}/ab_result.json","w"), ensure_ascii=False, indent=1)
print(f"OK -> {S}/ab_result.json", file=sys.stderr)
