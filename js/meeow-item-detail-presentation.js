(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    Meeow.itemDetailPresentation = {
        props: {
            item: { type: Object, required: true },
            showEffect: { type: Boolean, default: false }
        },
        components: { 'meeow-item-visual': Meeow.itemVisuals.component },
        setup(props) {
            const attributes = global.Vue.computed(() => Meeow.inventory.getItemDisplayAttributes(props.item));
            const category = global.Vue.computed(() => Meeow.inventory.getItemDisplayCategory(props.item));
            const effect = global.Vue.computed(() => props.showEffect && Number.isInteger(props.item?.effect) ? props.item.effect : null);
            return { attributes, category, effect };
        },
        template: `<div class="meeow-item-detail-presentation space-y-4">
            <div class="text-center">
                <div class="meeow-item-surface mx-auto w-20 h-20 rounded-2xl flex items-center justify-center text-5xl" aria-hidden="true">
                    <meeow-item-visual :item="item" size="large"></meeow-item-visual>
                </div>
                <h3 class="mt-3 text-base font-extrabold text-[var(--ui-text)] break-words">{{ item.name || '未命名物品' }}</h3>
                <p class="text-xs text-[var(--ui-text-muted)] mt-1">{{ category }}</p>
            </div>
            <div v-if="attributes.length" class="text-xs text-[var(--ui-text)]">
                <div class="font-bold text-[var(--ui-text-muted)] mb-2">属性</div>
                <div class="flex flex-wrap gap-1.5">
                    <span v-for="label in attributes" :key="label" class="px-2 py-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-soft)]">{{ label }}</span>
                </div>
            </div>
            <p v-if="item.fullContent || item.desc" class="text-xs leading-relaxed text-[var(--ui-text)] whitespace-pre-wrap break-words">{{ item.fullContent || item.desc }}</p>
            <p v-if="effect !== null" class="text-xs text-[var(--ui-text-muted)]">效果：{{ effect }}</p>
        </div>`
    };
})(typeof window !== 'undefined' ? window : globalThis);
