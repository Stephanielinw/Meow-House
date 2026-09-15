(function (global) {
    'use strict';
    const Meeow = global.Meeow = global.Meeow || {};
    const values = (result, kind = 'fate-d100') => {
        if (!Number.isInteger(result) || result < 1 || result > 100) throw new Error('Invalid authoritative d100 result');
        return Object.freeze({ result, kind, tens: result === 100 ? '00' : String(Math.floor(result / 10) * 10).padStart(2, '0'), ones: String(result % 10) });
    };
    // This module has no RNG or game-state access. Transforms decorate a frozen number.
    const present = ({ element, result, kind = 'fate-d100', reducedMotion, duration = 650 } = {}) => {
        const face = values(result, kind);
        if (!element) return Promise.resolve(face);
        const reduced = reducedMotion ?? Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        element.replaceChildren();
        element.className = 'meeow-dice-stage';
        element.style.setProperty('--meeow-dice-duration', `${reduced ? 0 : duration}ms`);
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', `d100：${face.result}`);
        const numbers = kind === 'coc-d100' ? [face.tens, face.ones] : [String(face.result)];
        for (const number of numbers) {
            const cube = global.document.createElement('div');
            cube.className = 'meeow-dice-cube';
            cube.style.setProperty('--meeow-dice-duration', `${reduced ? 0 : duration}ms`);
            ['front', 'back', 'left', 'right', 'top', 'bottom'].forEach(side => {
                const plane = global.document.createElement('span');
                plane.className = `meeow-dice-plane meeow-dice-${side}`;
                // Only the resting front presents a value. Side decoration is never a roll.
                plane.textContent = side === 'front' ? number : '✦';
                cube.appendChild(plane);
            });
            element.appendChild(cube);
        }
        const final = global.document.createElement('strong');
        final.className = 'meeow-dice-total';
        final.textContent = `d100 · ${face.result}`;
        element.appendChild(final);
        return new Promise(resolve => global.setTimeout(() => resolve(face), reduced ? 0 : duration));
    };
    Meeow.dice = { values, present, component: {
        props: { result: Number, kind: { default: 'fate-d100' }, fast: Boolean, duration: { default: 650 } },
        template: '<div ref="stage"></div>',
        mounted() { this.renderResult(); },
        watch: { result() { this.renderResult(); } },
        methods: { renderResult() { if (this.result) present({ element: this.$refs.stage, result: this.result, kind: this.kind, reducedMotion: this.fast || undefined, duration: this.duration }); } }
    } };
})(window);
