package com.johnny.neoreader;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "NeoReaderLibrary")
public class NeoReaderLibraryPlugin extends Plugin {
    @PluginMethod
    public void selectEpubFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "folderSelected");
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isEmpty()) {
            call.reject("Arquivo invalido.");
            return;
        }

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
    }

    @ActivityCallback
    private void folderSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Selecao de pasta cancelada.");
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("Pasta invalida.");
            return;
        }

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
            collectEpubFiles(root, files, responseFolderName(root));

            JSObject response = new JSObject();
            response.put("folderName", responseFolderName(root));
            response.put("folderUri", treeUri.toString());
            response.put("files", files);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Erro ao ler a pasta selecionada.", error);
        }
    }

    private void collectEpubFiles(DocumentFile folder, JSArray files, String currentPath) throws Exception {
        DocumentFile[] children = folder.listFiles();
        for (DocumentFile child : children) {
            String name = child.getName();
            String childPath = name != null ? currentPath + "/" + name : currentPath;

            if (child.isDirectory()) {
                collectEpubFiles(child, files, childPath);
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
}
