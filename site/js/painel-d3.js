/* ==========================================================================
   FECAM — Painel de Gestão: gráficos com D3
   Carregado sob demanda por dashboard.js (depois de d3.v7, d3-sankey e
   rj-municipios.js). Usa dados e funções globais do dashboard.js:
   projectsData, formatCurrency, escapeHtml, STATUS_COLORS, REDUCED_MOTION,
   matchMunicipios, openProjectModal, switchView, clearFilters, applyFilters.
   ========================================================================== */
(function () {
    'use strict';

    const d3 = window.d3;
    let rendered = false;

    const DURATION = REDUCED_MOTION ? 0 : 650;
    const fmtInt = v => Math.round(v).toLocaleString('pt-BR');
    const plural = (n, um, varios) => fmtInt(n) + ' ' + (n === 1 ? um : varios);
    const STATUS_ORDER = Object.keys(STATUS_COLORS);

    // Órgãos com cor própria (a cor segue o órgão); os demais ficam em cinza
    const ORG_COLORS = { INEA: '#178A5F', SEAS: '#2563B0', PSAM: '#CC4F86', CEDAE: '#D99A2B' };
    const ORG_OTHER = '#7B8A84';

    // Escala sequencial (um tom, do claro ao escuro) para o mapa
    const SEQ = ['#E2F1E7', '#B5DEC4', '#7CC29C', '#3E9C70', '#0F6B48'];
    const ZERO_FILL = '#E9EDEA';

    /* ---------------------------------------------------------------
       Dica flutuante (tooltip) compartilhada
       --------------------------------------------------------------- */
    const tip = (() => {
        const el = document.createElement('div');
        el.className = 'd3-tip';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
        const api = {
            show(html, ev) {
                el.innerHTML = html;
                el.classList.add('is-visible');
                api.move(ev);
            },
            move(ev) {
                if (!ev) return;
                const pad = 14;
                const r = el.getBoundingClientRect();
                let x = ev.clientX + pad, y = ev.clientY + pad;
                if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
                if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
                el.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
            },
            hide() { el.classList.remove('is-visible'); }
        };
        window.addEventListener('scroll', api.hide, { passive: true });
        return api;
    })();

    const tipRow = (label, value) =>
        `<div class="d3-tip-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
    const tipTitle = t => `<div class="d3-tip-title">${escapeHtml(t)}</div>`;
    const tipNote = t => `<div class="d3-tip-note">${escapeHtml(t)}</div>`;

    /* ---------------------------------------------------------------
       Estrutura dos cartões
       --------------------------------------------------------------- */
    function makeCard(title, note) {
        const card = document.createElement('div');
        card.className = 'chart-card chart-card-wide d3-card';
        const head = document.createElement('div');
        head.className = 'd3-card-head';
        const h3 = document.createElement('h3');
        h3.textContent = title;
        head.appendChild(h3);
        const tools = document.createElement('div');
        tools.className = 'd3-tools';
        head.appendChild(tools);
        const body = document.createElement('div');
        body.className = 'd3-body';
        card.append(head, body);
        if (note) {
            const p = document.createElement('p');
            p.className = 'chart-note';
            p.textContent = note;
            card.appendChild(p);
        }
        return { card, head, h3, tools, body };
    }

    function segmented(options, value, onChange) {
        const wrap = document.createElement('div');
        wrap.className = 'segmented';
        wrap.setAttribute('role', 'group');
        options.forEach(([val, label]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.setAttribute('aria-pressed', String(val === value));
            b.addEventListener('click', () => {
                wrap.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
                b.setAttribute('aria-pressed', 'true');
                onChange(val);
            });
            wrap.appendChild(b);
        });
        return wrap;
    }

    function textColorOn(hex) {
        const c = d3.color(hex).rgb();
        const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
        return lum > 0.6 ? '#12231B' : '#FFFFFF';
    }

    function fitText(str, maxWidth, charW) {
        const max = Math.floor(maxWidth / (charW || 6.8));
        if (max < 3) return '';
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

    /* ===============================================================
       1. Mapa por município
       =============================================================== */
    function renderMap(container, projects) {
        const geo = window.RJ_MUNICIPIOS;
        const { card, tools, body } = makeCard(
            'Onde estão os projetos',
            'Projetos que atendem vários municípios contam em cada um; no valor, o total do projeto é dividido igualmente entre eles.'
        );
        container.appendChild(card);

        // Agregação por município
        const stats = new Map(geo.features.map(f => [f.properties.nome, { count: 0, value: 0, projects: [] }]));
        const estadual = { count: 0, value: 0 };
        const semMunicipio = { count: 0, value: 0 };
        projects.forEach(p => {
            const r = matchMunicipios(p.municipios);
            if (r.nomes.length) {
                const share = (p.valor_total || 0) / r.nomes.length;
                r.nomes.forEach(n => {
                    const s = stats.get(n);
                    if (!s) return;
                    s.count += 1;
                    s.value += share;
                    s.projects.push(p);
                });
            } else if (r.estadual) {
                estadual.count += 1; estadual.value += p.valor_total || 0;
            } else {
                semMunicipio.count += 1; semMunicipio.value += p.valor_total || 0;
            }
        });

        const MODES = {
            count: {
                label: 'Projetos por município',
                get: s => s.count,
                scale: d3.scaleThreshold().domain([1, 2, 4, 7, 11]).range([ZERO_FILL, ...SEQ]),
                legend: ['1', '2–3', '4–6', '7–10', '11 ou mais'],
                fmt: v => plural(v, 'projeto', 'projetos')
            },
            value: {
                label: 'Valor por município',
                get: s => s.value,
                scale: d3.scaleThreshold().domain([1, 5e6, 25e6, 100e6, 300e6]).range([ZERO_FILL, ...SEQ]),
                legend: ['até R$ 5 mi', 'R$ 5–25 mi', 'R$ 25–100 mi', 'R$ 100–300 mi', 'acima de R$ 300 mi'],
                fmt: v => formatCurrency(v)
            }
        };
        let mode = 'count';
        let selected = null;

        // Layout: mapa + coluna lateral
        const layout = document.createElement('div');
        layout.className = 'map-layout';
        const mapBox = document.createElement('div');
        mapBox.className = 'map-box';
        const aside = document.createElement('div');
        aside.className = 'map-aside';
        layout.append(mapBox, aside);
        body.appendChild(layout);

        const W = Math.max(300, Math.round(mapBox.clientWidth || 700));
        const projection = d3.geoMercator().fitWidth(W - 12, geo);
        const path = d3.geoPath(projection);
        const b = path.bounds(geo);
        projection.translate([projection.translate()[0] + 6, projection.translate()[1] - b[0][1] + 6]);
        const H = Math.ceil(b[1][1] - b[0][1]) + 12;

        const svg = d3.select(mapBox).append('svg')
            .attr('class', 'chart-svg map-svg')
            .attr('viewBox', [0, 0, W, H])
            .attr('width', '100%')
            .attr('role', 'img')
            .attr('aria-label', 'Mapa do Estado do Rio de Janeiro por município');

        // Ordem da animação de entrada: de oeste para leste
        const order = geo.features
            .map(f => [f.properties.nome, path.centroid(f)[0]])
            .sort((a, b2) => a[1] - b2[1])
            .reduce((m, [n], i) => m.set(n, i), new Map());

        const isTouch = window.matchMedia && window.matchMedia('(hover: none)').matches;

        const munis = svg.append('g').attr('class', 'munis')
            .selectAll('path')
            .data(geo.features)
            .join('path')
            .attr('class', 'muni')
            .attr('d', path)
            .style('--i', f => order.get(f.properties.nome))
            .attr('fill', f => MODES[mode].scale(MODES[mode].get(stats.get(f.properties.nome))))
            .on('pointerenter pointermove', (ev, f) => {
                if (ev.pointerType === 'touch') return;
                d3.select(ev.currentTarget).raise().classed('is-hover', true);
                showMuniTip(ev, f);
            })
            .on('pointerleave', ev => {
                d3.select(ev.currentTarget).classed('is-hover', false);
                if (selected) munis.filter(f => f.properties.nome === selected).raise();
                tip.hide();
            })
            .on('click', (ev, f) => {
                const nome = f.properties.nome;
                if (isTouch) showMuniTip(ev, f);
                select(selected === nome ? null : nome);
            });

        function showMuniTip(ev, f) {
            const s = stats.get(f.properties.nome);
            const html = tipTitle(f.properties.nome) +
                tipRow('Projetos', fmtInt(s.count)) +
                tipRow('Valor (rateado)', formatCurrency(s.value)) +
                (s.count ? tipNote('Clique para ver a lista') : '');
            tip.show(html, ev);
        }

        function select(nome) {
            selected = nome;
            munis.classed('is-selected', f => f.properties.nome === nome)
                .classed('is-dim', f => nome && f.properties.nome !== nome);
            if (nome) munis.filter(f => f.properties.nome === nome).raise();
            renderAside();
        }

        function recolor() {
            munis.transition().duration(DURATION).ease(d3.easeCubicOut)
                .delay(f => REDUCED_MOTION ? 0 : order.get(f.properties.nome) * 5)
                .attr('fill', f => MODES[mode].scale(MODES[mode].get(stats.get(f.properties.nome))));
            renderAside();
        }

        tools.appendChild(segmented([['count', 'Nº de projetos'], ['value', 'Valor']], mode, m => { mode = m; recolor(); }));

        function renderAside() {
            const M = MODES[mode];
            aside.replaceChildren();

            // Legenda
            const leg = document.createElement('div');
            leg.className = 'map-legend';
            const lt = document.createElement('div');
            lt.className = 'map-legend-title';
            lt.textContent = M.label;
            leg.appendChild(lt);
            const sw = document.createElement('div');
            sw.className = 'map-legend-scale';
            SEQ.forEach((c, i) => {
                const item = document.createElement('div');
                item.className = 'map-legend-item';
                item.innerHTML = `<span style="background:${c}"></span>${escapeHtml(M.legend[i])}`;
                sw.appendChild(item);
            });
            const zero = document.createElement('div');
            zero.className = 'map-legend-item';
            zero.innerHTML = `<span style="background:${ZERO_FILL}"></span>sem projeto registrado`;
            sw.appendChild(zero);
            leg.appendChild(sw);
            aside.appendChild(leg);

            if (selected) {
                const s = stats.get(selected);
                const box = document.createElement('div');
                box.className = 'map-detail';
                const head = document.createElement('div');
                head.className = 'map-detail-head';
                const h = document.createElement('div');
                h.className = 'map-detail-title';
                h.textContent = selected;
                const close = document.createElement('button');
                close.type = 'button';
                close.className = 'link-btn';
                close.textContent = 'Voltar ao ranking';
                close.addEventListener('click', () => select(null));
                head.append(h, close);
                const sub = document.createElement('div');
                sub.className = 'map-detail-sub';
                sub.textContent = `${plural(s.count, 'projeto', 'projetos')} · ${formatCurrency(s.value)} (rateado)`;
                box.append(head, sub);
                const ul = document.createElement('ul');
                ul.className = 'map-list';
                s.projects.slice().sort((a, b2) => b2.valor_total - a.valor_total).forEach(p => {
                    const li = document.createElement('li');
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.innerHTML = `<i style="background:${STATUS_COLORS[p.status] || ORG_OTHER}"></i>` +
                        `<span>${escapeHtml(p.projeto)}</span><b>${escapeHtml(formatCurrency(p.valor_total))}</b>`;
                    btn.title = p.status;
                    btn.addEventListener('click', () => openProjectModal(p));
                    li.appendChild(btn);
                    ul.appendChild(li);
                });
                if (!s.projects.length) {
                    const li = document.createElement('li');
                    li.className = 'map-empty';
                    li.textContent = 'Nenhum projeto com este município registrado.';
                    ul.appendChild(li);
                }
                box.appendChild(ul);
                aside.appendChild(box);
            } else {
                const box = document.createElement('div');
                box.className = 'map-detail';
                const t = document.createElement('div');
                t.className = 'map-detail-title';
                t.textContent = mode === 'count' ? 'Mais projetos' : 'Maior valor';
                box.appendChild(t);
                const ol = document.createElement('ol');
                ol.className = 'map-rank';
                Array.from(stats, ([nome, s]) => ({ nome, v: M.get(s) }))
                    .filter(x => x.v > 0)
                    .sort((a, b2) => b2.v - a.v)
                    .slice(0, 5)
                    .forEach(x => {
                        const li = document.createElement('li');
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.innerHTML = `<span>${escapeHtml(x.nome)}</span><b>${escapeHtml(mode === 'count' ? fmtInt(x.v) : formatCurrency(x.v))}</b>`;
                        btn.addEventListener('click', () => select(x.nome));
                        li.appendChild(btn);
                        ol.appendChild(li);
                    });
                box.appendChild(ol);
                aside.appendChild(box);
            }

            // Projetos sem município no mapa
            const extra = document.createElement('div');
            extra.className = 'map-extra';
            extra.innerHTML =
                `<div><b>${escapeHtml(plural(estadual.count, 'projeto', 'projetos'))}</b> de abrangência estadual (${escapeHtml(formatCurrency(estadual.value))}) não aparecem no mapa.</div>` +
                (semMunicipio.count ? `<div><b>${escapeHtml(plural(semMunicipio.count, 'projeto', 'projetos'))}</b> sem município informado (${escapeHtml(formatCurrency(semMunicipio.value))}).</div>` : '');
            aside.appendChild(extra);
        }

        renderAside();
    }

    /* ===============================================================
       2. Treemap: valor por órgão e setor (clique para aproximar)
       =============================================================== */
    function renderTreemap(container, projects) {
        const { card, tools, body } = makeCard(
            'Valor por órgão e setor',
            'Cada retângulo é um setor; a área é proporcional ao valor total dos projetos. Clique em um órgão para ver seus setores.'
        );
        container.appendChild(card);

        const crumb = document.createElement('div');
        crumb.className = 'tm-crumb';
        tools.appendChild(crumb);

        const valueBy = d3.rollup(projects, v => d3.sum(v, p => p.valor_total || 0),
            p => p.proponente || 'Não informado', p => p.setor || 'Não informado');
        const countBy = d3.rollup(projects, v => v.length,
            p => p.proponente || 'Não informado', p => p.setor || 'Não informado');
        const data = {
            name: 'Todos os órgãos',
            children: Array.from(valueBy, ([org, setores]) => ({
                name: org,
                children: Array.from(setores, ([setor, value]) => ({
                    name: setor, value, count: countBy.get(org).get(setor)
                }))
            }))
        };

        const W = Math.max(300, Math.round(body.clientWidth || 700));
        const H = W < 600 ? 420 : 440;
        const HEAD = 22;

        const root = d3.hierarchy(data).sum(d => d.value || 0).sort((a, b) => b.value - a.value);
        d3.treemap().size([W, H])
            .paddingTop(n => n.depth === 1 ? HEAD : 0)
            .paddingInner(n => n.depth === 0 ? 4 : 2)
            .round(true)(root);

        const colorOf = n => {
            const org = n.depth === 1 ? n : n.parent;
            return ORG_COLORS[org.data.name] || ORG_OTHER;
        };

        const x = d3.scaleLinear().domain([0, W]).range([0, W]);
        const y = d3.scaleLinear().domain([0, H]).range([0, H]);

        const svg = d3.select(body).append('svg')
            .attr('class', 'chart-svg treemap-svg')
            .attr('viewBox', [0, 0, W, H])
            .attr('width', '100%')
            .attr('role', 'img')
            .attr('aria-label', 'Treemap do valor por órgão e setor');

        const groups = svg.append('g').selectAll('g')
            .data(root.children)
            .join('g')
            .attr('class', 'tm-group');

        groups.append('rect')
            .attr('class', 'tm-group-bg')
            .attr('fill', n => colorOf(n))
            .on('click', (ev, n) => zoomTo(n));

        groups.append('text')
            .attr('class', 'tm-group-label')
            .attr('fill', n => d3.color(colorOf(n)).darker(0.9))
            .on('click', (ev, n) => zoomTo(n));

        const leaves = svg.append('g').selectAll('g')
            .data(root.leaves())
            .join('g')
            .attr('class', 'tm-leaf')
            .style('--i', (n, i) => i)
            .on('pointerenter pointermove', (ev, n) => {
                if (ev.pointerType === 'touch') return;
                tip.show(tipTitle(`${n.parent.data.name} · ${n.data.name}`) +
                    tipRow('Valor', formatCurrency(n.value)) +
                    tipRow('Projetos', fmtInt(n.data.count)) +
                    tipRow('Participação', (n.value / root.value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'), ev);
            })
            .on('pointerleave', () => tip.hide())
            .on('click', (ev, n) => { if (focus === root) zoomTo(n.parent); });

        leaves.append('rect')
            .attr('fill', n => colorOf(n));

        const leafText = leaves.append('text').attr('class', 'tm-label');
        leafText.append('tspan').attr('class', 'tm-name');
        leafText.append('tspan').attr('class', 'tm-value');

        let focus = root;

        function layout(animate) {
            const t = svg.transition().duration(animate ? DURATION : 0).ease(d3.easeCubicInOut);
            const zoomed = focus !== root;

            groups.select('rect')
                .transition(t)
                .attr('x', n => x(n.x0)).attr('y', n => y(n.y0))
                .attr('width', n => Math.max(0, x(n.x1) - x(n.x0)))
                .attr('height', n => Math.max(0, y(n.y1) - y(n.y0)))
                .attr('fill-opacity', zoomed ? 0 : 0.14);

            groups.select('text')
                .text(n => {
                    const w = x(n.x1) - x(n.x0);
                    return fitText(`${n.data.name} · ${formatCurrency(n.value)}`, w - 10, 6.9);
                })
                .transition(t)
                .attr('x', n => x(n.x0) + 6)
                .attr('y', n => y(n.y0) + 15)
                .attr('opacity', n => (!zoomed && y(n.y1) - y(n.y0) > HEAD + 4) ? 1 : 0);

            leaves.select('rect')
                .transition(t)
                .attr('x', n => x(n.x0)).attr('y', n => y(n.y0))
                .attr('width', n => Math.max(0, x(n.x1) - x(n.x0)))
                .attr('height', n => Math.max(0, y(n.y1) - y(n.y0)));

            leafText
                .attr('fill', n => textColorOn(colorOf(n)))
                .transition(t)
                .attr('transform', n => `translate(${x(n.x0) + 7},${y(n.y0) + 17})`);

            leafText.select('.tm-name').text(n => {
                const w = x(n.x1) - x(n.x0), h = y(n.y1) - y(n.y0);
                return (w > 34 && h > 22) ? fitText(n.data.name, w - 12, 7.4) : '';
            });
            leafText.select('.tm-value')
                .attr('x', 0).attr('dy', 17)
                .text(n => {
                    const w = x(n.x1) - x(n.x0), h = y(n.y1) - y(n.y0);
                    return (w > 64 && h > 42) ? fitText(formatCurrency(n.value), w - 12, 6.6) : '';
                });

            leaves.classed('is-clickable', !zoomed);
            groups.classed('is-clickable', !zoomed);
            renderCrumb();
        }

        function zoomTo(n) {
            if (!n || n === focus) return;
            focus = n;
            tip.hide();
            x.domain([n.x0, n.x1]);
            y.domain([n === root ? n.y0 : n.y0 + HEAD, n.y1]);
            layout(true);
        }

        function renderCrumb() {
            crumb.replaceChildren();
            const all = document.createElement('button');
            all.type = 'button';
            all.className = 'link-btn';
            all.textContent = 'Todos os órgãos';
            all.disabled = focus === root;
            all.addEventListener('click', () => zoomTo(root));
            crumb.appendChild(all);
            if (focus !== root) {
                const sep = document.createElement('span');
                sep.className = 'tm-crumb-sep';
                sep.textContent = '/';
                const cur = document.createElement('span');
                cur.className = 'tm-crumb-cur';
                cur.textContent = `${focus.data.name} · ${formatCurrency(focus.value)}`;
                crumb.append(sep, cur);
            }
        }

        layout(false);
    }

    /* ===============================================================
       3. Linha do tempo (com aproximação por seleção)
       =============================================================== */
    function renderTimeline(container, projects) {
        const { card, tools, body } = makeCard(
            'Linha do tempo dos projetos',
            'Cada ponto é um projeto, pelo ano de aprovação e valor total (escala logarítmica). Arraste na faixa de baixo para aproximar um período; no computador, Ctrl + rolagem também aproxima. Clique em um ponto para ver os detalhes.'
        );
        container.appendChild(card);

        const pts = projects
            .map(p => ({ p, year: parseInt(p.ano_aprovacao, 10), v: p.valor_total || 0 }))
            .filter(d => d.year > 1900 && d.v > 0);
        if (!pts.length) { body.textContent = 'Sem dados.'; return; }

        // Deslocamento horizontal fixo por projeto (evita sobreposição no mesmo ano)
        const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
        pts.forEach(d => { d.jit = (hash(String(d.p.processo || d.p.projeto)) - 0.5) * 0.64; });

        const legend = document.createElement('div');
        legend.className = 'tl-legend';
        STATUS_ORDER.forEach(s => {
            const n = pts.filter(d => d.p.status === s).length;
            if (!n) return;
            const it = document.createElement('span');
            it.innerHTML = `<i style="background:${STATUS_COLORS[s]}"></i>${escapeHtml(s)} <em>${fmtInt(n)}</em>`;
            legend.appendChild(it);
        });
        body.appendChild(legend);

        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'link-btn';
        reset.textContent = 'Ver todo o período';
        reset.hidden = true;
        tools.appendChild(reset);

        const W = Math.max(300, Math.round(body.clientWidth || 700));
        const m = { top: 12, right: 14, bottom: 26, left: 66 };
        const H = W < 600 ? 300 : 340;
        const H2 = 64;
        const iw = W - m.left - m.right, ih = H - m.top - m.bottom;

        const years = d3.extent(pts, d => d.year);
        const x2 = d3.scaleLinear().domain([years[0] - 0.6, years[1] + 0.6]).range([0, iw]);
        const x = x2.copy();
        const yMin = d3.min(pts, d => d.v), yMax = d3.max(pts, d => d.v);
        const y = d3.scaleLog().domain([yMin / 1.6, yMax * 1.6]).range([ih, 0]);
        // Rótulos redondos no eixo: R$ 100 mil, R$ 1 mi, R$ 10 mi, R$ 1 bi
        const axisMoney = v => v >= 1e9 ? `R$ ${v / 1e9} bi` : v >= 1e6 ? `R$ ${v / 1e6} mi` : `R$ ${v / 1e3} mil`;

        const svg = d3.select(body).append('svg')
            .attr('class', 'chart-svg timeline-svg')
            .attr('viewBox', [0, 0, W, H + H2 + 18])
            .attr('width', '100%')
            .attr('role', 'img')
            .attr('aria-label', 'Linha do tempo dos projetos por ano de aprovação e valor');

        const clipId = 'tl-clip';
        svg.append('defs').append('clipPath').attr('id', clipId)
            .append('rect').attr('x', -8).attr('y', -8).attr('width', iw + 16).attr('height', ih + 16);

        const focusG = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

        // Eixo Y (valores)
        const yTicks = [1e5, 1e6, 1e7, 1e8, 1e9, 1e10].filter(v => v >= y.domain()[0] && v <= y.domain()[1]);
        const yAxis = focusG.append('g').attr('class', 'tl-axis tl-axis-y');
        yAxis.selectAll('line').data(yTicks).join('line')
            .attr('x1', 0).attr('x2', iw).attr('y1', y).attr('y2', y);
        yAxis.selectAll('text').data(yTicks).join('text')
            .attr('x', -10).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end')
            .text(axisMoney);

        const xAxisG = focusG.append('g').attr('class', 'tl-axis tl-axis-x').attr('transform', `translate(0,${ih})`);

        const yearIndex = new Map(Array.from(new Set(pts.map(d => d.year))).sort().map((yr, i) => [yr, i]));

        const dotsG = focusG.append('g').attr('clip-path', `url(#${clipId})`);
        const dots = dotsG.selectAll('circle')
            .data(pts.sort((a, b) => b.v - a.v))
            .join('circle')
            .attr('class', 'tl-dot')
            .attr('r', W < 600 ? 4.5 : 5.5)
            .attr('cy', d => y(d.v))
            .attr('fill', d => STATUS_COLORS[d.p.status] || ORG_OTHER)
            .style('--i', d => yearIndex.get(d.year))
            .on('pointerenter pointermove', (ev, d) => {
                if (ev.pointerType === 'touch') return;
                d3.select(ev.currentTarget).raise().classed('is-hover', true);
                tip.show(tipTitle(d.p.projeto) +
                    tipRow('Aprovação', String(d.year)) +
                    tipRow('Valor total', formatCurrency(d.v)) +
                    tipRow('Situação', d.p.status) +
                    tipRow('Órgão', d.p.proponente || '-'), ev);
            })
            .on('pointerleave', ev => { d3.select(ev.currentTarget).classed('is-hover', false); tip.hide(); })
            .on('click', (ev, d) => { tip.hide(); openProjectModal(d.p); });

        // Faixa de contexto: projetos por ano + seleção
        const ctxG = svg.append('g').attr('class', 'tl-context').attr('transform', `translate(${m.left},${H + 4})`);
        const perYear = d3.rollups(pts, v => v.length, d => d.year);
        const yc = d3.scaleLinear().domain([0, d3.max(perYear, d => d[1])]).range([H2 - 18, 0]);
        const bw = Math.max(2, Math.min(14, iw / (years[1] - years[0] + 2) * 0.6));
        ctxG.append('rect').attr('class', 'tl-context-bg').attr('width', iw).attr('height', H2 - 18);
        ctxG.selectAll('.tl-bar').data(perYear).join('rect')
            .attr('class', 'tl-bar')
            .attr('x', d => x2(d[0]) - bw / 2).attr('width', bw)
            .attr('y', d => yc(d[1])).attr('height', d => yc(0) - yc(d[1]));
        const ctxAxis = ctxG.append('g').attr('class', 'tl-axis tl-axis-x').attr('transform', `translate(0,${H2 - 18})`);
        drawXAxis(ctxAxis, x2, iw < 500 ? 5 : 10, false);

        function drawXAxis(g, scale, approx, grid) {
            const [a, b] = scale.domain();
            const span = b - a;
            const step = span <= 6 ? 1 : span <= 14 ? 2 : 5;
            const ticks = d3.range(Math.ceil(a / step) * step, b, step).filter(t => t >= a && t <= b);
            g.selectAll('text').data(ticks, t => t).join('text')
                .attr('x', scale).attr('y', 18).attr('text-anchor', 'middle')
                .text(t => String(t));
            if (grid) {
                g.selectAll('line').data(ticks, t => t).join('line')
                    .attr('x1', scale).attr('x2', scale).attr('y1', -ih).attr('y2', 0);
            }
        }

        function update() {
            dots.attr('cx', d => x(d.year + d.jit));
            drawXAxis(xAxisG, x, 10, true);
            const full = x2.domain();
            const cur = x.domain();
            reset.hidden = Math.abs(cur[0] - full[0]) < 0.01 && Math.abs(cur[1] - full[1]) < 0.01;
        }

        const brush = d3.brushX()
            .extent([[0, 0], [iw, H2 - 18]])
            .on('brush end', brushed);
        const brushG = ctxG.append('g').attr('class', 'tl-brush').call(brush);

        const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
        const zoom = d3.zoom()
            .scaleExtent([1, 20])
            .translateExtent([[0, 0], [iw, ih]])
            .extent([[0, 0], [iw, ih]])
            .filter(ev => ev.type === 'wheel' ? (ev.ctrlKey || ev.metaKey) : (ev.type === 'mousedown' && ev.button === 0))
            .on('zoom', zoomed);
        const zoomRect = focusG.insert('rect', ':first-child')
            .attr('class', 'tl-zoom')
            .attr('width', iw).attr('height', ih);
        if (fine) zoomRect.call(zoom).on('dblclick.zoom', null);

        // Seleção na faixa e zoom no gráfico ficam sincronizados (a trava evita o vai e volta)
        let syncing = false;

        function brushed(ev) {
            if (syncing) return;
            const s = ev.selection || x2.range();
            x.domain(s.map(x2.invert, x2));
            update();
            if (fine) {
                syncing = true;
                zoomRect.call(zoom.transform, d3.zoomIdentity.scale(iw / (s[1] - s[0])).translate(-s[0], 0));
                syncing = false;
            }
        }

        function zoomed(ev) {
            if (syncing) return;
            const t = ev.transform;
            x.domain(t.rescaleX(x2).domain());
            update();
            syncing = true;
            brushG.call(brush.move, t.k <= 1.0001 ? null : x.range().map(t.invertX, t));
            syncing = false;
        }

        reset.addEventListener('click', () => {
            const from = x.domain(), to = x2.domain();
            if (REDUCED_MOTION) { brushG.call(brush.move, null); return; }
            d3.select(body).transition().duration(DURATION).tween('reset', () => {
                const i = d3.interpolate(from, to);
                return k => { x.domain(i(k)); update(); };
            }).on('end', () => brushG.call(brush.move, null));
        });

        update();
    }

    /* ===============================================================
       4. Fluxo: origem do valor → situação → prestação de contas
       =============================================================== */
    function renderSankey(container, projects) {
        const { card, body } = makeCard(
            'Do valor aprovado à prestação de contas',
            'Valor total = valor aprovado + complementos. A prestação de contas de cada projeto é limitada ao seu valor total.'
        );
        container.appendChild(card);

        const statuses = STATUS_ORDER.filter(s => projects.some(p => p.status === s));
        const nodes = [
            { id: 'aprovado', name: 'Valor aprovado', color: '#0B4431' },
            { id: 'complemento', name: 'Complementos', color: '#7CC29C' },
            ...statuses.map(s => ({ id: 'st:' + s, name: s, color: STATUS_COLORS[s] })),
            { id: 'pc', name: 'Com prestação de contas', color: '#0F6B48' },
            { id: 'sem', name: 'Sem prestação de contas', color: '#B9C4BE' }
        ];
        const sums = new Map();
        const add = (s, t, v) => { if (v > 0) sums.set(s + '>' + t, (sums.get(s + '>' + t) || 0) + v); };
        projects.forEach(p => {
            const st = 'st:' + p.status;
            if (!statuses.includes(p.status)) return;
            const total = p.valor_total || 0;
            const pc = Math.min(p.prestacao_contas || 0, total);
            add('aprovado', st, p.valor_aprovado || 0);
            add('complemento', st, p.complemento || 0);
            add(st, 'pc', pc);
            add(st, 'sem', total - pc);
        });
        const links = Array.from(sums, ([k, value]) => { const [source, target] = k.split('>'); return { source, target, value }; });

        // Em telas estreitas o fluxo mantém 600px e rola na horizontal (os rótulos não cabem menores)
        const avail = Math.round(body.clientWidth || 700);
        const W = Math.max(600, avail);
        const H = 400;
        const scrolls = avail < 600;
        if (scrolls) body.classList.add('d3-scroll');

        const sankey = d3.sankey()
            .nodeId(d => d.id)
            .nodeAlign(d3.sankeyJustify)
            .nodeWidth(14)
            .nodePadding(22)
            .nodeSort(null)
            .extent([[1, 8], [W - 1, H - 8]]);
        const graph = sankey({ nodes: nodes.map(d => ({ ...d })), links: links.map(d => ({ ...d })) });

        const svg = d3.select(body).append('svg')
            .attr('class', 'chart-svg sankey-svg')
            .attr('viewBox', [0, 0, W, H])
            .attr('width', scrolls ? W : '100%')
            .attr('role', 'img')
            .attr('aria-label', 'Fluxo do valor aprovado até a prestação de contas');

        const linkColor = l => l.source.id.startsWith('st:') ? l.source.color : l.target.color;

        svg.append('g').attr('class', 'sk-links')
            .selectAll('path')
            .data(graph.links)
            .join('path')
            .attr('class', 'sk-link')
            .attr('d', d3.sankeyLinkHorizontal())
            .attr('pathLength', 1)
            .attr('stroke', linkColor)
            .attr('stroke-width', l => Math.max(1, l.width))
            .style('--i', (l, i) => i)
            .on('pointerenter pointermove', (ev, l) => {
                if (ev.pointerType === 'touch') return;
                d3.select(ev.currentTarget).classed('is-hover', true);
                tip.show(tipTitle(`${l.source.name} → ${l.target.name}`) +
                    tipRow('Valor', formatCurrency(l.value)) +
                    tipRow('Do total', (l.value / d3.sum(graph.nodes.filter(n => n.depth === 0), n => n.value) * 100)
                        .toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'), ev);
            })
            .on('pointerleave', ev => { d3.select(ev.currentTarget).classed('is-hover', false); tip.hide(); });

        const nodeG = svg.append('g').attr('class', 'sk-nodes')
            .selectAll('g')
            .data(graph.nodes)
            .join('g')
            .attr('class', 'sk-node')
            .style('--i', n => n.depth);

        nodeG.append('rect')
            .attr('x', n => n.x0).attr('y', n => n.y0)
            .attr('width', n => n.x1 - n.x0)
            .attr('height', n => Math.max(1, n.y1 - n.y0))
            .attr('fill', n => n.color)
            .on('pointerenter pointermove', (ev, n) => {
                if (ev.pointerType === 'touch') return;
                tip.show(tipTitle(n.name) + tipRow('Valor', formatCurrency(n.value)), ev);
            })
            .on('pointerleave', () => tip.hide());

        const label = nodeG.append('text')
            .attr('class', 'sk-label')
            .attr('x', n => n.x0 < W / 2 ? n.x1 + 8 : n.x0 - 8)
            .attr('y', n => (n.y0 + n.y1) / 2)
            .attr('text-anchor', n => n.x0 < W / 2 ? 'start' : 'end');
        label.append('tspan').attr('class', 'sk-name').attr('dy', n => (n.y1 - n.y0) > 30 ? '-0.25em' : '0.32em').text(n => n.name);
        label.append('tspan').attr('class', 'sk-value')
            .attr('x', n => n.x0 < W / 2 ? n.x1 + 8 : n.x0 - 8)
            .attr('dy', '1.25em')
            .text(n => (n.y1 - n.y0) > 30 ? formatCurrency(n.value) : '');
    }

    /* ===============================================================
       Montagem no Painel
       =============================================================== */
    window.renderPainelD3 = function () {
        if (rendered) return;
        const pane = document.getElementById('viewGraficos');
        if (!pane || pane.style.display === 'none' || !window.RJ_MUNICIPIOS || !d3 || !d3.sankey) return;
        rendered = true;

        const data = projectsData;

        // Mapa, treemap e linha do tempo logo abaixo dos números do topo
        const grid = document.createElement('div');
        grid.className = 'charts-grid d3-grid';
        const kpiRow = pane.querySelector('.charts-kpi-row');
        if (kpiRow) kpiRow.after(grid); else pane.prepend(grid);

        // O fluxo entra na seção de Prestação de Contas
        const pcTitle = Array.from(pane.querySelectorAll('.chart-section-title'))
            .find(el => /presta/i.test(el.textContent));
        const pcGrid = document.createElement('div');
        pcGrid.className = 'charts-grid d3-grid';
        if (pcTitle) pcTitle.after(pcGrid); else pane.appendChild(pcGrid);

        const run = (fn, where) => {
            try { fn(where, data); } catch (err) { console.error('Painel D3:', err); }
        };
        run(renderMap, grid);
        run(renderTreemap, grid);
        run(renderTimeline, grid);
        run(renderSankey, pcGrid);
    };
})();
