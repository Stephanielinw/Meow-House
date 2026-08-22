(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const core = Meeow.core = Meeow.core || {};

    core.parseAIJSON = (text) => {
        try {
            if (!text) return null;
            let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

            // Try to find the JSON block
            const firstBrace = cleaned.indexOf('{');
            const firstBracket = cleaned.indexOf('[');

            let start = -1;
            if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
                start = firstBrace;
            } else if (firstBracket !== -1) {
                start = firstBracket;
            }

            if (start === -1) return null;

            // Extract from start to the end of the string
            let jsonCandidate = cleaned.substring(start);

            // Attempt to parse directly first
            try {
                const lastBrace = jsonCandidate.lastIndexOf('}');
                const lastBracket = jsonCandidate.lastIndexOf(']');
                const end = Math.max(lastBrace, lastBracket);
                if (end !== -1) {
                    return JSON.parse(jsonCandidate.substring(0, end + 1));
                }
            } catch (e) { }

            // Robust Truncated JSON Repair Logic
            const repairJSON = (str) => {
                let stack = [];
                let inString = false;
                let escaped = false;
                for (let i = 0; i < str.length; i++) {
                    const char = str[i];
                    if (escaped) { escaped = false; continue; }
                    if (char === '\\') { escaped = true; continue; }
                    if (char === '"') { inString = !inString; continue; }
                    if (inString) continue;
                    if (char === '{' || char === '[') { stack.push(char === '{' ? '}' : ']'); }
                    else if (char === '}' || char === ']') { if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop(); }
                }
                let repaired = str;
                if (inString) repaired += '"';
                while (stack.length > 0) repaired += stack.pop();
                return repaired;
            };

            try {
                const repaired = repairJSON(jsonCandidate);
                return JSON.parse(repaired);
            } catch (finalError) {
                if (jsonCandidate.startsWith('[')) {
                    const lastCompleteObjectEnd = jsonCandidate.lastIndexOf('}');
                    if (lastCompleteObjectEnd !== -1) {
                        try { return JSON.parse(jsonCandidate.substring(0, lastCompleteObjectEnd + 1) + ']'); } catch (e) { }
                    }
                }
                throw finalError;
            }
        } catch (e) {
            console.error("JSON Parse Error:", e, text);
            return null;
        }
    };

    core.cleanText = (text) => {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
        cleaned = cleaned.replace(/\*/g, '');
        cleaned = cleaned.replace(/^\[(STATUS|VOICE|REPLY|CONTENT|ACTION)\]/i, '');
        cleaned = cleaned.replace(/^(Status|状态|Inner Voice|Heart|心声|Think|Thinking|Content|Message|Response|Reply|Action|正文|内容|思考|布鲁斯·韦恩|迪克·格雷森|杰森·陶德|提姆·德雷克|达米安·韦恩|阿福)[：:]\s*/i, '');
        cleaned = cleaned.replace(/^[\u4e00-\u9fa5·]{2,10}[：:]\s*/, '');
        return cleaned.trim();
    };

    core.normalizeHexColor = (color, fallback = '#64748b') => /^#[0-9a-f]{6}$/i.test(String(color || '').trim()) ? String(color).trim() : fallback;
    core.escapeSvgText = (value) => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
    core.cloneData = (value) => JSON.parse(JSON.stringify(value));
}(window));
