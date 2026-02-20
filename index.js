process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
const PORT = process.env.PORT || 5000;

const MIRRORS = [
    "https://h5.aoneroom.com",
    "https://moviebox.pk",
    "https://www.moviebox.ph",
    "https://api.moviebox.ph"
];

let currentMirrorIndex = 0;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const getApiHeaders = (refererUrl = null) => {
    const ip = Array(4).fill(0).map((_, i) => Math.floor(Math.random() * 255) + (i === 0 ? 1 : 0)).join('.');
    const headers = {
        'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept': 'application/json',
        'User-Agent': 'okhttp/4.12.0',
        'Connection': 'keep-alive',
        'X-Forwarded-For': ip,
        'CF-Connecting-IP': ip,
        'X-Real-IP': ip,
        'Client-IP': ip,
        'True-Client-IP': ip,
        'Host': MIRRORS[currentMirrorIndex].replace('https://', '')
    };
    
    if (refererUrl) {
        headers['Referer'] = refererUrl;
        headers['Origin'] = new URL(refererUrl).origin;
    }
    
    return headers;
};

const jar = new CookieJar();
const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 15000
}));

async function fetchSmart(path, options = {}) {
    let attempt = 0;
    const maxAttempts = MIRRORS.length;
    let lastError = null;

    while (attempt < maxAttempts) {
        const baseUrl = MIRRORS[currentMirrorIndex];
        const url = `${baseUrl}/wefeed-h5-bff${path}`;
        
        try {
            const config = {
                ...options,
                headers: {
                    ...getApiHeaders(options.customReferer),
                    ...(options.headers || {})
                }
            };
            
            const { data } = await client(url, config);
            if (typeof data === 'string' && (data.includes('Internet Positif') || data.includes('Situs web yang coba kamu akses diblokir') || data.includes('blocked'))) {
                 throw new Error("Blocked Page Detected");
            }
            return data.data || data;

        } catch (error) {
            lastError = error;
            console.error(`Mirror ${baseUrl} failed (${error.response?.status || error.message || 'Net Error'}). Switching to next mirror...`);
            currentMirrorIndex = (currentMirrorIndex + 1) % MIRRORS.length;
            attempt++;
        }
    }
    
    throw lastError;
}

app.get('/api/homepage', async (req, res) => {
    try {
        const data = await fetchSmart('/web/home');
        res.json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/trending', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const perPage = parseInt(req.query.perPage) || 18;
        const data = await fetchSmart('/web/subject/trending', {
            params: { page, perPage, uid: '5591179548772780352' }
        });
        res.json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 24;
        const subjectType = parseInt(req.query.type) || 0;

        const data = await fetchSmart('/web/subject/search', {
            method: 'POST',
            data: { keyword: query, page, perPage, subjectType }
        });

        if (data.items) {
            data.items = data.items.map(item => ({
                ...item,
                thumbnail: item.cover?.url || item.stills?.url || ''
            }));
        }

        res.json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/info/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const data = await fetchSmart('/web/subject/detail', {
            params: { subjectId: movieId }
        });

        if (data.subject) {
            data.subject.thumbnail = data.subject.cover?.url || data.subject.stills?.url || '';
        }

        res.json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/sources/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const season = parseInt(req.query.season) || 0;
        const episode = parseInt(req.query.episode) || 0;
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['host'];

        const info = await fetchSmart('/web/subject/detail', {
            params: { subjectId: movieId }
        });

        const detailPath = info?.subject?.detailPath || '';
        const refererUrl = `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${movieId}&type=/movie/detail`;
        
        const data = await fetchSmart('/web/subject/download', {
            params: { subjectId: movieId, se: season, ep: episode },
            customReferer: refererUrl
        });

        const processedSources = (data.downloads || []).map(file => ({
            id: file.id,
            quality: parseInt(file.resolution) || 0,
            size: file.size,
            format: 'mp4',
            proxyUrl: `${protocol}://${host}/api/download/${encodeURIComponent(file.url)}`
        }));

        res.json({
            status: 'success',
            data: { ...data, processedSources }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/download/*', async (req, res) => {
    try {
        const rawUrl = req.params[0];
        if (!rawUrl) return res.status(400).json({ status: 'error', message: 'Missing URL' });

        const downloadUrl = decodeURIComponent(rawUrl);
        const range = req.headers.range;

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://fmoviesunblocked.net/',
            'Origin': 'https://fmoviesunblocked.net',
            'Accept': '*/*'
        };

        if (range) headers['Range'] = range;

        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream',
            headers,
            timeout: 60000,
            validateStatus: status => status >= 200 && status < 300
        });

        const head = {
            'Content-Type': response.headers['content-type'] || 'video/mp4',
            'Content-Length': response.headers['content-length'],
            'Accept-Ranges': 'bytes',
        };

        if (response.status === 206) {
            head['Content-Range'] = response.headers['content-range'];
            res.writeHead(206, head);
        } else {
            res.writeHead(200, head);
        }

        response.data.pipe(res);
        response.data.on('error', () => res.end());
        res.on('close', () => {
            if (response.data && typeof response.data.destroy === 'function') {
                response.data.destroy();
            }
        });

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ status: 'error', message: 'Stream failed' });
        }
    }
});

app.use((req, res) => {
    res.status(404).json({ status: 'error', message: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
