(function () {
  'use strict';

  var printButton = document.getElementById('printQrButton');
  var pngButton = document.getElementById('downloadQrPngButton');
  var pdfButton = document.getElementById('downloadQrPdfButton');
  var expediente = document.getElementById('qrExpediente');
  var status = document.getElementById('exportStatus');
  var exportButtons = [pngButton, pdfButton].filter(Boolean);

  if (printButton) {
    printButton.addEventListener('click', function () {
      window.print();
    });
  }

  if (!expediente || !pngButton || !pdfButton) {
    return;
  }

  function setStatus(message, isError) {
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('error', Boolean(isError));
  }

  function setBusy(active, currentButton) {
    exportButtons.forEach(function (button) {
      button.disabled = active;
    });

    if (!currentButton) return;
    if (active) {
      currentButton.dataset.originalText = currentButton.textContent;
      currentButton.textContent = 'Generando...';
    } else if (currentButton.dataset.originalText) {
      currentButton.textContent = currentButton.dataset.originalText;
      delete currentButton.dataset.originalText;
    }
  }

  function safeFileName() {
    var name = expediente.dataset.fileName || 'expediente-qr';
    return name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'expediente-qr';
  }

  function waitForImages(root) {
    var images = Array.prototype.slice.call(root.querySelectorAll('img'));
    return Promise.all(images.map(function (img) {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(function (resolve) {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  }

  async function renderExpediente() {
    if (typeof window.html2canvas !== 'function') {
      throw new Error('No se pudo cargar el generador de imágenes.');
    }

    await waitForImages(expediente);
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    var scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
    return window.html2canvas(expediente, {
      scale: scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(document.documentElement.clientWidth, expediente.scrollWidth),
      windowHeight: Math.max(document.documentElement.clientHeight, expediente.scrollHeight)
    });
  }

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function downloadPng() {
    setBusy(true, pngButton);
    setStatus('Preparando imagen...', false);
    try {
      var canvas = await renderExpediente();
      var blob = await new Promise(function (resolve, reject) {
        canvas.toBlob(function (result) {
          if (result) resolve(result);
          else reject(new Error('No fue posible crear el archivo PNG.'));
        }, 'image/png');
      });
      downloadBlob(blob, safeFileName() + '.png');
      setStatus('PNG descargado correctamente.', false);
    } catch (error) {
      setStatus(error && error.message ? error.message : 'No se pudo descargar el PNG.', true);
    } finally {
      setBusy(false, pngButton);
    }
  }

  async function downloadPdf() {
    setBusy(true, pdfButton);
    setStatus('Preparando PDF...', false);
    try {
      var canvas = await renderExpediente();
      var JsPdf = window.jspdf && window.jspdf.jsPDF;
      if (!JsPdf) {
        throw new Error('No se pudo cargar el generador de PDF.');
      }

      var pageWidth = 210;
      var pageHeight = pageWidth * canvas.height / canvas.width;
      var pdf = new JsPdf({
        orientation: pageHeight >= pageWidth ? 'portrait' : 'landscape',
        unit: 'mm',
        format: [pageWidth, pageHeight],
        compress: true
      });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
      pdf.save(safeFileName() + '.pdf');
      setStatus('PDF descargado correctamente.', false);
    } catch (error) {
      setStatus(error && error.message ? error.message : 'No se pudo descargar el PDF.', true);
    } finally {
      setBusy(false, pdfButton);
    }
  }

  pngButton.addEventListener('click', downloadPng);
  pdfButton.addEventListener('click', downloadPdf);
}());
