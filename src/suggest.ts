import { getFileTitle } from 'index/utils/normalizers';
import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile, prepareFuzzySearch, sortSearchResults, SearchResult, Notice, prepareSimpleSearch, renderMath, finishRenderMath, getAllTags } from "obsidian";

import MathBooster from "./main";
import { formatLabel, getModifierNameInPlatform, insertBlockIdIfNotExist, openFileAndSelectPosition, resolveSettings } from './utils';
import { LEAF_OPTION_TO_ARGS } from "./settings/settings";
import { EquationBlock, MarkdownBlock, MarkdownPage, MathBoosterBlock, TheoremCalloutBlock } from "index/typings/markdown";
import { MathIndex } from "index";


type ScoredMathBoosterBlock = { match: SearchResult, block: MathBoosterBlock };

abstract class LinkAutocomplete extends EditorSuggest<MathBoosterBlock> {
    index: MathIndex;

    /**
     * @param type The type of the block to search for. See: index/typings/markdown.ts
     */
    constructor(public plugin: MathBooster, public triggerGetter: () => string) {
        const { app } = plugin;
        super(app);

        this.index = this.plugin.indexManager.index;

        // Mod (by default) + Enter to jump to the selected item
        this.scope.register([this.plugin.extraSettings.modifierToJump], "Enter", () => {
            if (this.context) {
                const { editor, start, end } = this.context;
                editor.replaceRange("", start, end);
            }
            // Reference: https://github.com/tadashi-aikawa/obsidian-various-complements-plugin/blob/be4a12c3f861c31f2be3c0f81809cfc5ab6bb5fd/src/ui/AutoCompleteSuggest.ts#L595-L619
            const item = this.suggestions.values[this.suggestions.selectedItem];
            const file = this.app.vault.getAbstractFileByPath(item.$file); // the file containing the selected item
            if (!(file instanceof TFile)) return;
            openFileAndSelectPosition(file, item.$pos, ...LEAF_OPTION_TO_ARGS[this.plugin.extraSettings.suggestLeafOption]);
            return false;
        });

        // Shift (by default) + Enter to insert a link to the note containing the selected item
        this.scope.register([this.plugin.extraSettings.modifierToNoteLink], "Enter", () => {
            const item = this.suggestions.values[this.suggestions.selectedItem];
            this.selectSuggestionImpl(item, true);
            return false;
        });

        if (this.plugin.extraSettings.showModifierInstruction) {
            this.setInstructions([
                { command: "↑↓", purpose: "to navigate" },
                { command: "↵", purpose: "to insert link" },
                { command: `${getModifierNameInPlatform(this.plugin.extraSettings.modifierToNoteLink)} + ↵`, purpose: "to insert link to note" },
                { command: `${getModifierNameInPlatform(this.plugin.extraSettings.modifierToJump)} + ↵`, purpose: "to jump" },
            ]);
        }
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
        const trigger = this.triggerGetter();
        const text = editor.getLine(cursor.line);
        const index = text.lastIndexOf(trigger);
        if (index < 0) return null;

        const query = text.slice(index + trigger.length);
        this.limit = this.plugin.extraSettings.suggestNumber;
        return !query.startsWith("[[") ? {
            start: { line: cursor.line, ch: index },
            end: cursor,
            query
        } : null;
    }

    abstract getUnsortedSuggestions(): Array<string> | Set<string>;
    
    postProcessResults(results: ScoredMathBoosterBlock[]) {}

    getSuggestions(context: EditorSuggestContext): MathBoosterBlock[] {
        const ids = this.getUnsortedSuggestions();
        const results = this.gradeSuggestions(ids, context);
        this.postProcessResults(results);
        sortSearchResults(results);
        return results.map((result) => result.block);
    }

    gradeSuggestions(ids: Array<string> | Set<string>, context: EditorSuggestContext) {
        const callback = (this.plugin.extraSettings.searchMethod == "Fuzzy" ? prepareFuzzySearch : prepareSimpleSearch)(context.query);
        const results: ScoredMathBoosterBlock[] = [];

        for (const id of ids) {
            const block = this.index.load(id) as MathBoosterBlock;

            // generate the search target text
            let tags: string[] = [];
            if (this.plugin.extraSettings.searchTags) {
                const cache = this.app.metadataCache.getCache(block.$file);
                if (cache) tags = getAllTags(cache) ?? [];
            }

            let text = `${block.$printName} ${block.$file} ${tags.join(" ")}`;

            if (block.$type === "theorem") {
                text += ` ${(block as TheoremCalloutBlock).$settings.type}`;
                if (this.plugin.extraSettings.searchLabel) {
                    const file = this.app.vault.getAbstractFileByPath(block.$file);
                    if (file instanceof TFile) {
                        const resolvedSettings = resolveSettings((block as TheoremCalloutBlock).$settings, this.plugin, file);
                        text += ` ${formatLabel(resolvedSettings) ?? ""}`
                    }
                }
            } else if (block.$type === "equation") {
                text += " " + (block as EquationBlock).$mathText;
            }

            // run search
            const result = callback(text);
            if (result) {
                results.push({ match: result, block });
            }
        }

        return results;
    }

    renderSuggestion(block: MathBoosterBlock, el: HTMLElement): void {
        const baseEl = el.createDiv({ cls: "math-booster-search-item" });
        if (block.$printName) {
            baseEl.createDiv({ text: block.$printName });
        }
        const smallEl = baseEl.createEl(
            "small", {
            text: `${getFileTitle(block.$file)}, line ${block.$position.start + 1}`,
            cls: "math-booster-search-item-description"
        });
        if (block.$type === "equation") {
            if (this.plugin.extraSettings.renderMathInSuggestion) {
                const mjxContainerEl = renderMath((block as EquationBlock).$mathText, true);
                baseEl.insertBefore(mjxContainerEl, smallEl);
                // finishRenderMath();
            } else {
                const mathTextEl = createDiv({ text: (block as EquationBlock).$mathText });
                baseEl.insertBefore(mathTextEl, smallEl);
            }
        }
    }

