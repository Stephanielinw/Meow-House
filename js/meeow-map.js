(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const map = Meeow.map = Meeow.map || {};

    const makeMapPoint = (id, name, furnitureId, description, anchors, options = {}) => ({
        id,
        name,
        furnitureId,
        description,
        depth: options.depth || 'surface',
        labelOffset: options.labelOffset || [0, 8],
        aliases: options.aliases || [],
        occlusionProfile: options.occlusionProfile || null,
        region: options.region || null,
        anchors
    });

    const MAP_ROOM_DEFINITIONS = [
        { id: 'dorm', name: '小猫宿舍', icon: 'fas fa-bed', groundLayers: ['carpet', 'cushion-a', 'cushion-b'], foregroundLayers: ['window', 'cat-climber', 'shelf', 'cat-house'], zones: [
            makeMapPoint('window-sill', '窗台', 'window', '窗边/窗台/晒太阳的位置', [{ x: 350, y: 287 }, { x: 435, y: 287 }], { aliases: ['window'] }),
            makeMapPoint('cat-tree-top', '猫爬架顶层', 'cat-climber', '猫爬架花朵顶层或最高处', [{ x: 140, y: 352 }, { x: 250, y: 352 }], { aliases: ['tree-top'] }),
            makeMapPoint('cat-tree-high', '猫爬架高台', 'cat-climber', '猫爬架中上层高台', [{ x: 305, y: 510 }, { x: 370, y: 510 }], { aliases: ['tree-platform'] }),
            makeMapPoint('cat-tree-low', '猫爬架底层', 'cat-climber', '猫爬架底层/斜坡/抓挠活动处', [{ x: 180, y: 690 }, { x: 285, y: 690 }], { aliases: ['tree-base', 'tree', 'cat-tree'] }),
            makeMapPoint('wardrobe-top', '柜顶', 'shelf', '衣柜或柜子顶面', [{ x: 720, y: 320 }, { x: 835, y: 320 }], { aliases: ['wardrobe'], region: { x: 610, y: 265, width: 280, height: 70 } }),
            makeMapPoint('wardrobe-under', '柜子底', 'shelf', '衣柜底部阴影和柜脚附近', [{ x: 760, y: 600 }], { aliases: ['wardrobe-under'], occlusionProfile: 'wardrobe-front', region: { x: 635, y: 535, width: 250, height: 100 } }),
            makeMapPoint('dorm-carpet', '地毯', 'carpet', '宿舍地毯区域', [{ x: 650, y: 735 }, { x: 805, y: 740 }], { aliases: ['carpet'], region: { x: 470, y: 560, width: 405, height: 220 } }),
            makeMapPoint('flower-cushion', '花朵软垫', 'cushion-a', '花朵形状软垫，默认软垫点位', [{ x: 165, y: 935 }], { aliases: ['cushion-a', 'cushion'], region: { x: 70, y: 850, width: 230, height: 135 } }),
            makeMapPoint('gingham-cushion', '格纹软垫', 'cushion-b', '绿色格纹软垫', [{ x: 440, y: 925 }], { aliases: ['cushion-b'], region: { x: 335, y: 855, width: 225, height: 120 } }),
            makeMapPoint('cat-house-door', '猫屋入口', 'cat-house', '猫屋入口和猫窝内侧', [{ x: 770, y: 925 }], { aliases: ['nest'] })
        ] },
        { id: 'living', name: '客厅', icon: 'fas fa-couch', groundLayers: ['carpet'], foregroundLayers: ['sofa', 'shelf', 'cat-toys', 'scratching-board-a', 'scratching-board-b'], zones: [
            makeMapPoint('bookshelf-top', '书柜顶', 'shelf', '左侧书柜顶部/最高处', [{ x: 190, y: 120 }, { x: 255, y: 120 }], { region: { x: 145, y: 80, width: 170, height: 70 } }),
            makeMapPoint('bookshelf-upper', '书架上层', 'shelf', '左侧书架上层隔板', [{ x: 185, y: 235 }, { x: 255, y: 235 }], { aliases: ['bookshelf'], region: { x: 105, y: 195, width: 215, height: 70 } }),
            makeMapPoint('bookshelf-middle', '书架中层', 'shelf', '左侧书架中层隔板', [{ x: 185, y: 330 }, { x: 255, y: 330 }], { region: { x: 105, y: 292, width: 215, height: 70 } }),
            makeMapPoint('sofa-seat', '沙发上', 'sofa', '沙发坐垫表面/坐垫右侧或中间', [{ x: 500, y: 410 }, { x: 620, y: 410 }], { aliases: ['sofa'], region: { x: 410, y: 345, width: 335, height: 85 } }),
            makeMapPoint('sofa-foot', '沙发脚', 'sofa', '沙发前方脚边地面', [{ x: 500, y: 495 }, { x: 640, y: 495 }], { region: { x: 400, y: 448, width: 360, height: 90 } }),
            makeMapPoint('living-rug', '客厅地毯', 'carpet', '客厅地毯中央和两侧', [{ x: 390, y: 690 }, { x: 560, y: 690 }], { aliases: ['rug'], region: { x: 240, y: 585, width: 405, height: 225 } }),
            makeMapPoint('toy-area', '玩具区', 'cat-toys', '右侧玩具垫、玩具盒和小玩具附近', [{ x: 760, y: 790 }, { x: 880, y: 790 }], { aliases: ['toy'], region: { x: 690, y: 690, width: 270, height: 255 } }),
            makeMapPoint('scratch-board', '抓板前', 'scratching-board-a', '左下竖向猫抓板前方', [{ x: 135, y: 835 }, { x: 160, y: 900 }], { aliases: ['scratch', 'scratch-board-front'], region: { x: 70, y: 735, width: 150, height: 220 } }),
            makeMapPoint('scratch-post-top', '右侧抓柱上', 'scratching-board-b', '右侧圆柱猫抓板顶部', [{ x: 845, y: 350 }], { aliases: ['scratch-post', 'scratch-column'], region: { x: 820, y: 310, width: 100, height: 65 } }),
            makeMapPoint('owner-feet', '馆长脚边', 'floor', '地图下方可见地面，表示在馆长脚边/身边', [{ x: 510, y: 905 }, { x: 600, y: 905 }], { region: { x: 405, y: 835, width: 280, height: 120 } })
        ] },
        { id: 'dining', name: '餐厅', icon: 'fas fa-utensils', groundLayers: [], foregroundLayers: ['fridge', 'wash-basin', 'hearth', 'kitchen-island', 'foodshelf', 'chair-a', 'chair-b', 'table', 'water-bowl', 'food-bowl'], zones: [
            makeMapPoint('fridge-top', '冰箱顶上', 'fridge', '左侧冰箱顶部', [{ x: 150, y: 170 }], { aliases: ['fridge-top'], region: { x: 45, y: 70, width: 220, height: 95 } }),
            makeMapPoint('fridge-side', '冰箱旁', 'fridge', '冰箱右侧和柜台旁', [{ x: 285, y: 505 }], { aliases: ['fridge'], region: { x: 250, y: 430, width: 120, height: 130 } }),
            makeMapPoint('food-cabinet-top', '猫粮柜顶上', 'foodshelf', '右侧猫粮柜顶部', [{ x: 900, y: 170 }], { aliases: ['food-cabinet-top'], region: { x: 790, y: 70, width: 220, height: 95 } }),
            makeMapPoint('food-cabinet', '猫粮柜', 'foodshelf', '右侧猫粮柜和粮袋附近', [{ x: 900, y: 500 }, { x: 900, y: 590 }], { aliases: ['snack-shelf'], region: { x: 800, y: 330, width: 200, height: 230 } }),
            makeMapPoint('sink-basin', '水池里', 'wash-basin', '水池/水槽盆里', [{ x: 410, y: 325 }], { aliases: ['sink', 'sink-basin'], occlusionProfile: 'sink-rim', region: { x: 325, y: 285, width: 165, height: 80 } }),
            makeMapPoint('cabinet-top', '柜子顶部', 'kitchen-island', '厨房柜台/柜子顶部', [{ x: 620, y: 330 }, { x: 710, y: 330 }], { aliases: ['cabinet-top', 'countertop'], region: { x: 560, y: 285, width: 210, height: 75 } }),
            makeMapPoint('cabinet-under', '柜子底', 'kitchen-island', '厨房岛台柜子底部/柜脚阴影', [{ x: 610, y: 585 }, { x: 710, y: 585 }], { aliases: ['cabinet-under'], occlusionProfile: 'cabinet-front', region: { x: 500, y: 515, width: 270, height: 110 } }),
            makeMapPoint('kitchen-island-front', '厨房岛台前', 'kitchen-island', '厨房岛台前方地面，不是炉灶', [{ x: 455, y: 505 }, { x: 625, y: 505 }], { aliases: ['kitchen-island'], region: { x: 340, y: 470, width: 390, height: 115 } }),
            makeMapPoint('table-under-left', '左侧桌下', 'table', '餐桌左侧桌下地面', [{ x: 145, y: 700 }], { aliases: ['under-table'], occlusionProfile: 'table-front', region: { x: 60, y: 620, width: 205, height: 125 } }),
            makeMapPoint('table-under-right', '右侧桌下', 'table', '餐桌右侧桌下地面', [{ x: 390, y: 700 }], { occlusionProfile: 'table-front', region: { x: 300, y: 620, width: 205, height: 125 } }),
            makeMapPoint('table-edge', '桌边地面', 'table', '餐桌边缘附近地面', [{ x: 270, y: 800 }, { x: 420, y: 800 }], { aliases: ['table'], region: { x: 100, y: 720, width: 410, height: 120 } }),
            makeMapPoint('chair-left', '左椅', 'chair-a', '左侧餐椅椅面', [{ x: 105, y: 675 }], { aliases: ['chair'], occlusionProfile: 'table-front', region: { x: 55, y: 595, width: 115, height: 115 } }),
            makeMapPoint('chair-right', '右椅', 'chair-b', '右侧餐椅椅面', [{ x: 390, y: 675 }], { occlusionProfile: 'table-front', region: { x: 345, y: 595, width: 115, height: 115 } }),
            makeMapPoint('water-bowl', '水碗', 'water-bowl', '底部一排水碗', [{ x: 560, y: 785 }, { x: 685, y: 785 }, { x: 810, y: 785 }, { x: 935, y: 785 }], { region: { x: 515, y: 725, width: 445, height: 90 } }),
            makeMapPoint('food-bowl', '食盆', 'food-bowl', '底部一排食盆', [{ x: 560, y: 900 }, { x: 685, y: 900 }, { x: 810, y: 900 }, { x: 935, y: 900 }], { region: { x: 515, y: 850, width: 445, height: 95 } })
        ] }
    ];

    const getMapAssetPath = (roomId, layer) => `assets/meeow-map/${roomId}/${layer}.png`;
    const getZonePrimaryAnchor = (zone) => (Array.isArray(zone?.anchors) && zone.anchors[0]) || { x: 512, y: 720 };
    const getMapZoneStyle = (zone) => {
        const anchor = getZonePrimaryAnchor(zone);
        const bounds = zone?.bounds || { x: Math.max(0, (anchor.x / 1024) * 100 - 4), y: Math.max(0, (anchor.y / 1024) * 100 - 4), width: 8, height: 8 };
        return {
            left: `${bounds.x}%`,
            top: `${bounds.y}%`,
            width: `${bounds.width}%`,
            height: `${bounds.height}%`,
            borderRadius: bounds.borderRadius || '18px'
        };
    };
    const buildAllMapPoints = (rooms = MAP_ROOM_DEFINITIONS) => rooms.flatMap(room => room.zones.map(point => ({ ...point, roomId: room.id, roomName: room.name })));
    const buildMapPointAliasIndex = (points = buildAllMapPoints()) => {
        const index = new Map();
        points.forEach(point => {
            [point.id, ...(point.aliases || [])].forEach(alias => {
                if (alias) index.set(String(alias), point);
            });
        });
        index.set('bookshelf', index.get('bookshelf-upper'));
        index.set('sofa', index.get('sofa-seat'));
        index.set('rug', index.get('living-rug'));
        index.set('toy', index.get('toy-area'));
        index.set('scratch', index.get('scratch-board'));
        index.set('scratch-post', index.get('scratch-post-top'));
        index.set('table', index.get('table-edge'));
        index.set('under-table', index.get('table-under-left'));
        index.set('chair', index.get('chair-left'));
        index.set('fridge-top', index.get('fridge-top'));
        index.set('food-cabinet-top', index.get('food-cabinet-top'));
        index.set('sink', index.get('sink-basin'));
        index.set('cabinet-top', index.get('cabinet-top'));
        index.set('cabinet-under', index.get('cabinet-under'));
        index.set('window', index.get('window-sill'));
        index.set('tree-top', index.get('cat-tree-top'));
        index.set('tree-platform', index.get('cat-tree-high'));
        index.set('tree-base', index.get('cat-tree-low'));
        index.set('wardrobe', index.get('wardrobe-top'));
        index.set('wardrobe-under', index.get('wardrobe-under'));
        index.set('carpet', index.get('dorm-carpet'));
        index.set('cushion-a', index.get('flower-cushion'));
        index.set('cushion-b', index.get('gingham-cushion'));
        index.set('nest', index.get('cat-house-door'));
        return index;
    };
    const findMapPoint = (id, roomId = '', aliasIndex) => {
        const direct = aliasIndex?.get(String(id || ''));
        return direct && (!roomId || direct.roomId === roomId) ? direct : null;
    };
    const getMapPointPromptGuide = () => MAP_ROOM_DEFINITIONS.map(room => {
        const points = room.zones.map(point => {
            const placement = point.region
                ? `区域 ${point.region.x},${point.region.y},${point.region.width}×${point.region.height}`
                : `脚底点 ${point.anchors.map(anchor => `${anchor.x},${anchor.y}`).join('|')}`;
            return `${point.id}=${point.name}/${point.description}/${placement}`;
        }).join('; ');
        return `${room.id}(${room.name}): ${points}`;
    }).join('\n');
    const getCompactMapPointPromptGuide = () => MAP_ROOM_DEFINITIONS.map(room =>
        `${room.id}: ${room.zones.map(point => `${point.id}=${point.furnitureId}/${point.name}`).join('; ')}`
    ).join('\n');

    Object.assign(map, {
        MAP_ROOM_DEFINITIONS,
        getMapAssetPath,
        getZonePrimaryAnchor,
        getMapZoneStyle,
        buildAllMapPoints,
        buildMapPointAliasIndex,
        findMapPoint,
        getMapPointPromptGuide,
        getCompactMapPointPromptGuide
    });
}(window));
