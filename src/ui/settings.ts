import FullCalendarPlugin from "../main";
import {
    App,
    DropdownComponent,
    Notice,
    PluginSettingTab,
    Setting,
    TFile,
    TFolder,
} from "obsidian";
import { makeDefaultPartialCalendarSource, CalendarInfo } from "../types";
import { CalendarSettings } from "./components/CalendarSetting";
import { AddCalendarSource } from "./components/AddCalendarSource";
import * as ReactDOM from "react-dom";
import { createElement } from "react";
import { getDailyNoteSettings } from "obsidian-daily-notes-interface";
import ReactModal from "./ReactModal";
import { importCalendars } from "src/calendars/parsing/caldav/import";

export interface FullCalendarSettings {
    calendarSources: CalendarInfo[];
    defaultCalendar: number;
    firstDay: number;
    initialView: {
        desktop: string;
        mobile: string;
    };
    current_gmt: string;
    timeFormat24h: boolean;
}

export const DEFAULT_SETTINGS: FullCalendarSettings = {
    calendarSources: [],
    defaultCalendar: 0,
    firstDay: 0,
    initialView: {
        desktop: "timeGridWeek",
        mobile: "timeGrid3Days",
    },
    current_gmt: "India",
    timeFormat24h: false,
};

const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const GMT_OPTIONS = {
    Zulu: "GMT+00 Greenwich Mean Time (GMT)",
    Alpha: "GMT+01 Central European Time (CET)",
    Bravo: "GMT+02 Eastern European Time (EET)",
    Charlie: "GMT+03 Moscow Time (MSK)",
    Delta: "GMT+04 Armenia Time (AMT)",
    Echo: "GMT+05 Pakistan Standard Time (PKT)",
    Foxtrot: "GMT+06 Omsk Time (OMSK)",
    Golf: "GMT+07 Kranoyask Time (KRAT)",
    Hotel: "GMT+08 China Standard Time (CST)",
    India: "GMT+09 Korea Standard Time (KST)",
    Kilo: "GMT+10 Eastern Australia Standard Time (AEST)",
    Lima: "GMT+11 Sakhalin Time (SAKT)",
    Mike: "GMT+12 New Zealand Standard Time (NZST)",
    November: "GMT-01 West Africa Time (WAT)",
    Oscar: "GMT-02 Azores Time (AT)",
    Papa: "GMT-03 Argentina Time (ART)",
    Quebec: "GMT-04 Atlantic Standard Time (AST, EDT)",
    Romeo: "GMT-05 Eastern Standard Time (EST)",
    Sierra: "GMT-06 Central Standard Time (CST)",
    Tango: "GMT-07 Mountain Standard Time (MST, PDT)",
    Uniform: "GMT-08 Pacific Standard Time (PST)",
    Victor: "GMT-09 Alaska Standard Time (AKST)",
    Whiskey: "GMT-10 Hawaii Standard Time (HST)",
    Xray: "GMT-11 Nome Time (NT)",
    Yankee: "GMT-12 International Date Line West (IDLW)",
};

const INITIAL_VIEW_OPTIONS = {
    DESKTOP: {
        timeGridDay: "Day",
        timeGridWeek: "Week",
        dayGridMonth: "Month",
        listWeek: "List",
    },
    MOBILE: {
        timeGrid3Days: "3 Days",
        timeGridDay: "Day",
        listWeek: "List",
    },
};

