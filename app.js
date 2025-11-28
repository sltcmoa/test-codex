const statusGrid = document.querySelector('#grid');
const summary = document.querySelector('#summary');
const refreshButton = document.querySelector('#refresh');
const lastUpdated = document.querySelector('#last-updated');
const template = document.querySelector('#service-card');

const AUTO_REFRESH_MS = 60_000;
let servicesCache = [];

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

const SERVICES_URL = new URL('./services.json', window.location.href);

async function loadServices() {
  const response = await fetch(SERVICES_URL.href, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Impossible de lire services.json');
  }
  const payload = await response.json();
  return payload.services ?? [];
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

  url.innerHTML = `<a href="${service.statusUrl}" target="_blank" rel="noreferrer">${service.statusUrl}</a>`;
  notes.textContent = service.notes ?? '—';
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

async function bootstrap() {
  async function refreshAndRender() {
    try {
      const services = await loadServices();
      servicesCache = sortServices(services);
      renderSummary(servicesCache);
      renderServices(servicesCache);
      lastUpdated.textContent = `Dernière mise à jour : ${new Date().toLocaleString('fr-FR')}`;
    } catch (error) {
      console.error('Erreur de rafraîchissement des statuts', error);
      summary.innerHTML = `<div class="summary-banner" style="color:#fca5a5;border-color:rgba(248,113,113,0.4);background:rgba(248,113,113,0.08)">Erreur : ${error.message}</div>`;
      lastUpdated.textContent = 'Dernière mise à jour : échec du chargement des données';
    }
  }

  await refreshAndRender();

  refreshButton.addEventListener('click', refreshAndRender);

  setInterval(refreshAndRender, AUTO_REFRESH_MS);
}

bootstrap();
