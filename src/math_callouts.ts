import { App, Editor, MarkdownRenderChild, MarkdownView, TFile } from "obsidian";

import MathBooster from './main';
import { MathCalloutModal } from './modals';
import { MathSettings } from './settings/settings';
import { TheoremLikeEnv, getTheoremLikeEnv } from './env';
import { increaseQuoteLevel, renderTextWithMath, formatTitle, formatTitleWithoutSubtitle, resolveSettings, splitIntoLines } from './utils';
import { ActiveNoteIndexer } from './indexer';

export class MathCallout extends MarkdownRenderChild {
    env: TheoremLikeEnv;
    renderedTitleElements: (HTMLElement | string)[];

    constructor(containerEl: HTMLElement, public app: App, public plugin: MathBooster, public config: MathSettings, public currentFile: TFile) {
        super(containerEl);
        this.env = getTheoremLikeEnv(this.config.type);
        this.config = resolveSettings(this.config, this.plugin, this.currentFile);
    }

    async setRenderedTitleElements() {
        // ex) "Theorem 1.1", not "Theorem 1.1 (Cauchy-Schwarz)"
        let titleWithoutSubtitle = await renderTextWithMath(formatTitleWithoutSubtitle(this.config));
        this.renderedTitleElements = [
            ...titleWithoutSubtitle
        ];
        if (this.config.title) {
            // ex) "(Cauchy-Schwarz)"
            let subtitle = await renderTextWithMath(`(${this.config.title})`);
            let subtitleEl = createSpan({ cls: "math-callout-subtitle" });
            subtitleEl.replaceChildren(...subtitle)
            this.renderedTitleElements.push(" ", subtitleEl);
        }
    }

    onload() {
        // make sure setRenderedTitleElements() is called beforehand
        let titleInner = this.containerEl.querySelector<HTMLElement>('.callout-title-inner');
        titleInner?.replaceChildren(...this.renderedTitleElements);

        // add classes for CSS snippets
        this.containerEl.classList.add("math-callout-" + this.config.lang);
        this.containerEl.classList.add("math-callout-" + this.config.type);

        // click the title block (div.callout-title) to edit settings
        let title = this.containerEl.querySelector<HTMLElement>('.callout-title');
        if (title) {
            this.plugin.registerDomEvent(title, "click", async (event: MouseEvent) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const editor = view?.editor;
                if (editor) {
                    let modal = new MathCalloutModal(
                        this.app,
                        this.plugin,
                        view,
                        (settings) => {
                            let resolvedSettings = resolveSettings(settings, this.plugin, this.currentFile);
                            let title = formatTitle(resolvedSettings);
                            let indexer = new ActiveNoteIndexer(this.app, this.plugin, view);
                            indexer.calloutIndexer.overwriteSettings(editor.getCursor().line, settings, title);
                        },
                        "Confirm",
                        "Edit Math Callout Settings",
                        this.config,
                    );
                    modal.resolveDefaultSettings(view.file);
                    modal.open();
                }
            });
        }
    }
}


export function insertMathCalloutCallback(plugin: MathBooster, editor: Editor, config: MathSettings, currentFile: TFile) {
    let selection = editor.getSelection();
    let cursorPos = editor.getCursor();
    let resolvedSettings = resolveSettings(config, plugin, currentFile);
    let title = formatTitle(resolvedSettings);

    if (selection) {
        let nLines = splitIntoLines(selection).length;
        editor.replaceSelection(
            `> [!math|${JSON.stringify(config)}] ${title}\n`
            + increaseQuoteLevel(selection)
        );
        cursorPos.line += nLines;
    } else {
        editor.replaceRange(
            `> [!math|${JSON.stringify(config)}] ${title}\n> `,
            cursorPos
        )
        cursorPos.line += 1;
    }
    cursorPos.ch = 2;
    editor.setCursor(cursorPos);
}
