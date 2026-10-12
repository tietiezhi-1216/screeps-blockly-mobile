// 官方 Screeps 规则常量（精简可用子集）
(function (g) {
g.CONTROLLER_LEVELS = [0, 200, 45000, 135000, 405000, 1215000, 3645000, 10935000];
g.CONTROLLER_DOWNGRADE = [0, 20000, 10000, 20000, 40000, 80000, 120000, 150000, 200000];
g.CONTROLLER_STRUCTURES = {
  spawn: [0, 1, 1, 1, 1, 1, 1, 2, 3], extension: [0, 0, 5, 10, 20, 30, 40, 50, 60],
  road: [0, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity],
  constructedWall: [0, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity],
  rampart: [0, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity],
  tower: [0, 0, 0, 1, 1, 2, 2, 3, 6], container: [0, 5, 5, 5, 5, 5, 5, 5, 5],
  storage: [0, 0, 0, 0, 1, 1, 1, 1, 1], link: [0, 0, 0, 0, 0, 2, 3, 4, 6],
  extractor: [0, 0, 0, 0, 0, 0, 1, 1, 1], lab: [0, 0, 0, 0, 0, 0, 3, 6, 10],
  terminal: [0, 0, 0, 0, 0, 0, 1, 1, 1], observer: [0, 0, 0, 0, 0, 0, 0, 0, 1],
  powerSpawn: [0, 0, 0, 0, 0, 0, 0, 0, 1], nuker: [0, 0, 0, 0, 0, 0, 0, 0, 1], factory: [0, 0, 0, 0, 0, 0, 0, 1, 1],
};
g.STRUCT_COST = { spawn: 15000, extension: 3000, road: 300, constructedWall: 1, rampart: 1, tower: 5000, container: 5000, storage: 30000, link: 5000, extractor: 5000, lab: 50000, terminal: 100000, observer: 8000, powerSpawn: 100000, nuker: 100000, factory: 100000 };
g.STRUCT_HITS = { spawn: 5000, extension: 1000, road: 5000, constructedWall: 1, rampart: 1, tower: 3000, container: 250000, storage: 10000, link: 1000, extractor: 500, lab: 500, terminal: 3000, observer: 500, powerSpawn: 5000, nuker: 1000, factory: 1000 };
g.STRUCT_ENERGY = { spawn: 300, extension: 50, tower: 1000, storage: 0, container: 0, link: 0, lab: 0, terminal: 0, powerSpawn: 0, nuker: 0 };
g.STRUCT_ENERGY_CAP = { spawn: 300, extension: 50, tower: 1000, storage: 1000000, container: 2000, link: 800, lab: 2000, terminal: 300000, powerSpawn: 5000, nuker: 300000 };
g.WALKABLE_STRUCT = new Set(['road', 'container', 'rampart']);
g.OBSTACLE_STRUCT = new Set(['spawn', 'extension', 'constructedWall', 'tower', 'storage', 'link', 'extractor', 'lab', 'terminal', 'observer', 'powerSpawn', 'nuker', 'factory']);
g.BODY_COST = { work: 100, carry: 50, move: 50, attack: 80, ranged_attack: 150, heal: 250, tough: 10 };
g.FIND_SOURCES = 1; g.FIND_MY_CREEPS = 2; g.FIND_CONSTRUCTION_SITES = 3; g.FIND_MY_SPAWNS = 4; g.FIND_MY_STRUCTURES = 5; g.FIND_HOSTILE_CREEPS = 6; g.FIND_STRUCTURES = 7; g.FIND_HOSTILE_STRUCTURES = 8;
g.LOOK_STRUCTURES = 'structure'; g.LOOK_CREEPS = 'creep'; g.LOOK_SOURCES = 'source'; g.LOOK_CONSTRUCTION_SITES = 'constructionSite';
})(typeof globalThis !== 'undefined' ? globalThis : this);
