package com.johnny.neoreader;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.OperationCanceledException;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.util.Log;

import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.StringReader;
import java.io.OutputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.channels.FileChannel;
import java.util.Map;
import java.util.UUID;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

@CapacitorPlugin(name = "NeoReaderLibrary", requestCodes = { 4701, 4702 })
public class NeoReaderLibraryPlugin extends Plugin {
    static final int SELECT_FOLDER_REQUEST_CODE = 4701;
    static final int SELECT_FILE_REQUEST_CODE = 4702;
    private static final String TAG = "NeoReaderLibrary";
    private static final String PREFS_NAME = "NeoReaderLibraryPlugin";
    private static final String PENDING_FOLDER_RESULT_KEY = "pendingFolderResult";
    private static final String PENDING_FILE_RESULT_KEY = "pendingFileResult";
    private static final String SELECTED_FOLDER_FILES_KEY = "selectedFolderFiles";
    private static final int FILE_PAGE_SIZE = 100;
    private static final int DEFAULT_FILE_CHUNK_SIZE = 1024 * 1024;
    private static final int MAX_FILE_CHUNK_SIZE = 1024 * 1024;
    private static final int COPY_BUFFER_SIZE = 128 * 1024;
    private static final int MAX_COVER_BYTES = 10 * 1024 * 1024;

    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
    private final Map<String, FileReadSession> fileReadSessions = new ConcurrentHashMap<>();
    private final Set<String> canceledImports = ConcurrentHashMap.newKeySet();

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void selectEpubFolder(PluginCall call) {
        Log.i(TAG, "selectEpubFolder start");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        saveCall(call);
        startActivityForResult(call, intent, SELECT_FOLDER_REQUEST_CODE);
    }

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void selectEpubFile(PluginCall call) {
        Log.i(TAG, "selectEpubFile start");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "application/epub+zip",
            "application/octet-stream"
        });
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        saveCall(call);
        startActivityForResult(call, intent, SELECT_FILE_REQUEST_CODE);
    }

    @PluginMethod
    public void consumePendingFolderSelection(PluginCall call) {
        String pendingResult = getPreferences().getString(PENDING_FOLDER_RESULT_KEY, null);
        if (pendingResult == null) {
            call.resolve(new JSObject());
            return;
        }

        getPreferences().edit().remove(PENDING_FOLDER_RESULT_KEY).apply();

        try {
            call.resolve(new JSObject(pendingResult));
        } catch (Exception error) {
            call.reject("Erro ao restaurar a pasta selecionada.", error);
        }
    }

    @PluginMethod
    public void consumePendingFileSelection(PluginCall call) {
        String pendingResult = getPreferences().getString(PENDING_FILE_RESULT_KEY, null);
        if (pendingResult == null) {
            call.resolve(new JSObject());
            return;
        }

        getPreferences().edit().remove(PENDING_FILE_RESULT_KEY).apply();

        try {
            call.resolve(new JSObject(pendingResult));
        } catch (Exception error) {
            call.reject("Erro ao restaurar o arquivo selecionado.", error);
        }
    }

    @PluginMethod
    public void listSelectedFolderFiles(PluginCall call) {
        int offset = call.getInt("offset", 0);
        int limit = call.getInt("limit", FILE_PAGE_SIZE);

        ioExecutor.execute(() -> {
            try {
                JSArray files = getStoredSelectedFolderFiles();
                call.resolve(buildFilesPageResponse(files, offset, limit));
            } catch (Exception error) {
                call.reject("Erro ao listar arquivos selecionados.", error);
            }
        });
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isEmpty()) {
            call.reject("Arquivo invalido.");
            return;
        }

        ioExecutor.execute(() -> {
            try {
                Uri uri = Uri.parse(uriValue);
                JSObject response = new JSObject();
                response.put("name", call.getString("name", "livro.epub"));
                response.put("uri", uriValue);
                response.put("path", call.getString("path"));
                response.put("size", getLongOption(call, "size", 0L));
                response.put("base64", readFileAsBase64(uri));
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Erro ao ler arquivo da pasta selecionada.", error);
            }
        });
    }

    @PluginMethod
    public void readFileChunk(PluginCall call) {
        String uriValue = call.getString("uri");
        String sessionId = call.getString("sessionId");
        boolean hasSession = sessionId != null && !sessionId.isEmpty();
        if (!hasSession && (uriValue == null || uriValue.isEmpty())) {
            call.reject("Arquivo invalido.");
            return;
        }

        long offset = getLongOption(call, "offset", 0L);
        if (offset < 0L) {
            call.reject("Offset invalido.");
            return;
        }

        int requestedLength = getIntOption(call, "length", DEFAULT_FILE_CHUNK_SIZE);
        int length = Math.max(1, Math.min(requestedLength, MAX_FILE_CHUNK_SIZE));

        ioExecutor.execute(() -> {
            try {
                if (hasSession) {
                    FileReadSession session = fileReadSessions.get(sessionId);
                    if (session == null) throw new IllegalStateException("Sessao nativa de leitura expirada.");

                    if (offset == 0L || shouldLogChunkProgress(offset, length)) {
                        Log.d(TAG, "readFileChunk session start. sessionId=" + shortSessionId(sessionId)
                            + " offset=" + offset
                            + " requestedLength=" + requestedLength
                            + " length=" + length);
                    }
                    call.resolve(readFileChunkFromSession(session, offset, length));
                    return;
                }

                Uri uri = Uri.parse(uriValue);
                if (offset == 0L || shouldLogChunkProgress(offset, length)) {
                    Log.d(TAG, "readFileChunk start. uriHash=" + hashUri(uriValue)
                        + " offset=" + offset
                        + " requestedLength=" + requestedLength
                        + " length=" + length);
                }
                call.resolve(readFileChunkAsBase64(uri, offset, length));
            } catch (Exception error) {
                Log.e(TAG, "readFileChunk failed. offset=" + offset
                    + " requestedLength=" + requestedLength
                    + " length=" + length, error);
                call.reject(
                    "Erro ao ler trecho do arquivo selecionado: "
                        + error.getClass().getSimpleName()
                        + ": "
                        + error.getMessage(),
                    error
                );
            }
        });
    }

    @PluginMethod
    public void openFileReadSession(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isEmpty()) {
            call.reject("Arquivo invalido.");
            return;
        }

        ioExecutor.execute(() -> {
            try {
                Uri uri = Uri.parse(uriValue);
                FileReadSession session = openFileReadSession(uri);
                String sessionId = UUID.randomUUID().toString();
                fileReadSessions.put(sessionId, session);

                JSObject response = new JSObject();
                response.put("sessionId", sessionId);
                response.put("mode", "file-channel");
                response.put("size", getLongOption(call, "size", 0L));
                Log.i(TAG, "openFileReadSession opened. sessionId=" + shortSessionId(sessionId)
                    + " uriHash=" + hashUri(uriValue));
                call.resolve(response);
            } catch (Exception error) {
                Log.w(TAG, "openFileReadSession failed. uriHash=" + hashUri(uriValue), error);
                call.reject("Erro ao abrir sessao de leitura do arquivo selecionado.", error);
            }
        });
    }

    @PluginMethod
    public void closeFileReadSession(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId == null || sessionId.isEmpty()) {
            call.reject("Sessao invalida.");
            return;
        }

        FileReadSession session = fileReadSessions.remove(sessionId);
        closeQuietly(session);

        JSObject response = new JSObject();
        response.put("closed", session != null);
        Log.i(TAG, "closeFileReadSession closed. sessionId=" + shortSessionId(sessionId)
            + " found=" + (session != null));
        call.resolve(response);
    }

    @PluginMethod
    public void prepareLocalEpubImport(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isEmpty()) {
            call.reject("Arquivo invalido.");
            return;
        }

        String importId = call.getString("importId", UUID.randomUUID().toString());
        String name = call.getString("name", "livro.epub");
        String path = call.getString("path", name);
        long reportedSize = getLongOption(call, "size", 0L);
        canceledImports.remove(importId);

        ioExecutor.execute(() -> {
            File tmpFile = null;
            File localFile = null;
            boolean createdLocalFile = false;
            long copyStartedAt = System.currentTimeMillis();
            try {
                Uri uri = Uri.parse(uriValue);
                File tmpDir = ensureDirectory("import-tmp");
                File booksDir = ensureDirectory("books");
                tmpFile = File.createTempFile(safeFilePrefix(importId), ".epub", tmpDir);

                CopyResult copyResult = copyToTempAndHash(importId, uri, tmpFile);
                checkImportCanceled(importId);

                localFile = new File(booksDir, copyResult.sha256 + ".epub");
                boolean localFileExisted = localFile.exists();
                if (localFileExisted) {
                    deleteQuietly(tmpFile);
                } else {
                    moveFile(tmpFile, localFile);
                    createdLocalFile = true;
                }

                long copyMs = System.currentTimeMillis() - copyStartedAt;
                long inspectStartedAt = System.currentTimeMillis();
                EpubInspection inspection = inspectEpub(localFile, name);
                long inspectMs = System.currentTimeMillis() - inspectStartedAt;

                JSObject response = new JSObject();
                response.put("importId", importId);
                response.put("name", name);
                response.put("path", path);
                response.put("size", copyResult.bytesCopied > 0L ? copyResult.bytesCopied : reportedSize);
                response.put("sha256", copyResult.sha256);
                response.put("localUri", Uri.fromFile(localFile).toString());
                response.put("originalUri", uriValue);
                response.put("metadata", inspection.metadata);
                if (inspection.cover != null) response.put("cover", inspection.cover);

                JSObject diagnostics = new JSObject();
                diagnostics.put("copyMs", copyMs);
                diagnostics.put("inspectMs", inspectMs);
                diagnostics.put("bytesCopied", copyResult.bytesCopied);
                diagnostics.put("localFileExisted", localFileExisted);
                response.put("diagnostics", diagnostics);

                Log.i(TAG, "prepareLocalEpubImport finished. importId=" + importId
                    + " name=" + name
                    + " bytesCopied=" + copyResult.bytesCopied
                    + " sha256=" + copyResult.sha256.substring(0, Math.min(12, copyResult.sha256.length()))
                    + " copyMs=" + copyMs
                    + " inspectMs=" + inspectMs
                    + " existed=" + localFileExisted);
                call.resolve(response);
            } catch (OperationCanceledException canceled) {
                deleteQuietly(tmpFile);
                if (createdLocalFile) deleteQuietly(localFile);
                Log.w(TAG, "prepareLocalEpubImport canceled. importId=" + importId);
                call.reject("Importacao cancelada.", canceled);
            } catch (Exception error) {
                deleteQuietly(tmpFile);
                if (createdLocalFile) deleteQuietly(localFile);
                Log.e(TAG, "prepareLocalEpubImport failed. importId=" + importId + " name=" + name, error);
                call.reject("Erro ao preparar importacao local do EPUB: "
                    + error.getClass().getSimpleName()
                    + ": "
                    + error.getMessage(), error);
            } finally {
                canceledImports.remove(importId);
            }
        });
    }

    @PluginMethod
    public void cancelImport(PluginCall call) {
        String importId = call.getString("importId");
        if (importId == null || importId.isEmpty()) {
            call.reject("Importacao invalida.");
            return;
        }

        canceledImports.add(importId);
        JSObject response = new JSObject();
        response.put("canceled", true);
        call.resolve(response);
    }

    @PluginMethod
    public void deleteLocalBookFile(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isEmpty()) {
            call.reject("Arquivo invalido.");
            return;
        }

        try {
            File file = localBookFileFromUri(uriValue);
            boolean deleted = deleteQuietly(file);
            JSObject response = new JSObject();
            response.put("deleted", deleted);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Erro ao remover arquivo local do livro.", error);
        }
    }

    @PluginMethod
    public void cleanupImportTemp(PluginCall call) {
        File tmpDir = new File(getContext().getFilesDir(), "import-tmp");
        int deleted = deleteDirectoryChildren(tmpDir);
        JSObject response = new JSObject();
        response.put("deleted", deleted);
        call.resolve(response);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != SELECT_FOLDER_REQUEST_CODE && requestCode != SELECT_FILE_REQUEST_CODE) return;

        PluginCall call = getSavedCall();
        if (requestCode == SELECT_FOLDER_REQUEST_CODE) {
            handleFolderSelected(call, resultCode, data);
            return;
        }

        handleFileSelected(call, resultCode, data);
    }

    private void handleFileSelected(PluginCall call, int resultCode, Intent data) {
        if (resultCode != Activity.RESULT_OK || data == null) {
            if (call != null) call.reject("Selecao de arquivo cancelada.");
            freeSavedCallSafely();
            return;
        }

        Uri fileUri = data.getData();
        if (fileUri == null) {
            if (call != null) call.reject("Arquivo invalido.");
            freeSavedCallSafely();
            return;
        }

        ioExecutor.execute(() -> {
            try {
                try {
                    getContext().getContentResolver().takePersistableUriPermission(
                        fileUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
                } catch (SecurityException ignored) {
                    // Some providers grant access for the current session only.
                }

                JSObject response = buildFileMetadata(fileUri);
                Log.i(TAG, "selectEpubFile selected. uriHash=" + hashUri(fileUri.toString())
                    + " name=" + response.getString("name")
                    + " size=" + response.getLong("size"));
                getPreferences().edit().putString(PENDING_FILE_RESULT_KEY, response.toString()).apply();
                if (call != null) call.resolve(response);
                freeSavedCallSafely();
            } catch (Exception error) {
                if (call != null) call.reject("Erro ao selecionar arquivo.", error);
                freeSavedCallSafely();
            }
        });
    }

    private void handleFolderSelected(PluginCall call, int resultCode, Intent data) {
        if (resultCode != Activity.RESULT_OK || data == null) {
            if (call != null) call.reject("Selecao de pasta cancelada.");
            freeSavedCallSafely();
            return;
        }

        Uri treeUri = data.getData();
        if (treeUri == null) {
            if (call != null) call.reject("Pasta invalida.");
            freeSavedCallSafely();
            return;
        }

        ioExecutor.execute(() -> {
            try {
                getContext().getContentResolver().takePersistableUriPermission(
                    treeUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            } catch (SecurityException ignored) {
                // Some providers grant access for the current session only.
            }

            DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (root == null || !root.isDirectory()) {
                if (call != null) call.reject("Pasta invalida.");
                freeSavedCallSafely();
                return;
            }

            try {
                JSArray files = new JSArray();
                collectEpubFiles(treeUri, root, files);
                Log.i(TAG, "selectEpubFolder selected. uriHash=" + hashUri(treeUri.toString())
                    + " folderName=" + responseFolderName(root)
                    + " fileCount=" + files.length());
                getPreferences().edit().putString(SELECTED_FOLDER_FILES_KEY, files.toString()).apply();

                JSObject response = buildFilesPageResponse(files, 0, FILE_PAGE_SIZE);
                response.put("folderName", responseFolderName(root));
                response.put("folderUri", treeUri.toString());
                getPreferences().edit().putString(PENDING_FOLDER_RESULT_KEY, response.toString()).apply();
                if (call != null) call.resolve(response);
                freeSavedCallSafely();
            } catch (Exception error) {
                if (call != null) call.reject("Erro ao ler a pasta selecionada.", error);
                freeSavedCallSafely();
            }
        });
    }

    private void collectEpubFiles(Uri treeUri, DocumentFile root, JSArray files) throws Exception {
        try {
            String rootDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
            collectEpubFilesWithResolver(treeUri, rootDocumentId, responseFolderName(root), files);
        } catch (Exception resolverError) {
            collectEpubFilesWithDocumentFile(root, files, responseFolderName(root));
        }
    }

    private JSObject buildFilesPageResponse(JSArray files, int rawOffset, int rawLimit) throws Exception {
        int offset = Math.max(0, rawOffset);
        int limit = Math.max(1, Math.min(rawLimit, FILE_PAGE_SIZE));
        int total = files.length();
        int end = Math.min(total, offset + limit);
        JSArray page = new JSArray();

        for (int index = offset; index < end; index += 1) {
            page.put(files.get(index));
        }

        JSObject response = new JSObject();
        response.put("files", page);
        response.put("fileCount", total);
        response.put("nextOffset", end);
        response.put("hasMoreFiles", end < total);
        return response;
    }

    private JSArray getStoredSelectedFolderFiles() throws Exception {
        String storedFiles = getPreferences().getString(SELECTED_FOLDER_FILES_KEY, "[]");
        return new JSArray(storedFiles);
    }

    private void collectEpubFilesWithResolver(Uri treeUri, String parentDocumentId, String currentPath, JSArray files) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId);
        String[] projection = new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE
        };

        try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
            if (cursor == null) throw new IllegalStateException("Provider nao retornou arquivos.");

            int documentIdIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
            int nameIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
            int mimeTypeIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE);
            int sizeIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_SIZE);

            while (cursor.moveToNext()) {
                String documentId = cursor.getString(documentIdIndex);
                String name = cursor.getString(nameIndex);
                String mimeType = cursor.getString(mimeTypeIndex);
                long size = cursor.isNull(sizeIndex) ? 0 : cursor.getLong(sizeIndex);
                String childPath = name != null ? currentPath + "/" + name : currentPath;

                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType)) {
                    collectEpubFilesWithResolver(treeUri, documentId, childPath, files);
                    continue;
                }

                if (name == null || !name.toLowerCase().endsWith(".epub")) continue;

                JSObject file = new JSObject();
                file.put("name", name);
                file.put("uri", DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId).toString());
                file.put("path", childPath);
                file.put("size", size);
                files.put(file);
            }
        }
    }

    private void collectEpubFilesWithDocumentFile(DocumentFile folder, JSArray files, String currentPath) throws Exception {
        DocumentFile[] children = folder.listFiles();
        for (DocumentFile child : children) {
            String name = child.getName();
            String childPath = name != null ? currentPath + "/" + name : currentPath;

            if (child.isDirectory()) {
                collectEpubFilesWithDocumentFile(child, files, childPath);
                continue;
            }

            if (name == null || !name.toLowerCase().endsWith(".epub")) continue;

            JSObject file = new JSObject();
            file.put("name", name);
            file.put("uri", child.getUri().toString());
            file.put("path", childPath);
            file.put("size", child.length());
            files.put(file);
        }
    }

    private JSObject buildFileMetadata(Uri uri) throws Exception {
        String name = "livro.epub";
        long size = 0L;
        String[] projection = new String[] {
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_SIZE
        };

        try (Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
                int sizeIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE);
                if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex);
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex);
            }
        }

        JSObject file = new JSObject();
        file.put("name", name);
        file.put("uri", uri.toString());
        file.put("path", name);
        file.put("size", size);
        return file;
    }

    private String responseFolderName(DocumentFile root) {
        return root.getName() != null ? root.getName() : "Pasta selecionada";
    }

    private String readFileAsBase64(Uri uri) throws Exception {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IllegalStateException("Arquivo inacessivel.");

            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }

            return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        }
    }

    private JSObject readFileChunkAsBase64(Uri uri, long offset, int length) throws Exception {
        try {
            return readFileChunkWithFileChannel(uri, offset, length);
        } catch (Exception fileDescriptorError) {
            Log.w(TAG, "FileChannel chunk read failed; falling back to InputStream. offset="
                + offset
                + " length="
                + length, fileDescriptorError);
            return readFileChunkWithInputStream(uri, offset, length);
        }
    }

    private JSObject readFileChunkWithFileChannel(Uri uri, long offset, int length) throws Exception {
        try (ParcelFileDescriptor descriptor = getContext().getContentResolver().openFileDescriptor(uri, "r");
             FileInputStream input = descriptor != null ? new FileInputStream(descriptor.getFileDescriptor()) : null;
             FileChannel channel = input != null ? input.getChannel() : null) {
            if (channel == null) throw new IllegalStateException("Arquivo inacessivel.");

            return readFileChunkFromChannel(channel, offset, length);
        }
    }

    private FileReadSession openFileReadSession(Uri uri) throws Exception {
        ParcelFileDescriptor descriptor = null;
        FileInputStream input = null;
        try {
            descriptor = getContext().getContentResolver().openFileDescriptor(uri, "r");
            if (descriptor == null) throw new IllegalStateException("Arquivo inacessivel.");
            input = new FileInputStream(descriptor.getFileDescriptor());
            FileChannel channel = input.getChannel();
            if (channel == null) throw new IllegalStateException("Arquivo inacessivel.");
            return new FileReadSession(descriptor, input, channel);
        } catch (Exception error) {
            closeQuietly(input);
            closeQuietly(descriptor);
            throw error;
        }
    }

    private JSObject readFileChunkFromSession(FileReadSession session, long offset, int length) throws Exception {
        synchronized (session) {
            return readFileChunkFromChannel(session.channel, offset, length);
        }
    }

    private JSObject readFileChunkFromChannel(FileChannel channel, long offset, int length) throws Exception {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream(length)) {
            channel.position(offset);
            byte[] buffer = new byte[Math.min(8192, length)];
            int totalRead = 0;
            while (totalRead < length) {
                ByteBuffer byteBuffer = ByteBuffer.wrap(buffer, 0, Math.min(buffer.length, length - totalRead));
                int read = channel.read(byteBuffer);
                if (read == -1) break;
                if (read == 0) continue;
                output.write(buffer, 0, read);
                totalRead += read;
            }

            return buildChunkResponse(output, offset, totalRead, length);
        }
    }

    private JSObject readFileChunkWithInputStream(Uri uri, long offset, int length) throws Exception {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream(length)) {
            if (input == null) throw new IllegalStateException("Arquivo inacessivel.");

            skipFully(input, offset);

            byte[] buffer = new byte[Math.min(8192, length)];
            int totalRead = 0;
            while (totalRead < length) {
                int read = input.read(buffer, 0, Math.min(buffer.length, length - totalRead));
                if (read == -1) break;
                output.write(buffer, 0, read);
                totalRead += read;
            }

            return buildChunkResponse(output, offset, totalRead, length);
        }
    }

    private JSObject buildChunkResponse(ByteArrayOutputStream output, long offset, int totalRead, int length) {
        if (totalRead <= 0 || totalRead < length || shouldLogChunkProgress(offset, length)) {
            Log.d(TAG, "readFileChunk result. offset=" + offset
                + " bytesRead=" + totalRead
                + " requestedLength=" + length
                + " done=" + (totalRead < length));
        }

        JSObject response = new JSObject();
        response.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
        response.put("bytesRead", totalRead);
        response.put("offset", offset);
        response.put("done", totalRead < length);
        return response;
    }

    private File ensureDirectory(String name) throws Exception {
        File directory = new File(getContext().getFilesDir(), name);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Nao foi possivel criar diretorio " + name + ".");
        }
        return directory;
    }

    private String safeFilePrefix(String value) {
        String prefix = value == null ? "import" : value.replaceAll("[^a-zA-Z0-9._-]", "_");
        return prefix.length() >= 3 ? prefix : "imp" + prefix;
    }

    private CopyResult copyToTempAndHash(String importId, Uri uri, File tmpFile) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long bytesCopied = 0L;

        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             OutputStream output = new FileOutputStream(tmpFile)) {
            if (input == null) throw new IllegalStateException("Arquivo inacessivel.");

            byte[] buffer = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) {
                checkImportCanceled(importId);
                output.write(buffer, 0, read);
                digest.update(buffer, 0, read);
                bytesCopied += read;
            }
        }

        if (bytesCopied <= 0L) throw new IllegalStateException("Arquivo vazio.");
        return new CopyResult(bytesToHex(digest.digest()), bytesCopied);
    }

    private void checkImportCanceled(String importId) {
        if (canceledImports.contains(importId)) {
            throw new OperationCanceledException("Importacao cancelada.");
        }
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format(Locale.US, "%02x", value & 0xff));
        }
        return builder.toString();
    }

    private void moveFile(File source, File target) throws Exception {
        if (source.renameTo(target)) return;
        copyFile(source, target);
        deleteQuietly(source);
    }

    private void copyFile(File source, File target) throws Exception {
        try (InputStream input = new FileInputStream(source);
             OutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        }
    }

    private EpubInspection inspectEpub(File file, String fallbackName) throws Exception {
        try (ZipFile zipFile = new ZipFile(file)) {
            String containerXml = readZipEntryAsString(zipFile, "META-INF/container.xml");
            if (containerXml == null) throw new IllegalStateException("EPUB invalido: container.xml ausente.");

            String opfPath = extractOpfPath(containerXml);
            if (opfPath == null || opfPath.isEmpty()) {
                throw new IllegalStateException("EPUB invalido: OPF ausente.");
            }

            String opfXml = readZipEntryAsString(zipFile, opfPath);
            if (opfXml == null) throw new IllegalStateException("EPUB invalido: OPF nao encontrado.");

            Document opfDoc = parseXml(opfXml);
            String title = cleanText(firstText(opfDoc, "title"));
            String author = cleanText(firstText(opfDoc, "creator"));
            String language = cleanText(firstText(opfDoc, "language"));
            String description = cleanDescription(firstText(opfDoc, "description"));

            JSObject metadata = new JSObject();
            metadata.put("title", title != null ? title : fallbackName.replaceAll("(?i)\\.epub$", ""));
            metadata.put("author", author != null ? author : "Autor desconhecido");
            if (language != null) metadata.put("language", language);
            if (description != null) metadata.put("description", description);
            metadata.put("identifiers", extractIdentifiers(opfDoc));

            return new EpubInspection(metadata, extractCover(zipFile, opfDoc, opfPath));
        }
    }

    private String extractOpfPath(String containerXml) throws Exception {
        Document document = parseXml(containerXml);
        for (Element element : elements(document, "rootfile")) {
            String fullPath = element.getAttribute("full-path");
            if (fullPath != null && !fullPath.isEmpty()) return normalizeZipPath(fullPath);
        }
        return null;
    }

    private JSObject extractCover(ZipFile zipFile, Document opfDoc, String opfPath) throws Exception {
        Map<String, ManifestEntry> manifest = extractManifest(opfDoc, opfPath);
        String coverId = null;

        for (Element meta : elements(opfDoc, "meta")) {
            String name = meta.getAttribute("name");
            if ("cover".equalsIgnoreCase(name)) {
                coverId = meta.getAttribute("content");
                break;
            }
        }

        ManifestEntry coverEntry = coverId != null ? manifest.get(coverId) : null;
        if (coverEntry == null) {
            for (ManifestEntry entry : manifest.values()) {
                if (entry.properties.contains("cover-image")) {
                    coverEntry = entry;
                    break;
                }
            }
        }
        if (coverEntry == null) {
            for (ManifestEntry entry : manifest.values()) {
                if (entry.mediaType != null
                    && entry.mediaType.toLowerCase(Locale.US).startsWith("image/")
                    && entry.href.toLowerCase(Locale.US).contains("cover")) {
                    coverEntry = entry;
                    break;
                }
            }
        }
        if (coverEntry == null) return null;

        ZipEntry zipEntry = zipFile.getEntry(coverEntry.path);
        if (zipEntry == null || zipEntry.getSize() > MAX_COVER_BYTES) return null;
        byte[] bytes = readZipEntryBytes(zipFile, coverEntry.path, MAX_COVER_BYTES);
        if (bytes == null || bytes.length == 0) return null;

        JSObject cover = new JSObject();
        cover.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
        cover.put("mimeType", coverEntry.mediaType != null ? coverEntry.mediaType : guessImageMimeType(coverEntry.path));
        return cover;
    }

    private Map<String, ManifestEntry> extractManifest(Document opfDoc, String opfPath) {
        Map<String, ManifestEntry> manifest = new ConcurrentHashMap<>();
        for (Element item : elements(opfDoc, "item")) {
            String id = item.getAttribute("id");
            String href = item.getAttribute("href");
            if (id == null || id.isEmpty() || href == null || href.isEmpty()) continue;
            String mediaType = item.getAttribute("media-type");
            String propertiesValue = item.getAttribute("properties");
            Set<String> properties = new HashSet<>();
            if (propertiesValue != null) {
                for (String property : propertiesValue.toLowerCase(Locale.US).split("\\s+")) {
                    if (!property.isEmpty()) properties.add(property);
                }
            }
            manifest.put(id, new ManifestEntry(href, resolveZipPath(opfPath, href), mediaType, properties));
        }
        return manifest;
    }

    private JSArray extractIdentifiers(Document opfDoc) {
        JSArray identifiers = new JSArray();
        Set<String> seen = new HashSet<>();

        for (Element element : elements(opfDoc, "identifier")) {
            Identifier identifier = normalizeIdentifier(cleanText(element.getTextContent()));
            if (identifier == null) continue;
            String key = identifier.kind + ":" + identifier.value;
            if (seen.contains(key)) continue;
            seen.add(key);

            JSObject item = new JSObject();
            item.put("kind", identifier.kind);
            item.put("value", identifier.value);
            item.put("raw", identifier.raw);
            identifiers.put(item);
        }

        return identifiers;
    }

    private Identifier normalizeIdentifier(String raw) {
        if (raw == null || raw.isEmpty()) return null;
        String trimmed = raw.trim();
        String isbnCandidate = trimmed.replaceFirst("(?i)^urn:isbn:", "").replaceAll("[^0-9Xx]", "").toUpperCase(Locale.US);
        if (isbnCandidate.matches("\\d{13}")) return new Identifier("ISBN_13", isbnCandidate, trimmed);
        if (isbnCandidate.matches("\\d{9}[0-9X]")) return new Identifier("ISBN_10", isbnCandidate, trimmed);
        if (trimmed.matches("(?i)^(urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) {
            return new Identifier("UUID", trimmed.replaceFirst("(?i)^urn:uuid:", "").toLowerCase(Locale.US), trimmed);
        }
        if (trimmed.toLowerCase(Locale.US).startsWith("urn:")) return new Identifier("URN", trimmed, trimmed);
        return new Identifier("OTHER", trimmed, trimmed);
    }

    private Document parseXml(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        try {
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        } catch (Exception ignored) {
            // Some Android parsers do not support every hardening feature.
        }
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(normalizeXmlForParsing(xml))));
    }

    private String normalizeXmlForParsing(String xml) {
        if (xml == null) return "";
        String normalized = xml;
        if (normalized.startsWith("\uFEFF")) {
            normalized = normalized.substring(1);
        }
        if (normalized.startsWith("\u00EF\u00BB\u00BF")) {
            normalized = normalized.substring(3);
        }

        int firstMarkup = normalized.indexOf('<');
        if (firstMarkup > 0) {
            String prefix = normalized.substring(0, firstMarkup);
            if (prefix.trim().isEmpty() || prefix.indexOf('\uFEFF') >= 0 || prefix.startsWith("\u00EF\u00BB\u00BF")) {
                normalized = normalized.substring(firstMarkup);
            }
        }
        return normalized;
    }

    private Element[] elements(Document document, String localName) {
        NodeList nodes = document.getElementsByTagName("*");
        java.util.ArrayList<Element> result = new java.util.ArrayList<>();
        for (int index = 0; index < nodes.getLength(); index += 1) {
            Node node = nodes.item(index);
            if (!(node instanceof Element)) continue;
            Element element = (Element) node;
            String actualLocalName = element.getLocalName() != null ? element.getLocalName() : element.getNodeName();
            if (localName.equalsIgnoreCase(actualLocalName)) result.add(element);
        }
        return result.toArray(new Element[0]);
    }

    private String firstText(Document document, String localName) {
        for (Element element : elements(document, localName)) {
            String text = cleanText(element.getTextContent());
            if (text != null) return text;
        }
        return null;
    }

    private String readZipEntryAsString(ZipFile zipFile, String path) throws Exception {
        byte[] bytes = readZipEntryBytes(zipFile, path, Integer.MAX_VALUE);
        return bytes != null ? new String(bytes, StandardCharsets.UTF_8) : null;
    }

    private byte[] readZipEntryBytes(ZipFile zipFile, String path, int maxBytes) throws Exception {
        ZipEntry entry = zipFile.getEntry(normalizeZipPath(path));
        if (entry == null) return null;
        if (entry.getSize() > maxBytes) return null;

        try (InputStream input = zipFile.getInputStream(entry);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            int total = 0;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) return null;
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private String resolveZipPath(String basePath, String href) {
        if (href == null || href.isEmpty()) return "";
        if (href.matches("(?i)^[a-z][a-z0-9+.-]*:.*")) return href;
        try {
            String baseDir = basePath.contains("/") ? basePath.substring(0, basePath.lastIndexOf("/") + 1) : "";
            URI normalized = new URI(null, null, "/" + baseDir + href, null).normalize();
            return normalizeZipPath(normalized.getPath());
        } catch (Exception ignored) {
            String baseDir = basePath.contains("/") ? basePath.substring(0, basePath.lastIndexOf("/") + 1) : "";
            return normalizeZipPath(baseDir + href);
        }
    }

    private String normalizeZipPath(String path) {
        return path == null ? "" : path.replace("\\", "/").replaceFirst("^/+", "");
    }

    private String cleanDescription(String value) {
        String cleaned = cleanText(value);
        if (cleaned == null) return null;
        return cleanText(cleaned.replaceAll("<[^>]+>", " "));
    }

    private String cleanText(String value) {
        if (value == null) return null;
        String cleaned = value.replaceAll("\\s+", " ").trim();
        return cleaned.isEmpty() ? null : cleaned;
    }

    private String guessImageMimeType(String path) {
        String lower = path.toLowerCase(Locale.US);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        return "image/jpeg";
    }

    private File localBookFileFromUri(String uriValue) throws Exception {
        Uri uri = Uri.parse(uriValue);
        if (!"file".equalsIgnoreCase(uri.getScheme())) {
            throw new SecurityException("URI local invalida.");
        }

        File booksDir = ensureDirectory("books").getCanonicalFile();
        File file = new File(uri.getPath()).getCanonicalFile();
        String booksPath = booksDir.getPath();
        String filePath = file.getPath();
        if (!filePath.equals(booksPath) && !filePath.startsWith(booksPath + File.separator)) {
            throw new SecurityException("Arquivo fora do diretorio de livros.");
        }
        return file;
    }

    private boolean deleteQuietly(File file) {
        if (file == null || !file.exists()) return false;
        try {
            return file.delete();
        } catch (Exception ignored) {
            return false;
        }
    }

    private int deleteDirectoryChildren(File directory) {
        if (directory == null || !directory.exists() || !directory.isDirectory()) return 0;
        int deleted = 0;
        File[] files = directory.listFiles();
        if (files == null) return 0;
        for (File file : files) {
            if (file.isDirectory()) deleted += deleteDirectoryChildren(file);
            if (deleteQuietly(file)) deleted += 1;
        }
        return deleted;
    }

    private boolean shouldLogChunkProgress(long offset, int length) {
        long interval = Math.max((long) length * 20L, 1024L * 1024L);
        return offset > 0L && offset % interval == 0L;
    }

    private int hashUri(String uriValue) {
        return uriValue != null ? uriValue.hashCode() : 0;
    }

    private String shortSessionId(String sessionId) {
        return sessionId != null && sessionId.length() > 8 ? sessionId.substring(0, 8) : sessionId;
    }

    private long getLongOption(PluginCall call, String name, long defaultValue) {
        Object value = call.getData().opt(name);
        if (value == null) return defaultValue;
        if (value instanceof Number) return ((Number) value).longValue();
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return defaultValue;
        }
    }

    private int getIntOption(PluginCall call, String name, int defaultValue) {
        Object value = call.getData().opt(name);
        if (value == null) return defaultValue;
        if (value instanceof Number) return ((Number) value).intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return defaultValue;
        }
    }

    private void skipFully(InputStream input, long bytesToSkip) throws Exception {
        long remaining = bytesToSkip;
        while (remaining > 0L) {
            long skipped = input.skip(remaining);
            if (skipped > 0L) {
                remaining -= skipped;
                continue;
            }

            if (input.read() == -1) return;
            remaining -= 1L;
        }
    }

    @Override
    protected void handleOnDestroy() {
        for (FileReadSession session : fileReadSessions.values()) {
            closeQuietly(session);
        }
        fileReadSessions.clear();
        ioExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private SharedPreferences getPreferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @SuppressWarnings("deprecation")
    private void freeSavedCallSafely() {
        try {
            if (getSavedCall() != null) {
                freeSavedCall();
            }
        } catch (Exception ignored) {
            saveCall(null);
        }
    }

    private void closeQuietly(Closeable closeable) {
        if (closeable == null) return;
        try {
            closeable.close();
        } catch (Exception ignored) {
            // Best effort cleanup.
        }
    }

    private static class CopyResult {
        private final String sha256;
        private final long bytesCopied;

        CopyResult(String sha256, long bytesCopied) {
            this.sha256 = sha256;
            this.bytesCopied = bytesCopied;
        }
    }

    private static class EpubInspection {
        private final JSObject metadata;
        private final JSObject cover;

        EpubInspection(JSObject metadata, JSObject cover) {
            this.metadata = metadata;
            this.cover = cover;
        }
    }

    private static class ManifestEntry {
        private final String href;
        private final String path;
        private final String mediaType;
        private final Set<String> properties;

        ManifestEntry(String href, String path, String mediaType, Set<String> properties) {
            this.href = href;
            this.path = path;
            this.mediaType = mediaType;
            this.properties = properties;
        }
    }

    private static class Identifier {
        private final String kind;
        private final String value;
        private final String raw;

        Identifier(String kind, String value, String raw) {
            this.kind = kind;
            this.value = value;
            this.raw = raw;
        }
    }

    private static class FileReadSession implements Closeable {
        private final ParcelFileDescriptor descriptor;
        private final FileInputStream input;
        private final FileChannel channel;

        FileReadSession(ParcelFileDescriptor descriptor, FileInputStream input, FileChannel channel) {
            this.descriptor = descriptor;
            this.input = input;
            this.channel = channel;
        }

        @Override
        public void close() {
            try {
                channel.close();
            } catch (Exception ignored) {
                // Best effort cleanup.
            }
            try {
                input.close();
            } catch (Exception ignored) {
                // Best effort cleanup.
            }
            try {
                descriptor.close();
            } catch (Exception ignored) {
                // Best effort cleanup.
            }
        }
    }
}
