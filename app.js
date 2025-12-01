const statusGrid = document.querySelector('#grid');
const summary = document.querySelector('#summary');
const refreshButton = document.querySelector('#refresh');
const fullscreenButton = document.querySelector('#fullscreen');
const lastUpdated = document.querySelector('#last-updated');
const template = document.querySelector('#service-card');

const AUTO_REFRESH_MS = 60_000;
let servicesCache = [];
const CACHE_PREFIX = 'status-cache:';

const statusLabels = {
  operational: 'Opérationnel',
  degraded: 'Dégradation',
  down: 'Incident',
  unknown: 'Inconnu',
};

const statusPriority = {
  down: 0,
  degraded: 1,
  unknown: 2,
  operational: 3,
};

function mapStatuspageIndicator(indicator) {
  switch (indicator) {
    case 'none':
      return 'operational';
    case 'maintenance':
    case 'minor':
      return 'degraded';
    case 'major':
    case 'critical':
      return 'down';
    default:
      return 'unknown';
  }
}

function normalizeText(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ');
}

function cacheKey(service) {
  return `${CACHE_PREFIX}${service.name}`;
}

function readCachedStatus(service) {
  try {
    const raw = localStorage.getItem(cacheKey(service));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.status) return null;
    return parsed;
  } catch (error) {
    console.warn('Cache navigateur illisible', error);
    return null;
  }
}

function writeCachedStatus(service, status) {
  try {
    const payload = {
      ...status,
      cachedAt: new Date().toISOString(),
    };
    localStorage.setItem(cacheKey(service), JSON.stringify(payload));
  } catch (error) {
    console.warn('Impossible d\'écrire dans le cache navigateur', error);
  }
}

function parseHtmlStatus(html, { preferH1 = false } = {}) {
  const text = normalizeText(html);

  const operationalHints = [
    'all systems operational',
    'all systems are operational',
    'tous les systemes fonctionnent',
    'tous les systèmes fonctionnent',
    'operationnel',
    'operationnels',
    'operational',
    'no incidents reported',
    'no incidents or maintenance reported',
    'aucun incident signale',
  ];

  const degradedHints = [
    'partial outage',
    'degrad',
    'minor issue',
    'maintenance',
    'maintenance planifiee',
    'maintenance en cours',
    'degraded performance',
    'planned maintenance',
  ];

  const downHints = [
    'major outage',
    'major incident',
    'critical',
    'incident critique',
    'panne',
    'interruption',
    'service disruption',
  ];

  if (preferH1) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      const h1Text = normalizeText(h1Match[1]);
      if (operationalHints.some((hint) => h1Text.includes(hint))) {
        return { status: 'operational', statusDetails: 'Statut extrait du H1 (opérationnel)' };
      }
      if (degradedHints.some((hint) => h1Text.includes(hint))) {
        return { status: 'degraded', statusDetails: 'Statut extrait du H1 (maintenance/dégradation)' };
      }
      if (downHints.some((hint) => h1Text.includes(hint))) {
        return { status: 'down', statusDetails: 'Statut extrait du H1 (incident/critique)' };
      }
    }
  }

  if (operationalHints.some((hint) => text.includes(hint))) {
    return { status: 'operational', statusDetails: 'Statut extrait du HTML (opérationnel)' };
  }

  if (degradedHints.some((hint) => text.includes(hint))) {
    return { status: 'degraded', statusDetails: 'Statut extrait du HTML (maintenance/dégradation)' };
  }

  if (downHints.some((hint) => text.includes(hint))) {
    return { status: 'down', statusDetails: 'Statut extrait du HTML (incident/critique)' };
  }

  return { status: 'unknown', statusDetails: 'Statut HTML indéterminé' };
}

async function fetchStatuspage(apiUrl) {
  const response = await fetch(apiUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Statuspage indisponible (${response.status})`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Réponse inattendue (Content-Type: ${contentType || 'inconnu'})`);
  }
  const payload = await response.json();
  const indicator = payload?.status?.indicator;
  const description = payload?.status?.description || '';
  const status = mapStatuspageIndicator(indicator);
  return { status, statusDetails: description || 'Statut fourni par Statuspage (navigateur)' };
}

async function fetchStatuspageWithCandidates(primaryApiUrl, candidates = []) {
  const tried = [];
  const allCandidates = [primaryApiUrl, ...candidates];

  if (primaryApiUrl?.endsWith('status.json')) {
    const summaryCandidate = primaryApiUrl.replace(/status\.json$/, 'summary.json');
    if (!allCandidates.includes(summaryCandidate)) {
      allCandidates.push(summaryCandidate);
    }
  }

  for (const url of allCandidates.filter(Boolean)) {
    try {
      const status = await fetchStatuspage(url);
      return { ...status, statusDetails: `${status.statusDetails} (API ${url})` };
    } catch (error) {
      tried.push(`${url} → ${error.message}`);
    }
  }

  throw new Error(tried.join(' ; '));
}

