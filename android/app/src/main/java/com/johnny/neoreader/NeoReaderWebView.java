package com.johnny.neoreader;

import android.content.Context;
import android.util.AttributeSet;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.View;

import com.getcapacitor.CapacitorWebView;

/**
 * WebView do app. Existe por um motivo só: recusar a barra flutuante de seleção
 * do Android (Copiar / Traduzir / Selecionar tudo) enquanto o leitor está
 * aberto, para que só o menu do NeoReader apareça sobre a seleção (FR-010).
 *
 * Por que aqui e não na Activity: recusar em
 * Activity.onWindowStartingActionMode NÃO resolve — verificado em device
 * (Samsung, Android 16, WebView 152): o hook é chamado, devolvemos null, e o
 * DecorView cria o ActionMode mesmo assim, porque null ali significa apenas
 * "a app não fornece um ActionMode próprio".
 *
 * E por que devolver um ActionMode vazio em vez de null/finish(): o Chromium
 * trata a destruição do ActionMode como "usuário desistiu" e LIMPA a seleção
 * junto — o que apagaria a seleção e o nosso menu. Devolvendo um ActionMode
 * que não desenha nada, a seleção nativa e as alças continuam de pé e nenhuma
 * barra do sistema aparece.
 */
public class NeoReaderWebView extends CapacitorWebView {

    public NeoReaderWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    private boolean isSelectionMenuSuppressed() {
        Context context = getContext();
        return context instanceof MainActivity && ((MainActivity) context).isSelectionMenuSuppressed();
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback) {
        if (isSelectionMenuSuppressed()) return new SilentActionMode(callback);
        return super.startActionMode(callback);
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        if (isSelectionMenuSuppressed() && type == ActionMode.TYPE_FLOATING) {
            return new SilentActionMode(callback);
        }
        return super.startActionMode(callback, type);
    }

    /**
     * ActionMode que não desenha nada. Mantemos o callback só para avisá-lo do
     * fim (onDestroyActionMode), que é o que o Chromium espera para liberar
     * seus próprios recursos de seleção.
     */
    private final class SilentActionMode extends ActionMode {
        private final ActionMode.Callback callback;
        private CharSequence title;
        private CharSequence subtitle;
        private Object tag;
        private boolean titleOptionalHint;

        SilentActionMode(ActionMode.Callback callback) {
            this.callback = callback;
        }

        @Override
        public void setTitle(CharSequence title) { this.title = title; }

        @Override
        public void setTitle(int resId) { this.title = getContext().getString(resId); }

        @Override
        public void setSubtitle(CharSequence subtitle) { this.subtitle = subtitle; }

        @Override
        public void setSubtitle(int resId) { this.subtitle = getContext().getString(resId); }

        @Override
        public void setCustomView(View view) { /* nada a desenhar */ }

        @Override
        public View getCustomView() { return null; }

        @Override
        public void invalidate() { /* nada a redesenhar */ }

        @Override
        public void finish() {
            if (callback != null) callback.onDestroyActionMode(this);
        }

        @Override
        public Menu getMenu() { return new SilentMenuHolder().getMenu(); }

        @Override
        public CharSequence getTitle() { return title; }

        @Override
        public CharSequence getSubtitle() { return subtitle; }

        @Override
        public MenuInflater getMenuInflater() { return new MenuInflater(getContext()); }

        @Override
        public void setTag(Object tag) { this.tag = tag; }

        @Override
        public Object getTag() { return tag; }

        @Override
        public void setTitleOptionalHint(boolean titleOptional) { this.titleOptionalHint = titleOptional; }

        @Override
        public boolean getTitleOptionalHint() { return titleOptionalHint; }
    }

    /**
     * Menu descartável: o Chromium popula itens (Copiar, Compartilhar...) assim
     * que o ActionMode nasce. Como nada é exibido, damos a ele um menu real mas
     * descartável, criado a partir de um PopupMenu — a API de menu do Android
     * não tem implementação pública instanciável direta.
     */
    private final class SilentMenuHolder {
        private final android.widget.PopupMenu popupMenu =
            new android.widget.PopupMenu(getContext(), NeoReaderWebView.this);

        Menu getMenu() { return popupMenu.getMenu(); }
    }
}
