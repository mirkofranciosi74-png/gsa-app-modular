import { useState, useRef, useCallback } from "react";
import { uid } from "../utils/formatters.js";

/**
 * Gestisce una coda di PDF da estrarre sequenzialmente.
 *
 * @param {object}   opts
 * @param {Function} opts.extractFn    - async (file: File) => data  — funzione di estrazione specifica del modulo
 * @param {Function} opts.onReady      - (item: QueueItem) => void   — chiamata quando un item è pronto per la validazione
 * @param {Function} [opts.onAfterBatch] - () => void               — chiamata dopo ogni batch (es. reload lista)
 * @param {boolean}  [opts.keepFile=false] - se true, mantiene _file sull'item dopo l'estrazione (serve per upload allegato)
 *
 * QueueItem shape: { id, nomeFile, stato, data, pdfUrl, _file, _errore? }
 *   stato: "attesa" | "caricamento" | "pronto" | "errore"
 */
export function usePdfQueue({ extractFn, onReady, onAfterBatch, keepFile = false }) {
  const [queue, setQueue] = useState([]);
  const queueRef        = useRef([]);
  const processingRef   = useRef(false);
  const extractFnRef    = useRef(extractFn);
  const onReadyRef      = useRef(onReady);
  const onAfterBatchRef = useRef(onAfterBatch);
  extractFnRef.current   = extractFn;
  onReadyRef.current     = onReady;
  onAfterBatchRef.current = onAfterBatch;

  // Always update both ref and state together so _elabora can read queueRef synchronously.
  // Supports both direct value and functional updater (like React setState).
  const _setQueue = useCallback((val) => {
    const next = typeof val === "function" ? val(queueRef.current) : val;
    queueRef.current = next;
    setQueue(next);
  }, []);

  const apriProssimo = useCallback((coda) => {
    const next = coda.find(q => q.stato === "pronto");
    if (next) onReadyRef.current(next);
  }, []);

  const validaItem = useCallback((item) => {
    onReadyRef.current(item);
  }, []);

  const addFiles = useCallback((files) => {
    if (!files?.length) return;
    const nuovi = Array.from(files).map(f => ({
      id: uid(), nomeFile: f.name, stato: "attesa",
      data: null, pdfUrl: null, _file: f,
    }));
    // Build merged queue from ref (sync), set state, then start processing — all outside a state updater.
    const ag = [...queueRef.current, ...nuovi];
    _setQueue(ag);
    _elabora(ag, nuovi.map(n => n.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeItem = useCallback((id) => {
    _setQueue(queueRef.current.filter(q => q.id !== id));
  }, [_setQueue]);

  const clearQueue = useCallback(() => _setQueue([]), [_setQueue]);

  async function _elabora(codaInit, ids) {
    if (processingRef.current) return;
    processingRef.current = true;
    let coda = [...codaInit];

    for (const id of ids) {
      const item = coda.find(q => q.id === id);
      if (!item || item.stato !== "attesa") continue;

      coda = coda.map(q => q.id === id ? { ...q, stato: "caricamento" } : q);
      _setQueue([...coda]);

      try {
        const pdfUrl = URL.createObjectURL(item._file);
        const data   = await extractFnRef.current(item._file);
        coda = coda.map(q => q.id === id
          ? { ...q, stato: "pronto", data, pdfUrl, _file: keepFile ? item._file : null }
          : q
        );
        _setQueue([...coda]);
      } catch (e) {
        coda = coda.map(q => q.id === id
          ? { ...q, stato: "errore", _errore: e.message, _file: null }
          : q
        );
        _setQueue([...coda]);
      }
    }

    processingRef.current = false;
    onAfterBatchRef.current?.();
    apriProssimo(coda);
  }

  return { queue, setQueue: _setQueue, addFiles, removeItem, clearQueue, apriProssimo, validaItem };
}
