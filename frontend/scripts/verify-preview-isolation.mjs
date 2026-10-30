/*
 * Read-only Preview environment diagnostic.
 * Run only with Preview variables injected by Vercel:
 *   vercel env run -e preview -- node scripts/verify-preview-isolation.mjs
 * It never writes data and never prints credential values.
 */
import { checkPreviewIsolation, previewIsolationPassed } from '../backend/previewIsolation.js';

const result = await checkPreviewIsolation();

console.log(JSON.stringify(result, null, 2));
if (!previewIsolationPassed(result)) process.exitCode = 1;
