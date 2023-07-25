import { ENV_IDs, ENVs, TheoremLikeEnv, getTheoremLikeEnv } from "env";
import MathPlugin from "main";
import { DEFAULT_LANG } from "default_lang";

import { App, Plugin, PluginSettingTab, Setting, TextComponent } from "obsidian";


export type RenameEnv = {[K in typeof ENV_IDs[number]]: string};

export interface MathContextSettings {
    lang?: string;
    number_prefix?: string;
    number_suffix?: string;
    number_init?: number;
    label_prefix?: string;
    rename? : RenameEnv;
}


export interface MathItemSettings {
    type: string;
    number?: string;
    title?: string;
    label?: string;
}

export interface MathItemPrivateFields {
    autoIndex?: number;
}


// export type MathMetadata = MathContextSettings & MathItemSettings;
export type MathSettings = MathContextSettings & MathItemSettings & MathItemPrivateFields;
export type CalloutSettings = MathSettings;



export const MATH_CONTXT_SETTINGS_KEYS = [
    "lang",
    "number_prefix",
    "number_suffix",
    "number_init",
    "label_prefix",
    "rename",
]

export const MATH_ITEM_SETTINGS_KEYS = [
    "type",
    "number",
    "title",
    "label"
]

export const MATH_ITEM_PRIVATE_FIELDS_KEYS = [
    "autoIndex",
]


export const MATH_SETTINGS_KEYS = [
    ...MATH_CONTXT_SETTINGS_KEYS, 
    ...MATH_ITEM_SETTINGS_KEYS, 
    ...MATH_ITEM_PRIVATE_FIELDS_KEYS
]






export const DEFAULT_SETTINGS = {
    lang: DEFAULT_LANG,
    number_prefix: "",
    number_suffix: "",
    number_init: 1,
    label_prefix: "",
    rename: {},
}




import LanguageManager from "language";
import { ContextSettingModal } from "modals";




export class MathItemSettingsHelper {
    env: TheoremLikeEnv;
    constructor(
        public contentEl: HTMLElement, 
        public settings: MathItemSettings, 
        public defaultSettings: Partial<MathItemSettings>, 
    ) { }

    makeSettingPane() {
        const { contentEl } = this;
        new Setting(contentEl)
            .setName("type")
            .addDropdown((dropdown) => {
                for (let env of ENVs) {
                    dropdown.addOption(env.id, env.id);
                    if (this.defaultSettings.type) {
                        dropdown.setValue(String(this.defaultSettings.type));
                    }
                }

                let initType = dropdown.getValue();
                this.settings.type = initType;
                this.env = getTheoremLikeEnv(initType);


                new Setting(contentEl)
                    .setName("number")
                    .addText((text) => {
                        text.setValue(
                            this.defaultSettings.number ?? "auto"
                        );
                        this.settings.number = text.getValue();
                        text.onChange((value) => {
                            this.settings.title = value;
                        });
                    })


                let titleComp: TextComponent;
                let titlePane = new Setting(contentEl).setName("title")


                let labelPane = new Setting(contentEl).setName("label");
                let labelPrefixEl = labelPane.controlEl.createDiv({ text: this.env.prefix + ":" });

                titlePane.addText((text) => {
                    text.inputEl.setAttribute('style', 'width: 300px;')
                    if (this.defaultSettings.title) {
                        text.setValue(this.defaultSettings.title);
                    }


                    let labelTextComp: TextComponent;
                    labelPane.addText((text) => {
                        labelTextComp = text;
                        text.inputEl.setAttribute('style', 'width: 300px;')
                        if (this.defaultSettings.label) {
                            text.setValue(this.defaultSettings.label);
                        }
                        text.onChange((value) => {
                            this.settings.label = value;
                        });

                    });

                    text
                        .setPlaceholder("e.g. Uniform law of large numbers")
                        .onChange((value) => {
                            this.settings.title = value;
                            labelTextComp.setValue(this.settings.title.replaceAll(' ', '-').replaceAll("'s", '').replaceAll("\\", "").replaceAll("$", "").toLowerCase());
                        })
                });

                dropdown.onChange((value) => {
                    this.settings.type = value;
                    this.env = getTheoremLikeEnv(value);
                    labelPrefixEl.textContent = this.env.prefix + ":";
                });


            });

    }
}



export class MathContextSettingsHelper {
    constructor(
        public contentEl: HTMLElement,
        public settings: MathContextSettings,
        public defaultSettings: MathContextSettings, 
        public plugin?: MathPlugin, // passed if called from the plugin's setting tab
    ) { }


    addTextSetting(name: keyof MathContextSettings): Setting {
        let callback = (value: string): void => {
            Object.assign(this.settings, {[name]: value});
        };
        if (this.plugin) {
            callback = async (value: string): Promise<void> => {
                Object.assign(this.settings, {[name]: value});
                await this.plugin?.saveSettings();
            };
        } 
        return new Setting(this.contentEl)
            .setName(name)
            .addText((text) => {
                text
                .setValue(String(this.defaultSettings[name]))
                .onChange(callback)
            });
    }


    makeSettingPane() {
        const { contentEl } = this;

        new Setting(contentEl)
            .setName("lang")
            .addDropdown((dropdown) => {
                for (let lang of LanguageManager.supported) {
                    dropdown.addOption(lang, lang);
                }
                dropdown.setValue(this.defaultSettings.lang as string);
                dropdown.onChange((value) => {
                    this.settings.lang = value;
                });
            });
        this.addTextSetting("number_prefix");
        this.addTextSetting("number_suffix");
        this.addTextSetting("number_init");
        this.addTextSetting("label_prefix");
        let renamePane = new Setting(contentEl).setName("rename");

        renamePane.addDropdown((dropdown) => {
                for (let envId of ENV_IDs) {
                    dropdown.addOption(envId, envId);
                }
                dropdown.onChange((selectedEnvId) => {
                    let renamePaneTextBox = new Setting(renamePane.controlEl).addText((text) => {
                        text.onChange((newName) => {
                            if (this.settings.rename === undefined) {
                                this.settings.rename = {} as RenameEnv;
                            }
                            Object.assign(this.settings.rename, {[selectedEnvId]: newName});
                        })
                    });
                    let inputEl = renamePaneTextBox.settingEl.querySelector<HTMLElement>("input");
                    if (inputEl) {
                        renamePaneTextBox.settingEl.replaceWith(inputEl);                        
                    }
                });
            });



    }
}