    selectSuggestion(item: MathBoosterBlock, evt: MouseEvent | KeyboardEvent): void {
        this.selectSuggestionImpl(item, false);
    }

    async selectSuggestionImpl(block: MathBoosterBlock, insertNoteLink: boolean): Promise<void> {
        if (!this.context) return;
        const fileContainingBlock = this.app.vault.getAbstractFileByPath(block.$file);
        const cache = this.app.metadataCache.getCache(block.$file);
        if (!(fileContainingBlock instanceof TFile) || !cache) return;

        const { editor, start, end, file } = this.context;
        const settings = resolveSettings(undefined, this.plugin, file);
        let success = false;

        const result = await insertBlockIdIfNotExist(this.plugin, fileContainingBlock, cache, block);
        if (result) {
            const { id, lineAdded } = result;
            // We can't use FileManager.generateMarkdownLink here.
            // This is because, when the user is turning off "Use [[Wikilinks]]", 
            // FileManager.generateMarkdownLink inserts a markdown link [](), not a wikilink [[]].
            // Markdown links are hard to deal with for the purpose of this plugin, and also
            // MathLinks has some issues with markdown links (https://github.com/zhaoshenzhai/obsidian-mathlinks/issues/47).
            // So we have to explicitly generate a wikilink here.
            let linktext = "";
            if (fileContainingBlock != file) {
                linktext += this.app.metadataCache.fileToLinktext(fileContainingBlock, file.path);
            }
            if (!insertNoteLink) {
                linktext += `#^${id}`;
            }
            const link = `[[${linktext}]]`
            const insertText = link + (settings.insertSpace ? " " : "");
            if (fileContainingBlock == file) {
                editor.replaceRange(
                    insertText,
                    { line: start.line + lineAdded, ch: start.ch },
                    { line: end.line + lineAdded, ch: end.ch }
                );
            } else {
                editor.replaceRange(insertText, start, end);
            }
            success = true;
        }

        if (!success) {
            new Notice(`${this.plugin.manifest.name}: Failed to read cache. Retry again later.`, 5000);
        }
    }
}

/** Suggest theorems and/or equations from the entire vault. */
export abstract class WholeVaultLinkAutocomplete extends LinkAutocomplete {
    postProcessResults(results: ScoredMathBoosterBlock[]) {
        results.forEach((result) => {
            if (this.app.workspace.getLastOpenFiles().contains(result.block.$file)) {
                result.match.score += this.plugin.extraSettings.upWeightRecent;
            }
        });
    }
}

export class WholeVaultTheoremEquationLinkAutocomplete extends WholeVaultLinkAutocomplete {
    getUnsortedSuggestions(): Set<string> {
        return this.index.getByType('block-math-booster');
    }
}

export class WholeVaultTheoremLinkAutocomplete extends WholeVaultLinkAutocomplete {
    getUnsortedSuggestions(): Set<string> {
        return this.index.getByType('block-theorem');
    }
}

export class WholeVaultEquationLinkAutocomplete extends WholeVaultLinkAutocomplete {
    getUnsortedSuggestions(): Set<string> {
        return this.index.getByType('block-equation');
    }
}


/** Suggest theorems and/or equations from the given set of files. */
export abstract class PartialLinkAutocomplete extends LinkAutocomplete {
    abstract getPaths(): Array<string>;

    abstract filterBlock(block: MarkdownBlock): boolean;

    getUnsortedSuggestions(): Array<string> {
        const ids: string[] = [];
        const pages = this.getPaths().map((path) => this.index.load(path));
        for (const page of pages) {
            if (!MarkdownPage.isMarkdownPage(page)) continue;

            for (const section of page.$sections) {
                for (const block of section.$blocks) {
                    if (this.filterBlock(block)) ids.push(block.$id);
                }
            }
        }
        return ids;
    }
}


export abstract class RecentNotesLinkAutocomplete extends PartialLinkAutocomplete {
    getPaths(): Array<string> {
        return this.app.workspace.getLastOpenFiles();
    }
}

export class RecentNotesTheoremEquationLinkAutocomplete extends RecentNotesLinkAutocomplete {
    filterBlock = MathBoosterBlock.isMathBoosterBlock;
}

export class RecentNotesTheoremLinkAutocomplete extends RecentNotesLinkAutocomplete {
    filterBlock = TheoremCalloutBlock.isTheoremCalloutBlock;
}

export class RecentNotesEquationLinkAutocomplete extends RecentNotesLinkAutocomplete {
    filterBlock = EquationBlock.isEquationBlock;
}


export abstract class ActiveNoteLinkAutocomplete extends PartialLinkAutocomplete {
    getPaths(): Array<string> {
        const path = this.app.workspace.getActiveFile()?.path;
        return path?.endsWith('.md') ? [path] : [];
    }
}

export class ActiveNoteTheoremEquationLinkAutocomplete extends ActiveNoteLinkAutocomplete {
    filterBlock = MathBoosterBlock.isMathBoosterBlock;
}

export class ActiveNoteTheoremLinkAutocomplete extends ActiveNoteLinkAutocomplete {
    filterBlock = TheoremCalloutBlock.isTheoremCalloutBlock;
}

export class ActiveNoteEquationLinkAutocomplete extends ActiveNoteLinkAutocomplete {
    filterBlock = EquationBlock.isEquationBlock;
}
