const statusGrid = document.querySelector('#grid');
const summary = document.querySelector('#summary');
const searchInput = document.querySelector('#search');
const refreshButton = document.querySelector('#refresh');
const template = document.querySelector('#service-card');

const statusLabels = {
  operational: 'Opérationnel',
  degraded: 'Dégradation',
  down: 'Incident',
  unknown: 'Inconnu',
};

async function loadServices() {
  const response = await fetch('services.json', { cache: 'no-store' });
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
  summary.innerHTML = `<div class="summary-banner">${ok}/${total} services signalés comme opérationnels</div>`;
}

function renderServices(services) {
  statusGrid.innerHTML = '';
  services.forEach((service) => statusGrid.appendChild(createCard(service)));
}

function filterServices(services, term) {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return services;
  return services.filter((service) => {
    return service.name.toLowerCase().includes(normalized) ||
      (service.description && service.description.toLowerCase().includes(normalized));
  });
}

async function bootstrap() {
  try {
    const services = await loadServices();
    renderSummary(services);
    renderServices(services);

    searchInput.addEventListener('input', (event) => {
      const filtered = filterServices(services, event.target.value);
      renderServices(filtered);
    });

    refreshButton.addEventListener('click', async () => {
      const updated = await loadServices();
      renderSummary(updated);
      renderServices(filterServices(updated, searchInput.value));
    });
  } catch (error) {
    summary.innerHTML = `<div class="summary-banner" style="color:#fca5a5;border-color:rgba(248,113,113,0.4);background:rgba(248,113,113,0.08)">Erreur : ${error.message}</div>`;
  }
}

bootstrap();