async function fetchHtmlStatus(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Scraping impossible (${response.status})`);
  }
  const html = await response.text();
  return parseHtmlStatus(html, options);
}

function preferH1Only(service) {
  const name = (service.name || '').toLowerCase();
  return name.includes('doofinder') || name.includes('sogecommerce') || name.includes('lyra');
}

async function resolveServiceClient(service) {
  const base = {
    name: service.name,
    statusUrl: service.statusUrl,
    description: service.description,
    notes: service.notes || '',
  };

  const htmlSourceUrl = service.source?.html?.url || service.statusUrl;
  const allowHtmlFallback = Boolean(service.source?.htmlFallback || service.source?.type === 'html');
  const cached = readCachedStatus(service);

  if (service.source?.type === 'statuspage' && service.source.api) {
    try {
      const resolved = await fetchStatuspageWithCandidates(service.source.api, service.source.apiCandidates);
      writeCachedStatus(service, resolved);
      return { ...base, ...resolved, statusDetails: `${resolved.statusDetails} (API navigateur)` };
    } catch (error) {
      if (cached) {
        const cachedDate = cached.cachedAt
          ? new Date(cached.cachedAt).toLocaleString('fr-FR')
          : 'date inconnue';
        return {
          ...base,
          status: cached.status,
          statusDetails: `${cached.statusDetails || 'Statut mis en cache'} (cache navigateur · ${cachedDate}; échec API: ${
            error.message
          })`,
        };
      }
      if (allowHtmlFallback && htmlSourceUrl) {
        try {
          const scraped = await fetchHtmlStatus(htmlSourceUrl, { preferH1: preferH1Only(service) });
          return { ...base, ...scraped, statusDetails: `${scraped.statusDetails} (fallback HTML depuis le navigateur)` };
        } catch (htmlError) {
          return {
            ...base,
            status: service.fallbackStatus || 'unknown',
            statusDetails: `Impossible de récupérer le statut (Statuspage: ${error.message}; HTML: ${htmlError.message})`,
          };
        }
      }
      return {
        ...base,
        status: service.fallbackStatus || 'unknown',
        statusDetails: `Impossible de récupérer le statut (Statuspage navigateur) : ${error.message}`,
      };
    }
  }

  if (service.source?.type === 'html' && htmlSourceUrl) {
    try {
      const scraped = await fetchHtmlStatus(htmlSourceUrl, { preferH1: preferH1Only(service) });
      return { ...base, ...scraped };
    } catch (error) {
      return {
        ...base,
        status: service.fallbackStatus || 'unknown',
        statusDetails: `Impossible de récupérer le statut (HTML navigateur) : ${error.message}`,
      };
    }
  }

  return {
    ...base,
    status: service.fallbackStatus || 'unknown',
    statusDetails: service.source?.type === 'none' ? 'Aucune API de statut déclarée' : 'Source non configurée',
  };
}

async function loadServices() {
  // 1) Essai du backend (/api/status)
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`API hors service (code ${response.status})`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Réponse inattendue du collecteur');
    }
    const payload = await response.json();
    return {
      services: payload.services ?? [],
      fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
      mode: 'backend',
    };
  } catch (error) {
    console.warn('Collecte dynamique via backend indisponible, essai navigateur direct', error);
  }

  // 2) Essai direct depuis le navigateur (GitHub Pages ou hébergement statique avec CORS autorisé)
  try {
    const staticResponse = await fetch('./services.json', { cache: 'no-store' });
    if (!staticResponse.ok) {
      throw new Error("Impossible de récupérer la configuration des services");
    }
    const payload = await staticResponse.json();
    const services = await Promise.all((payload.services ?? []).map((service) => resolveServiceClient(service)));
    return {
      services,
      fetchedAt: new Date().toISOString(),
      mode: 'browser',
    };
  } catch (error) {
    console.warn('Collecte côté navigateur indisponible, passage à la sauvegarde statique', error);
  }

  // 3) Mode statique pur (services.json uniquement)
  const staticResponse = await fetch('./services.json', { cache: 'no-store' });
  if (!staticResponse.ok) {
    throw new Error("Impossible de récupérer les statuts dynamiques ni la sauvegarde statique");
  }
  const payload = await staticResponse.json();
  const services = (payload.services ?? []).map((service) => ({
    ...service,
    status: service.status ?? service.fallbackStatus ?? 'unknown',
    statusDetails: 'Chargé depuis la configuration statique (aucun backend disponible)',
  }));
  return {
    services,
    fetchedAt: new Date().toISOString(),
    mode: 'static',
  };
}

function createCard(service) {
  const card = template.content.firstElementChild.cloneNode(true);
  const title = card.querySelector('.card__title');
  const description = card.querySelector('.card__description');
  const badge = card.querySelector('.badge');
  const url = card.querySelector('.status-url');
  const notes = card.querySelector('.notes');
  const button = card.querySelector('.button');

  title.textContent = service.name;
  description.textContent = service.description;

  const state = service.status ?? 'unknown';
  card.dataset.state = state;
  badge.dataset.state = state;
  badge.textContent = statusLabels[state] ?? statusLabels.unknown;

  const statusNotes = service.statusDetails ? `Source : ${service.statusDetails}` : '';
  const baseNotes = service.notes && service.notes.trim().length ? service.notes : '—';
  notes.innerHTML = statusNotes ? `${baseNotes}<br><span class="muted">${statusNotes}</span>` : baseNotes;

  url.innerHTML = `<a href="${service.statusUrl}" target="_blank" rel="noreferrer">${service.statusUrl}</a>`;
  button.href = service.statusUrl;
  button.setAttribute('aria-label', `Ouvrir la page de statut de ${service.name}`);

  return card;
}

function renderSummary(services) {
  const total = services.length;
  const ok = services.filter((service) => service.status === 'operational').length;
  const incidents = services.filter((service) => service.status === 'down');
  const maintenances = services.filter((service) => service.status === 'degraded');

  const issuePills = [...incidents, ...maintenances]
    .map(
      (service) =>
        `<span class="issue-pill" data-state="${service.status}">${statusLabels[service.status]} · ${service.name}</span>`
    )
    .join('');

  const issuesRow = issuePills
    ? `<div class="issues-row" aria-live="polite">${issuePills}</div>`
    : '<p class="muted no-issues">Aucun incident ou maintenance signalé.</p>';

  summary.innerHTML = `
    <div class="summary-banner">
      <div class="summary-metrics" role="list">
        <div class="metric" data-state="down" role="listitem">
          <p class="metric__label">Incidents</p>
          <p class="metric__value">${incidents.length}</p>
        </div>
        <div class="metric" data-state="degraded" role="listitem">
          <p class="metric__label">Maintenances</p>
          <p class="metric__value">${maintenances.length}</p>
        </div>
        <div class="metric" data-state="operational" role="listitem">
          <p class="metric__label">Opérationnels</p>
          <p class="metric__value">${ok}</p>
        </div>
        <div class="metric" data-state="total" role="listitem">
          <p class="metric__label">Total</p>
          <p class="metric__value">${total}</p>
        </div>
      </div>
      ${issuesRow}
    </div>
  `;
}

function renderServices(services) {
  statusGrid.innerHTML = '';
  services.forEach((service) => statusGrid.appendChild(createCard(service)));
}

function sortServices(services) {
  return [...services].sort((a, b) => {
    const aPriority = statusPriority[a.status] ?? statusPriority.unknown;
    const bPriority = statusPriority[b.status] ?? statusPriority.unknown;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function updateFullscreenButton() {
  const isFullscreen = Boolean(document.fullscreenElement);
  fullscreenButton.textContent = isFullscreen ? 'Quitter le plein écran' : 'Plein écran';
  fullscreenButton.setAttribute(
    'aria-label',
    isFullscreen ? 'Quitter le mode plein écran' : 'Activer le mode plein écran pour le tableau de bord'
  );
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.error('Impossible de basculer en plein écran', error);
  } finally {
    updateFullscreenButton();
  }
}

async function bootstrap() {
  async function refreshAndRender() {
    try {
      const { services, fetchedAt, mode } = await loadServices();
      servicesCache = sortServices(services);
      renderSummary(servicesCache);
      renderServices(servicesCache);
      const modeLabel =
        mode === 'backend'
          ? `Données dynamiques (backend)`
          : mode === 'browser'
          ? 'Données dynamiques (navigateur)'
          : 'Mode statique (configuration locale)';
      lastUpdated.textContent = `Dernière mise à jour : ${new Date(fetchedAt).toLocaleString('fr-FR')} · ${modeLabel}`;
    } catch (error) {
      console.error('Erreur de rafraîchissement des statuts', error);
      summary.innerHTML = `<div class="summary-banner" style="color:#fca5a5;border-color:rgba(248,113,113,0.4);background:rgba(248,113,113,0.08)">Erreur : ${error.message}</div>`;
      lastUpdated.textContent = 'Dernière mise à jour : échec du chargement des données';
    }
  }

  await refreshAndRender();

  refreshButton.addEventListener('click', refreshAndRender);
  fullscreenButton.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  updateFullscreenButton();

  setInterval(refreshAndRender, AUTO_REFRESH_MS);
}

bootstrap();
