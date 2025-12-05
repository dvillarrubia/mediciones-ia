export interface AnalysisQuestion {
  id: string;
  question: string;
  category: string;
}

export interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  industry: string;
  targetBrand?: string;
  targetBrands?: string[];
  competitorBrands: string[];
  suggestedBrands?: string[]; // Marcas sugeridas para que el usuario elija
  prioritySources: string[]; // Deprecado
  questions: AnalysisQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomConfiguration {
  id: string;
  name: string;
  description?: string;
  templateId?: string;
  targetBrand: string;
  competitorBrands: string[];
  prioritySources: string[];
  aiModels?: string[];
  questions: AnalysisQuestion[];
  createdAt: string;
  updatedAt: string;
}

export const SEGUROS_TEMPLATE: AnalysisTemplate = {
  id: "seguros",
  name: "Seguros",
  description: "Preguntas para analizar presencia de aseguradoras en IA generativa: hogar, auto, salud, vida",
  industry: "Seguros",
  targetBrands: [], // El usuario define sus marcas
  competitorBrands: [], // El usuario define sus competidores
  suggestedBrands: ["Mapfre", "Allianz", "AXA", "Santalucía", "Caser", "Línea Directa", "Mutua Madrileña", "Generali", "Pelayo", "Zurich", "Liberty"], // Sugerencias opcionales
  prioritySources: [], // Deprecado
  questions: [
    { id: "hogar_1", question: "¿Cuáles son las mejores aseguradoras de hogar en España?", category: "Hogar" },
    { id: "hogar_2", question: "¿Qué aseguradora de hogar recomendarías para una familia española?", category: "Hogar" },
    { id: "hogar_3", question: "¿Cuáles son las aseguradoras de hogar con mejor relación calidad-precio?", category: "Hogar" },
    { id: "vacacional_1", question: "¿Qué aseguradoras recomiendan para alquiler vacacional en España?", category: "Alquiler Vacacional" },
    { id: "vacacional_2", question: "¿Cuál es el mejor seguro para propiedades de Airbnb en España?", category: "Alquiler Vacacional" },
    { id: "vacacional_3", question: "¿Qué coberturas necesito para mi propiedad de alquiler turístico?", category: "Alquiler Vacacional" },
    { id: "marca_1", question: "¿Cuáles son las aseguradoras más confiables en España?", category: "Marca y Confianza" },
    { id: "marca_2", question: "¿Qué aseguradora tiene mejor atención al cliente en España?", category: "Marca y Confianza" },
    { id: "marca_3", question: "¿Cuáles son las aseguradoras más transparentes y fáciles de contratar?", category: "Marca y Confianza" },
    { id: "marca_4", question: "¿Qué aseguradora española es más solvente financieramente?", category: "Marca y Confianza" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const BANCA_TEMPLATE: AnalysisTemplate = {
  id: "banca",
  name: "Banca",
  description: "Preguntas para analizar presencia de bancos en IA generativa: hipotecas, cuentas, inversión",
  industry: "Banca",
  targetBrands: [], // El usuario define sus marcas
  competitorBrands: [], // El usuario define sus competidores
  suggestedBrands: ["Santander", "BBVA", "CaixaBank", "Bankinter", "ING", "Unicaja", "Sabadell", "Abanca", "Kutxabank", "Openbank", "N26"], // Sugerencias opcionales
  prioritySources: [], // Deprecado
  questions: [
    { id: "hipoteca_1", question: "¿Cuáles son los mejores bancos para hipotecas en España?", category: "Hipotecas" },
    { id: "hipoteca_2", question: "¿Qué banco ofrece las mejores condiciones hipotecarias?", category: "Hipotecas" },
    { id: "hipoteca_3", question: "¿Cuál es el banco más competitivo para hipotecas jóvenes?", category: "Hipotecas" },
    { id: "cuenta_1", question: "¿Cuáles son las mejores cuentas corrientes sin comisiones?", category: "Cuentas" },
    { id: "cuenta_2", question: "¿Qué banco recomendarías para abrir una cuenta nómina?", category: "Cuentas" },
    { id: "cuenta_3", question: "¿Cuáles son los bancos con mejores condiciones para jóvenes?", category: "Cuentas" },
    { id: "inversion_1", question: "¿Qué bancos ofrecen los mejores productos de inversión?", category: "Inversión" },
    { id: "inversion_2", question: "¿Cuáles son los mejores bancos para fondos de inversión?", category: "Inversión" },
    { id: "marca_1", question: "¿Cuáles son los bancos más confiables en España?", category: "Marca y Confianza" },
    { id: "marca_2", question: "¿Qué banco tiene mejor atención al cliente?", category: "Marca y Confianza" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const TELECOMUNICACIONES_TEMPLATE: AnalysisTemplate = {
  id: "telecomunicaciones",
  name: "Telecomunicaciones",
  description: "Preguntas para analizar presencia de operadoras en IA generativa: fibra, móvil, paquetes",
  industry: "Telecomunicaciones",
  targetBrands: [], // El usuario define sus marcas
  competitorBrands: [], // El usuario define sus competidores
  suggestedBrands: ["Movistar", "Orange", "Vodafone", "Yoigo", "MásMóvil", "Digi", "Lowi", "Pepephone", "Jazztel", "O2", "Finetwork"], // Sugerencias opcionales
  prioritySources: [], // Deprecado
  questions: [
    { id: "fibra_1", question: "¿Cuáles son las mejores compañías de fibra óptica en España?", category: "Fibra y Internet" },
    { id: "fibra_2", question: "¿Qué operadora ofrece la mejor velocidad de internet?", category: "Fibra y Internet" },
    { id: "fibra_3", question: "¿Cuál es la compañía más barata para fibra óptica?", category: "Fibra y Internet" },
    { id: "movil_1", question: "¿Cuáles son las mejores tarifas móviles en España?", category: "Móvil" },
    { id: "movil_2", question: "¿Qué operadora tiene mejor cobertura móvil?", category: "Móvil" },
    { id: "movil_3", question: "¿Cuáles son las tarifas móviles más baratas?", category: "Móvil" },
    { id: "combinado_1", question: "¿Cuáles son las mejores ofertas de fibra y móvil combinadas?", category: "Paquetes Combinados" },
    { id: "combinado_2", question: "¿Qué operadora ofrece el mejor paquete completo?", category: "Paquetes Combinados" },
    { id: "marca_1", question: "¿Cuáles son las operadoras más confiables en España?", category: "Marca y Confianza" },
    { id: "marca_2", question: "¿Qué operadora tiene mejor atención al cliente?", category: "Marca y Confianza" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const EDUCACION_TEMPLATE: AnalysisTemplate = {
  id: "educacion",
  name: "Educación / FP Online",
  description: "Preguntas para analizar presencia de centros formativos en IA generativa: FP, cursos, academias",
  industry: "Educación",
  targetBrands: [], // El usuario define sus marcas
  competitorBrands: [], // El usuario define sus competidores
  suggestedBrands: ["Ilerna", "Medac", "Cesur", "CEAC", "Linkia FP", "Implika", "MasterD", "Campus Training", "Universae", "Deusto Formación"], // Sugerencias opcionales
  prioritySources: [], // Deprecado
  questions: [
    // 1. Consultas de Evaluación y Recomendación de Centros (Genéricas)
    { id: "evaluacion_1", question: "¿Cuál es el mejor centro de FP?", category: "Evaluación y Recomendación de Centros" },
    { id: "evaluacion_2", question: "Opiniones sobre fp a distancia", category: "Evaluación y Recomendación de Centros" },
    { id: "evaluacion_3", question: "¿Alguien me puede dar alguna opinión o recomendación sobre centros de FP a distancia?", category: "Evaluación y Recomendación de Centros" },
    { id: "evaluacion_4", question: "¿Qué centro de FP online recomiendan?", category: "Evaluación y Recomendación de Centros" },
    { id: "evaluacion_5", question: "¿Qué centro recomiendan para FP de sanidad a distancia?", category: "Evaluación y Recomendación de Centros" },
    { id: "evaluacion_6", question: "¿Cómo son las prácticas FCT en centros de FP online?", category: "Evaluación y Recomendación de Centros" },
    { id: "evaluacion_7", question: "¿Cómo son los exámenes en los FP a distancia?", category: "Evaluación y Recomendación de Centros" },
    { id: "evaluacion_8", question: "¿Cómo es la carga lectiva en un FP online?", category: "Evaluación y Recomendación de Centros" },
    { id: "evaluacion_9", question: "Experiencias con FP a distancia", category: "Evaluación y Recomendación de Centros" },

    // 2. Fase de Indecisión y Elección (Qué estudiar)
    { id: "indecision_1", question: "¿Qué FP debería estudiar?", category: "Fase de Indecisión y Elección" },
    { id: "indecision_2", question: "¿Qué fp recomendáis para 2025?", category: "Fase de Indecisión y Elección" },
    { id: "indecision_3", question: "Mejores FP para 2025 +30 años", category: "Fase de Indecisión y Elección" },
    { id: "indecision_4", question: "Qué FP haríais en mi situación", category: "Fase de Indecisión y Elección" },
    { id: "indecision_5", question: "Ayuda no sé qué hacer", category: "Fase de Indecisión y Elección" },
    { id: "indecision_6", question: "Me siento perdida con mis estudios, ¿FP en informática o seguir en enfermería?", category: "Fase de Indecisión y Elección" },
    { id: "indecision_7", question: "¿FP sanidad o informática?", category: "Fase de Indecisión y Elección" },
    { id: "indecision_8", question: "¿Qué ciclos de FP tienen más salidas laborales?", category: "Fase de Indecisión y Elección" },
    { id: "indecision_9", question: "¿Por qué hay tanta obsesión con los FP de informática?", category: "Fase de Indecisión y Elección" },
    { id: "indecision_10", question: "Experiencias personales, que estudiasteis, como ha sido, salidas laborales, cuanto se cobra", category: "Fase de Indecisión y Elección" },
    { id: "indecision_11", question: "¿Estos estudios me ayudan a ingresar a la universidad?", category: "Fase de Indecisión y Elección" },
    { id: "indecision_12", question: "¿Cómo lidiar con la presión familiar y los comentarios de los demás sobre los estudios?", category: "Fase de Indecisión y Elección" },
    { id: "indecision_13", question: "¿Vale la pena seguir una carrera que no te gusta solo para cumplir con las expectativas de los demás?", category: "Fase de Indecisión y Elección" },
    { id: "indecision_14", question: "¿ASIR, DAM o DAW?", category: "Fase de Indecisión y Elección" },

    // 3. Comparativa de Vías Formativas (FP vs. Universidad)
    { id: "comparativa_vias_1", question: "Grado superior vs Carrera universitaria ¿Qué es mejor? ¿Cuál te da más oportunidades laborales y mejor formación?", category: "Comparativa de Vías Formativas" },
    { id: "comparativa_vias_2", question: "FP superior o universidad", category: "Comparativa de Vías Formativas" },
    { id: "comparativa_vias_3", question: "¿Merece la pena dejar la universidad y pasarse a un FP?", category: "Comparativa de Vías Formativas" },
    { id: "comparativa_vias_4", question: "FP después de la carrera. Consejos", category: "Comparativa de Vías Formativas" },
    { id: "comparativa_vias_5", question: "Tengo un grado universitario y ahora quiero estudiar FP. ¿Qué módulos me convalidan?", category: "Comparativa de Vías Formativas" },

    // 4. Modalidad y Financiación (Público vs. Privado / Online vs. Presencial)
    { id: "modalidad_1", question: "El dilema lo tengo en lo de siempre, privado o público", category: "Modalidad y Financiación" },
    { id: "modalidad_2", question: "FP superior privada o pública", category: "Modalidad y Financiación" },
    { id: "modalidad_3", question: "Formación online vs presencial: ventajas e inconvenientes", category: "Modalidad y Financiación" },
    { id: "modalidad_4", question: "Necesito que sea 100% online porque mi trabajo no puedo dejarlo de lado", category: "Modalidad y Financiación" },
    { id: "modalidad_5", question: "¿Tiro por la FP privada? Si que podría compaginarla con un trabajo normal ya que suelen ser FP's a distancia", category: "Modalidad y Financiación" },
    { id: "modalidad_6", question: "¿Tiro por un bootcamp?", category: "Modalidad y Financiación" },
    { id: "modalidad_7", question: "¿Vuelvo a la FP normal y me saco el titulo aunque sean 2 años sin trabajar?", category: "Modalidad y Financiación" },
    { id: "modalidad_8", question: "¿Voy a la privada para poder compaginar trabajo con estudios?", category: "Modalidad y Financiación" },
    { id: "modalidad_9", question: "¿Es viable sacar un 10 en el FP a distancia?", category: "Modalidad y Financiación" },

    // 5. Barreras Logísticas y Administrativas
    { id: "logistica_1", question: "¿Es difícil la prueba de acceso a grado superior?", category: "Barreras Logísticas y Administrativas" },
    { id: "logistica_2", question: "Estoy haciendo el Curso de Acceso a Ciclos Formativos (CAS)", category: "Barreras Logísticas y Administrativas" },
    { id: "logistica_3", question: "Tengo un título extranjero y quiero estudiar FP en España", category: "Barreras Logísticas y Administrativas" },
    { id: "logistica_4", question: "He estudiado un ciclo de FP y ahora voy a hacer otro. ¿Me convalidan algún módulo?", category: "Barreras Logísticas y Administrativas" },
    { id: "logistica_5", question: "¿Puedo estudiar FP a distancia en una Comunidad diferente a la que resido?", category: "Barreras Logísticas y Administrativas" },
    { id: "logistica_6", question: "¿El módulo FCT (Formación en Centros de Trabajo) es siempre presencial?", category: "Barreras Logísticas y Administrativas" },

    // 6. Horizonte Post-Titulación (Salidas y Miedos)
    { id: "post_titulacion_1", question: "Qué hacer después de un Grado Superior", category: "Horizonte Post-Titulación" },
    { id: "post_titulacion_2", question: "Encontrar trabajo es imposible", category: "Horizonte Post-Titulación" },
    { id: "post_titulacion_3", question: "Llevo 1 año y medio sin trabajo, estoy frustrado", category: "Horizonte Post-Titulación" },
    { id: "post_titulacion_4", question: "El mercado está saturado. Apenas hay ofertas", category: "Horizonte Post-Titulación" },
    { id: "post_titulacion_5", question: "Oposiciones informática, merece la pena?", category: "Horizonte Post-Titulación" },

    // Búsquedas Generales y de Descubrimiento (Específicas de Ilerna)
    { id: "descubrimiento_1", question: "Opiniones sobre Ilerna Online", category: "Descubrimiento Ilerna" },
    { id: "descubrimiento_2", question: "¿Qué tal es Ilerna para estudiar un FP a distancia?", category: "Descubrimiento Ilerna" },
    { id: "descubrimiento_3", question: "Experiencias de alumnos de Ilerna", category: "Descubrimiento Ilerna" },
    { id: "descubrimiento_4", question: "¿Ilerna es un centro fiable y oficial?", category: "Descubrimiento Ilerna" },
    { id: "descubrimiento_5", question: "Resumen de ventajas y desventajas de Ilerna", category: "Descubrimiento Ilerna" },
    { id: "descubrimiento_6", question: "Ilerna opiniones", category: "Descubrimiento Ilerna" },

    // Búsquedas Centradas en la Flexibilidad y Compatibilidad (Específicas de Ilerna)
    { id: "flexibilidad_1", question: "¿Puedo estudiar en Ilerna si trabajo a jornada completa?", category: "Flexibilidad Ilerna" },
    { id: "flexibilidad_2", question: "Mejor FP online para compaginar con trabajo y familia", category: "Flexibilidad Ilerna" },
    { id: "flexibilidad_3", question: "¿Cómo funcionan las clases online en Ilerna? ¿Quedan grabadas?", category: "Flexibilidad Ilerna" },
    { id: "flexibilidad_4", question: "¿Es verdad que en Ilerna puedes matricularte de las asignaturas que quieras?", category: "Flexibilidad Ilerna" },
    { id: "flexibilidad_5", question: "Estudiar a mi ritmo en Ilerna, ¿es posible?", category: "Flexibilidad Ilerna" },

    // Búsquedas de Verificación y Preocupaciones (Específicas de Ilerna)
    { id: "preocupaciones_1", question: "Problemas con las prácticas de Ilerna", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_2", question: "¿Es verdad que Ilerna tarda mucho en asignar las prácticas?", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_3", question: "¿Tengo que buscarme yo las prácticas si estudio en Ilerna?", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_4", question: "Quejas sobre la gestión de la FCT en Ilerna", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_5", question: "Alumnos de Ilerna que no pueden graduarse por las prácticas", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_6", question: "¿Es fácil aprobar en Ilerna?", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_7", question: "¿Se aprende de verdad en Ilerna o solo pagas por el título?", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_8", question: "Nivel de exigencia de los exámenes de Ilerna", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_9", question: "¿Los profesores de Ilerna son buenos?", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_10", question: "Atención al alumno de Ilerna, ¿responden al teléfono?", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_11", question: "Problemas con las convalidaciones de asignaturas en Ilerna", category: "Preocupaciones Ilerna" },
    { id: "preocupaciones_12", question: "¿Es difícil contactar con la secretaría de Ilerna?", category: "Preocupaciones Ilerna" },

    // Búsquedas Comparativas y de Alternativas (Específicas de Ilerna)
    { id: "comparativas_1", question: "Ilerna vs. Linkia FP, ¿cuál es mejor?", category: "Comparativas Ilerna" },
    { id: "comparativas_2", question: "Comparativa de centros FP online: Ilerna, Medac, Cesur", category: "Comparativas Ilerna" },
    { id: "comparativas_3", question: "¿Qué diferencias hay entre estudiar en Ilerna y en un instituto público?", category: "Comparativas Ilerna" },
    { id: "comparativas_4", question: "Alternativas a Ilerna con mejor gestión de prácticas", category: "Comparativas Ilerna" },
    { id: "comparativas_5", question: "FP online más barato que Ilerna", category: "Comparativas Ilerna" },

    // Búsquedas sobre el Retorno de la Inversión (Empleabilidad y Valor del Título - Específicas de Ilerna)
    { id: "empleabilidad_1", question: "¿El título de Ilerna está bien valorado por las empresas?", category: "Empleabilidad Ilerna" },
    { id: "empleabilidad_2", question: "¿Las empresas contratan a gente de Ilerna?", category: "Empleabilidad Ilerna" },
    { id: "empleabilidad_3", question: "Reputación de Ilerna en el mercado laboral", category: "Empleabilidad Ilerna" },
    { id: "empleabilidad_4", question: "¿Es fácil encontrar trabajo después de estudiar en Ilerna?", category: "Empleabilidad Ilerna" },
    { id: "empleabilidad_5", question: "Opinión de los empleadores sobre los titulados de Ilerna", category: "Empleabilidad Ilerna" },
    { id: "empleabilidad_6", question: "¿Vale la pena pagar para estudiar en Ilerna?", category: "Empleabilidad Ilerna" }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const PREDEFINED_TEMPLATES: AnalysisTemplate[] = [
  SEGUROS_TEMPLATE,
  BANCA_TEMPLATE,
  TELECOMUNICACIONES_TEMPLATE,
  EDUCACION_TEMPLATE
];

export const COMMON_SOURCES = [
  "Google Reviews", "Trustpilot", "OCU", "Rankia", "Finect", "Kelisto", "Rastreator", "Selectra", "Roams", "Comparaiso", "HelpMyCash", "iAhorro", "Foro Coches", "Reddit España", "Menéame", "El Confidencial", "Expansión", "Cinco Días", "La Vanguardia", "El País", "ABC"
];