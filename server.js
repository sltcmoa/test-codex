const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_ROOT = path.join(__dirname);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const servicesConfigPath = path.join(PUBLIC_ROOT, 'services.json');
const servicesConfig = JSON.parse(fs.readFileSync(servicesConfigPath, 'utf8')).services;

const DEFAULT_HEADERS = { 'user-agent': 'status-wall/1.1', 'accept': '*/*' };

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

async function fetchStatuspage(apiUrl) {
  const response = await fetch(apiUrl, { cache: 'no-store', headers: DEFAULT_HEADERS });
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
  return { status, statusDetails: description || 'Statut fourni par Statuspage' };
}

function normalizeText(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ');
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

async function fetchHtmlStatus(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', headers: DEFAULT_HEADERS });
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

async function resolveService(service) {
  const base = {
    name: service.name,
    statusUrl: service.statusUrl,
    description: service.description,
    notes: service.notes || '',
  };

  const htmlSourceUrl = service.source?.html?.url || service.statusUrl;
  const allowHtmlFallback = Boolean(service.source?.htmlFallback || service.source?.type === 'html');

  if (service.source?.type === 'statuspage' && service.source.api) {
    try {
      const resolved = await fetchStatuspage(service.source.api);
      return { ...base, ...resolved };
    } catch (error) {
      if (allowHtmlFallback && htmlSourceUrl) {
        try {
          const scraped = await fetchHtmlStatus(htmlSourceUrl, { preferH1: preferH1Only(service) });
          return { ...base, ...scraped, statusDetails: `${scraped.statusDetails} (fallback HTML)` };
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
        statusDetails: `Impossible de récupérer le statut (Statuspage) : ${error.message}`,
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
        statusDetails: `Impossible de récupérer le statut (HTML) : ${error.message}`,
      };
    }
  }

  return {
    ...base,
    status: service.fallbackStatus || 'unknown',
    statusDetails: service.source?.type === 'none' ? 'Aucune API de statut déclarée' : 'Source non configurée',
  };
}

async function handleStatusApi(res) {
  try {
    const services = await Promise.all(servicesConfig.map((service) => resolveService(service)));
    const body = JSON.stringify({ services, fetchedAt: new Date().toISOString() });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  } catch (error) {
    console.error('Erreur lors de la récupération des statuts', error);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Impossible de récupérer les statuts dynamiquement' }));
  }
}

function resolveFilePath(requestPath) {
  const safePath = path.normalize(requestPath).replace(/^\/+/, '');
  const resolvedPath = path.join(PUBLIC_ROOT, safePath);
  if (!resolvedPath.startsWith(PUBLIC_ROOT)) {
    return null;
  }
  return resolvedPath;
}

function serveStatic(resolvedPath, res) {
  let finalPath = resolvedPath;
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
    finalPath = path.join(resolvedPath, 'index.html');
  }

  if (!fs.existsSync(finalPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(finalPath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(finalPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);

  if (parsed.pathname === '/api/status') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Méthode non autorisée' }));
      return;
    }
    await handleStatusApi(res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  const resolvedPath = resolveFilePath(parsed.pathname === '/' ? '/index.html' : parsed.pathname);
  if (!resolvedPath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  serveStatic(resolvedPath, res);
});

server.listen(PORT, () => {
  console.log(`Dashboard serveur démarré sur http://localhost:${PORT}`);
});
