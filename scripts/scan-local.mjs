import { analyzePackage, SOURCE_FILE_PATTERNS } from '@n8n/scan-community-package/scanner/scanner.mjs';
for (const [folder, patterns] of [['.', SOURCE_FILE_PATTERNS], ['dist', ['**/*.js', 'package.json']]]) {
  const result = await analyzePackage(new URL(`../${folder}/`, import.meta.url).pathname, patterns);
  if (!result.passed) { console.error(result.details ?? result.message); process.exitCode = 1; }
  else console.log(`Official n8n scanner passed: ${folder}`);
}
