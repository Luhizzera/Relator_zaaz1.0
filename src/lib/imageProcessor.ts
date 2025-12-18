// ===== 2. Processador de Imagem Técnico =====
export const compressImage = (base64: string, maxWidth = 1280): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth * height) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      
      // Exporta como JPEG para reduzir o peso drasticamente
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
  });
};