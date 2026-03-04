import './style.css';
import { convertElpxToDocx } from './converter';

interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface PendingSaveTarget {
  handle: FileSystemFileHandle;
  filename: string;
}

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('No se ha encontrado el contenedor principal.');
}

app.innerHTML = `
  <main class="shell">
    <section class="hero" aria-label="Cabecera de la aplicación">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">eXe</span>
        <div class="brand-copy">
          <p class="eyebrow">Herramienta de exportación</p>
          <h1>Conversor para eXeLearning</h1>
        </div>
      </div>
      <p class="lede">
        Convierte un archivo <code>.elpx</code> a <code>.docx</code> directamente en el navegador, sin subirlo a ningún
        servidor.
      </p>
    </section>

    <section class="panel">
      <form id="convert-form" class="form">
        <label class="field">
          <span>Archivo <code>.elpx</code></span>
          <input id="file-input" type="file" accept=".elpx,.zip" required />
        </label>

        <div class="actions">
          <button id="submit-button" type="submit">Convertir y guardar</button>
        </div>
      </form>

      <p id="status" class="status" aria-live="polite">Listo para convertir.</p>

      <details class="notes">
        <summary>Limitaciones actuales</summary>
        <ul>
          <li>Esta primera versión se centra en ELPX modernos con <code>content.xml</code>.</li>
          <li>El resultado prioriza texto, listas, tablas e imágenes incrustadas.</li>
          <li>Los elementos interactivos se simplifican para que el DOCX sea estable.</li>
        </ul>
      </details>
    </section>
  </main>
`;

const formElement = document.querySelector<HTMLFormElement>('#convert-form');
const fileInputElement = document.querySelector<HTMLInputElement>('#file-input');
const submitButtonElement = document.querySelector<HTMLButtonElement>('#submit-button');
const statusElement = document.querySelector<HTMLParagraphElement>('#status');

if (!formElement || !fileInputElement || !submitButtonElement || !statusElement) {
  throw new Error('No se ha podido inicializar la interfaz.');
}

const form = formElement;
const fileInput = fileInputElement;
const submitButton = submitButtonElement;
const status = statusElement;

form.addEventListener('submit', async event => {
  event.preventDefault();

  const file = fileInput.files?.[0];
  if (!file) {
    setStatus('Selecciona antes un archivo .elpx.');
    return;
  }

  submitButton.disabled = true;

  try {
    const saveTarget = await prepareSaveTarget(file.name);
    const result = await convertElpxToDocx(file, progress => {
      setStatus(progress.message);
    });

    const savedWithDialog = await saveBlobToTarget(result.blob, result.filename, saveTarget);
    setStatus(
      savedWithDialog
        ? `Conversión completada. Se han procesado ${result.pageCount} páginas.`
        : `Conversión completada. Se han procesado ${result.pageCount} páginas y se ha usado la descarga estándar.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Error: ${message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

function setStatus(message: string, isError = false): void {
  status.textContent = message;
  status.dataset.state = isError ? 'error' : 'idle';
}

async function prepareSaveTarget(inputFilename: string): Promise<PendingSaveTarget | null> {
  const filePickerWindow = window as FilePickerWindow;

  if (!filePickerWindow.showSaveFilePicker) {
    return null;
  }

  const suggestedName = toDocxFilename(inputFilename);

  try {
    const handle = await filePickerWindow.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: 'Documento de Word',
          accept: {
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          },
        },
      ],
    });

    return { handle, filename: suggestedName };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Guardado cancelado por el usuario.');
    }
  }

  return null;
}

async function saveBlobToTarget(blob: Blob, filename: string, saveTarget: PendingSaveTarget | null): Promise<boolean> {
  if (saveTarget) {
    const writable = await saveTarget.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }

  downloadBlob(blob, filename);
  return false;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toDocxFilename(inputFilename: string): string {
  const stem = inputFilename.replace(/\.[^.]+$/, '') || 'documento';
  return `${stem}.docx`;
}