export function addCalendarButton(
    app: App,
    plugin: FullCalendarPlugin,
    containerEl: HTMLElement,
    submitCallback: (setting: CalendarInfo) => void,
    listUsedDirectories?: () => string[]
) {
    let dropdown: DropdownComponent;
    const directories = app.vault
        .getAllLoadedFiles()
        .filter((f) => f instanceof TFolder)
        .map((f) => f.path);

    return new Setting(containerEl)
        .setName("Calendars")
        .setDesc("Add calendar")
        .addDropdown(
            (d) =>
                (dropdown = d.addOptions({
                    local: "Full note",
                    dailynote: "Daily Note",
                    icloud: "iCloud",
                    caldav: "CalDAV",
                    ical: "Remote (.ics format)",
                }))
        )
        .addExtraButton((button) => {
            button.setTooltip("Add Calendar");
            button.setIcon("plus-with-circle");
            button.onClick(() => {
                let modal = new ReactModal(app, async () => {
                    await plugin.loadSettings();
                    const usedDirectories = (
                        listUsedDirectories
                            ? listUsedDirectories
                            : () =>
                                  plugin.settings.calendarSources
                                      .map(
                                          (s) =>
                                              s.type === "local" && s.directory
                                      )
                                      .filter((s): s is string => !!s)
                    )();
                    let headings: string[] = [];
                    let { template } = getDailyNoteSettings();

                    if (template) {
                        if (!template.endsWith(".md")) {
                            template += ".md";
                        }
                        const file = app.vault.getAbstractFileByPath(template);
                        if (file instanceof TFile) {
                            headings =
                                app.metadataCache
                                    .getFileCache(file)
                                    ?.headings?.map((h) => h.heading) || [];
                        }
                    }

                    return createElement(AddCalendarSource, {
                        source: makeDefaultPartialCalendarSource(
                            dropdown.getValue() as CalendarInfo["type"]
                        ),
                        directories: directories.filter(
                            (dir) => usedDirectories.indexOf(dir) === -1
                        ),
                        headings,
                        submit: async (source: CalendarInfo) => {
                            if (
                                source.type === "caldav" ||
                                source.type === "icloud"
                            ) {
                                try {
                                    let sources = await importCalendars(
                                        {
                                            type: "basic",
                                            username: source.username,
                                            password: source.password,
                                        },
                                        source.url
                                    );
                                    sources.forEach((source) =>
                                        submitCallback(source)
                                    );
                                } catch (e) {
                                    if (e instanceof Error) {
                                        new Notice(e.message);
                                    }
                                }
                            } else {
                                submitCallback(source);
                            }
                            modal.close();
                        },
                    });
                });
                modal.open();
            });
        });
}

export class FullCalendarSettingTab extends PluginSettingTab {
    plugin: FullCalendarPlugin;

    constructor(app: App, plugin: FullCalendarPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Calendar Preferences" });
        new Setting(containerEl)
            .setName("Current Time Zone")
            .setDesc("Choose the GMT offset for the current time zone.")
            .addDropdown((dropdown) => {
                Object.entries(GMT_OPTIONS).forEach(([value, display]) => {
                    dropdown.addOption(value, display);
                });
                dropdown.setValue(this.plugin.settings.current_gmt);
                dropdown.onChange(async (current_gmt) => {
                    this.plugin.settings.current_gmt = current_gmt;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Desktop Initial View")
            .setDesc("Choose the initial view range on desktop devices.")
            .addDropdown((dropdown) => {
                Object.entries(INITIAL_VIEW_OPTIONS.DESKTOP).forEach(
                    ([value, display]) => {
                        dropdown.addOption(value, display);
                    }
                );
                dropdown.setValue(this.plugin.settings.initialView.desktop);
                dropdown.onChange(async (initialView) => {
                    this.plugin.settings.initialView.desktop = initialView;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Mobile Initial View")
            .setDesc("Choose the initial view range on mobile devices.")
            .addDropdown((dropdown) => {
                Object.entries(INITIAL_VIEW_OPTIONS.MOBILE).forEach(
                    ([value, display]) => {
                        dropdown.addOption(value, display);
                    }
                );
                dropdown.setValue(this.plugin.settings.initialView.mobile);
                dropdown.onChange(async (initialView) => {
                    this.plugin.settings.initialView.mobile = initialView;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Starting Day of the Week")
            .setDesc("Choose what day of the week to start.")
            .addDropdown((dropdown) => {
                WEEKDAYS.forEach((day, code) => {
                    dropdown.addOption(code.toString(), day);
                });
                dropdown.setValue(this.plugin.settings.firstDay.toString());
                dropdown.onChange(async (codeAsString) => {
                    this.plugin.settings.firstDay = Number(codeAsString);
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("24-hour format")
            .setDesc("Display the time in a 24-hour format.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.timeFormat24h);
                toggle.onChange(async (val) => {
                    this.plugin.settings.timeFormat24h = val;
                    await this.plugin.saveSettings();
                });
            });

        containerEl.createEl("h2", { text: "Manage Calendars" });
        addCalendarButton(
            this.app,
            this.plugin,
            containerEl,
            async (source: CalendarInfo) => {
                sourceList.addSource(source);
            },
            () =>
                sourceList.state.sources
                    .map((s) => s.type === "local" && s.directory)
                    .filter((s): s is string => !!s)
        );

        const sourcesDiv = containerEl.createDiv();
        sourcesDiv.style.display = "block";
        let sourceList = ReactDOM.render(
            createElement(CalendarSettings, {
                sources: this.plugin.settings.calendarSources,
                submit: async (settings: CalendarInfo[]) => {
                    this.plugin.settings.calendarSources = settings;
                    await this.plugin.saveSettings();
                },
            }),
            sourcesDiv
        );
    }
}
