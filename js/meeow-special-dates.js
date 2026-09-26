(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const gregorianRules = [
        ['new-years-day', 1, 1, '元旦', '元旦快乐'],
        ['valentines-day', 2, 14, '情人节', '情人节快乐'],
        ['april-fools-day', 4, 1, '愚人节', '愚人节快乐'],
        ['labor-day', 5, 1, '劳动节', '劳动节快乐'],
        ['childrens-day', 6, 1, '儿童节', '儿童节快乐'],
        ['national-day', 10, 1, '国庆节', '国庆节快乐'],
        ['halloween-eve', 10, 31, '万圣节前夜', '万圣节前夜'],
        ['halloween', 11, 1, '万圣节', '万圣节快乐'],
        ['christmas-eve', 12, 24, '平安夜', '平安夜快乐'],
        ['christmas', 12, 25, '圣诞节', '圣诞节快乐']
    ];
    const lunarRules = [
        ['spring-festival', 1, 1, '春节'],
        ['lantern-festival', 1, 15, '元宵节'],
        ['dragon-raises-head', 2, 2, '龙抬头'],
        ['dragon-boat', 5, 5, '端午节'],
        ['qixi', 7, 7, '七夕节'],
        ['mid-autumn', 8, 15, '中秋节'],
        ['double-ninth', 9, 9, '重阳节'],
        ['laba', 12, 8, '腊八节'],
        ['little-new-year-north', 12, 23, '北方小年'],
        ['little-new-year-south', 12, 24, '南方小年']
    ];
    const RULES = Object.freeze([
        ...gregorianRules.map(([id, month, day, name, greeting]) => Object.freeze({
            id, month, day, name, greeting, calendar: 'gregorian'
        })),
        ...lunarRules.map(([id, month, day, name]) => Object.freeze({
            id, month, day, name, greeting: `${name}快乐`, calendar: 'lunar'
        })),
        Object.freeze({ id: 'lunar-new-years-eve', name: '除夕', greeting: '除夕快乐', calendar: 'lunar', computed: true })
    ]);
    const localDateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const localNoon = date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const converterFrom = converter => {
        if (typeof converter === 'function') return converter;
        if (converter && typeof converter.fromDate === 'function') return date => converter.fromDate(date);
        return null;
    };
    const evaluate = (date = new Date(), lunarConverter = global.Lunar) => {
        const input = date instanceof Date ? date : new Date(date);
        if (!Number.isFinite(input.getTime())) throw new TypeError('A valid local Date is required.');
        const year = input.getFullYear(), month = input.getMonth() + 1, day = input.getDate();
        const matches = RULES.filter(rule => rule.calendar === 'gregorian' && rule.month === month && rule.day === day)
            .map(rule => Object.freeze({ id: rule.id, name: rule.name, greeting: rule.greeting, calendar: rule.calendar }));
        let lunarAvailable = false, lunarError = '';
        const convert = converterFrom(lunarConverter);
        if (!convert) lunarError = 'lunar-library-unavailable';
        else {
            const firstLunarMatch = matches.length;
            try {
                const lunar = convert(localNoon(input));
                const lunarMonth = lunar?.getMonth?.(), lunarDay = lunar?.getDay?.();
                if (!Number.isInteger(lunarMonth) || !Number.isInteger(lunarDay) || lunarDay < 1 || lunarDay > 30 || Math.abs(lunarMonth) > 12 || lunarMonth === 0)
                    throw new Error('Invalid lunar date');
                lunarAvailable = true;
                // Negative months represent leap lunar months; preserve the original
                // contract that only ordinary lunar months match festival rules.
                if (lunarMonth > 0) {
                    for (const rule of RULES) {
                        if (rule.calendar !== 'lunar' || rule.computed || rule.month !== lunarMonth || rule.day !== lunarDay) continue;
                        matches.push(Object.freeze({ id: rule.id, name: rule.name, greeting: rule.greeting, calendar: rule.calendar }));
                    }
                    if (lunarMonth === 12) {
                        const tomorrow = localNoon(input);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        const nextLunar = convert(tomorrow);
                        if (nextLunar?.getMonth?.() === 1 && nextLunar?.getDay?.() === 1) {
                            const rule = RULES[RULES.length - 1];
                            matches.push(Object.freeze({ id: rule.id, name: rule.name, greeting: rule.greeting, calendar: rule.calendar }));
                        }
                    }
                }
            } catch (error) {
                lunarAvailable = false;
                lunarError = 'lunar-conversion-failed';
                // No partially checked lunar state is published.
                matches.length = firstLunarMatch;
            }
        }
        return Object.freeze({
            version: 1, dateKey: localDateKey(input), holidays: Object.freeze(matches),
            primaryHolidayId: matches.length ? matches[matches.length - 1].id : null,
            lunar: Object.freeze({ available: lunarAvailable, errorCode: lunarError })
        });
    };
    let currentState = evaluate();
    const listeners = new Set();
    const refresh = (date = new Date(), lunarConverter = global.Lunar) => {
        const next = evaluate(date, lunarConverter);
        const changed = JSON.stringify(next) !== JSON.stringify(currentState);
        currentState = next;
        if (changed) for (const listener of listeners) listener(currentState);
        if (next.lunar.errorCode && changed) global.console?.warn?.(`Meeow lunar calendar unavailable: ${next.lunar.errorCode}`);
        return currentState;
    };
    const getCurrentHolidayState = () => currentState;
    const isHolidayActive = () => currentState.holidays.length > 0;
    const hasHoliday = id => currentState.holidays.some(holiday => holiday.id === id);
    const getCurrentHolidayIds = () => currentState.holidays.map(holiday => holiday.id);
    const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
    const nextLocalMidnightDelay = (date = new Date()) => {
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        return Math.max(1, next.getTime() - date.getTime() + 10);
    };
    const getInteractionHolidayContext = (state = currentState) => {
        if (!state?.holidays?.length) return '';
        const context = { dateKey: state.dateKey, holidays: state.holidays.map(({ id, name, greeting }) => ({ id, name, greeting })) };
        return `[AUTHORITATIVE HOLIDAY CONTEXT]\n${JSON.stringify(context)}\nThese are PROGRAM-verified holidays for today's shared environment. They may naturally influence presentation, mood, topics or greetings when relevant; do not force a mention in every reply or invent another active holiday. This context does not authorize item transfers, affinity or relationship changes, event selection, or any other gameplay decision.`;
    };
    Meeow.specialDates = Object.freeze({
        RULES, evaluate, refresh, subscribe, nextLocalMidnightDelay, getCurrentHolidayState,
        isHolidayActive, hasHoliday, getCurrentHolidayIds, getInteractionHolidayContext
    });
})(typeof window !== 'undefined' ? window : globalThis);
