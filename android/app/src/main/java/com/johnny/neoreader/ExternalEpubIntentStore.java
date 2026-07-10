package com.johnny.neoreader;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;

import org.json.JSONObject;

import java.util.Locale;

final class ExternalEpubIntentStore {
    private static final String TAG = "ExternalEpubIntent";
    private static final String PREFS_NAME = "NeoReaderLibraryPlugin";
    private static final String PENDING_EXTERNAL_EPUB_INTENT_KEY = "pendingExternalEpubIntent";
    private static final String EPUB_MIME_TYPE = "application/epub+zip";

    private ExternalEpubIntentStore() {}

    static boolean storeFromIntent(Context context, Intent intent) {
        if (context == null || intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return false;

        Uri uri = intent.getData();
        if (uri == null || !isSupportedScheme(uri)) return false;

        try {
            JSONObject metadata = buildFileMetadata(context, uri);
            String name = metadata.optString("name", "");
            String mimeType = resolveMimeType(context, intent, uri);
            if (!isSupportedEpub(mimeType, name)) {
                Log.w(TAG, "Ignoring external view intent. uriHash=" + hashUri(uri.toString())
                    + " mimeType=" + mimeType
                    + " nameLooksEpub=" + hasEpubExtension(name));
                return false;
            }

            takePersistableReadPermissionIfAvailable(context, intent, uri);
            getPreferences(context)
                .edit()
                .putString(PENDING_EXTERNAL_EPUB_INTENT_KEY, metadata.toString())
                .apply();

            Log.i(TAG, "Stored external EPUB intent. uriHash=" + hashUri(uri.toString())
                + " size=" + metadata.optLong("size", 0L)
                + " mimeType=" + mimeType);
            return true;
        } catch (Exception error) {
            Log.e(TAG, "Failed to store external EPUB intent. uriHash=" + hashUri(uri.toString()), error);
            return false;
        }
    }

    static String consumePending(Context context) {
        SharedPreferences preferences = getPreferences(context);
        String pendingResult = preferences.getString(PENDING_EXTERNAL_EPUB_INTENT_KEY, null);
        if (pendingResult == null) return null;

        preferences.edit().remove(PENDING_EXTERNAL_EPUB_INTENT_KEY).apply();
        return pendingResult;
    }

    private static JSONObject buildFileMetadata(Context context, Uri uri) throws Exception {
        String name = fallbackFileName(uri);
        long size = 0L;

        try (Cursor cursor = context.getContentResolver().query(
            uri,
            new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE },
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex);
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex);
            }
        }

        JSONObject file = new JSONObject();
        file.put("name", name);
        file.put("uri", uri.toString());
        file.put("path", name);
        file.put("size", size);
        return file;
    }

    private static String resolveMimeType(Context context, Intent intent, Uri uri) {
        String mimeType = intent.getType();
        if (mimeType != null && !mimeType.isEmpty()) return mimeType;

        try {
            return context.getContentResolver().getType(uri);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isSupportedScheme(Uri uri) {
        String scheme = uri.getScheme();
        return ContentResolver.SCHEME_CONTENT.equalsIgnoreCase(scheme)
            || ContentResolver.SCHEME_FILE.equalsIgnoreCase(scheme);
    }

    private static boolean isSupportedEpub(String mimeType, String name) {
        return EPUB_MIME_TYPE.equalsIgnoreCase(mimeType) || hasEpubExtension(name);
    }

    private static boolean hasEpubExtension(String name) {
        return name != null && name.toLowerCase(Locale.US).endsWith(".epub");
    }

    private static void takePersistableReadPermissionIfAvailable(Context context, Intent intent, Uri uri) {
        int flags = intent.getFlags();
        boolean hasReadGrant = (flags & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0;
        boolean hasPersistableGrant = (flags & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0;
        if (!hasReadGrant || !hasPersistableGrant) return;

        try {
            context.getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        } catch (SecurityException ignored) {
            // Some providers grant access only for the current activity session.
        }
    }

    private static String fallbackFileName(Uri uri) {
        String segment = uri.getLastPathSegment();
        return segment != null && !segment.isEmpty() ? segment : "livro.epub";
    }

    private static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static int hashUri(String uriValue) {
        return uriValue != null ? uriValue.hashCode() : 0;
    }
}
