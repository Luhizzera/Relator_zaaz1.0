// src/utils/fileHandler.ts

// ===== 1. Tipo de Dados para Foto Importada (Necessário para a tipagem do ReportData) =====
interface ImportedPhoto {
    src: string;        // Data URL (base64) da imagem, pronto para o jsPDF
    description: string; // Nome do arquivo como descrição inicial
}

// ===== 2. Função principal para configurar a Zona de Drop (Integração DOM) =====
/**
 * Configura uma zona de drop para processar arquivos de imagem arrastados.
 * * @param dropZoneElement O elemento HTML que servirá como zona de drop (ex: um div).
 * @param onFilesImported Callback a ser executado após a importação de todas as fotos.
 */
export function setupDropZone(dropZoneElement: HTMLElement, onFilesImported: (photos: ImportedPhoto[]) => void): void {
    
    // Nível de Abstração: Configura os listeners de evento DOM para Drag and Drop.

    // Previne comportamento padrão do navegador (abrir arquivo ao arrastar)
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZoneElement.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e: Event) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Feedback visual (opcional: requer classe CSS 'highlight')
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZoneElement.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZoneElement.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e: Event) {
        dropZoneElement.classList.add('highlight');
    }

    function unhighlight(e: Event) {
        dropZoneElement.classList.remove('highlight');
    }

    // ===== 3. Evento DROP: Processamento dos arquivos =====
    dropZoneElement.addEventListener('drop', handleDrop, false);

    function handleDrop(e: DragEvent) {
        const dt = e.dataTransfer;
        if (!dt) return;
        
        const files = dt.files;
        handleFiles(files, onFilesImported);
    }
}

// ===== 4. Função para ler os arquivos e emitir o resultado (Data URL) =====
function handleFiles(files: FileList, onFilesImported: (photos: ImportedPhoto[]) => void): void {
    
    // Nível de Abstração: Lê o conteúdo dos arquivos de imagem e converte para Data URL.

    const importedPhotos: ImportedPhoto[] = [];
    let filesProcessed = 0;
    const filesToProcess = Array.from(files).filter(file => file.type.startsWith('image/'));
    const totalFiles = filesToProcess.length;
    
    if (totalFiles === 0) {
        onFilesImported([]);
        return;
    }

    filesToProcess.forEach(file => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            if (e.target && typeof e.target.result === 'string') {
                importedPhotos.push({
                    src: e.target.result, // Data URL (Base64) da Imagem
                    description: file.name.replace(/\.[^/.]+$/, ""), // Nome do arquivo sem extensão
                });
            }
            filesProcessed++;
            // Finaliza quando todos os arquivos forem lidos
            if (filesProcessed === totalFiles) {
                onFilesImported(importedPhotos);
            }
        };
        
        reader.onerror = () => {
            console.error('Error reading file:', file.name);
            filesProcessed++;
            if (filesProcessed === totalFiles) {
                onFilesImported(importedPhotos);
            }
        };

        reader.readAsDataURL(file); // Lê o arquivo como Data URL (Base64)
    });
}