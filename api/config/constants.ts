/**
 * Constantes de configuraci�n para el an�lisis de marca en seguros
 */

// Marcas objetivo de Occident/Catalana Occidente
export const TARGET_BRANDS = [
  "Occident",
  "Catalana Occidente", 
  "GCO",
  "Plus Ultra Seguros",
  "Seguros Bilbao",
  "NorteHispana"
] as const;

// Competidores principales
export const COMPETITOR_BRANDS = [
  "Mapfre",
  "Allianz", 
  "AXA",
  "Santaluc�a",
  "Caser",
  "Ocaso",
  "L�nea Directa",
  "Mutua Madrile�a",
  "Tuio",
  "Generali",
  "Pelayo",
  "MGS",
  "AMA"
] as const;

// Fuentes prioritarias (lista blanca)
export const PRIORITY_SOURCES = [
  "Rastreator",
  "Selectra", 
  "OCU",
  "Rankia",
  "Roams",
  "AvaiBook",
  "Lodgify",
  "Acierto",
  "Seguros.insure",
  "Trustpilot",
  "Finect"
] as const;

// Las 10 preguntas predefinidas organizadas por categor�as
export const ANALYSIS_QUESTIONS = {
  "hogar": [
    {
      id: "hogar_1",
      question: "�Cu�les son las mejores aseguradoras de hogar en Espa�a seg�n las comparativas m�s recientes?",
      category: "Hogar"
    },
    {
      id: "hogar_2", 
      question: "�Qu� opinan los usuarios sobre las coberturas de seguro de hogar de las principales aseguradoras espa�olas?",
      category: "Hogar"
    },
    {
      id: "hogar_3",
      question: "�Cu�les son las aseguradoras de hogar con mejor relaci�n calidad-precio seg�n los comparadores especializados?",
      category: "Hogar"
    }
  ],
  "alquiler_vacacional": [
    {
      id: "vacacional_1",
      question: "�Qu� aseguradoras ofrecen las mejores coberturas para alquiler vacacional en Espa�a?",
      category: "Alquiler Vacacional"
    },
    {
      id: "vacacional_2",
      question: "�Cu�les son las opiniones de propietarios sobre seguros para alquiler tur�stico y Airbnb?",
      category: "Alquiler Vacacional"
    },
    {
      id: "vacacional_3",
      question: "�Qu� coberturas espec�ficas recomiendan los expertos para propiedades de alquiler vacacional?",
      category: "Alquiler Vacacional"
    }
  ],
  "marca_confianza": [
    {
      id: "marca_1",
      question: "�Cu�les son las aseguradoras m�s confiables y con mejor reputaci�n en Espa�a seg�n estudios recientes?",
      category: "Marca y Confianza"
    },
    {
      id: "marca_2",
      question: "�Qu� aseguradoras tienen mejor valoraci�n en atenci�n al cliente y gesti�n de siniestros?",
      category: "Marca y Confianza"
    },
    {
      id: "marca_3",
      question: "�Cu�les son las aseguradoras mejor valoradas en transparencia y facilidad de contrataci�n?",
      category: "Marca y Confianza"
    },
    {
      id: "marca_4",
      question: "�Qu� opinan los usuarios sobre la solvencia y estabilidad financiera de las principales aseguradoras espa�olas?",
      category: "Marca y Confianza"
    }
  ]
} as const;

// Configuraci�n de an�lisis
export const ANALYSIS_CONFIG = {
  DEFAULT_MAX_SOURCES: 6,
  CONFIDENCE_THRESHOLDS: {
    HIGH: 0.8,
    MEDIUM: 0.5,
    LOW: 0.3
  },
  TIMEZONE: "Europe/Madrid",
  LOCALE: "es-ES"
} as const;

// Tipos de sentimiento
export const SENTIMENT_TYPES = ["positive", "negative", "neutral"] as const;

export type TargetBrand = typeof TARGET_BRANDS[number];
export type CompetitorBrand = typeof COMPETITOR_BRANDS[number];
export type PrioritySource = typeof PRIORITY_SOURCES[number];
export type SentimentType = typeof SENTIMENT_TYPES[number];
export type QuestionCategory = keyof typeof ANALYSIS_QUESTIONS;