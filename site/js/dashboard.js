// Dados completos do FECAM (amostra expandida)
        let projectsData = [];

        // Inicializar dashboard
        function initDashboard() {
            enhanceUI();

            try {
                const dataElement = document.getElementById('projectsData');
                if (!dataElement) throw new Error('Bloco projectsData não encontrado');
                projectsData = JSON.parse(dataElement.textContent);
                if (!Array.isArray(projectsData)) throw new Error('Formato de dados inválido');
            } catch (error) {
                console.error('Falha ao carregar os dados incorporados ao HTML:', error);
                const container = document.getElementById('tableContainer');
                container.textContent = 'Não foi possível carregar os dados do dashboard.';
                document.getElementById('noResults').style.display = 'none';
                return;
            }

            updateKPIs();
            updateStats();
            populateSectorFilter();
            populateProponentFilter();
            populateYearFilter();
            renderTable(getFilteredData());
            attachFilterListeners();
        }

        function updateKPIs() {
            // Total sempre baseado em projectsData completo
            const totalGeral = projectsData.length;
            document.getElementById('totalProjects').textContent = totalGeral;
            
            if (kpiFilterStatus === 'all') {
                // Mostrar todos os valores
                const executing = projectsData.filter(p => p.status === 'Em Execução').length;
                const notStarted = projectsData.filter(p => p.status === 'Não Iniciado').length;
                const stopped = projectsData.filter(p => p.status === 'Parado').length;
                const canceled = projectsData.filter(p => p.status === 'Cancelado').length;
                
                document.getElementById('executingProjects').textContent = executing;
                document.getElementById('notStartedProjects').textContent = notStarted;
                document.getElementById('stoppedProjects').textContent = stopped;
                document.getElementById('canceledProjects').textContent = canceled;
            } else {
                // Quando filtrado, mostrar apenas o valor do filtro selecionado
                const data = getFilteredData();
                document.getElementById('executingProjects').textContent = kpiFilterStatus === 'Em Execução' ? data.length : '';
                document.getElementById('notStartedProjects').textContent = kpiFilterStatus === 'Não Iniciado' ? data.length : '';
                document.getElementById('stoppedProjects').textContent = kpiFilterStatus === 'Parado' ? data.length : '';
                document.getElementById('canceledProjects').textContent = kpiFilterStatus === 'Cancelado' ? data.length : '';
            }
            
            updateKpiHint();
        }

        function updateStats() {
            const data = getFilteredData();

            // Investimento Total recalculado com dados filtrados
            const totalValue = data.reduce((sum, p) => sum + p.valor_total, 0);
            tweenValue(document.getElementById('totalValue'), totalValue, formatCurrency);
        }

        function populateSectorFilter(proponent) {
            const select = document.getElementById('sectorFilter');
            const selecionadoAtual = select.value;

            // Setores dos projetos do proponente escolhido (ou todos, se nenhum)
            const base = proponent
                ? projectsData.filter(p => p.proponente === proponent)
                : projectsData;
            const sectors = [...new Set(base.map(p => p.setor))].sort();

            // Reconstruir opções mantendo "Todos"
            select.innerHTML = '<option value="">Todos</option>';
            sectors.forEach(sector => {
                const option = document.createElement('option');
                option.value = sector;
                option.textContent = sector;
                select.appendChild(option);
            });

            // Preservar seleção anterior se ainda for válida
            if (sectors.includes(selecionadoAtual)) {
                select.value = selecionadoAtual;
            } else {
                select.value = '';
            }
        }

        function onProponentChange() {
            const proponent = document.getElementById('proponentFilter').value;
            populateSectorFilter(proponent);
            applyFilters();
        }

        function extractYearFromProcess(processo) {
            // Formato: SEI-XXXXXX/XXXXXX/YYYY ou E-07/XXX/YY
            const parts = processo.split('/');
            const year = parts[parts.length - 1];
            // Se for 2 dígitos, adicionar 20 na frente (ex: 12 → 2012)
            if (year.length === 2) {
                return '20' + year;
            }
            return year;
        }

        // Adicionar ano de aprovação a cada projeto
        projectsData.forEach(project => {
            if (!project.ano_aprovacao) {
                project.ano_aprovacao = extractYearFromProcess(project.processo);
            }
        });

        function populateProponentFilter() {
            const proponents = [...new Set(projectsData.map(p => p.proponente))].sort();
            const select = document.getElementById('proponentFilter');
            proponents.forEach(proponent => {
                const option = document.createElement('option');
                option.value = proponent;
                option.textContent = proponent;
                select.appendChild(option);
            });
        }

        function populateYearFilter() {
            const years = [...new Set(projectsData.map(p => p.ano_aprovacao))].sort().reverse();
            const select = document.getElementById('yearFilter');
            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                select.appendChild(option);
            });
        }

        function attachFilterListeners() {
            document.getElementById('statusFilter').addEventListener('change', applyFilters);
            document.getElementById('sectorFilter').addEventListener('change', applyFilters);
            document.getElementById('proponentFilter').addEventListener('change', onProponentChange);
            document.getElementById('yearFilter').addEventListener('change', applyFilters);
            document.getElementById('searchInput').addEventListener('input', applyFilters);
        }

        function applyFilters() {
            const statusFilter = document.getElementById('statusFilter').value;
            const sectorFilter = document.getElementById('sectorFilter').value;
            const proponentFilter = document.getElementById('proponentFilter').value;
            const yearFilter = document.getElementById('yearFilter').value;
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();

            let filtered = getFilteredData();
            
            filtered = filtered.filter(item => {
                const matchStatus = !statusFilter || item.status === statusFilter;
                const matchSector = !sectorFilter || item.setor === sectorFilter;
                const matchProponent = !proponentFilter || item.proponente === proponentFilter;
                const matchYear = !yearFilter || item.ano_aprovacao === yearFilter;
                const matchSearch = !searchTerm || 
                    item.projeto.toLowerCase().includes(searchTerm) || 
                    item.processo.toLowerCase().includes(searchTerm) ||
                    item.municipios.toLowerCase().includes(searchTerm) ||
                    (item.processos_prestacao || '').toLowerCase().includes(searchTerm);
                return matchStatus && matchSector && matchProponent && matchYear && matchSearch;
            });

            // Aplicar ordenação
            if (sortColumn) {
                filtered.sort((a, b) => {
                    let aVal = a[sortColumn];
                    let bVal = b[sortColumn];
                    
                    // Se for número, comparar numericamente
                    if (typeof aVal === 'number' && typeof bVal === 'number') {
                        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                    }
                    
                    // Se for string, comparar alfabeticamente
                    aVal = String(aVal).toLowerCase();
                    bVal = String(bVal).toLowerCase();
                    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                });
            }
renderTable(filtered);
            document.getElementById('resultCount').textContent = `(${filtered.length})`;
            updateKPIs();
            updateStats();
        }

        let currentData = [];

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }


        function renderTable(data) {
            currentData = data;
            const container = document.getElementById('tableContainer');
            const noResults = document.getElementById('noResults');

            if (data.length === 0) {
                container.innerHTML = '';
                noResults.style.display = 'block';
                return;
            }

            noResults.style.display = 'none';

            // Função para adicionar símbolo à coluna
            const getSymbol = (column) => {
                if (sortColumn === column) {
                    return sortDirection === 'asc' ? ' ↑' : ' ↓';
                }
                return '';
            };

            let html = '<table>';
            html += `
                <thead>
                    <tr>
                        <th onclick="sortTable('projeto')" style="cursor: pointer;">Projeto${getSymbol('projeto')}</th>
                        <th onclick="sortTable('ano_aprovacao')" style="cursor: pointer; text-align: center;">Ano da Aprovação${getSymbol('ano_aprovacao')}</th>
                        <th onclick="sortTable('valor_total')" style="cursor: pointer;">Valor Total${getSymbol('valor_total')}</th>
                        <th onclick="sortTable('prestacao_contas')" style="cursor: pointer;">Prestação de Contas${getSymbol('prestacao_contas')}</th>
                        <th style="text-align: center; cursor: pointer;" onclick="sortTable('status')">Status${getSymbol('status')}</th>
                    </tr>
                </thead>
                <tbody>
            `;

            data.forEach((project, idx) => {
                const statusClass = project.status === 'Em Execução' ? 'status-executing' : 
                                   project.status === 'Cancelado' ? 'status-canceled' : 
                                   project.status === 'Parado' ? 'status-parado' : 'status-not-started';
                html += `
                    <tr onclick="openModal(${idx})" tabindex="0" onkeydown="if(event.key==='Enter'){openModal(${idx})}">
                        <td><strong>${escapeHtml(project.projeto)}</strong></td>
                        <td style="text-align: center;">${escapeHtml(project.ano_aprovacao || '-')}</td>
                        <td>${formatCurrency(project.valor_total)}</td>
                        <td>${formatCurrency(project.prestacao_contas || 0)}</td>
                        <td style="text-align: center;"><span class="status-badge ${statusClass}">${escapeHtml(project.status)}</span></td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        }

        // Estado global do filtro por KPI
        let kpiFilterStatus = 'all';

        // Estado de ordenação
        let sortColumn = null;
        let sortDirection = 'asc'; // 'asc' ou 'desc'

        function sortTable(column) {
            // Se clicar na mesma coluna, inverte direção
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            
            applyFilters();
        }

        function clearFilters() {
            // Resetar campos de filtro e busca
            document.getElementById('statusFilter').value = '';
            document.getElementById('sectorFilter').value = '';
            document.getElementById('proponentFilter').value = '';
            document.getElementById('yearFilter').value = '';
            document.getElementById('searchInput').value = '';

            // Restaurar lista completa de setores
            populateSectorFilter();

            // Resetar filtro por KPI e ordenação
            kpiFilterStatus = 'all';
            sortColumn = null;
            sortDirection = 'asc';

            // Resetar visual dos cards de KPI
            document.querySelectorAll('.kpi-card').forEach(card => {
                card.classList.remove('active', 'dimmed', 'inactive');
            });

            // Recarregar tudo
            updateKPIs();
            updateStats();
            applyFilters();
        }

        function filterByKPI(status) {
            // Se clicar na mesma caixa, reseta (toggle)
            if (kpiFilterStatus === status) {
                kpiFilterStatus = 'all';
            } else {
                kpiFilterStatus = status;
            }
            
            // Atualizar visual dos cards
            document.querySelectorAll('.kpi-card').forEach((card) => {
                const cardStatus = card.dataset.status;
                // Card estático (Investimento Total) não participa do filtro visual
                if (!cardStatus) return;

                card.classList.remove('active');
                card.classList.remove('dimmed');

                // Card Total (all) nunca fica inativo
                if (cardStatus === 'all') {
                    card.classList.remove('inactive');
                } else if (kpiFilterStatus !== 'all') {
                    card.classList.add('inactive');
                    if (cardStatus === kpiFilterStatus) {
                        card.classList.add('active');
                        card.classList.remove('dimmed');
                    } else {
                        card.classList.add('dimmed');
                    }
                } else {
                    card.classList.remove('inactive');
                }
            });
            
            // Limpar filtros de busca
            document.getElementById('statusFilter').value = '';
            document.getElementById('sectorFilter').value = '';
            document.getElementById('proponentFilter').value = '';
            document.getElementById('yearFilter').value = '';
            document.getElementById('searchInput').value = '';
            
            // Recarregar página
            updateKPIs();
            updateStats();
            applyFilters();
        }

        function getFilteredData() {
            let filtered = projectsData;
            
            if (kpiFilterStatus !== 'all') {
                filtered = filtered.filter(p => p.status === kpiFilterStatus);
            }
            
            return filtered;
        }

        // Funções do Modal
        function openModal(projectIndex) {
            openProjectModal(currentData[projectIndex]);
        }

        function openProjectModal(project) {
            if (!project) return;
            
            // Preencher campos do modal
            document.getElementById('modalProject').textContent = project.projeto;
            document.getElementById('modalProcesso').textContent = project.processo;
            document.getElementById('modalProponente').textContent = project.proponente;
            document.getElementById('modalSetor').textContent = project.setor;
            document.getElementById('modalValorAprovado').textContent = formatCurrencyFull(project.valor_aprovado);
            document.getElementById('modalEmpenhoTotal').textContent = formatCurrencyFull(project.empenho_total || 0);
            document.getElementById('modalEmpenho').textContent = formatCurrencyFull(project.empenho_2026);
            document.getElementById('modalMunicipios').textContent = project.municipios;
            document.getElementById('modalComplemento').textContent = formatCurrencyFull(project.complemento || 0);
            document.getElementById('modalPrestacao').textContent = formatCurrencyFull(project.prestacao_contas || 0);

            // Processos de prestação de contas: lista separada por ";" ou "Nenhum"
            const processos = (project.processos_prestacao || '').trim();
            if (processos) {
                const lista = processos.split(';').map(p => p.trim()).filter(Boolean);
                const containerProcessos = document.getElementById('modalProcessosPrestacao');
                containerProcessos.replaceChildren();
                lista.forEach(p => {
                    const item = document.createElement('div');
                    item.textContent = p;
                    containerProcessos.appendChild(item);
                });
            } else {
                document.getElementById('modalProcessosPrestacao').textContent = 'Nenhum registrado';
            }
            
            // Status com cor
            const statusClass = project.status === 'Em Execução' ? 'status-executing' : 
                               project.status === 'Cancelado' ? 'status-canceled' : 
                               project.status === 'Parado' ? 'status-parado' : 'status-not-started';
            const statusContainer = document.getElementById('modalStatusContainer');
            statusContainer.replaceChildren();
            const statusBadge = document.createElement('div');
            statusBadge.className = `status-badge status-badge-large ${statusClass}`;
            statusBadge.textContent = project.status;
            statusContainer.appendChild(statusBadge);
            
            // Mostrar modal
            document.getElementById('projectModal').classList.add('show');
            document.body.style.overflow = 'hidden';
        }

        function closeModal() {
            document.getElementById('projectModal').classList.remove('show');
            document.body.style.overflow = 'auto';
        }

        // Fechar modal ao clicar fora dele
        document.addEventListener('DOMContentLoaded', function() {
            const modal = document.getElementById('projectModal');
            window.addEventListener('click', function(event) {
                if (event.target == modal) {
                    closeModal();
                }
            });
            
            // Fechar com tecla ESC
            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    closeModal();
                }
            });
        });

        function downloadCSV() {
            const dados = (currentData && currentData.length) ? currentData : projectsData;

            // Cabeçalhos e mapeamento de cada coluna
            const cabecalhos = ['Processo', 'Projeto', 'Proponente', 'Setor', 'Ano Aprovação',
                'Municípios Atendidos', 'Valor Aprovado (R$)', 'Valor Total (R$)', 'Complemento (R$)',
                'Total Empenhado (R$)', 'Valor Empenhado 2026 (R$)', 'Prestação de Contas (R$)',
                'Processos Prest. de Contas', 'Status'];

            // Escapar campo conforme regras de CSV (aspas, vírgula, quebra de linha)
            const esc = (v) => {
                let s = (v === null || v === undefined) ? '' : String(v);
                if (s.includes('"') || s.includes(';') || s.includes(',') || s.includes('\n')) {
                    s = '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            };

            // Usa ponto-e-vírgula como separador (padrão do Excel em português)
            const linhas = [cabecalhos.join(';')];
            dados.forEach(p => {
                linhas.push([
                    esc(p.processo),
                    esc(p.projeto),
                    esc(p.proponente),
                    esc(p.setor),
                    esc(p.ano_aprovacao || ''),
                    esc(p.municipios),
                    esc((p.valor_aprovado || 0).toFixed(2).replace('.', ',')),
                    esc((p.valor_total || 0).toFixed(2).replace('.', ',')),
                    esc((p.complemento || 0).toFixed(2).replace('.', ',')),
                    esc((p.empenho_total || 0).toFixed(2).replace('.', ',')),
                    esc((p.empenho_2026 || 0).toFixed(2).replace('.', ',')),
                    esc((p.prestacao_contas || 0).toFixed(2).replace('.', ',')),
                    esc(p.processos_prestacao || ''),
                    esc(p.status)
                ].join(';'));
            });

            // BOM UTF-8 para acentos corretos no Excel
            const csv = '\uFEFF' + linhas.join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);

            const hoje = new Date().toISOString().slice(0, 10);
            const link = document.createElement('a');
            link.href = url;
            link.download = `FECAM_projetos_${hoje}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        // Valor abreviado no padrão brasileiro: R$ 14,6 bi · R$ 350 mi · R$ 2,5 mi · R$ 80 mil
        function currencyUnit(value) {
            const v = Math.abs(Number(value) || 0);
            if (v >= 1e9) return { div: 1e9, suffix: ' bi', dec: 1 };
            if (v >= 1e6) return { div: 1e6, suffix: ' mi', dec: v < 1e7 ? 1 : 0 };
            if (v >= 1e3) return { div: 1e3, suffix: ' mil', dec: 0 };
            return { div: 1, suffix: '', dec: 0 };
        }

        function formatInUnit(value, unit) {
            const n = (Number(value) || 0) / unit.div;
            return 'R$ ' + n.toLocaleString('pt-BR', {
                minimumFractionDigits: unit.dec,
                maximumFractionDigits: unit.dec
            }) + unit.suffix;
        }

        function formatCurrency(value) {
            return formatInUnit(value, currencyUnit(value));
        }

        // Valor completo com centavos no padrão brasileiro (R$ 1.234.567,89)
        function formatCurrencyFull(value) {
            return 'R$ ' + (Number(value) || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }

        // ===== Painel de Gestão (gráficos) =====
        let chartsRendered = false;

        function switchView(view) {
            const views = {
                informacoes:{ pane: 'viewInformacoes',tab: 'tabInformacoes' },
                projetos:   { pane: 'viewProjetos',   tab: 'tabProjetos' },
                graficos:   { pane: 'viewGraficos',   tab: 'tabGraficos' },
                conselho:   { pane: 'viewConselho',   tab: 'tabConselho' },
                legislacao: { pane: 'viewLegislacao', tab: 'tabLegislacao' },
                formularios:{ pane: 'viewFormularios',tab: 'tabFormularios' },
                deliberacoes:{ pane: 'viewDeliberacoes',tab: 'tabDeliberacoes' }
            };
            if (!views[view]) return;

            // Se a barra de abas já estiver fixa no topo, volta ao início do conteúdo
            const tabsBar = document.querySelector('.view-tabs');
            const header = document.querySelector('header');
            if (tabsBar && header) {
                const stickAt = header.offsetHeight;
                if (window.scrollY > stickAt) window.scrollTo(0, stickAt);
            }

            Object.keys(views).forEach(k => {
                document.getElementById(views[k].pane).style.display = (k === view) ? 'block' : 'none';
                document.getElementById(views[k].tab).classList.toggle('active', k === view);
            });

            updateTabIndicator(true);

            if (view === 'projetos' && !kpiIntroShown) {
                kpiIntroShown = true;
                const grid = document.querySelector('.kpi-grid');
                if (grid && !REDUCED_MOTION) {
                    grid.classList.add('kpi-intro');
                    setTimeout(() => grid.classList.remove('kpi-intro'), 2600);
                }
            }

            if (view === 'graficos') {
                if (!chartsRendered) {
                    renderCharts();
                    chartsRendered = true;
                }
                // Barras e roscas reanimam via CSS a cada abertura; os números contam junto
                animatePanelKPIs();
                // Mapa, treemap, fluxo e linha do tempo (D3) carregam só quando o Painel é aberto
                loadPainelD3()
                    .then(() => { if (window.renderPainelD3) window.renderPainelD3(); })
                    .catch(err => console.error(err));
            }
        }

        // ===== Carregamento sob demanda do D3 e dos gráficos do Painel =====
        const SCRIPT_BASE = (document.currentScript && document.currentScript.src)
            ? document.currentScript.src.replace(/[^/]*$/, '')
            : 'js/';
        let painelD3Promise = null;

        function loadScript(file) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = SCRIPT_BASE + file;
                s.onload = resolve;
                s.onerror = () => reject(new Error('Não foi possível carregar ' + file));
                document.head.appendChild(s);
            });
        }

        function loadPainelD3() {
            if (!painelD3Promise) {
                painelD3Promise = loadScript('d3.v7.min.js')
                    .then(() => Promise.all([loadScript('d3-sankey.min.js'), loadScript('rj-municipios.js')]))
                    .then(() => loadScript('painel-d3.js'))
                    .catch(err => { painelD3Promise = null; throw err; });
            }
            return painelD3Promise;
        }

        // ===== Municípios atendidos: leitura do campo livre "municipios" =====
        // Nomes oficiais (IBGE) dos 92 municípios do RJ
        const RJ_MUNICIPIOS_NOMES = ["Angra dos Reis", "Aperibé", "Araruama", "Areal", "Armação dos Búzios", "Arraial do Cabo", "Barra Mansa", "Barra do Piraí", "Belford Roxo", "Bom Jardim", "Bom Jesus do Itabapoana", "Cabo Frio", "Cachoeiras de Macacu", "Cambuci", "Campos dos Goytacazes", "Cantagalo", "Carapebus", "Cardoso Moreira", "Carmo", "Casimiro de Abreu", "Comendador Levy Gasparian", "Conceição de Macabu", "Cordeiro", "Duas Barras", "Duque de Caxias", "Engenheiro Paulo de Frontin", "Guapimirim", "Iguaba Grande", "Itaboraí", "Itaguaí", "Italva", "Itaocara", "Itaperuna", "Itatiaia", "Japeri", "Laje do Muriaé", "Macaé", "Macuco", "Magé", "Mangaratiba", "Maricá", "Mendes", "Mesquita", "Miguel Pereira", "Miracema", "Natividade", "Nilópolis", "Niterói", "Nova Friburgo", "Nova Iguaçu", "Paracambi", "Paraty", "Paraíba do Sul", "Paty do Alferes", "Petrópolis", "Pinheiral", "Piraí", "Porciúncula", "Porto Real", "Quatis", "Queimados", "Quissamã", "Resende", "Rio Bonito", "Rio Claro", "Rio das Flores", "Rio das Ostras", "Rio de Janeiro", "Santa Maria Madalena", "Santo Antônio de Pádua", "Sapucaia", "Saquarema", "Seropédica", "Silva Jardim", "Sumidouro", "São Fidélis", "São Francisco de Itabapoana", "São Gonçalo", "São José de Ubá", "São José do Vale do Rio Preto", "São João da Barra", "São João de Meriti", "São Pedro da Aldeia", "São Sebastião do Alto", "Tanguá", "Teresópolis", "Trajano de Moraes", "Três Rios", "Valença", "Varre-Sai", "Vassouras", "Volta Redonda"];

        // Grafias encontradas na base → nome oficial
        const MUNICIPIO_ALIASES = {
            'casemiro de abreu': 'Casimiro de Abreu',
            'ltaborai': 'Itaboraí',
            'rio dejaneiro': 'Rio de Janeiro',
            'sao jose do reio preto': 'São José do Vale do Rio Preto',
            'sao jose do rio preto': 'São José do Vale do Rio Preto',
            'laje de muriae': 'Laje do Muriaé',
            'santo antonio e padua': 'Santo Antônio de Pádua',
            'armacao de buzios': 'Armação dos Búzios',
            'buzios': 'Armação dos Búzios',
            'cachoeira de macacu': 'Cachoeiras de Macacu',
            'sao francisco do itabapoana': 'São Francisco de Itabapoana',
            'lagoa rodrigo de freitas': 'Rio de Janeiro',
            'parati': 'Paraty'
        };

        function normalizeText(s) {
            return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        }

        const MUNICIPIO_INDEX = (() => {
            const entries = RJ_MUNICIPIOS_NOMES.map(nome => [normalizeText(nome), nome]);
            Object.entries(MUNICIPIO_ALIASES).forEach(([alias, nome]) => entries.push([alias, nome]));
            // nomes mais longos primeiro: "barra do pirai" antes de "pirai"
            return entries.sort((a, b) => b[0].length - a[0].length);
        })();

        // Retorna { nomes: [...oficiais], estadual: bool }
        function matchMunicipios(texto) {
            let t = ' ' + normalizeText(texto) + ' ';
            const estadual = /\b(estado do rio de janeiro|unidades de conservacao estaduais)\b/.test(t);
            t = t.replace(/estado do rio de janeiro/g, ' # ');
            const nomes = new Set();
            for (const [chave, nome] of MUNICIPIO_INDEX) {
                const alvo = ' ' + chave + ' ';
                if (t.includes(alvo)) {
                    nomes.add(nome);
                    t = t.split(alvo).join(' # ');
                }
            }
            return { nomes: [...nomes], estadual };
        }

        // Cor única para gráficos de uma série; situações têm cor fixa (a cor segue a situação, nunca a posição)
        const SERIES_COLOR = '#1A9467';
        const STATUS_COLORS = {
            'Em Execução':  '#1A9467',   // folha
            'Não Iniciado': '#E0A526',   // ipê-amarelo
            'Parado':       '#7D8782',   // granito
            'Cancelado':    '#C2453A'    // pau-brasil
        };
        // Mantida por compatibilidade, caso outro código ainda a use
        const CHART_COLORS = ['#1A9467', '#1D6A86', '#E0A526', '#6E4A97', '#8ED1A6', '#C2453A', '#0B4431', '#7D8782'];

        const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        function escapeXml(s) {
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        // Os gráficos são desenhados na largura real do cartão, para o texto sair no tamanho certo
        function chartWidth(el) {
            const w = Math.round(el.clientWidth || 0);
            return w > 200 ? w : 560;
        }

        function truncateLabel(label, maxChars) {
            label = String(label);
            return label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
        }

        function formatPercent(v) {
            return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
        }

        // Barra horizontal: ponta arredondada, base reta
        function hBarPath(x, y, w, h, r) {
            r = Math.min(r, w, h / 2);
            return `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x}Z`;
        }

        // Coluna: topo arredondado, base reta
        function vBarPath(x, yTop, w, yBase, r) {
            r = Math.min(r, w / 2, yBase - yTop);
            return `M${x},${yBase}V${yTop + r}A${r},${r} 0 0 1 ${x + r},${yTop}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${yTop + r}V${yBase}Z`;
        }

        // Gráfico de barras horizontais. data = [{label, value, display}]
        function hBarChart(containerId, data, opts) {
            opts = opts || {};
            const el = document.getElementById(containerId);
            if (!data.length) { el.innerHTML = '<p class="chart-empty">Sem dados.</p>'; return; }

            const W = chartWidth(el);
            const barH = 18, pitch = 34;
            const leftW = Math.min(opts.labelWidth || 150, Math.round(W * 0.36));
            const rightW = 76;
            const barMaxW = Math.max(40, W - leftW - rightW);
            const maxVal = Math.max(...data.map(d => d.value)) || 1;
            const H = data.length * pitch;
            const maxChars = Math.max(8, Math.floor((leftW - 14) / 6.9));
            const fill = opts.color ? `fill:${opts.color};` : '';

            let svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">`;
            data.forEach((d, i) => {
                const y = i * pitch + (pitch - barH) / 2;
                const w = Math.max(3, (d.value / maxVal) * barMaxW);
                const shown = escapeXml(d.display || d.value);
                svg += `<text x="${leftW - 12}" y="${y + barH / 2}" dy="0.35em" text-anchor="end" class="bar-row-label">${escapeXml(truncateLabel(d.label, maxChars))}<title>${escapeXml(d.label)}</title></text>`;
                svg += `<path class="bar" style="--i:${i};${fill}" d="${hBarPath(leftW, y, w, barH, 4)}"><title>${escapeXml(d.label)}: ${shown}</title></path>`;
                svg += `<text x="${leftW + w + 8}" y="${y + barH / 2}" dy="0.35em" class="bar-row-value val" style="--i:${i}">${shown}</text>`;
            });
            svg += `<line class="chart-axis" x1="${leftW + .5}" y1="0" x2="${leftW + .5}" y2="${H}"/>`;
            svg += `</svg>`;
            el.innerHTML = svg;
        }

        // Gráfico de colunas. data = [{label, value}]
        function vBarChart(containerId, data) {
            const el = document.getElementById(containerId);
            if (!data.length) { el.innerHTML = '<p class="chart-empty">Sem dados.</p>'; return; }

            const W = chartWidth(el);
            const H = 330, padB = 30, padT = 24, padX = 2;
            const n = data.length;
            const slot = (W - padX * 2) / n;
            const barW = Math.max(6, Math.min(24, slot * 0.62));
            const maxVal = Math.max(...data.map(d => d.value)) || 1;
            const base = H - padB;
            const plotH = base - padT;
            const shortYears = slot < 38;   // pouco espaço: 2021 → ’21

            let svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">`;
            data.forEach((d, i) => {
                const cx = padX + slot * i + slot / 2;
                const bh = Math.max(2, (d.value / maxVal) * plotH);
                const yTop = base - bh;
                const label = (shortYears && /^\d{4}$/.test(d.label)) ? '’' + d.label.slice(2) : d.label;
                svg += `<path class="col" style="--i:${i}" d="${vBarPath(cx - barW / 2, yTop, barW, base, 4)}"><title>${escapeXml(d.label)}: ${d.value}</title></path>`;
                svg += `<text x="${cx}" y="${yTop - 7}" text-anchor="middle" class="bar-row-value val" style="--i:${i}">${d.value}</text>`;
                svg += `<text x="${cx}" y="${base + 20}" text-anchor="middle" class="bar-row-label">${escapeXml(label)}</text>`;
            });
            svg += `<line class="chart-axis" x1="0" y1="${base + .5}" x2="${W}" y2="${base + .5}"/>`;
            svg += `</svg>`;
            el.innerHTML = svg;
        }

        // Rosca (donut) com varredura animada. data = [{label, value, color}]
        function donutChart(containerId, data, opts) {
            opts = opts || {};
            const fmt = opts.format || (v => Number(v).toLocaleString('pt-BR'));
            const centerLabel = opts.centerLabel || 'projetos';
            const el = document.getElementById(containerId);
            if (!data.length) { el.innerHTML = '<p class="chart-empty">Sem dados.</p>'; return; }

            const total = data.reduce((s, d) => s + d.value, 0) || 1;
            const centerText = opts.centerText !== undefined ? opts.centerText : total.toLocaleString('pt-BR');
            const S = 200, cx = 100, cy = 100, r = 94, thick = 26, ri = r - thick;
            const maskId = 'sweep-' + containerId;

            let ang = -Math.PI / 2;
            let segs = '';
            data.forEach(d => {
                const frac = d.value / total;
                const tip = `<title>${escapeXml(d.label)}: ${escapeXml(fmt(d.value))}</title>`;
                if (frac >= 0.9999) {
                    segs += `<circle cx="${cx}" cy="${cy}" r="${r - thick / 2}" fill="none" stroke="${d.color}" stroke-width="${thick}">${tip}</circle>`;
                    return;
                }
                const a2 = ang + frac * 2 * Math.PI;
                const large = frac > 0.5 ? 1 : 0;
                const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
                segs += `<path d="M${p(r, ang)} A${r} ${r} 0 ${large} 1 ${p(r, a2)} L${p(ri, a2)} A${ri} ${ri} 0 ${large} 0 ${p(ri, ang)} Z" fill="${d.color}" stroke="#fff" stroke-width="2" stroke-linejoin="round">${tip}</path>`;
                ang = a2;
            });

            const centerSize = String(centerText).length > 6 ? 23 : 36;
            let svg = `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg" role="img">`;
            svg += `<defs><mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}">`;
            svg += `<circle class="donut-sweep" cx="${cx}" cy="${cy}" r="${r - thick / 2}" fill="none" stroke="#fff" stroke-width="${thick + 8}" pathLength="1" transform="rotate(-90 ${cx} ${cy})"/>`;
            svg += `</mask></defs>`;
            svg += `<g mask="url(#${maskId})">${segs}</g>`;
            svg += `<g class="donut-center">`;
            svg += `<text x="${cx}" y="${cy + centerSize * 0.18}" text-anchor="middle" class="donut-center-value" style="font-size:${centerSize}px">${escapeXml(centerText)}</text>`;
            svg += `<text x="${cx}" y="${cy + centerSize * 0.18 + 20}" text-anchor="middle" class="donut-center-label">${escapeXml(centerLabel)}</text>`;
            svg += `</g></svg>`;

            let legend = '<ul class="donut-legend">';
            data.forEach(d => {
                legend += `<li><span class="lg-dot" style="--c:${d.color}"></span><span>${escapeXml(d.label)}</span>` +
                          `<span class="lg-val">${escapeXml(fmt(d.value))}</span><span class="lg-pct">${formatPercent(d.value / total * 100)}</span></li>`;
            });
            legend += '</ul>';

            el.innerHTML = `<div class="donut">${svg}${legend}</div>`;
        }

        function countBy(arr, keyFn) {
            const m = {};
            arr.forEach(x => { const k = keyFn(x); if (k) m[k] = (m[k]||0)+1; });
            return m;
        }
        function toSortedArray(obj, limit) {
            let a = Object.entries(obj).map(([label, value]) => ({label, value}));
            a.sort((x,y) => y.value - x.value);
            return limit ? a.slice(0, limit) : a;
        }

        // Números do topo do painel contam a partir de zero a cada abertura da aba
        let panelTotals = null;

        function countUp(el, target, format, duration) {
            if (!el) return;
            if (el._countRaf) cancelAnimationFrame(el._countRaf);
            if (REDUCED_MOTION) { el.textContent = format(target); return; }
            duration = duration || 1300;
            const start = performance.now();
            const tick = now => {
                const p = Math.min(1, (now - start) / duration);
                el.textContent = format(target * (1 - Math.pow(1 - p, 4)));
                if (p < 1) el._countRaf = requestAnimationFrame(tick);
            };
            el.textContent = format(0);
            el._countRaf = requestAnimationFrame(tick);
        }

        function animatePanelKPIs() {
            if (!panelTotals) return;
            const int = v => Math.round(v).toLocaleString('pt-BR');
            const unit = currencyUnit(panelTotals.valor);
            countUp(document.getElementById('ck-total'), panelTotals.total, int);
            countUp(document.getElementById('ck-valor'), panelTotals.valor, v => formatInUnit(v, unit));
            countUp(document.getElementById('ck-exec'), panelTotals.exec, int);
            countUp(document.getElementById('ck-pc'), panelTotals.pc, int);
        }

        function renderCharts() {
            const d = projectsData;

            // KPIs do painel (valores finais; a contagem animada fica em animatePanelKPIs)
            panelTotals = {
                total: d.length,
                valor: d.reduce((s,p)=>s+p.valor_total,0),
                exec: d.filter(p=>p.status==='Em Execução').length,
                pc: d.filter(p=>(p.processos_prestacao||'').trim()).length
            };
            document.getElementById('ck-total').textContent = panelTotals.total.toLocaleString('pt-BR');
            document.getElementById('ck-valor').textContent = formatCurrency(panelTotals.valor);
            document.getElementById('ck-exec').textContent = panelTotals.exec.toLocaleString('pt-BR');
            document.getElementById('ck-pc').textContent = panelTotals.pc.toLocaleString('pt-BR');

            // Situação dos projetos (rosca)
            const statusOrder = Object.keys(STATUS_COLORS).map(label => ({ label, color: STATUS_COLORS[label] }));
            const statusCount = countBy(d, p=>p.status);
            donutChart('chartStatus', statusOrder
                .filter(s => statusCount[s.label])
                .map(s => ({label:s.label, value:statusCount[s.label], color:s.color})));

            // Valor total por situação (mesmas cores, somando valor_total)
            const statusValor = {};
            d.forEach(p => { statusValor[p.status] = (statusValor[p.status]||0) + p.valor_total; });
            donutChart('chartStatusValor', statusOrder
                .filter(s => statusValor[s.label])
                .map(s => ({label:s.label, value:statusValor[s.label], color:s.color})),
                { format: formatCurrency, centerText: formatCurrency(panelTotals.valor), centerLabel: 'total' });

            // Projetos por órgão proponente
            hBarChart('chartProponente', toSortedArray(countBy(d, p=>p.proponente), 10), {labelWidth: 160});

            // Valor por órgão
            const valorPorOrgao = {};
            d.forEach(p => { valorPorOrgao[p.proponente] = (valorPorOrgao[p.proponente]||0) + p.valor_total; });
            const valArr = Object.entries(valorPorOrgao)
                .map(([label,value]) => ({label, value, display: formatCurrency(value)}))
                .sort((a,b) => b.value - a.value);
            hBarChart('chartValorOrgao', valArr.slice(0,10), {labelWidth: 160});

            // Projetos por ano de aprovação (cronológico)
            const anoCount = countBy(d, p=>p.ano_aprovacao);
            const anoArr = Object.entries(anoCount)
                .filter(([k])=>k)
                .sort((a,b)=>a[0].localeCompare(b[0]))
                .map(([label,value])=>({label,value}));
            vBarChart('chartAno', anoArr);

            // Top 10 municípios (nomes reconhecidos; projetos estaduais ficam de fora)
            const munCount = {};
            d.forEach(p => {
                matchMunicipios(p.municipios).nomes.forEach(m => {
                    munCount[m] = (munCount[m]||0)+1;
                });
            });
            hBarChart('chartMunicipios', toSortedArray(munCount, 10), {labelWidth: 160});

            // Prestação de Contas registradas por ano (extrai anos dos processos SEI)
            const pcAno = {};
            d.forEach(p => {
                const proc = (p.processos_prestacao||'').trim();
                if (!proc) return;
                const anos = new Set();
                proc.split(';').forEach(sei => {
                    const m = sei.trim().match(/\/(\d{4})\s*$/);
                    if (m) anos.add(m[1]);
                });
                anos.forEach(a => { pcAno[a] = (pcAno[a]||0)+1; });
            });
            const pcAnoArr = Object.entries(pcAno).sort((a,b)=>a[0].localeCompare(b[0])).map(([label,value])=>({label,value}));
            vBarChart('chartPCAno', pcAnoArr);

            // % do valor em prestação de contas sobre o valor aprovado, por órgão
            const aprovadoOrg = {}, pcValorOrg = {};
            d.forEach(p => {
                aprovadoOrg[p.proponente] = (aprovadoOrg[p.proponente]||0) + (p.valor_aprovado||0);
                pcValorOrg[p.proponente] = (pcValorOrg[p.proponente]||0) + (p.prestacao_contas||0);
            });
            const pcValArr = Object.keys(aprovadoOrg).map(org => {
                const base = aprovadoOrg[org] || 0;
                const pct = base > 0 ? (pcValorOrg[org]/base*100) : 0;
                return {label: org, value: pct, display: formatPercent(pct)};
            }).sort((a,b)=>b.value-a.value);
            hBarChart('chartPCValor', pcValArr.slice(0,10), {labelWidth: 160});
        }

        // ===== Acabamento visual aplicado sobre o HTML existente =====

        // Remove emojis/ícones do início de títulos, abas e rótulos
        const LEADING_SYMBOLS = /^[\s\p{Extended_Pictographic}ℹ✕✖⬇️‍]+/u;

        function stripLeadingSymbols(el) {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (!node.nodeValue.trim()) continue;
                node.nodeValue = node.nodeValue.replace(LEADING_SYMBOLS, '');
                return;
            }
        }

        // ===== Textos de apoio (edite aqui) =====
        const HEADER_TAGLINE = '';   // frase opcional abaixo da marca (vazio = sem frase)
        const VIEW_LEADS = {
            viewInformacoes: ['Conheça o fundo', 'Origem dos recursos, gestão e finalidade do FECAM.'],
            viewProjetos:    ['Explore os projetos', 'Consulta pública aos projetos financiados pelo FECAM.'],
            viewGraficos:    ['Dados em perspectiva', 'Como os recursos se distribuem por situação, órgão, ano e município.']
        };

        // Ícone de broto (marca no cabeçalho, rodapé e favicon)
        const SPROUT_SVG = '<svg viewBox="0 0 160 160" fill="none" aria-hidden="true" focusable="false"><path d="M80 132V82M80 95C52 96 38 78 38 53c24-1 43 13 42 42ZM80 81c2-29 18-48 47-50 1 30-16 50-47 50Z" stroke="currentColor" stroke-width="3.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M80 113c-12-10-24-12-37-9M80 125c11-11 22-13 35-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

        function svgFromString(markup, cls) {
            const tpl = document.createElement('template');
            tpl.innerHTML = markup.trim();
            const el = tpl.content.firstElementChild;
            if (cls) el.setAttribute('class', cls);
            return el;
        }

        let kpiIntroShown = false;

        // Anima um número do valor exibido até o novo valor (ex.: Investimento total ao trocar de situação)
        function tweenValue(el, target, format, duration) {
            if (!el) return;
            if (el._tweenRaf) cancelAnimationFrame(el._tweenRaf);
            const from = (typeof el._value === 'number') ? el._value : null;
            if (from === null || REDUCED_MOTION || from === target) {
                el._value = target;
                el.textContent = format(target);
                return;
            }
            duration = duration || 900;
            const start = performance.now();
            const tick = now => {
                const p = Math.min(1, (now - start) / duration);
                const eased = 1 - Math.pow(1 - p, 3);
                el._value = from + (target - from) * eased;
                el.textContent = format(el._value);
                if (p < 1) el._tweenRaf = requestAnimationFrame(tick);
                else el._value = target;
            };
            el._tweenRaf = requestAnimationFrame(tick);
        }

        // Frase acima dos indicadores: explica o clique e mostra o filtro ativo
        function updateKpiHint() {
            const hint = document.getElementById('kpiHint');
            if (!hint) return;
            const text = hint.querySelector('span');
            text.replaceChildren();
            if (typeof kpiFilterStatus === 'undefined' || kpiFilterStatus === 'all') {
                text.textContent = 'Clique em uma situação para filtrar a lista de projetos.';
            } else {
                const b = document.createElement('b');
                b.textContent = kpiFilterStatus;
                text.append('Mostrando só projetos com situação ', b, '. Clique de novo no card ou em Total para ver todos.');
            }
        }

        function enhanceUI() {
            document.querySelectorAll(
                'header h1, .view-tab, h2, h3, .kpi-label, .detail-label, .chart-section-title, #clearFiltersBtn, #downloadBtn, .modal-footer span'
            ).forEach(stripLeadingSymbols);

            // "FECAM - Transparência de Projetos" → marca + título
            const h1 = document.querySelector('header h1');
            if (h1) {
                const m = h1.textContent.trim().match(/^(FECAM)\s*[-–—]\s*(.+)$/i);
                if (m) {
                    const mark = document.createElement('span');
                    mark.className = 'brand-mark';
                    mark.textContent = m[1];
                    const dot = document.createElement('span');
                    dot.className = 'brand-dot';
                    dot.textContent = '.';
                    mark.appendChild(dot);
                    const title = document.createElement('span');
                    title.className = 'brand-title';
                    title.textContent = m[2];
                    h1.replaceChildren(mark, title);
                }
            }

            // Botões com estilo inline no HTML passam a usar as classes do tema
            [['clearFiltersBtn', 'btn btn-ghost'], ['downloadBtn', 'btn btn-primary']].forEach(([id, cls]) => {
                const b = document.getElementById(id);
                if (!b) return;
                b.removeAttribute('style');
                b.removeAttribute('onmouseover');
                b.removeAttribute('onmouseout');
                b.className = cls;
            });

            // Indicadores clicáveis também pelo teclado
            document.querySelectorAll('.kpi-card[data-status]').forEach(card => {
                card.tabIndex = 0;
                card.setAttribute('role', 'button');
                card.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
                });
            });

            // Ícone na marca, frase no cabeçalho, ícone no rodapé e favicon
            const header = document.querySelector('header');
            if (header && HEADER_TAGLINE) {
                const tag = document.createElement('p');
                tag.className = 'header-tagline';
                tag.textContent = HEADER_TAGLINE;
                header.appendChild(tag);
            }
            const footer = document.querySelector('footer');
            if (footer) footer.prepend(svgFromString(SPROUT_SVG, 'footer-mark'));
            if (!document.querySelector('link[rel~="icon"]')) {
                const icon = document.createElement('link');
                icon.rel = 'icon';
                icon.type = 'image/svg+xml';
                icon.href = 'data:image/svg+xml,' + encodeURIComponent(
                    SPROUT_SVG.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/currentColor/g, '#12805A'));
                document.head.appendChild(icon);
            }

            // Linha de contexto no topo das abas principais
            Object.keys(VIEW_LEADS).forEach(id => {
                const pane = document.getElementById(id);
                if (!pane) return;
                const lead = document.createElement('div');
                lead.className = 'view-lead';
                const strong = document.createElement('strong');
                strong.textContent = VIEW_LEADS[id][0];
                const span = document.createElement('span');
                span.textContent = VIEW_LEADS[id][1];
                lead.append(strong, span);
                pane.prepend(lead);
            });

            // Dica acima dos indicadores de Projetos
            const kpiGrid = document.querySelector('.kpi-grid');
            if (kpiGrid) {
                const hint = document.createElement('div');
                hint.className = 'kpi-hint';
                hint.id = 'kpiHint';
                hint.setAttribute('aria-live', 'polite');
                hint.append(svgFromString('<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 9.5V3.8a1.3 1.3 0 0 1 2.6 0v5l3.2.6c1 .2 1.7 1.1 1.6 2.1l-.4 3.4a2.4 2.4 0 0 1-2.4 2.1H9.4c-.7 0-1.4-.3-1.8-.9L4.7 12.3a1.2 1.2 0 0 1 1.8-1.6L8 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'), document.createElement('span'));
                kpiGrid.before(hint);
                kpiGrid.querySelectorAll('.kpi-card[data-status]').forEach((card, n) => card.style.setProperty('--n', n));
                updateKpiHint();
            }

            // Busca e "Limpar filtros" na mesma linha
            const search = document.getElementById('searchInput');
            const clearBtn = document.getElementById('clearFiltersBtn');
            if (search && clearBtn) {
                const oldWrap = clearBtn.parentElement;
                const row = document.createElement('div');
                row.className = 'search-row';
                search.before(row);
                row.append(search, clearBtn);
                if (oldWrap && !oldWrap.children.length) oldWrap.remove();
            }

            buildRelief();

            updateTabIndicator(false);
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => updateTabIndicator(false));
            window.addEventListener('resize', () => updateTabIndicator(false));
        }

        // Pílula escura que desliza até a aba ativa
        function updateTabIndicator(animate) {
            const bar = document.querySelector('.view-tabs');
            const active = bar && bar.querySelector('.view-tab.active');
            if (!active) return;
            bar.classList.toggle('is-animated', !!animate && !REDUCED_MOTION);
            bar.style.setProperty('--ind-x', active.offsetLeft + 'px');
            bar.style.setProperty('--ind-w', active.offsetWidth + 'px');
            bar.classList.add('has-indicator');
            if (animate && bar.scrollWidth > bar.clientWidth) {
                active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
            }
        }

        // Relevo do cabeçalho: curvas de nível geradas (sempre o mesmo desenho) e desenhadas ao carregar
        function buildRelief() {
            const header = document.querySelector('header');
            if (!header || header.querySelector('.relief')) return;

            const W = 1600, H = 440, step = 10;
            const cols = Math.ceil(W / step) + 1, rows = Math.ceil(H / step) + 1;

            // Ruído determinístico — semente: 1986, ano da Lei 1.060 que criou o FECAM
            let seed = 1986;
            const rand = () => {
                seed = (seed + 0x6D2B79F5) | 0;
                let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
            const G = 64;
            const lattice = new Float32Array(G * G);
            for (let n = 0; n < lattice.length; n++) lattice[n] = rand();
            const fade = t => t * t * (3 - 2 * t);
            const at = (i, j) => lattice[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
            const noise = (x, y) => {
                const xi = Math.floor(x), yi = Math.floor(y);
                const u = fade(x - xi), v = fade(y - yi);
                const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), e = at(xi + 1, yi + 1);
                return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
            };
            const fbm = (x, y) => {
                let s = 0, amp = .5, f = 1;
                for (let o = 0; o < 4; o++) { s += amp * noise(x * f, y * f); f *= 2.1; amp *= .5; }
                return s;
            };

            // Maciços à direita (atrás do espaço vazio), planície à esquerda (atrás do texto)
            const peaks = [
                { x: .80, y: .50, r: 200, h: 1.00 },
                { x: .62, y: 1.05, r: 170, h: .62 },
                { x: .98, y: .02, r: 190, h: .78 },
                { x: .46, y: -.08, r: 130, h: .36 }
            ];
            const z = new Float32Array(cols * rows);
            let zmin = Infinity, zmax = -Infinity;
            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++) {
                    const x = i * step, y = j * step;
                    const wx = x + 150 * (fbm(x / 320 + 7.3, y / 320) - .5);
                    const wy = y + 150 * (fbm(x / 320, y / 320 + 3.1) - .5);
                    let v = .5 * fbm(x / 240, y / 240);
                    for (const p of peaks) {
                        const dx = wx - p.x * W, dy = wy - p.y * H;
                        v += p.h * Math.exp(-(dx * dx + dy * dy) / (2 * p.r * p.r));
                    }
                    z[j * cols + i] = v;
                    if (v < zmin) zmin = v;
                    if (v > zmax) zmax = v;
                }
            }

            // Marching squares, com os segmentos encadeados em linhas contínuas
            const LEVELS = 18;
            const lines = [];
            for (let k = 0; k < LEVELS; k++) {
                const L = zmin + (k + .5) * (zmax - zmin) / LEVELS;
                const pts = new Map(), adj = new Map();
                const pt = (key, x, y) => { if (!pts.has(key)) pts.set(key, [x, y]); return key; };
                const link = (a, b) => {
                    if (!adj.has(a)) adj.set(a, []);
                    if (!adj.has(b)) adj.set(b, []);
                    adj.get(a).push(b);
                    adj.get(b).push(a);
                };
                for (let j = 0; j < rows - 1; j++) {
                    for (let i = 0; i < cols - 1; i++) {
                        const tl = z[j * cols + i], tr = z[j * cols + i + 1];
                        const br = z[(j + 1) * cols + i + 1], bl = z[(j + 1) * cols + i];
                        const c = (tl >= L ? 8 : 0) | (tr >= L ? 4 : 0) | (br >= L ? 2 : 0) | (bl >= L ? 1 : 0);
                        if (c === 0 || c === 15) continue;
                        const T = () => pt(`h${i},${j}`, (i + (L - tl) / (tr - tl)) * step, j * step);
                        const B = () => pt(`h${i},${j + 1}`, (i + (L - bl) / (br - bl)) * step, (j + 1) * step);
                        const Lf = () => pt(`v${i},${j}`, i * step, (j + (L - tl) / (bl - tl)) * step);
                        const R = () => pt(`v${i + 1},${j}`, (i + 1) * step, (j + (L - tr) / (br - tr)) * step);
                        const center = (tl + tr + br + bl) / 4;
                        switch (c) {
                            case 1: case 14: link(Lf(), B()); break;
                            case 2: case 13: link(B(), R()); break;
                            case 3: case 12: link(Lf(), R()); break;
                            case 4: case 11: link(T(), R()); break;
                            case 6: case 9:  link(T(), B()); break;
                            case 7: case 8:  link(T(), Lf()); break;
                            case 5:
                                if (center >= L) { link(T(), Lf()); link(B(), R()); }
                                else { link(T(), R()); link(Lf(), B()); }
                                break;
                            case 10:
                                if (center >= L) { link(T(), R()); link(Lf(), B()); }
                                else { link(T(), Lf()); link(B(), R()); }
                                break;
                        }
                    }
                }

                const seen = new Set();
                const walk = start => {
                    const chain = [start];
                    seen.add(start);
                    let cur = start;
                    for (;;) {
                        const next = adj.get(cur).find(nb => !seen.has(nb));
                        if (!next) break;
                        seen.add(next);
                        chain.push(next);
                        cur = next;
                    }
                    return chain;
                };
                const chains = [];
                adj.forEach((nb, key) => { if (nb.length === 1 && !seen.has(key)) chains.push({ keys: walk(key), closed: false }); });
                adj.forEach((nb, key) => { if (!seen.has(key)) chains.push({ keys: walk(key), closed: true }); });

                chains.forEach(ch => {
                    if (ch.keys.length < 6) return;   // descarta voltinhas de ruído
                    const d = ch.keys.map((key, n) => {
                        const [x, y] = pts.get(key);
                        return (n ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
                    }).join('') + (ch.closed ? 'Z' : '');
                    lines.push({ d, k });
                });
            }

            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('class', 'relief');
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            svg.setAttribute('preserveAspectRatio', 'xMaxYMid slice');
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('focusable', 'false');
            lines.forEach(line => {
                const path = document.createElementNS(NS, 'path');
                path.setAttribute('d', line.d);
                path.setAttribute('pathLength', '1');
                // Uma curva mestra a cada quatro; a mais alta em amarelo-ipê
                const cls = line.k === 15 ? 'mestra cume' : (line.k % 4 === 3 ? 'mestra' : '');
                if (cls) path.setAttribute('class', cls);
                path.style.setProperty('--d', (120 + line.k * 75) + 'ms');
                svg.appendChild(path);
            });
            header.prepend(svg);
        }

        // Iniciar ao carregar a página
        document.addEventListener('DOMContentLoaded', initDashboard);
