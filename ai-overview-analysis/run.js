/**
 * run.js - Orquestador del pipeline: parse -> analyze -> report
 *
 * Uso: node run.js
 */

import { parse } from './parse.js';
import { analyze } from './analyze.js';
import { report } from './report.js';

console.log('=== AI Overview Analysis Pipeline ===\n');

const t0 = Date.now();

// Paso 1: Parse
console.log('--- PASO 1: Parse ---');
parse();
console.log();

// Paso 2: Analyze
console.log('--- PASO 2: Analyze ---');
analyze();
console.log();

// Paso 3: Report
console.log('--- PASO 3: Report ---');
report();
console.log();

const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
console.log(`=== Pipeline completado en ${elapsed}s ===`);
