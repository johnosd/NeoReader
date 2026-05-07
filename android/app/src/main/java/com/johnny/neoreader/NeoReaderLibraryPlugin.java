package com.johnny.neoreader;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NeoReaderLibrary", requestCodes = { 4701 })
public class NeoReaderLibraryPlugin extends Plugin {
    static final int SELECT_FOLDER_REQUEST_CODE = 4701;
    private static final String PREFS_NAME = "NeoReaderLibraryPlugin";
    private static final String PENDING_FOLDER_RESULT_KEY = "pendingFolderResult";
    private static final String SELECTED_FOLDER_FILES_KEY = "selectedFolderFiles";
    private static final int FILE_PAGE_SIZE = 100;

    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void selectEpubFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        saveCall(call);
        startActivityForResult(call, intent, SELECT_FOLDER_REQUEST_CODE);
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
                response.put("size", call.getLong("size", 0L));
                response.put("base64", readFileAsBase64(uri));
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Erro ao ler arquivo da pasta selecionada.", error);
            }
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != SELECT_FOLDER_REQUEST_CODE) return;

        PluginCall call = getSavedCall();
        handleFolderSelected(call, resultCode, data);
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
                call.reject("Pasta invalida.");
                return;
            }

            try {
                JSArray files = new JSArray();
                collectEpubFiles(treeUri, root, files);
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

    @Override
    protected void handleOnDestroy() {
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
}
