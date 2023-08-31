import ical from "ical.js";
import { OFCEvent, validateEvent } from "../../types";
import { DateTime, IANAZone } from "luxon";
import { rrulestr } from "rrule";

function getDate(t: ical.Time): string {
    return DateTime.fromSeconds(t.toUnixTime(), {
        zone: "Asia/Seoul",
    }).toISODate();
}

function getDateL(tstr: string, tzone: string): string {
    const t = DateTime.fromISO(tstr, { zone: new IANAZone(tzone) });
    return t.setZone(new IANAZone("Asia/Seoul")).toISODate();
}

function getTime(t: ical.Time): string {
    if (t.isDate) {
        return "00:00";
    }
    return DateTime.fromSeconds(t.toUnixTime(), {
        zone: "Asia/Seoul",
    }).toISOTime({
        includeOffset: false,
        includePrefix: false,
        suppressMilliseconds: true,
        suppressSeconds: true,
    });
}

function getTimeL(tstr: string, tzone: string): string {
    const t = DateTime.fromISO(tstr, { zone: new IANAZone(tzone) });
    return t.setZone(new IANAZone("Asia/Seoul")).toISOTime({
        includeOffset: false,
        includePrefix: false,
        suppressMilliseconds: true,
        suppressSeconds: true,
    });
}

function extractEventUrl(iCalEvent: ical.Event): string {
    let urlProp = iCalEvent.component.getFirstProperty("url");
    return urlProp ? urlProp.getFirstValue() : "";
}

function specifiesEnd(iCalEvent: ical.Event) {
    return (
        Boolean(iCalEvent.component.getFirstProperty("dtend")) ||
        Boolean(iCalEvent.component.getFirstProperty("duration"))
    );
}

function icsToOFC(input: ical.Event): OFCEvent {
    if (input.isRecurring()) {
        const rrule = rrulestr(
            input.component.getFirstProperty("rrule").getFirstValue().toString()
        );
        const allDay = input.startDate.isDate;
        const exdates = input.component
            .getAllProperties("exdate")
            .map((exdateProp) => {
                const exdate = exdateProp.getFirstValue();
                // NOTE: We only store the date from an exdate and recreate the full datetime exdate later,
                // so recurring events with exclusions that happen more than once per day are not supported.
                return getDate(exdate);
            });
        if (!allDay) {
        }
        return {
            type: "rrule",
            title: input.summary,
            id: `ics::${input.uid}::${getDate(input.startDate)}::recurring`,
            rrule: rrule.toString(),
            skipDates: exdates,
            startDate: getDate(input.startDate),
            ...(allDay
                ? { allDay: true }
                : {
                      allDay: false,
                      startTime: getTime(input.startDate),
                      endTime: getTime(input.endDate),
                  }),
        };
    } else {
        // if (!ical.TimezoneService.has(input.startDate.timezone)) {
        const date = getDateL(
            input.startDate.toString(),
            input.startDate.timezone
        );
        const endDate =
            specifiesEnd(input) && input.endDate
                ? getDateL(input.endDate.toString(), input.endDate.timezone)
                : undefined;
        const allDay = input.startDate.isDate;
        return {
            type: "single",
            id: `ics::${input.uid}::${date}::single`,
            title: input.summary,
            date,
            endDate: date !== endDate ? endDate : undefined,
            ...(allDay
                ? { allDay: true }
                : {
                      allDay: false,
                      startTime: getTimeL(
                          input.startDate.toString(),
                          input.startDate.timezone
                      ),
                      endTime: getTimeL(
                          input.endDate.toString(),
                          input.endDate.timezone
                      ),
                  }),
        };
    }
}

export function getEventsFromICS(text: string): OFCEvent[] {
    const jCalData = ical.parse(text);
    const component = new ical.Component(jCalData);

    // TODO: Timezone support
    // const tzc = component.getAllSubcomponents("vtimezone");
    // const tz = new ical.Timezone(tzc[0]);
    const timezones: ical.Timezone[] = component
        .getAllSubcomponents("vtimezone")
        .map((vtimezone) => {
            const timezone = new ical.Timezone(vtimezone);
            ical.TimezoneService.register(timezone.tzid, timezone);
            return timezone;
        });

    const events: ical.Event[] = component
        .getAllSubcomponents("vevent")
        .map((vevent) => new ical.Event(vevent))
        .filter((evt) => {
            evt.iterator;
            try {
                evt.startDate.toJSDate();
                evt.endDate.toJSDate();
                return true;
            } catch (err) {
                // skipping events with invalid time
                return false;
            }
        });

    // Events with RECURRENCE-ID will have duplicated UIDs.
    // We need to modify the base event to exclude those recurrence exceptions.
    const baseEvents = Object.fromEntries(
        events
            .filter((e) => e.recurrenceId === null)
            .map((e) => [e.uid, icsToOFC(e)])
    );

    const recurrenceExceptions = events
        .filter((e) => e.recurrenceId !== null)
        .map((e): [string, OFCEvent] => [e.uid, icsToOFC(e)]);

    for (const [uid, event] of recurrenceExceptions) {
        const baseEvent = baseEvents[uid];
        if (!baseEvent) {
            continue;
        }

        if (baseEvent.type !== "rrule" || event.type !== "single") {
            console.warn(
                "Recurrence exception was recurring or base event was not recurring",
                { baseEvent, recurrenceException: event }
            );
            continue;
        }
        baseEvent.skipDates.push(event.date);
    }

    const allEvents = Object.values(baseEvents).concat(
        recurrenceExceptions.map((e) => e[1])
    );

    return allEvents.map(validateEvent).flatMap((e) => (e ? [e] : []));
}
