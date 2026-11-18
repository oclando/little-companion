const fs = require('node:fs');
const path = require('node:path');

// Copy data installed by npm; do not commit generated model files.
const destination = path.join(__dirname, '..', 'assets', 'ocr');
fs.mkdirSync(destination, { recursive: true });
for (const language of ['eng', 'chi_sim']) {
  const data = require(`@tesseract.js-data/${language}`);
  const filename = `${language}.traineddata.gz`;
  fs.copyFileSync(path.join(data.langPath, filename), path.join(destination, filename));
}
console.log('English and Chinese OCR data are ready.');
