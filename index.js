const express = require('express');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware - Updated to allow Range headers properly
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type'); // Important for video player
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

const SELECTED_HOST = process.env.MOVIEBOX_API_HOST || "h5.aoneroom.com";
const HOST_URL = `https://${SELECTED_HOST}`;

const DEFAULT_HEADERS = {
    'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept': 'application/json',
    'User-Agent': 'okhttp/4.12.0',
    'Referer': HOST_URL,
    'Host': SELECTED_HOST,
    'Connection': 'keep-alive',
    'X-Forwarded-For': '1.1.1.1',
    'CF-Connecting-IP': '1.1.1.1',
    'X-Real-IP': '1.1.1.1'
};

const SubjectType = { ALL: 0, MOVIES: 1, TV_SERIES: 2, MUSIC: 6 };

const jar = new CookieJar();
const axiosInstance = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 30000
}));

let cookiesInitialized = false;

function processApiResponse(response) {
    if (response.data && response.data.data) return response.data.data;
    return response.data || response;
}

async function ensureCookiesAreAssigned() {
    if (!cookiesInitialized) {
        try {
            console.log('Initializing session cookies...');
            const response = await axiosInstance.get(`${HOST_URL}/wefeed-h5-bff/app/get-latest-app-pkgs?app_name=moviebox`, {
                headers: DEFAULT_HEADERS
            });
            cookiesInitialized = true;
            console.log('Session cookies initialized successfully');
        } catch (error) {
            console.error('Failed to get app info:', error.message);
        }
    }
    return cookiesInitialized;
}

async function makeApiRequestWithCookies(url, options = {}) {
    await ensureCookiesAreAssigned();
    const config = {
        url: url,
        headers: { ...DEFAULT_HEADERS, ...options.headers },
        withCredentials: true,
        ...options
    };
    try {
        return await axiosInstance(config);
    } catch (error) {
        console.error(`Request to ${url} failed:`, error.response?.status);
        throw error;
    }
}

// Routes
app.get('/', (req, res) => res.send('<h1>MovieBox API Server Running</h1><p>Status: Operational</p>'));

app.get('/api/homepage', async (req, res) => {
    try {
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/home`);
        res.json({ status: 'success', data: processApiResponse(response) });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/trending', async (req, res) => {
    try {
        const params = { page: req.query.page || 0, perPage: req.query.perPage || 18, uid: '5591179548772780352' };
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/trending`, { method: 'GET', params });
        res.json({ status: 'success', data: processApiResponse(response) });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/search/:query', async (req, res) => {
    try {
        const payload = {
            keyword: req.params.query,
            page: parseInt(req.query.page) || 1,
            perPage: parseInt(req.query.perPage) || 24,
            subjectType: parseInt(req.query.type) || SubjectType.ALL
        };
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/search`, { method: 'POST', data: payload });
        let content = processApiResponse(response);
        if (content.items) {
            content.items.forEach(item => {
                if (item.cover?.url) item.thumbnail = item.cover.url;
                else if (item.stills?.url) item.thumbnail = item.stills.url;
            });
        }
        res.json({ status: 'success', data: content });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/info/:movieId', async (req, res) => {
    try {
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/detail`, {
            method: 'GET', params: { subjectId: req.params.movieId }
        });
        const content = processApiResponse(response);
        // Helper to populate thumbnail
        if (content.subject) {
            if (content.subject.cover?.url) content.subject.thumbnail = content.subject.cover.url;
        }
        res.json({ status: 'success', data: content });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/sources/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const season = parseInt(req.query.season) || 1;
        const episode = parseInt(req.query.episode) || 1;

        console.log(`Getting sources for: ${movieId} S${season}E${episode}`);

        // 1. Get Detail Path first
        const infoRes = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/detail`, {
            method: 'GET', params: { subjectId: movieId }
        });
        const detailPath = processApiResponse(infoRes)?.subject?.detailPath;
        
        if (!detailPath) throw new Error('Detail path not found');

        // 2. Get Sources with Referer
        const refererUrl = `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${movieId}&type=/movie/detail`;
        
        const response = await makeApiRequestWithCookies(`${HOST_URL}/wefeed-h5-bff/web/subject/download`, {
            method: 'GET',
            params: { subjectId: movieId, se: season, ep: episode }, // Note: se/ep parameters
            headers: {
                'Referer': refererUrl,
                'Origin': 'https://fmoviesunblocked.net',
            }
        });

        const content = processApiResponse(response);

        if (content && content.downloads) {
            // Generate Proxy URL using Query Parameter (Better encoding handling)
            const processedSources = content.downloads.map(file => ({
                id: file.id,
                resolution: parseInt(file.resolution) || 0,
                url: file.url,
                // Change strategy: use ?url= instead of path param
                proxyUrl: `${req.protocol}://${req.get('host')}/api/download?url=${encodeURIComponent(file.url)}`,
                size: file.size
            }));
            content.processedSources = processedSources;
        }

        res.json({ status: 'success', data: content });
    } catch (error) {
        console.error("Source Error:", error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// --- FIXED PROXY DOWNLOAD ENDPOINT ---
// Use /api/download?url=... instead of /api/download/...
app.get('/api/download', async (req, res) => {
    try {
        const targetUrl = req.query.url;

        if (!targetUrl) {
            return res.status(400).send("Missing 'url' parameter");
        }

        // Whitelist domains (Expanded to include 'bcdnxw')
        const validDomains = [
            'bcdnw.hakunaymatata.com',
            'valiw.hakunaymatata.com',
            'bcdnxw.hakunaymatata.com'
        ];
        
        const urlObj = new URL(targetUrl);
        if (!validDomains.some(domain => urlObj.hostname.includes(domain))) {
            return res.status(403).send("Forbidden Domain");
        }

        console.log(`Proxying: ${targetUrl}`);

        const headers = {
            'User-Agent': 'okhttp/4.12.0',
            'Referer': 'https://fmoviesunblocked.net/',
            'Origin': 'https://fmoviesunblocked.net',
            'Accept': '*/*',
        };

        // Forward Range Header (Critical for video seeking!)
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const response = await axios({
            method: 'GET',
            url: targetUrl,
            responseType: 'stream',
            headers: headers,
            validateStatus: (status) => status < 400 // Accept 200 & 206
        });

        // Forward Response Headers
        res.status(response.status);
        
        // Critical headers for video player
        const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
        forwardHeaders.forEach(h => {
            if (response.headers[h]) res.set(h, response.headers[h]);
        });
        
        // Pipe Stream
        response.data.pipe(res);

    } catch (error) {
        console.error("Proxy Error:", error.message);
        if (!res.headersSent) res.status(500).send("Stream Error");
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`MovieBox API running on port ${PORT}`);
});

module.exports = app;
