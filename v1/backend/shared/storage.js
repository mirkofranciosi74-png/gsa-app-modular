/**
 * src/storage.js
 * Gestione salvataggio/lettura/eliminazione PDF sul filesystem locale.
 * I file vengono salvati in STORAGE_PATH (default: ./storage/pdf/)
 * con nome {uuid}.pdf per evitare collisioni.
 */
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dir      = dirname(fileURLToPath(import.meta.url));
const BASE_PATH  = resolve(
  process.env.STORAGE_PATH || join(__dir, "..", "..", "..", "storage", "pdf")
);

// Crea la cartella al primo avvio se non esiste
if (!existsSync(BASE_PATH)) {
  mkdirSync(BASE_PATH, { recursive: true });
  console.log(`[storage] cartella creata: ${BASE_PATH}`);
}

/**
 * Salva un buffer PDF su disco.
 * @param {string} docId  — UUID del documento (usato come nome file)
 * @param {Buffer} buffer — contenuto del PDF
 * @returns {string} path relativo salvato (es. "storage/pdf/abc123.pdf")
 */
export { BASE_PATH as PDF_STORAGE_PATH, ARCHIVIO_PATH as ARCHIVIO_STORAGE_PATH };

export function salvaPdf(docId, buffer) {
  const filePath = join(BASE_PATH, `${docId}.pdf`);
  writeFileSync(filePath, buffer);
  console.log(`[storage] salvato: ${filePath} (${buffer.length} bytes)`);
  return filePath;
}

/**
 * Legge un PDF dal disco e lo restituisce come Buffer.
 * @param {string} docId
 * @returns {Buffer|null} null se il file non esiste
 */
export function leggiPdf(docId) {
  const filePath = join(BASE_PATH, `${docId}.pdf`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath);
}

/**
 * Elimina un PDF dal disco.
 * @param {string} docId
 * @returns {boolean} true se eliminato, false se non esisteva
 */
export function eliminaPdf(docId) {
  const filePath = join(BASE_PATH, `${docId}.pdf`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  console.log(`[storage] eliminato: ${filePath}`);
  return true;
}

/**
 * Verifica se il PDF esiste sul disco.
 */
export function pdfEsiste(docId) {
  return existsSync(join(BASE_PATH, `${docId}.pdf`));
}

// ─── Archivio documentale (file generici) ────────────────────────────────────
const ARCHIVIO_PATH = resolve(
  process.env.ARCHIVIO_PATH || join(__dir, "..", "..", "..", "storage", "archivio")
);
if (!existsSync(ARCHIVIO_PATH)) {
  mkdirSync(ARCHIVIO_PATH, { recursive: true });
}

export function salvaArchivio(docId, ext, buffer) {
  if (!existsSync(ARCHIVIO_PATH)) mkdirSync(ARCHIVIO_PATH, { recursive: true });
  const filePath = join(ARCHIVIO_PATH, `${docId}${ext}`);
  writeFileSync(filePath, buffer);
  return filePath;
}

export function leggiArchivio(docId, ext) {
  const filePath = join(ARCHIVIO_PATH, `${docId}${ext}`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath);
}

export function eliminaArchivio(docId, ext) {
  const filePath = join(ARCHIVIO_PATH, `${docId}${ext}`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

// ─── Allegati spese proprietari (stesso bucket pdf, nome {id}{ext}) ──────────
export function salvaAllegato(id, ext, buffer) {
  const filePath = join(BASE_PATH, `${id}${ext}`);
  writeFileSync(filePath, buffer);
  return filePath;
}

export function leggiAllegato(id, ext) {
  const filePath = join(BASE_PATH, `${id}${ext}`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath);
}

export function eliminaAllegato(id, ext) {
  const filePath = join(BASE_PATH, `${id}${ext}`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}
