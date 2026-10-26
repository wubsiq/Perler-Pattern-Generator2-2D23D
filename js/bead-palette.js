/**
 * BeadPalette - 拼豆色板组件
 * 基于 Mard 221 色数据集的颜色选择组件
 */
class BeadPalette {
    constructor(options) {
        this.container = typeof options.container === 'string'
            ? document.querySelector(options.container)
            : options.container;
        this.colorSet = options.colorSet || 'mard221';
        this.columns = options.columns || 8;
        this.onSelect = options.onSelect || function() {};
        this.initialColor = options.initialColor || null;

        this.currentColor = null;
        this.currentColorName = null;
        this.groups = {};
        this.allColors = [];
        this.activeGroup = 'ALL';
        this.searchTerm = '';

        this.init();
    }

    init() {
        this.loadColors();
        this.buildUI();
        this.bindEvents();
        if (this.initialColor) {
            this.setColor(this.initialColor);
        } else if (this.allColors.length > 0) {
            this.setColor(this.allColors[0].name);
        }
    }

    loadColors() {
        if (typeof colorSets === 'undefined' || !colorSets[this.colorSet]) {
            console.error(`Color set "${this.colorSet}" not found`);
            return;
        }

        const colors = colorSets[this.colorSet];
        this.allColors = colors.map(c => ({
            name: c.name,
            rgb: c.rgb,
            hex: this.rgbToHex(c.rgb)
        }));

        this.groups = {};
        this.allColors.forEach(color => {
            const group = color.name.charAt(0);
            if (!this.groups[group]) {
                this.groups[group] = [];
            }
            this.groups[group].push(color);
        });
    }

    rgbToHex(rgb) {
        return '#' + rgb.map(v => {
            const hex = v.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('').toUpperCase();
    }

    getContrastColor(rgb) {
        const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    }

    buildUI() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="bead-palette">
                <div class="bead-palette-header">
                    <div class="bead-palette-search">
                        <input type="text" placeholder="输入编号搜索..." class="bead-search-input">
                    </div>
                    <div class="bead-palette-groups"></div>
                </div>
                <div class="bead-palette-body">
                    <div class="bead-palette-grid"></div>
                </div>
                <div class="bead-palette-footer">
                    <div class="bead-current-color">
                        <span class="current-color-swatch"></span>
                        <span class="current-color-info">未选择</span>
                    </div>
                </div>
            </div>
        `;

        this.searchInput = this.container.querySelector('.bead-search-input');
        this.groupsContainer = this.container.querySelector('.bead-palette-groups');
        this.gridContainer = this.container.querySelector('.bead-palette-grid');
        this.currentSwatch = this.container.querySelector('.current-color-swatch');
        this.currentInfo = this.container.querySelector('.current-color-info');

        this.renderGroupTabs();
        this.renderGrid();
    }

    renderGroupTabs() {
        const tabs = [{ key: 'ALL', label: '全部' }];
        Object.keys(this.groups).sort().forEach(key => {
            tabs.push({ key, label: `${key}系` });
        });

        this.groupsContainer.innerHTML = tabs.map(tab => `
            <button class="bead-group-tab ${tab.key === this.activeGroup ? 'active' : ''}" data-group="${tab.key}">
                ${tab.label}
            </button>
        `).join('');
    }

    renderGrid() {
        if (!this.gridContainer) return;

        let colorsToShow = this.allColors;

        if (this.activeGroup !== 'ALL' && this.groups[this.activeGroup]) {
            colorsToShow = this.groups[this.activeGroup];
        }

        if (this.searchTerm) {
            const term = this.searchTerm.toUpperCase();
            colorsToShow = colorsToShow.filter(c =>
                c.name.toUpperCase().includes(term)
            );
        }

        const fragment = document.createDocumentFragment();
        const sortedColors = colorsToShow.slice().sort((a, b) => {
            const numA = parseInt(a.name.replace(/^[A-Z]/, ''));
            const numB = parseInt(b.name.replace(/^[A-Z]/, ''));
            if (numA !== numB) return numA - numB;
            return a.name.localeCompare(b.name);
        });

        sortedColors.forEach(color => {
            const item = document.createElement('div');
            item.className = 'bead-color-item';
            item.dataset.name = color.name;
            item.style.backgroundColor = color.hex;

            const textColor = this.getContrastColor(color.rgb);
            item.innerHTML = `<span class="bead-color-name" style="color: ${textColor}">${color.name}</span>`;

            if (color.hex === this.currentColor) {
                item.classList.add('active');
            }

            item.addEventListener('click', () => {
                this.setColor(color.name);
            });

            fragment.appendChild(item);
        });

        this.gridContainer.innerHTML = '';
        this.gridContainer.appendChild(fragment);
        this.gridContainer.style.gridTemplateColumns = `repeat(${this.columns}, 1fr)`;
    }

    bindEvents() {
        if (this.searchInput) {
            let debounceTimer;
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.searchTerm = e.target.value.trim();
                    this.renderGrid();
                }, 200);
            });
        }

        if (this.groupsContainer) {
            this.groupsContainer.addEventListener('click', (e) => {
                const tab = e.target.closest('.bead-group-tab');
                if (tab) {
                    this.activeGroup = tab.dataset.group;
                    this.renderGroupTabs();
                    this.renderGrid();
                }
            });
        }
    }

    setColor(name) {
        const color = this.allColors.find(c => c.name === name);
        if (!color) return;

        this.currentColor = color.hex;
        this.currentColorName = color.name;

        if (this.currentSwatch) {
            this.currentSwatch.style.backgroundColor = color.hex;
        }
        if (this.currentInfo) {
            this.currentInfo.textContent = `${color.name} · ${color.hex}`;
        }

        this.gridContainer.querySelectorAll('.bead-color-item').forEach(item => {
            item.classList.toggle('active', item.dataset.name === name);
        });

        this.onSelect({
            name: color.name,
            rgb: color.rgb,
            hex: color.hex
        });
    }

    getSelected() {
        if (!this.currentColorName) return null;
        return this.allColors.find(c => c.name === this.currentColorName);
    }

    getSelectedColor() {
        if (!this.currentColorName) return null;
        const color = this.allColors.find(c => c.name === this.currentColorName);
        return color ? {
            name: color.name,
            rgb: color.rgb,
            hex: color.hex
        } : null;
    }

    refresh() {
        this.renderGroupTabs();
        this.renderGrid();
    }

    setSearchTerm(term) {
        this.searchTerm = term;
        if (this.searchInput) {
            this.searchInput.value = term;
        }
        this.renderGrid();
    }

    setGroup(group) {
        this.activeGroup = group;
        this.renderGroupTabs();
        this.renderGrid();
    }
}

window.BeadPalette = BeadPalette;
