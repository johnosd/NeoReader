package com.johnny.neoreader;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

/**
 * Apoio ao import de PDF (feature 022): detecção por bytes, contagem de páginas e capa da página 1.
 *
 * O plugin só COPIA e inspeciona o essencial aqui; título, autor, camada de texto e idioma saem do pdf.js
 * no lado JS (PdfService). PdfRenderer existe desde a API 21 e não exige dependência nova.
 */
final class PdfImportHelper {
    static final String CODE_PASSWORD_PROTECTED = "PDF_PASSWORD_PROTECTED";
    static final String CODE_INVALID = "PDF_INVALID";

    // A spec do PDF aceita lixo antes de "%PDF-", mas só nos primeiros 1024 bytes.
    private static final int HEADER_SEARCH_BYTES = 1024;
    private static final byte[] PDF_MAGIC = { '%', 'P', 'D', 'F', '-' };
    // Maior lado da capa renderizada. O JS ainda reduz para o teto de capas do app (2000 px); aqui só limita memória.
    private static final int COVER_MAX_DIMENSION_PX = 1400;
    private static final int COVER_JPEG_QUALITY = 85;

    private PdfImportHelper() {}

    /** Erro de PDF com código estável, devolvido ao JS em `error.code` (ver PdfImportError.ts). */
    static final class PdfImportException extends Exception {
        final String code;

        PdfImportException(String code, String message, Throwable cause) {
            super(message, cause);
            this.code = code;
        }
    }

    static final class PdfInfo {
        final int pageCount;
        // JPEG da página 1, ou null se não deu para renderizar (o JS tenta de novo com o pdf.js).
        final byte[] coverJpeg;

        PdfInfo(int pageCount, byte[] coverJpeg) {
            this.pageCount = pageCount;
            this.coverJpeg = coverJpeg;
        }
    }

    /** O arquivo é PDF? Decide pelo conteúdo (DI-011), não pela extensão. */
    static boolean isPdf(File file) throws IOException {
        byte[] head = new byte[HEADER_SEARCH_BYTES];
        int read;
        try (FileInputStream input = new FileInputStream(file)) {
            read = input.read(head);
        }
        if (read < PDF_MAGIC.length) return false;
        for (int start = 0; start <= read - PDF_MAGIC.length; start++) {
            boolean match = true;
            for (int i = 0; i < PDF_MAGIC.length; i++) {
                if (head[start + i] != PDF_MAGIC[i]) {
                    match = false;
                    break;
                }
            }
            if (match) return true;
        }
        return false;
    }

    /**
     * Abre o PDF com PdfRenderer: valida (senha → PDF_PASSWORD_PROTECTED, ilegível → PDF_INVALID), conta as
     * páginas e renderiza a capa. Falha só na capa não reprova o PDF.
     */
    static PdfInfo inspect(File file) throws PdfImportException {
        try (ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
             PdfRenderer renderer = new PdfRenderer(descriptor)) {
            int pageCount = renderer.getPageCount();
            if (pageCount <= 0) {
                throw new PdfImportException(CODE_INVALID, "PDF sem paginas.", null);
            }
            return new PdfInfo(pageCount, renderCover(renderer));
        } catch (SecurityException error) {
            // PdfRenderer lança SecurityException quando o documento exige senha.
            throw new PdfImportException(CODE_PASSWORD_PROTECTED, "PDF protegido por senha.", error);
        } catch (PdfImportException error) {
            throw error;
        } catch (IOException | IllegalArgumentException | IllegalStateException error) {
            throw new PdfImportException(CODE_INVALID, "PDF invalido ou corrompido.", error);
        }
    }

    private static byte[] renderCover(PdfRenderer renderer) {
        Bitmap bitmap = null;
        try (PdfRenderer.Page page = renderer.openPage(0)) {
            // Largura/altura da página vêm em pontos (1/72"); escala para o maior lado ficar em COVER_MAX_DIMENSION_PX.
            float scale = COVER_MAX_DIMENSION_PX / (float) Math.max(page.getWidth(), page.getHeight());
            int width = Math.max(1, Math.round(page.getWidth() * scale));
            int height = Math.max(1, Math.round(page.getHeight() * scale));
            bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            // PdfRenderer desenha sobre transparente; sem isto a capa sai com fundo preto no JPEG.
            bitmap.eraseColor(Color.WHITE);
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, COVER_JPEG_QUALITY, output);
            return output.toByteArray();
        } catch (Exception | OutOfMemoryError error) {
            return null;
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }
}
