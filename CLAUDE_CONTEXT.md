# Contexto para Claude - Mediciones IA

## Última sesión: 2025-12-19

## Estado del proyecto

### Cambios completados y listos para commit:

1. **`api/config/constants.ts`** - Modelos de IA corregidos
   - ELIMINADOS modelos ficticios `gpt-5.1` y `gpt-5.2` (no existen en OpenAI)
   - DEFAULT_MODEL cambiado a `gpt-4o`
   - Modelos disponibles: gpt-4o (recomendado), gpt-4o-mini, gpt-4-turbo
   - Soporte para Claude (Anthropic) y Gemini (Google) - requieren API keys

2. **`api/routes/analysis.ts`** - Correcciones en valores por defecto
   - Fallback de modelo cambiado de `gpt-5.1` a `gpt-4o`
   - Lista de modelos OpenAI actualizada

3. **`api/services/openaiService.ts`** - Soporte Multi-Proveedor de IA
   - Soporte para 3 proveedores: OpenAI, Anthropic (Claude), Google (Gemini)
   - Nuevos clientes: `anthropicClient` y `googleClient`
   - Métodos: `generateWithOpenAI()`, `generateWithAnthropic()`, `generateWithGoogle()`
   - Router: `generateContentWithProvider()` elige proveedor según modelo
   - **Funcionalidad `sourcesCited`** - extrae fuentes que el LLM menciona en sus respuestas
   - Nueva interfaz `SourceCited` con: name, type, url, context, credibility

4. **`api/services/excelService.ts`** - Nueva hoja "Fuentes Citadas"
   - Nueva hoja en Excel con: Pregunta, Fuente, Tipo, URL, Credibilidad, Contexto
   - Color coding según credibilidad (verde=alta, rojo=baja)

5. **`api/services/pdfService.ts`** - Fuentes Citadas en PDF
   - Sección "Fuentes citadas por el LLM" con chips coloreados

## Estado actual

- **Análisis funcionando correctamente** con modelo `gpt-4o-mini`
- **Extracción de sourcesCited verificada** - detecta fuentes como Trustpilot, El País, etc.
- Servidor corriendo en puerto 3003
- Frontend en puerto 5173

## Comandos útiles

```bash
# Levantar servicios
npm run dev

# Ver análisis guardados
curl -s http://localhost:3003/api/analysis/saved

# Ejecutar análisis
curl -X POST http://localhost:3003/api/analysis/execute -H "Content-Type: application/json" -d @test-analysis.json

# Ver modelos disponibles
curl -s http://localhost:3003/api/templates/ai-models
```

## Archivos de prueba
- `D:/mediciones_IA/test-analysis.json` - JSON para probar análisis

## Próximos pasos
1. Hacer commit de los cambios
2. Probar exportación Excel con fuentes citadas
3. Probar exportación PDF con fuentes citadas
